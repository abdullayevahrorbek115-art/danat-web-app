// Mijozlar (sotuvchilar/reseller) uchun HTTP API: balans, mahsulotlar, buyurtma berish, holatni bilish.
// Kalit admin paneldan (🔌 API) beriladi yoki foydalanuvchi botdagi «🔌 API» tugmasi orqali so'raydi.
// Kalit bazada faqat xesh ko'rinishida saqlanadi — yo'qolsa yangisi beriladi.
const crypto = require("crypto");
const { data, save, nextId } = require("./db");
const provider = require("./provider");
const { processOrder } = require("./orders");
const { esc } = require("./util");

const hash = (k) => crypto.createHash("sha256").update(String(k)).digest("hex");
const enabled = () => data().settings.apiEnabled !== false;
const baseUrl = () => ((process.env.PUBLIC_URL || "").replace(/\/$/, "") || "https://SIZNING-DOMEN") + "/api/v1";

function issueKey(u) {
  const key = "dk_" + crypto.randomBytes(24).toString("hex");
  u.apiHash = hash(key);
  u.apiAt = Date.now();
  delete u.apiReq;
  save();
  return key;
}
function revokeKey(u) {
  delete u.apiHash;
  delete u.apiAt;
  delete u.apiReq;
  save();
}
function userByKey(key) {
  if (!key) return null;
  const h = hash(key);
  return Object.values(data().users).find((u) => u.apiHash === h) || null;
}

function docsText() {
  const b = baseUrl();
  return (
    `🔌 <b>API hujjati</b>\n\nManzil: <code>${esc(b)}</code>\nHar bir so'rovda sarlavha: <code>X-API-Key: SIZNING_KALIT</code>\n\n` +
    `<b>GET /balance</b> — balans\n<b>GET /products</b> — o'yinlar, paketlar, narxlar\n` +
    `<b>POST /check</b> — ID tekshirish (imkon bo'lsa nik bilan)\n<b>POST /order</b> — buyurtma berish\n` +
    `<b>GET /order/ID</b> — buyurtma holati\n<b>GET /orders</b> — oxirgi 20 ta buyurtma\n\n` +
    `<b>Buyurtma namunasi:</b>\n<pre>curl -X POST ${esc(b)}/order \\\n -H "X-API-Key: KALIT" \\\n -H "Content-Type: application/json" \\\n -d '{"package_id":12,"player_id":"123456789","server_id":"2001","reference":"sizning-buyurtma-1"}'</pre>\n` +
    `<code>server_id</code> faqat kerak bo'lgan o'yinlarda; Telegram bo'limlarida <code>player_id</code> o'rniga username (@nom). ` +
    `<code>reference</code> — ixtiyoriy, bir xil reference bilan qayta yuborsangiz buyurtma takrorlanmaydi.\n\n` +
    `<b>Holatlar:</b> processing, pending (qo'lda yetkazilmoqda), completed, failed (pul qaytarilgan). Kod bilan yetkaziladigan paketlarda tayyor bo'lganda <code>code</code> maydoni to'ladi.\n` +
    `Xatolar: 401 kalit noto'g'ri, 402 balans yetmaydi, 409 paket tugagan, 422 ID topilmadi, 429 juda ko'p so'rov (daqiqasiga 60 ta).`
  );
}

// ---------- Himoya: cheklov ----------
const hits = new Map();
function limited(id, max) {
  const now = Date.now();
  const h = hits.get(id) || { t: now, n: 0 };
  if (now - h.t > 60000) { h.t = now; h.n = 0; }
  h.n++;
  hits.set(id, h);
  return h.n > max;
}
setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (n - v.t > 120000) hits.delete(k); }, 120000).unref();

const STATUS = { processing: "processing", pending: "pending", done: "completed", failed: "failed" };
const pub = (o) => ({
  id: o.id,
  status: STATUS[o.status] || o.status,
  game: o.gameName,
  package: o.pkgName,
  price: o.price,
  player_id: o.playerId || null,
  server_id: o.serverId || null,
  nickname: o.nickname || null,
  code: o.status === "done" ? o.code || null : null,
  reference: o.clientRef || null,
  created_at: new Date(o.createdAt).toISOString(),
});

function products() {
  return data()
    .games.filter((g) => g.active)
    .map((g) => ({
      game_id: g.id,
      name: g.name,
      type: g.kind === "tg" ? "telegram" : "game",
      needs_server_id: !!g.needsServer,
      packages: data()
        .packages.filter((p) => p.gameId === g.id && p.active)
        .map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          delivery: p.delivery === "code" ? "code" : "account",
          in_stock: p.delivery === "code" ? (p.stock || []).length > 0 : true,
        })),
    }))
    .filter((g) => g.packages.length);
}

class ApiError extends Error {
  constructor(code, error, message) { super(message); this.code = code; this.error = error; }
}

// Akkaunt ma'lumotini tekshiradi -> { playerId, serverId }
function cleanTarget(game, pkg, body) {
  if (pkg.delivery === "code") return { playerId: "", serverId: "" };
  const raw = String(body.player_id ?? "").trim();
  if (game.kind === "tg") {
    const uname = raw.replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "");
    if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(uname)) throw new ApiError(400, "bad_player_id", "Username noto'g'ri");
    return { playerId: "@" + uname, serverId: "" };
  }
  if (!/^\d{5,15}$/.test(raw)) throw new ApiError(400, "bad_player_id", "player_id 5–15 ta raqam bo'lishi kerak");
  let serverId = "";
  if (game.needsServer) {
    serverId = String(body.server_id ?? "").trim();
    if (!/^\d{1,7}$/.test(serverId)) throw new ApiError(400, "bad_server_id", "server_id kerak (faqat raqam)");
  }
  return { playerId: raw, serverId };
}

function findPackage(body) {
  const pkg = data().packages.find((p) => p.id === Number(body.package_id));
  const game = pkg && data().games.find((g) => g.id === pkg.gameId);
  if (!pkg || !game || !pkg.active || !game.active) throw new ApiError(404, "package_not_found", "Paket topilmadi yoki o'chirilgan");
  return { pkg, game };
}

async function route(method, path, body, u, botApi) {
  if (method === "GET" && path === "/balance") return { balance: u.balance };
  if (method === "GET" && path === "/products") return { products: products() };

  if (method === "POST" && path === "/check") {
    const { pkg, game } = findPackage(body);
    const t = cleanTarget(game, pkg, body);
    const r = await provider.checkId(game, t.playerId, t.serverId);
    return { valid: r.ok, verified: r.ok && !r.unverified, nickname: r.nickname || null };
  }

  if (method === "POST" && path === "/order") {
    const { pkg, game } = findPackage(body);
    const ref = body.reference ? String(body.reference).slice(0, 64) : "";
    if (ref) {
      const dup = data().orders.find((o) => o.userId === u.id && o.clientRef === ref);
      if (dup) return { order: pub(dup), duplicate: true };
    }
    const t = cleanTarget(game, pkg, body);
    if (pkg.delivery === "code" && !(pkg.stock || []).length) throw new ApiError(409, "out_of_stock", "Paket tugagan");
    let nickname = "";
    if (pkg.delivery !== "code") {
      let r;
      try { r = await provider.checkId(game, t.playerId, t.serverId); } catch (e) { r = { ok: true }; }
      if (!r.ok) throw new ApiError(422, "player_not_found", "Bunday ID topilmadi");
      nickname = r.nickname || "";
    }
    // Await dan keyingi holatni qayta tekshiramiz (balans/ombor), so'ng sinxron yechamiz
    if (pkg.delivery === "code" && !(pkg.stock || []).length) throw new ApiError(409, "out_of_stock", "Paket tugagan");
    if (u.balance < pkg.price) throw new ApiError(402, "insufficient_balance", "Balans yetarli emas");
    if (ref && data().orders.some((o) => o.userId === u.id && o.clientRef === ref)) {
      return { order: pub(data().orders.find((o) => o.userId === u.id && o.clientRef === ref)), duplicate: true };
    }
    u.balance -= pkg.price;
    const order = {
      id: nextId("order"),
      userId: u.id,
      gameId: game.id,
      gameName: game.name,
      pkgId: pkg.id,
      pkgName: pkg.name,
      price: pkg.price,
      playerId: t.playerId,
      serverId: t.serverId,
      nickname,
      kind: game.kind || "game",
      cost: pkg.cost || 0,
      status: "processing",
      via: "api",
      clientRef: ref,
      createdAt: Date.now(),
    };
    data().orders.push(order);
    save();
    try { await processOrder(botApi, order); } catch (e) { console.error("API processOrder xatosi:", e.message); }
    return { order: pub(order), balance: u.balance };
  }

  let m = /^\/order\/(\d+)$/.exec(path);
  if (method === "GET" && m) {
    const o = data().orders.find((x) => x.id === Number(m[1]) && x.userId === u.id);
    if (!o) throw new ApiError(404, "order_not_found", "Buyurtma topilmadi");
    return { order: pub(o) };
  }
  if (method === "GET" && path === "/orders") {
    return { orders: data().orders.filter((o) => o.userId === u.id).slice(-20).reverse().map(pub) };
  }
  throw new ApiError(404, "not_found", "Bunday yo'l yo'q");
}

async function handle(req, res, botApi, fullPath, readBody) {
  const send = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(obj));
  };
  const fail = (e) => send(e.code, { ok: false, error: e.error, message: e.message });
  try {
    const ip = req.socket.remoteAddress || "?";
    if (limited("ip:" + ip, 300)) throw new ApiError(429, "rate_limited", "Juda ko'p so'rov");
    if (!enabled()) throw new ApiError(403, "api_disabled", "API vaqtincha o'chirilgan");
    const auth = req.headers["authorization"] || "";
    const key = req.headers["x-api-key"] || (/^Bearer\s+(.+)$/i.exec(auth) || [])[1];
    const u = userByKey(String(key || "").trim());
    if (!u) {
      if (limited("bad:" + ip, 20)) throw new ApiError(429, "rate_limited", "Juda ko'p urinish");
      throw new ApiError(401, "invalid_key", "API kalit noto'g'ri");
    }
    if (limited("u:" + u.id, 60)) throw new ApiError(429, "rate_limited", "Daqiqasiga 60 ta so'rov");
    const path = fullPath.replace(/^\/api\/v1/, "") || "/";
    let body = {};
    if (req.method === "POST") {
      const raw = await readBody(req);
      try { body = raw ? JSON.parse(raw) : {}; } catch (e) { throw new ApiError(400, "bad_json", "JSON noto'g'ri"); }
      if (!body || typeof body !== "object") body = {};
    } else if (req.method !== "GET") {
      throw new ApiError(405, "method_not_allowed", "Faqat GET yoki POST");
    }
    const out = await route(req.method, path, body, u, botApi);
    send(200, { ok: true, ...out });
  } catch (e) {
    if (e instanceof ApiError) return fail(e);
    console.error("API xatosi:", e.message);
    send(500, { ok: false, error: "server_error", message: "Server xatosi" });
  }
}

module.exports = { handle, issueKey, revokeKey, userByKey, docsText, enabled, baseUrl };

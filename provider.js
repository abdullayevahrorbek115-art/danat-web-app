// Universal provayder ulagichi: hamma narsa admin paneldan (🔌 Provayder) sozlanadi.
//
// Ishlash tartibi:
//  - Rejim "manual": ID tekshirilmaydi, buyurtmani admin qo'lda bajaradi.
//  - Rejim "api" VA o'yinda "provayder kodi", paketda "SKU" bor bo'lsa: ID avtomatik tekshiriladi,
//    buyurtma avtomatik yetkaziladi. Kod/SKU yo'q o'yin yoki paket "manual" bo'lib qoladi.
//
// Qamrov: oddiy JSON API (kalit sarlavhada yoki so'rovda). Imzo (MD5/HMAC) talab qiladigan
// yoki asinxron (webhook) provayderlar uchun qo'shimcha kod kerak bo'ladi.
const { data } = require("./db");

const DEFAULTS = {
  baseUrl: "",
  key: "",
  method: "POST",
  authHeader: "Authorization",
  authValue: "Bearer {key}",
  checkPath: "/check-id",
  checkBody: '{"game":"{game}","player_id":"{player_id}","server_id":"{server_id}"}',
  checkOk: "success",
  checkNick: "nickname",
  orderPath: "/order",
  orderBody:
    '{"game":"{game}","sku":"{sku}","player_id":"{player_id}","server_id":"{server_id}","order_ref":"{order_id}"}',
  orderOk: "success",
  orderRef: "order_id",
  orderErr: "message",
  statusPath: "", // bo'sh bo'lmasa: buyurtma holati shu yo'ldan so'raladi, masalan /order/{ref}
  statusField: "data.status",
};

// Ludovex (https://ludovex.org/ru/docs) — admin paneldan bir tugma bilan qo'yiladi
const LUDOVEX = {
  baseUrl: "https://api.ludovex.org/api/v2",
  method: "POST",
  authHeader: "X-API-Key",
  authValue: "{key}",
  checkPath: "",
  orderPath: "/order",
  orderBody:
    '{"game_key":"{game}","variation_id":"{sku}","player_id":"{player_id}","zone_id":"{server_id}","idempotency_key":"bot{order_id}-{created}"}',
  orderOk: "ok",
  orderRef: "data.id",
  orderErr: "error.message",
  statusPath: "/order/{ref}",
  statusField: "data.status",
};

function cfg() {
  const p = (data().settings && data().settings.provider) || {};
  const c = { ...DEFAULTS, ...p };
  if (!c.baseUrl) c.baseUrl = process.env.PROVIDER_URL || "";
  if (!c.key) c.key = process.env.PROVIDER_KEY || "";
  return c;
}

// "data.user.name" kabi yo'l bo'yicha qiymat olish
const getPath = (obj, path) =>
  String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);

// spec: "success" (rost qiymat) yoki "status==success" (aniq qiymat)
function truthy(obj, spec) {
  if (!spec) return false;
  const [path, expected] = String(spec).split("==");
  const v = getPath(obj, path.trim());
  if (expected !== undefined) return String(v).toLowerCase() === expected.trim().toLowerCase();
  if (typeof v === "string") return ["true", "success", "ok", "1", "done"].includes(v.toLowerCase());
  return v === true || v === 1;
}

function fillTemplate(tpl, vars) {
  let obj;
  try {
    obj = JSON.parse(tpl);
  } catch (e) {
    throw new Error("So'rov shabloni (JSON) noto'g'ri");
  }
  const sub = (v) => {
    if (typeof v === "string") return v.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? "") : m));
    if (Array.isArray(v)) return v.map(sub);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sub(x)]));
    return v;
  };
  return sub(obj);
}

async function call(path, tpl, vars) {
  const c = cfg();
  if (!c.baseUrl) throw new Error("Provayder manzili (URL) kiritilmagan");
  const body = fillTemplate(tpl, { ...vars, key: c.key });
  for (const k of Object.keys(body)) if (body[k] === "") delete body[k]; // bo'sh zone_id va h.k. yuborilmaydi
  const headers = { Accept: "application/json" };
  if (c.authHeader && c.authValue) headers[c.authHeader] = c.authValue.replace(/\{key\}/g, c.key);
  const method = String(c.method).toUpperCase() === "GET" ? "GET" : "POST";
  let url = c.baseUrl.replace(/\/$/, "") + path;
  const opt = { method, headers, signal: AbortSignal.timeout(20000) };
  if (method === "GET") {
    url += "?" + new URLSearchParams(body).toString();
  } else {
    headers["Content-Type"] = "application/json";
    opt.body = JSON.stringify(body);
  }
  const res = await fetch(url, opt);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* JSON emas */ }
  if (res.status >= 500) throw new Error(`Provayder xatosi (HTTP ${res.status})`);
  if (res.status === 401 || res.status === 403) throw new Error(`Provayder kalitni qabul qilmadi (HTTP ${res.status})`);
  return { status: res.status, text, json };
}

// Sozlangan yo'l bo'sh qaytsa, keng tarqalgan nomlar bo'yicha qidiradi
const NICK_KEYS = ["nickname", "nick", "nick_name", "username", "user_name", "name", "player_name", "playerName", "role_name", "roleName"];
function findNick(obj, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 3) return null;
  for (const k of NICK_KEYS) {
    if (typeof obj[k] === "string" && obj[k].trim()) return obj[k].trim();
  }
  for (const v of Object.values(obj)) {
    const r = findNick(v, depth + 1);
    if (r) return r;
  }
  return null;
}

const apiEnabled = () => data().settings.providerMode === "api";

// -> { ok, nickname, unverified }
// ok:false FAQAT provayder ID ni aniq "topilmadi" deb rad etganda qaytadi.
// Sozlama to'liq emas, tarmoq xatosi yoki javob formati tushunarsiz bo'lsa — ID "tekshirilmagan" deb
// o'tkazib yuboriladi (mijoz to'g'ri ID ni ham "noto'g'ri" deb to'sib qo'yilmaydi).
async function checkId(game, playerId, serverId) {
  if (!apiEnabled() || !game.providerCode) return { ok: true, nickname: null, unverified: true };
  const c = cfg();
  if (!c.baseUrl || !c.key || !c.checkPath) return { ok: true, nickname: null, unverified: true };
  let r;
  try {
    r = await call(c.checkPath, c.checkBody, {
      game: game.providerCode,
      player_id: playerId,
      server_id: serverId || "",
    });
  } catch (e) {
    console.warn("ID tekshirish xizmati javob bermadi, o'tkazib yuborildi:", e.message);
    return { ok: true, nickname: null, unverified: true };
  }
  if (!r.json) {
    console.warn(`Provayder JSON qaytarmadi (HTTP ${r.status}) — ID tekshirilmadi`);
    return { ok: true, nickname: null, unverified: true };
  }
  const ok = truthy(r.json, c.checkOk);
  let nickname = getPath(r.json, c.checkNick) || null;
  if (!nickname) nickname = findNick(r.json);
  if (ok) {
    if (!nickname) console.warn("ID topildi, lekin nik yo'li (checkNick) javobga mos kelmadi. Javob:", r.text.slice(0, 500));
    return { ok: true, nickname: nickname ? String(nickname) : null };
  }
  // Provayder "ok" maydonini umuman qaytarmagan bo'lsa — sozlama noto'g'ri, ID ni rad etmaymiz
  const okPath = String(c.checkOk || "").split("==")[0].trim();
  const recognized = getPath(r.json, okPath) !== undefined || r.status === 404;
  if (!recognized) {
    console.warn("Provayder javobi 'checkOk' yo'liga mos kelmadi — ID tekshirilmadi. Javob:", r.text.slice(0, 500));
    return { ok: true, nickname: nickname ? String(nickname) : null, unverified: !nickname };
  }
  return { ok: false, nickname: null };
}

// -> { ok:true, manual:true } | { ok:true, ref } | { ok:false, error }
// Tarmoq xatosi, vaqt tugashi yoki 5xx — istisno tashlaydi (natija noaniq).
async function deliver(order, game, pkg) {
  if (!apiEnabled() || !game.providerCode || !pkg.sku) return { ok: true, manual: true };
  const c = cfg();
  const r = await call(c.orderPath, c.orderBody, {
    game: game.providerCode,
    sku: pkg.sku,
    player_id: order.playerId,
    server_id: order.serverId || "",
    order_id: order.id,
    created: order.createdAt,
  });
  if (!r.json) return { ok: false, error: `Provayder JSON qaytarmadi (HTTP ${r.status})` };
  if (truthy(r.json, c.orderOk)) {
    const ref = String(getPath(r.json, c.orderRef) ?? "");
    if (!c.statusPath) return { ok: true, ref };
    // 201 faqat "qabul qilindi" degani: haqiqiy natija holat bo'yicha aniqlanadi
    const st = stateOf(c, r.json);
    if (st === "done") return { ok: true, ref, code: findCode(r.json) };
    if (st === "failed") return { ok: false, error: "Provayder buyurtmani bajara olmadi" };
    return { ok: true, pending: true, ref };
  }
  return { ok: false, error: String(getPath(r.json, c.orderErr) || `HTTP ${r.status}`) };
}

// Provayder javobidagi holat: COMPLETED -> done, FAILED/REFUNDED -> failed, boshqasi -> wait
function stateOf(c, json) {
  const raw = String(getPath(json, c.statusField || "data.status") ?? "").toUpperCase();
  if (raw === "COMPLETED") return "done";
  if (raw === "FAILED" || raw === "REFUNDED") return "failed";
  return "wait";
}

// Yetkazilgan kod (agar provayder qaytarsa): faqat ma'lum nomdagi maydonlardan olinadi
const CODE_KEYS = ["code", "codes", "voucher", "pin", "serial", "redeem_code", "gift_code"];
function findCode(obj, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 4) return null;
  for (const k of CODE_KEYS) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 1000);
    if (Array.isArray(v) && v.length && v.every((x) => typeof x === "string")) return v.join("\n").slice(0, 1000);
  }
  for (const v of Object.values(obj)) {
    const r = findCode(v, depth + 1);
    if (r) return r;
  }
  return null;
}

async function get(path) {
  const c = cfg();
  if (!c.baseUrl) throw new Error("Provayder manzili (URL) kiritilmagan");
  const headers = { Accept: "application/json" };
  if (c.authHeader && c.authValue) headers[c.authHeader] = c.authValue.replace(/\{key\}/g, c.key);
  const res = await fetch(c.baseUrl.replace(/\/$/, "") + path, { headers, signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* JSON emas */ }
  return { status: res.status, text, json };
}

// Jarayondagi buyurtma holatini so'raydi -> { state: "done"|"failed"|"wait", code }
async function checkOrder(order) {
  const c = cfg();
  if (!c.statusPath || !order.ref) return { state: "wait" };
  const r = await get(c.statusPath.replace(/\{ref\}/g, encodeURIComponent(order.ref)));
  if (!r.json) return { state: "wait" };
  const st = stateOf(c, r.json);
  return { state: st, code: st === "done" ? findCode(r.json) : null, error: String(getPath(r.json, c.statusField) || "") };
}

// ---------- Ludovex katalogi (admin panelda kod/SKU ni topish uchun) ----------
const listOf = (j) => {
  const d = j && j.data;
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.items)) return d.items;
  if (d && Array.isArray(d.games)) return d.games;
  return Array.isArray(j) ? j : [];
};
async function catalog() {
  const r = await get("/catalog");
  const items = listOf(r.json)
    .map((g) => ({ key: String(g.game_key || g.key || g.id || ""), name: String(g.name || g.title || g.game_name || g.game || "") }))
    .filter((x) => x.key);
  return { items, raw: r.text, status: r.status };
}
async function offers(gameKey) {
  const r = await get("/catalog/" + encodeURIComponent(gameKey));
  const out = [];
  const walk = (o, d) => {
    if (!o || typeof o !== "object" || d > 6) return;
    if (!Array.isArray(o) && o.variation_id !== undefined) {
      out.push({
        id: String(o.variation_id),
        name: String(o.name || o.title || o.label || o.variation_name || ""),
        price: o.price_usdt ?? o.price ?? "",
      });
    }
    for (const v of Object.values(o)) walk(v, d + 1);
  };
  walk(r.json, 0);
  return { offers: out, raw: r.text, status: r.status };
}

// Admin paneldagi sinov uchun: rejimdan qat'i nazar xom javobni qaytaradi
async function testCheck(code, playerId, serverId) {
  const c = cfg();
  const r = await call(c.checkPath, c.checkBody, { game: code, player_id: playerId, server_id: serverId || "" });
  const parsed = r.json
    ? { ok: truthy(r.json, c.checkOk), nickname: getPath(r.json, c.checkNick) || null }
    : null;
  return { status: r.status, text: r.text, parsed };
}

// Katalogdagi paketlarni botga qo'shadi: o'yin (provayder kodi bilan) va paketlar (SKU, narx, tannarx) avtomatik.
// rate — 1 USDT necha so'm, markup — ustama foiz. Narx 100 so'mgacha yaxlitlanadi.
const { nextId, save } = require("./db");
function importOffers(gameKey, gameName, offers, rate, markup) {
  const d = data();
  let game = d.games.find((g) => g.providerCode === gameKey);
  let createdGame = false;
  // Bir xil nomli o'yin avvaldan bor va kodi yo'q bo'lsa — yangisini yaratmay, kodni shunga yozamiz
  if (!game) {
    const nm = String(gameName || "").trim().toLowerCase();
    game = d.games.find((g) => !g.providerCode && nm && (g.name.toLowerCase() === nm || nm.includes(g.name.toLowerCase())));
    if (game) game.providerCode = gameKey;
  }
  if (!game) {
    game = { id: nextId("game"), name: (gameName || "O'yin").slice(0, 40), emoji: "🎮", needsServer: false, active: true, providerCode: gameKey, kind: "game" };
    d.games.push(game);
    createdGame = true;
  }
  let added = 0, skipped = 0, noPrice = 0;
  for (const o of offers.slice(0, 60)) {
    if (d.packages.some((p) => p.gameId === game.id && p.sku === o.id)) { skipped++; continue; }
    const usdt = Number(o.price);
    if (!Number.isFinite(usdt) || usdt <= 0) { noPrice++; continue; }
    const cost = Math.round(usdt * rate);
    const price = Math.max(100, Math.round((cost * (1 + markup / 100)) / 100) * 100);
    d.packages.push({ id: nextId("pkg"), gameId: game.id, name: (o.name || o.id).slice(0, 40), price, active: true, sku: o.id, cost });
    added++;
  }
  save();
  return { game, createdGame, added, skipped, noPrice };
}

// Qidiruv qatoriga mos o'yinni topadi: aniq bitta bo'lsa — shu, bir nechta bo'lsa — nomi aynan mos kelganini, aks holda noaniq
const norm = (x) => String(x).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function pickGame(items, line) {
  const words = norm(line).split(" ").filter(Boolean);
  if (!words.length) return { none: true };
  const cand = items.filter((x) => {
    const hay = norm(x.name + " " + x.key);
    return words.every((w) => hay.includes(w));
  });
  if (cand.length === 1) return { item: cand[0] };
  if (!cand.length) return { none: true };
  const exact = cand.filter((x) => norm(x.name) === norm(line));
  if (exact.length === 1) return { item: exact[0] };
  return { ambiguous: cand.slice(0, 4).map((x) => x.name || x.key) };
}

module.exports = { pickGame, importOffers, checkId, deliver, checkOrder, catalog, offers, testCheck, cfg, DEFAULTS, LUDOVEX };

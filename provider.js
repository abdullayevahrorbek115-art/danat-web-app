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

// -> { ok, nickname } ; nickname null bo'lsa — tekshirilmagan
async function checkId(game, playerId, serverId) {
  if (!apiEnabled() || !game.providerCode) return { ok: true, nickname: null };
  const c = cfg();
  const r = await call(c.checkPath, c.checkBody, {
    game: game.providerCode,
    player_id: playerId,
    server_id: serverId || "",
  });
  if (!r.json) throw new Error(`Provayder JSON qaytarmadi (HTTP ${r.status})`);
  const ok = truthy(r.json, c.checkOk);
  let nickname = getPath(r.json, c.checkNick) || null;
  if (ok && !nickname) {
    nickname = findNick(r.json);
    if (!nickname) console.warn("ID topildi, lekin nik yo'li (checkNick) javobga mos kelmadi. Javob:", r.text.slice(0, 500));
  }
  return { ok, nickname: nickname ? String(nickname) : null };
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
  });
  if (!r.json) return { ok: false, error: `Provayder JSON qaytarmadi (HTTP ${r.status})` };
  if (truthy(r.json, c.orderOk)) return { ok: true, ref: String(getPath(r.json, c.orderRef) ?? "") };
  return { ok: false, error: String(getPath(r.json, c.orderErr) || `HTTP ${r.status}`) };
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

module.exports = { checkId, deliver, testCheck, cfg, DEFAULTS };

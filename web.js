// Veb-do'kon: bot bilan bir xil baza, balans va buyurtmalar. Kirish — Telegram Login Widget.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { data } = require("./db");
const api = require("./api");

const TOKEN = process.env.BOT_TOKEN || "";
const SECRET = crypto.createHash("sha256").update("web" + TOKEN).digest();
const hmac = (s, k = SECRET) => crypto.createHmac("sha256", k).update(s).digest("hex");
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

function verifyTg(d) {
  const { hash, ...rest } = d || {};
  if (!hash || !rest.id || !rest.auth_date) return false;
  const str = Object.keys(rest).sort().map((k) => `${k}=${rest[k]}`).join("\n");
  const key = crypto.createHash("sha256").update(TOKEN).digest();
  return same(hmac(str, key), String(hash)) && Date.now() / 1000 - Number(rest.auth_date) < 86400;
}
const makeToken = (id) => { const exp = Date.now() + 30 * 86400e3; return `${id}.${exp}.${hmac(id + "." + exp)}`; };
function userFromToken(h) {
  const m = /^Bearer (\d+)\.(\d+)\.([a-f0-9]{64})$/.exec(h || "");
  if (!m || Number(m[2]) < Date.now() || !same(hmac(m[1] + "." + m[2]), m[3])) return null;
  return data().users[m[1]] || null;
}

let botName = process.env.BOT_USERNAME || "";
const hits = new Map(); // oddiy tezlik cheklovi: IP bo'yicha daqiqasiga 60 so'rov
const limited = (ip) => { const n = Date.now(), a = (hits.get(ip) || []).filter((t) => n - t < 60000); a.push(n); hits.set(ip, a); return a.length > 60; };

async function handle(req, res, botApi, p, readBody) {
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };
  try {
    if (p === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(fs.readFileSync(path.join(__dirname, "web", "index.html")));
    }
    if (limited(req.socket.remoteAddress)) return send(429, { ok: false, error: "Juda ko'p so'rov" });
    const sub = p.replace(/^\/web/, "") || "/";
    if (sub === "/config") {
      if (!botName) botName = (await botApi.getMe()).username;
      return send(200, { ok: true, bot: botName });
    }
    if (sub === "/products") return send(200, { ok: true, products: api.products() });
    let body = {};
    if (req.method === "POST") { try { body = JSON.parse((await readBody(req)) || "{}"); } catch (e) { return send(400, { ok: false, error: "JSON xato" }); } }
    if (sub === "/login" && req.method === "POST") {
      if (!verifyTg(body)) return send(401, { ok: false, error: "Telegram tasdiqlanmadi" });
      if (!data().users[body.id]) return send(403, { ok: false, error: "Avval botga kirib /start bosing" });
      return send(200, { ok: true, token: makeToken(body.id), name: data().users[body.id].name || body.first_name });
    }
    const u = userFromToken(req.headers.authorization);
    if (!u) return send(401, { ok: false, error: "Kirish kerak" });
    if (req.method === "GET" && sub === "/me") return send(200, { ok: true, name: u.name, balance: u.balance, orders: data().orders.filter((o) => o.userId === u.id).slice(-10).reverse().map((o) => ({ id: o.id, game: o.gameName, pkg: o.pkgName, status: o.status, code: o.code || null })) });
    if (["/check", "/order"].includes(sub) && req.method === "POST") {
      const r = await api.route("POST", sub, body, u, botApi);
      return send(200, { ok: true, ...r, order: r.order && { id: r.order.id, status: r.order.status, code: r.order.code || null } });
    }
    return send(404, { ok: false, error: "Topilmadi" });
  } catch (e) {
    return send(e.code || 500, { ok: false, error: e.code ? e.message : "Server xatosi" });
  }
}
module.exports = { handle };

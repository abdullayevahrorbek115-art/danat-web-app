// Avtomatik to'lov tizimlari: Click (Shop API) va Payme (Merchant API).
//
// Ishlash tartibi:
//  1. Mijoz summani yozadi va to'lov usulini tanlaydi -> bot to'lov havolasini beradi.
//  2. Mijoz Click/Payme da to'laydi -> tizim bizning serverga (webhook) so'rov yuboradi.
//  3. Server so'rovni tekshiradi va mijoz balansini AVTOMATIK to'ldiradi. Admin chekni tasdiqlashi shart emas.
//
// Sozlamalar admin paneldan: 💳 To'lov tizimlari. Qo'shimcha kutubxona kerak emas (faqat Node.js).
const crypto = require("crypto");
const http = require("http");
const { data, save, nextId } = require("./db");
const { esc, fmt } = require("./util");
const { safeSend, notifyChat, notifyAdmins } = require("./orders");

// ---------- Sozlamalar ----------
const SYSTEMS = {
  click: {
    label: "Click",
    icon: "🟦",
    fields: {
      serviceId: "Service ID",
      merchantId: "Merchant ID",
      secretKey: "Secret key",
    },
    secret: ["secretKey"],
  },
  payme: {
    label: "Payme",
    icon: "🟩",
    fields: {
      merchantId: "Merchant ID (kassa ID)",
      key: "Kalit (KEY)",
    },
    secret: ["key"],
  },
};

const pcfg = () => {
  const p = (data().settings && data().settings.pay) || {};
  return {
    click: { enabled: false, serviceId: "", merchantId: "", secretKey: "", ...(p.click || {}) },
    payme: { enabled: false, merchantId: "", key: "", ...(p.payme || {}) },
    card: { enabled: true, auto: false, timeoutMin: 5, secret: "", ...(p.card || {}) },
  };
};

function pset(sys, key, val) {
  const st = data().settings;
  if (!st.pay) st.pay = {};
  st.pay[sys] = { ...(st.pay[sys] || {}), [key]: val };
  save();
}

// Tizim to'liq sozlangan va yoqilganmi
function isReady(sys) {
  const c = pcfg()[sys];
  if (!c || !c.enabled) return false;
  if (sys === "click") return !!(c.serviceId && c.merchantId && c.secretKey);
  if (sys === "payme") return !!(c.merchantId && c.key);
  return true;
}
const missingFields = (sys) => {
  const c = pcfg()[sys];
  return Object.keys(SYSTEMS[sys].fields).filter((k) => !c[k]);
};

// Mijozga ko'rsatiladigan to'lov usullari
function methods() {
  const list = [];
  if (isReady("click")) list.push({ id: "click", label: "🟦 Click" });
  if (isReady("payme")) list.push({ id: "payme", label: "🟩 Payme" });
  const card = pcfg().card;
  if (card.auto && data().settings.cardNumber) {
    list.push({ id: "cardauto", label: `🏦 Kartaga o'tkazish (avto, ${card.timeoutMin} daqiqa)` });
  }
  if (card.enabled !== false) list.push({ id: "card", label: "💳 Kartaga o'tkazish (chek)" });
  return list;
}
const autoMethods = () => methods().filter((m) => m.id !== "card");

// ---------- Kartaga o'tkazish (avto): noyob summa + vaqt chegarasi ----------
// Mijozga summa + 1..99 so'm qo'shilgan noyob summa beriladi. Karta kirimini kuzatuvchi xizmat/ilova
// /card manziliga o'tkazma xabarini yuboradi; summa mos kelsa va muddat tugamagan bo'lsa balans to'ldiriladi.
const GRACE = 60 * 1000; // bank xabari kechikishi uchun qo'shimcha vaqt
const pendingCard = () =>
  (data().payments || []).filter((p) => p.method === "cardauto" && p.status === "new" && p.expiresAt + GRACE > Date.now());

function cardSecret() {
  let sec = pcfg().card.secret;
  if (!sec) {
    sec = crypto.randomBytes(16).toString("hex");
    pset("card", "secret", sec);
  }
  return sec;
}

function createCardPayment(userId, base) {
  const used = new Set(pendingCard().map((p) => p.amount));
  const start = 1 + Math.floor(Math.random() * 99);
  let pay = 0;
  for (let i = 0; i < 99 && !pay; i++) {
    const cand = base + 1 + ((start + i) % 99);
    if (!used.has(cand)) pay = cand;
  }
  if (!pay) return null; // hozir juda band
  const p = createPayment(userId, pay, "cardauto");
  p.baseAmount = base;
  p.expiresAt = Date.now() + pcfg().card.timeoutMin * 60 * 1000;
  save();
  return p;
}

// Muddati o'tgan kutilayotgan to'lovlarni yopadi va mijozga xabar beradi
async function sweepExpired(api) {
  const now = Date.now();
  for (const p of data().payments || []) {
    if (p.method === "cardauto" && p.status === "new" && p.expiresAt + GRACE <= now) {
      p.status = "expired";
      save();
      await safeSend(api, p.userId, `⌛️ To'lov #${p.id} muddati tugadi (${fmt(p.amount)}). Pul o'tkazmagan bo'lsangiz, hisobni qaytadan to'ldiring.`);
    }
  }
}

const safeEq = (a, b) => {
  const x = crypto.createHash("sha256").update(String(a || "")).digest();
  const y = crypto.createHash("sha256").update(String(b || "")).digest();
  return crypto.timingSafeEqual(x, y);
};

// Matndan (bank SMS) summa nomzodlarini ajratadi: "50 013.00 UZS", "+50013 so'm" ...
function amountCandidates(f) {
  if (f.amount !== undefined && f.amount !== "") {
    const n = Number(String(f.amount).replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? [n] : [];
  }
  const text = String(f.text || f.message || f.body || f.sms || "");
  const near = [];
  const all = [];
  const re = /(\d[\d\s]*(?:[.,]\d{1,2})?)(\s*(?:uzs|sum|so'm|som|сум))?/gi;
  let m;
  while ((m = re.exec(text))) {
    const n = Number(m[1].replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(n)) continue;
    (m[2] ? near : all).push(n);
  }
  return [...near, ...all];
}

function cardHandle(f, query, headers, api) {
  const c = pcfg().card;
  if (!c.auto) return { code: 403, body: { ok: false, error: "disabled" } };
  const bearer = String(headers.authorization || "").replace(/^Bearer\s+/i, "");
  const secret = headers["x-secret"] || query.secret || f.secret || bearer;
  if (!c.secret || !safeEq(secret, c.secret)) return { code: 401, body: { ok: false, error: "bad secret" } };

  // Bir xil xabar ikki marta kelsa (id bo'lsa) qayta hisoblamaymiz
  const txid = f.id || f.txid || f.tx_id;
  if (!data().cardSeen) data().cardSeen = [];
  if (txid) {
    if (data().cardSeen.includes(String(txid))) return { code: 200, body: { ok: true, duplicate: true } };
    data().cardSeen.push(String(txid));
    if (data().cardSeen.length > 1000) data().cardSeen.shift();
  }

  const cands = amountCandidates(f);
  const pending = pendingCard();
  const p = cands.map((n) => pending.find((x) => x.amount === n)).find(Boolean);
  if (p) {
    const r = markPaid(p);
    if (r && r.u) notifyCredited(api, r.u, p.amount, r.info, "Karta").catch(() => {});
    return { code: 200, body: { ok: true, matched: true, payment: p.id } };
  }
  save();
  // Mos to'lov yo'q: admin qo'lda ko'rishi uchun xabar (muddati yaqinda tugagan bo'lsa ko'rsatamiz)
  const late = (data().payments || []).find(
    (x) => x.method === "cardauto" && x.status === "expired" && cands.includes(x.amount) && Date.now() - x.expiresAt < 3600 * 1000
  );
  if (cands.length) {
    notifyAdmins(
      api,
      late
        ? `⚠️ Kartaga ${fmt(late.amount)} tushdi, lekin to'lov #${late.id} muddati tugagan (foydalanuvchi ID: <code>${late.userId}</code>). Kerak bo'lsa balansini qo'lda to'ldiring.`
        : `ℹ️ Kartaga ${cands.slice(0, 3).map(fmt).join(" / ")} kirim xabari keldi, lekin mos to'lov topilmadi.`
    ).catch(() => {});
  }
  return { code: 200, body: { ok: true, matched: false } };
}

// ---------- Hisobni to'ldirish ----------
// Foydalanuvchi balansini oshiradi + do'st taklif bonusi (birinchi to'ldirishda). Sinxron ishlaydi.
function grantBalance(u, amount) {
  u.balance += amount;
  const bonus = data().settings.refBonus;
  const inviter = u.refBy && !u.refPaid ? data().users[u.refBy] : null;
  if (inviter && bonus > 0) {
    u.refPaid = true;
    inviter.balance += bonus;
    return { inviter, bonus };
  }
  return { inviter: null, bonus: 0 };
}

async function notifyCredited(api, u, amount, bonusInfo, methodLabel) {
  await safeSend(
    api,
    u.id,
    `✅ To'lov qabul qilindi! Hisobingiz <b>${fmt(amount)}</b> ga to'ldirildi.\n💰 Balans: ${fmt(u.balance)}`
  );
  if (bonusInfo && bonusInfo.inviter) {
    await safeSend(
      api,
      bonusInfo.inviter.id,
      `🎉 Siz taklif qilgan do'stingiz hisobini to'ldirdi! Sizga ${fmt(bonusInfo.bonus)} bonus berildi.\n💰 Balans: ${fmt(bonusInfo.inviter.balance)}`
    );
  }
  await notifyChat(api, `💳 Avto-to'lov (${esc(methodLabel)}): ${esc(u.name || u.id)} — ${fmt(amount)}`);
}

// To'lovni "to'langan" qiladi (qayta chaqirilsa ham ikki marta qo'shmaydi). Sinxron; xabarlar alohida yuboriladi.
function markPaid(p) {
  if (p.status === "paid") return null;
  const u = data().users[p.userId];
  p.status = "paid";
  p.paidAt = Date.now();
  let info = null;
  if (u) info = grantBalance(u, p.amount);
  save();
  return { u, info };
}

function createPayment(userId, amount, method) {
  const p = { id: nextId("pay"), userId, amount, method, status: "new", createdAt: Date.now() };
  if (!data().payments) data().payments = [];
  data().payments.push(p);
  save();
  return p;
}
const findPayment = (id) => (data().payments || []).find((p) => String(p.id) === String(id));

// To'lov havolasi
function payUrl(p, botUsername) {
  const c = pcfg();
  const back = botUsername ? `https://t.me/${botUsername}` : "https://t.me";
  if (p.method === "click") {
    const q = new URLSearchParams({
      service_id: c.click.serviceId,
      merchant_id: c.click.merchantId,
      amount: String(p.amount),
      transaction_param: String(p.id),
      return_url: back,
    });
    return "https://my.click.uz/services/pay?" + q.toString();
  }
  if (p.method === "payme") {
    // Payme: tiyinlarda summa; kassada maydon nomi aynan "order_id" bo'lishi kerak
    const raw = `m=${c.payme.merchantId};ac.order_id=${p.id};a=${p.amount * 100};c=${back}`;
    return "https://checkout.paycom.uz/" + Buffer.from(raw).toString("base64");
  }
  return null;
}

// ---------- Click (Shop API) ----------
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");

function clickHandle(f, api) {
  const c = pcfg().click;
  const base = {
    click_trans_id: f.click_trans_id,
    merchant_trans_id: f.merchant_trans_id,
  };
  const err = (code, note) => ({ ...base, error: code, error_note: note });

  if (!isReady("click")) return err(-8, "Click is not configured");
  const need = ["click_trans_id", "service_id", "merchant_trans_id", "amount", "action", "sign_time", "sign_string"];
  if (need.some((k) => f[k] === undefined || f[k] === "")) return err(-8, "Error in request from click");

  const action = String(f.action);
  const isComplete = action === "1";
  const sign = md5(
    `${f.click_trans_id}${f.service_id}${c.secretKey}${f.merchant_trans_id}${isComplete ? f.merchant_prepare_id ?? "" : ""}${f.amount}${f.action}${f.sign_time}`
  );
  if (sign !== String(f.sign_string).toLowerCase()) return err(-1, "SIGN CHECK FAILED!");
  if (String(f.service_id) !== String(c.serviceId)) return err(-8, "Error in request from click");
  if (action !== "0" && action !== "1") return err(-3, "Action not found");

  const p = findPayment(f.merchant_trans_id);
  if (!p || p.method !== "click") return err(action === "0" ? -5 : -6, action === "0" ? "User does not exist" : "Transaction does not exist");
  if (Math.abs(Number(f.amount) - p.amount) > 0.01) return err(-2, "Incorrect parameter amount");
  if (p.status === "paid") return err(-4, "Already paid");
  if (p.status === "cancelled") return err(-9, "Transaction cancelled");

  if (!isComplete) {
    p.status = "prepared";
    p.clickTransId = String(f.click_trans_id);
    save();
    return { ...base, merchant_prepare_id: p.id, error: 0, error_note: "Success" };
  }

  // complete
  if (String(f.merchant_prepare_id) !== String(p.id) || p.clickTransId !== String(f.click_trans_id)) {
    return err(-6, "Transaction does not exist");
  }
  if (Number(f.error) < 0) {
    p.status = "cancelled";
    save();
    return err(-9, "Transaction cancelled");
  }
  const r = markPaid(p);
  if (r && r.u) notifyCredited(api, r.u, p.amount, r.info, "Click").catch(() => {});
  return { ...base, merchant_confirm_id: p.id, error: 0, error_note: "Success" };
}

// ---------- Payme (Merchant API, JSON-RPC) ----------
const PAYME_TIMEOUT = 12 * 3600 * 1000;
const TX = () => {
  if (!data().paymeTx) data().paymeTx = [];
  return data().paymeTx;
};
const findTx = (id) => TX().find((t) => t.id === id);

class PaymeError extends Error {
  constructor(code, ru, uz, en, dataField) {
    super(en);
    this.rpc = { code, message: { ru, uz, en }, ...(dataField ? { data: dataField } : {}) };
  }
}
const ERR = {
  auth: () => new PaymeError(-32504, "Недостаточно привилегий", "Ruxsat yo'q", "Insufficient privilege"),
  noMethod: () => new PaymeError(-32601, "Метод не найден", "Metod topilmadi", "Method not found"),
  badReq: () => new PaymeError(-32600, "Неверный запрос", "Noto'g'ri so'rov", "Invalid request"),
  amount: () => new PaymeError(-31001, "Неверная сумма", "Noto'g'ri summa", "Incorrect amount"),
  noTx: () => new PaymeError(-31003, "Транзакция не найдена", "Tranzaksiya topilmadi", "Transaction not found"),
  cantDo: () => new PaymeError(-31008, "Невозможно выполнить операцию", "Amalni bajarib bo'lmaydi", "Unable to perform operation"),
  cantCancel: () => new PaymeError(-31007, "Заказ выполнен, отмена невозможна", "Buyurtma bajarilgan, bekor qilib bo'lmaydi", "Order completed, cannot cancel"),
  noOrder: () => new PaymeError(-31050, "Заказ не найден", "Buyurtma topilmadi", "Order not found", "order_id"),
  busy: () => new PaymeError(-31099, "Заказ недоступен для оплаты", "Buyurtma to'lov uchun mavjud emas", "Order unavailable", "order_id"),
};

function paymeAuthOk(header) {
  const key = pcfg().payme.key;
  if (!key || !header || !/^Basic /i.test(header)) return false;
  let dec = "";
  try { dec = Buffer.from(header.slice(6).trim(), "base64").toString("utf8"); } catch (e) { return false; }
  const i = dec.indexOf(":");
  if (i < 0) return false;
  const login = dec.slice(0, i);
  const pass = dec.slice(i + 1);
  const a = crypto.createHash("sha256").update(pass).digest();
  const b = crypto.createHash("sha256").update(key).digest();
  return login === "Paycom" && crypto.timingSafeEqual(a, b);
}

function paymeCheckOrder(params) {
  const p = findPayment(params && params.account && params.account.order_id);
  if (!p || p.method !== "payme") throw ERR.noOrder();
  if (Number(params.amount) !== p.amount * 100) throw ERR.amount();
  if (p.status === "paid") throw ERR.busy();
  return p;
}

const txView = (t) => ({
  create_time: t.time,
  perform_time: t.performTime || 0,
  cancel_time: t.cancelTime || 0,
  transaction: String(t.paymentId),
  state: t.state,
  reason: t.reason === undefined ? null : t.reason,
});

function paymeMethod(method, params, api) {
  const now = Date.now();
  switch (method) {
    case "CheckPerformTransaction": {
      paymeCheckOrder(params);
      return { allow: true };
    }
    case "CreateTransaction": {
      let t = findTx(params.id);
      if (t) {
        if (t.state !== 1) throw ERR.cantDo();
        if (now - t.time > PAYME_TIMEOUT) {
          t.state = -1;
          t.reason = 4;
          t.cancelTime = now;
          save();
          throw ERR.cantDo();
        }
        return { create_time: t.time, transaction: String(t.paymentId), state: 1 };
      }
      const p = paymeCheckOrder(params);
      // Bu buyurtmada boshqa tranzaksiya kutilayotgan bo'lsa — band
      if (TX().some((x) => x.paymentId === p.id && x.state === 1)) throw ERR.busy();
      t = { id: params.id, paymentId: p.id, amount: params.amount, time: Number(params.time) || now, state: 1 };
      TX().push(t);
      save();
      return { create_time: t.time, transaction: String(p.id), state: 1 };
    }
    case "PerformTransaction": {
      const t = findTx(params.id);
      if (!t) throw ERR.noTx();
      if (t.state === 2) return { transaction: String(t.paymentId), perform_time: t.performTime, state: 2 };
      if (t.state !== 1) throw ERR.cantDo();
      if (now - t.time > PAYME_TIMEOUT) {
        t.state = -1;
        t.reason = 4;
        t.cancelTime = now;
        save();
        throw ERR.cantDo();
      }
      const p = findPayment(t.paymentId);
      t.state = 2;
      t.performTime = now;
      const r = p ? markPaid(p) : null;
      save();
      if (r && r.u) notifyCredited(api, r.u, p.amount, r.info, "Payme").catch(() => {});
      return { transaction: String(t.paymentId), perform_time: now, state: 2 };
    }
    case "CancelTransaction": {
      const t = findTx(params.id);
      if (!t) throw ERR.noTx();
      if (t.state === 1) {
        t.state = -1;
        t.cancelTime = now;
        t.reason = params.reason;
        save();
      } else if (t.state === 2) {
        // To'lov bajarilgan: pul hisobda turgan bo'lsagina qaytarib olamiz
        const p = findPayment(t.paymentId);
        const u = p && data().users[p.userId];
        if (!u || u.balance < t.amount / 100) throw ERR.cantCancel();
        u.balance -= t.amount / 100;
        p.status = "cancelled";
        t.state = -2;
        t.cancelTime = now;
        t.reason = params.reason;
        save();
        safeSend(api, u.id, `ℹ️ To'lov bekor qilindi, ${fmt(t.amount / 100)} hisobingizdan ayirildi.`).catch(() => {});
      }
      return { transaction: String(t.paymentId), cancel_time: t.cancelTime, state: t.state };
    }
    case "CheckTransaction": {
      const t = findTx(params.id);
      if (!t) throw ERR.noTx();
      return txView(t);
    }
    case "GetStatement": {
      const from = Number(params.from);
      const to = Number(params.to);
      const list = TX()
        .filter((t) => t.time >= from && t.time <= to)
        .map((t) => ({
          id: t.id,
          time: t.time,
          amount: t.amount,
          account: { order_id: String(t.paymentId) },
          ...txView(t),
        }));
      return { transactions: list };
    }
    default:
      throw ERR.noMethod();
  }
}

function paymeHandle(body, authHeader, api) {
  const id = body && body.id !== undefined ? body.id : null;
  try {
    if (!paymeAuthOk(authHeader)) throw ERR.auth();
    if (!body || typeof body.method !== "string") throw ERR.badReq();
    const result = paymeMethod(body.method, body.params || {}, api);
    return { jsonrpc: "2.0", id, result };
  } catch (e) {
    if (e instanceof PaymeError) return { jsonrpc: "2.0", id, error: e.rpc };
    console.error("Payme xatosi:", e);
    return { jsonrpc: "2.0", id, error: { code: -32400, message: { ru: "Системная ошибка", uz: "Tizim xatosi", en: "System error" } } };
  }
}

// ---------- HTTP server ----------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 200000) { reject(new Error("too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseBody(raw, type) {
  if (!raw) return {};
  if (/json/i.test(type || "") || raw.trim().startsWith("{")) {
    try { return JSON.parse(raw); } catch (e) { return { text: raw }; }
  }
  if (/x-www-form-urlencoded/i.test(type || "")) return Object.fromEntries(new URLSearchParams(raw));
  if (/^[\w.-]+=/.test(raw) && !/\s/.test(raw.trim().split("&")[0])) return Object.fromEntries(new URLSearchParams(raw));
  return { text: raw };
}

function createServer(getApi) {
  return http.createServer(async (req, res) => {
    const send = (code, obj) => {
      res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(obj));
    };
    const [rawPath, qs] = (req.url || "/").split("?");
    const path = rawPath.replace(/\/+$/, "") || "/";
    const query = Object.fromEntries(new URLSearchParams(qs || ""));
    if (path === "/api/v1" || path.startsWith("/api/v1/")) {
      return require("./api").handle(req, res, getApi(), path, readBody);
    }
    if (req.method !== "POST") {
      res.writeHead(200);
      return res.end("OK");
    }
    try {
      const raw = await readBody(req);
      if (path === "/click" || path === "/click/prepare" || path === "/click/complete") {
        return send(200, clickHandle(parseBody(raw, req.headers["content-type"]), getApi()));
      }
      if (path === "/card") {
        const r = cardHandle(parseBody(raw, req.headers["content-type"]), query, req.headers, getApi());
        return send(r.code, r.body);
      }
      if (path === "/payme") {
        return send(200, paymeHandle(parseBody(raw, "json"), req.headers.authorization, getApi()));
      }
      send(404, { error: "not found" });
    } catch (e) {
      console.error("Webhook xatosi:", e.message);
      send(400, { error: "bad request" });
    }
  });
}

function startServer(getApi) {
  const port = Number(process.env.PORT) || 3000;
  const server = createServer(getApi);
  server.on("error", (e) => console.error("HTTP server ishga tushmadi (to'lov webhooklari ishlamaydi):", e.message));
  setInterval(() => sweepExpired(getApi()).catch((e) => console.error("sweep:", e.message)), 30000).unref();
  server.listen(port, () => console.log("HTTP port: " + port));
  return server;
}

const baseUrl = () => (process.env.PUBLIC_URL || "").replace(/\/$/, "") || "https://SIZNING-DOMEN";

module.exports = {
  SYSTEMS,
  pcfg,
  pset,
  isReady,
  missingFields,
  methods,
  autoMethods,
  grantBalance,
  createPayment,
  createCardPayment,
  cardSecret,
  cardHandle,
  sweepExpired,
  findPayment,
  payUrl,
  clickHandle,
  paymeHandle,
  createServer,
  startServer,
  baseUrl,
};

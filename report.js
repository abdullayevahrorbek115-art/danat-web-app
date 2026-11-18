// Moliya hisoboti: kunlik/oylik kirim (hisob to'ldirishlar), savdo (buyurtmalarga sarflangan pul), tannarx va foyda.
// Vaqt mintaqasi: TIMEZONE (.env), standart Asia/Tashkent.
const { data, save } = require("./db");
const { allAdmins } = require("./config");
const { fmt } = require("./util");
const { safeSend } = require("./orders");

const TZ = process.env.TIMEZONE || "Asia/Tashkent";
const dayKey = (ts) => new Date(ts).toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
const monthKey = (ts) => dayKey(ts).slice(0, 7);
const num = (n) => Number(n || 0).toLocaleString("ru-RU");
const dayLabel = (k) => `${k.slice(8, 10)}.${k.slice(5, 7)}`;
const monthLabel = (k) => `${k.slice(5, 7)}.${k.slice(0, 4)}`;

// Barcha moliyaviy voqealar: kirim (to'ldirish) va savdo (bajarilgan buyurtma)
function events() {
  const d = data();
  const income = [];
  d.topups.filter((t) => t.status === "approved").forEach((t) =>
    income.push({ ts: t.approvedAt || t.createdAt, amount: t.amount })
  );
  (d.payments || []).filter((p) => p.status === "paid").forEach((p) =>
    income.push({ ts: p.paidAt || p.createdAt, amount: p.amount })
  );
  const sales = d.orders
    .filter((o) => o.status === "done")
    .map((o) => ({ ts: o.doneAt || o.createdAt, price: o.price, cost: o.cost || 0 }));
  return { income, sales };
}

function summarize(ev, match) {
  const r = { income: 0, topups: 0, sales: 0, orders: 0, cost: 0 };
  ev.income.filter((e) => match(e.ts)).forEach((e) => { r.income += e.amount; r.topups++; });
  ev.sales.filter((e) => match(e.ts)).forEach((e) => { r.sales += e.price; r.cost += e.cost; r.orders++; });
  r.profit = r.sales - r.cost;
  return r;
}

const hasCost = (ev) => ev.sales.some((s) => s.cost > 0);

function block(title, r, withCost) {
  let t = `<b>${title}</b>\n🟢 Kirim (to'ldirilgan): ${fmt(r.income)} (${r.topups} ta)\n🛒 Savdo (sarflangan): ${fmt(r.sales)} (${r.orders} ta)`;
  if (withCost) t += `\n📉 Tannarx: ${fmt(r.cost)}\n📈 Foyda: ${fmt(r.profit)}`;
  return t;
}

function overview() {
  const ev = events();
  const now = Date.now();
  const today = dayKey(now);
  const yest = dayKey(now - 86400000);
  const week = new Set(Array.from({ length: 7 }, (_, i) => dayKey(now - i * 86400000)));
  const month = monthKey(now);
  const c = hasCost(ev);
  const balances = Object.values(data().users).reduce((s, u) => s + (u.balance || 0), 0);
  return (
    "💰 <b>Hisobot</b>\n\n" +
    [
      block("📅 Bugun", summarize(ev, (t) => dayKey(t) === today), c),
      block("🕘 Kecha", summarize(ev, (t) => dayKey(t) === yest), c),
      block("🗓 Oxirgi 7 kun", summarize(ev, (t) => week.has(dayKey(t))), c),
      block("📆 Shu oy", summarize(ev, (t) => monthKey(t) === month), c),
      block("♾ Hammasi", summarize(ev, () => true), c),
    ].join("\n\n") +
    `\n\n💼 Mijozlar balansida turgan pul: ${fmt(balances)}` +
    (c ? "" : "\n\n<i>Foyda ko'rish uchun paketga tannarx kiriting (📦 Paket → 💰 Tannarx).</i>")
  );
}

function byPeriod(keyFn, labelFn, limit, title) {
  const ev = events();
  const keys = new Set([...ev.income.map((e) => keyFn(e.ts)), ...ev.sales.map((e) => keyFn(e.ts))]);
  const list = [...keys].sort().reverse().slice(0, limit);
  if (!list.length) return `${title}\n\nHozircha ma'lumot yo'q.`;
  const c = hasCost(ev);
  const lines = list.map((k) => {
    const r = summarize(ev, (t) => keyFn(t) === k);
    return `<b>${labelFn(k)}</b> — kirim ${num(r.income)} • savdo ${num(r.sales)} (${r.orders} ta)` + (c ? ` • foyda ${num(r.profit)}` : "");
  });
  return `${title}\n<i>so'mda; kirim = hisob to'ldirish, savdo = buyurtmalarga sarflangan</i>\n\n` + lines.join("\n");
}

const daily = () => byPeriod(dayKey, dayLabel, 31, "📅 <b>Kunlar bo'yicha (oxirgi 31 kun)</b>");
const monthly = () => byPeriod(monthKey, monthLabel, 12, "📆 <b>Oylar bo'yicha (oxirgi 12 oy)</b>");

// Kunlik avtomatik hisobot: har kuni 23:55 da adminlarga yuboriladi
function dailyText() {
  const ev = events();
  const now = Date.now();
  const today = dayKey(now);
  const month = monthKey(now);
  const c = hasCost(ev);
  return (
    `📊 <b>Kunlik hisobot — ${dayLabel(today)}.${today.slice(0, 4)}</b>\n\n` +
    block("Bugun", summarize(ev, (t) => dayKey(t) === today), c) +
    "\n\n" +
    block("Shu oy (hozirgacha)", summarize(ev, (t) => monthKey(t) === month), c)
  );
}

function startReports(getApi) {
  const tick = async () => {
    const st = data().settings;
    if (st.dailyReport === false) return;
    const now = new Date();
    const hm = now.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
    const today = dayKey(now.getTime());
    if (hm < "23:55" || st.lastReportDay === today) return;
    st.lastReportDay = today;
    save();
    const text = dailyText();
    for (const id of allAdmins()) await safeSend(getApi(), id, text);
  };
  setInterval(() => tick().catch((e) => console.error("Hisobot xatosi:", e.message)), 60000).unref();
}

module.exports = { overview, daily, monthly, dailyText, startReports, summarize, events, dayKey };

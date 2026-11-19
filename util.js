const MENU = {
  shop: "🎮 Donat olish",
  bal: "💰 Hisobim",
  orders: "📦 Buyurtmalarim",
  promo: "🎁 Promo kod",
  ref: "👥 Do'st taklif qilish",
  help: "☎️ Aloqa",
  api: "🔌 API",
};

// HTML parse_mode uchun xavfsiz matn
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const fmt = (n) => `${Number(n).toLocaleString("ru-RU")} so'm`;

// Callback bo'lsa xabarni tahrirlaydi, aks holda yangi xabar yuboradi
async function show(ctx, text, kb) {
  const extra = { parse_mode: "HTML" };
  if (kb) extra.reply_markup = kb;
  if (ctx.callbackQuery && ctx.callbackQuery.message) {
    try {
      await ctx.editMessageText(text, extra);
      return;
    } catch (e) {
      if (String(e.description || e.message).includes("not modified")) return;
    }
  }
  await ctx.reply(text, extra);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { MENU, esc, fmt, show, sleep };

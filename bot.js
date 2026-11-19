const { Bot, session, InlineKeyboard } = require("grammy");
const { token, isAdmin, allAdmins } = require("./config");
const { getUser, data, save } = require("./db");
const { admin, adminText, panel } = require("./admin");
const { user, handleText, mainKb, reset } = require("./user");

if (!token) {
  console.error("BOT_TOKEN topilmadi. .env faylini tekshiring (.env.example ga qarang).");
  process.exit(1);
}
if (!allAdmins().length) {
  console.warn("⚠️ ADMIN_IDS bo'sh — admin panel ishlamaydi. Botga /myid yuborib ID ni oling va .env ga yozing.");
}

const bot = new Bot(token);

bot.use(session({ initial: () => ({ step: null, tmp: {} }) }));

// Guruh/kanal ID sini bilish uchun (admin panelda guruhni ulashda kerak)
bot.command("chatid", (ctx) => ctx.reply(`Bu chatning ID si: ${ctx.chat.id}`));

// Faqat shaxsiy chatlar
bot.use(async (ctx, next) => {
  if (ctx.chat && ctx.chat.type !== "private") return;
  await next();
});

// Foydalanuvchini ro'yxatga olish
bot.use(async (ctx, next) => {
  if (ctx.from) getUser(ctx.from);
  await next();
});

// Majburiy obuna (admin panel → Kanal/guruh)
const subCache = new Map(); // userId -> obuna tasdiqlangan vaqt

async function missingChannels(ctx) {
  const missing = [];
  for (const ch of data().settings.requiredChannels || []) {
    try {
      const m = await ctx.api.getChatMember(ch, ctx.from.id);
      if (!["member", "administrator", "creator"].includes(m.status)) missing.push(ch);
    } catch (e) {
      console.error("Obunani tekshirib bo'lmadi:", ch, e.description || e.message);
    }
  }
  return missing;
}

bot.use(async (ctx, next) => {
  const channels = data().settings.requiredChannels || [];
  if (!channels.length || !ctx.from || isAdmin(ctx.from.id)) return next();
  const isCheck = ctx.callbackQuery && ctx.callbackQuery.data === "chk";
  const ts = subCache.get(ctx.from.id);
  if (!isCheck && ts && Date.now() - ts < 60000) return next();
  const missing = await missingChannels(ctx);
  if (!missing.length) {
    subCache.set(ctx.from.id, Date.now());
    return next();
  }
  subCache.delete(ctx.from.id);
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: "Avval kanallarga obuna bo'ling", show_alert: true }).catch(() => {});
    return;
  }
  const kb = new InlineKeyboard();
  missing.forEach((ch) => {
    if (ch.startsWith("@")) kb.url(`📢 ${ch}`, `https://t.me/${ch.slice(1)}`).row();
  });
  kb.text("✅ Tekshirish", "chk");
  await ctx.reply("❗️ Botdan foydalanish uchun quyidagi kanallarga obuna bo'ling, so'ng «Tekshirish» tugmasini bosing:", {
    reply_markup: kb,
  });
});

bot.callbackQuery("chk", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "✅ Rahmat!" });
  await ctx.reply("✅ Obuna tasdiqlandi. Endi botdan foydalanishingiz mumkin.", { reply_markup: mainKb() });
});

bot.command("start", async (ctx) => {
  reset(ctx);
  // Do'st taklif havolasi: /start ref_123456
  const m = /^ref_(\d+)$/.exec(ctx.match || "");
  const self = data().users[ctx.from.id];
  if (m && self && self.refBy === undefined && Date.now() - self.joined < 60000) {
    const refId = Number(m[1]);
    if (refId !== self.id && data().users[refId]) {
      self.refBy = refId;
      save();
    }
  }
  const extra = isAdmin(ctx.from.id) ? "\n\n🛠 Boshqaruv paneli: /admin" : "";
  await ctx.reply(data().settings.welcome + extra, { reply_markup: mainKb() });
});

bot.command("myid", (ctx) => ctx.reply(`Sizning Telegram ID: ${ctx.from.id}`));

bot.command("admin", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply("⛔️ Sizda ruxsat yo'q.");
  await panel(ctx);
});

bot.use(admin);
bot.use(user);

bot.on("message:text", async (ctx) => {
  if (await adminText(ctx)) return;
  if (await handleText(ctx)) return;
  await ctx.reply("Menyudan foydalaning 👇", { reply_markup: mainKb() });
});

bot.catch((err) => console.error("Bot xatosi:", err.error || err));

bot.start({ onStart: (me) => console.log(`✅ @${me.username} ishga tushdi`) });

// HTTP server: hosting health-check (Render va h.k.) + to'lov tizimlari webhooklari (Click/Payme)
require("./payments").startServer(() => bot.api);
// Kunlik moliyaviy hisobot (har kuni 23:55 da adminlarga)
require("./report").startReports(() => bot.api);
// Provayderda jarayondagi buyurtmalarni kuzatish
require("./orders").startPolling(() => bot.api);

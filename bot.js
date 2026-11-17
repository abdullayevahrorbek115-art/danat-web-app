const { Bot, session } = require("grammy");
const { token, isAdmin, adminIds } = require("./config");
const { getUser, data } = require("./db");
const { admin, adminText, panel } = require("./admin");
const { user, handleText, mainKb, reset } = require("./user");

if (!token) {
  console.error("BOT_TOKEN topilmadi. .env faylini tekshiring (.env.example ga qarang).");
  process.exit(1);
}
if (!adminIds.length) {
  console.warn("⚠️ ADMIN_IDS bo'sh — admin panel ishlamaydi. Botga /myid yuborib ID ni oling va .env ga yozing.");
}

const bot = new Bot(token);

bot.use(session({ initial: () => ({ step: null, tmp: {} }) }));

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

bot.command("start", async (ctx) => {
  reset(ctx);
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

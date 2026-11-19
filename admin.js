// Admin panel: o'yinlar, paketlar, buyurtmalar, to'lovlar, sozlamalar, xabar yuborish
const { Composer, InlineKeyboard } = require("grammy");
const { data, save, nextId } = require("./db");
const { isAdmin, isMainAdmin, adminIds, allAdmins } = require("./config");
const { esc, fmt, show, sleep, MENU } = require("./util");
const provider = require("./provider");
const apiSvc = require("./api");
const payments = require("./payments");
const report = require("./report");
const { mainKb } = require("./user");
const {
  completeOrder,
  cancelOrder,
  safeSend,
  adminOrderText,
  orderKb,
} = require("./orders");

const admin = new Composer();
const adm = admin.filter((ctx) => isAdmin(ctx.from && ctx.from.id));

const reset = (ctx) => {
  ctx.session.step = null;
  ctx.session.tmp = {};
};
const findGame = (id) => data().games.find((g) => g.id === Number(id));
const apiOn = () => data().settings.providerMode === "api";
const findPkg = (id) => data().packages.find((p) => p.id === Number(id));
const parseNum = (t) => parseInt(String(t).replace(/[\s,._]/g, ""), 10);

const SETTINGS = {
  cardNumber: "💳 Karta raqami",
  cardOwner: "👤 Karta egasi",
  contact: "☎️ Aloqa (username/telefon)",
  welcome: "👋 Salomlashish matni",
  minTopup: "💵 Minimal to'ldirish summasi",
  refBonus: "🎁 Do'st taklif bonusi (so'm, 0 = o'chiq)",
  providerMode: "🔌 Yetkazish rejimi",
};

// ---------- Bosh panel ----------
const panelKb = () =>
  new InlineKeyboard()
    .text("🎮 O'yinlar", "a:games")
    .text("📦 Buyurtmalar", "a:orders")
    .row()
    .text("💳 Chekslar", "a:topups")
    .text("👥 Foydalanuvchilar", "a:users")
    .row()
    .text("⚙️ Sozlamalar", "a:settings")
    .text("📢 Xabar yuborish", "a:bc")
    .row()
    .text("🎁 Promo kodlar", "a:promo")
    .text("📡 Kanal/guruh", "a:chan")
    .row()
    .text("📊 Statistika", "a:stats")
    .text("👮 Adminlar", "a:admins")
    .row()
    .text("🔌 Provayder", "a:prov")
    .text("🔘 Tugmalar", "a:btns")
    .row()
    .text("💳 To'lov tizimlari", "a:pay")
    .text("💰 Hisobot", "a:rep")
    .row()
    .text("🔌 API (mijozlar)", "a:akl");

async function panel(ctx) {
  reset(ctx);
  await show(ctx, "🛠 <b>Boshqaruv paneli</b>", panelKb());
}

// "a:" bilan boshlanadigan har bir tugma bosilganda kutilayotgan kiritish bekor bo'ladi
adm.on("callback_query:data", async (ctx, next) => {
  const d = ctx.callbackQuery.data;
  if (d.startsWith("a:") && d !== "a:bcy" && !d.startsWith("a:bf")) reset(ctx);
  await next();
});

adm.callbackQuery("a:home", async (ctx) => {
  await ctx.answerCallbackQuery();
  await panel(ctx);
});

async function ask(ctx, step, tmp, prompt) {
  await ctx.answerCallbackQuery();
  ctx.session.step = step;
  ctx.session.tmp = tmp;
  await ctx.reply(prompt, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text("❌ Bekor qilish", "a:home"),
  });
}

// ---------- O'yinlar ----------
async function gamesList(ctx) {
  const kb = new InlineKeyboard();
  data().games.forEach((g) =>
    kb.text(`${g.active ? "✅" : "🚫"} ${g.emoji} ${g.name}`, `a:g:${g.id}`).row()
  );
  kb.text("➕ O'yin qo'shish", "a:gn").row();
  kb.text("⭐ Telegram Premium/Stars qo'shish", "a:gtg").row().text("⬅️ Orqaga", "a:home");
  await show(ctx, "🎮 <b>O'yinlar</b>\nTahrirlash uchun o'yinni tanlang:", kb);
}

async function gameMenu(ctx, id) {
  const g = findGame(id);
  if (!g) return gamesList(ctx);
  const n = data().packages.filter((p) => p.gameId === g.id).length;
  const text =
    `${g.emoji} <b>${esc(g.name)}</b>\n` +
    `Holat: ${g.active ? "✅ yoqilgan" : "🚫 o'chirilgan"}\n` +
    `Turi: ${g.kind === "tg" ? "⭐ Telegram (username so'raladi)" : "🎮 O'yin (Player ID so'raladi)"}\n` +
    `Server ID so'rash: ${g.needsServer ? "ha" : "yo'q"}\n` +
    (apiOn() ? `Provayder kodi: ${g.providerCode ? "<code>" + esc(g.providerCode) + "</code>" : "—"}\n` : "") +
    `Paketlar: ${n} ta`;
  const kb = new InlineKeyboard()
    .text(`📦 Paketlar (${n})`, `a:pl:${g.id}`)
    .row()
    .text("➕ Paket qo'shish", `a:pn:${g.id}`)
    .row()
    .text("✏️ Nomi", `a:ge:${g.id}`);
  if (apiOn()) kb.text("🔑 Provayder kodi", `a:gc:${g.id}`);
  kb.row()
    .text(g.needsServer ? "🌐 Server ID: yoqilgan" : "🌐 Server ID: o'chiq", `a:gs:${g.id}`)
    .row()
    .text(g.kind === "tg" ? "⭐ Turi: Telegram (username)" : "🎮 Turi: O'yin (ID)", `a:gk:${g.id}`)
    .row()
    .text(g.active ? "🚫 Vaqtincha o'chirish" : "✅ Yoqish", `a:gt:${g.id}`)
    .row()
    .text("🗑 Butunlay o'chirish", `a:gd:${g.id}`)
    .row()
    .text("⬅️ Orqaga", "a:games");
  await show(ctx, text, kb);
}

adm.callbackQuery("a:games", async (ctx) => { await ctx.answerCallbackQuery(); await gamesList(ctx); });
adm.callbackQuery(/^a:g:(\d+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await gameMenu(ctx, ctx.match[1]); });
adm.callbackQuery("a:gn", (ctx) => ask(ctx, "adm:gname", {}, "🎮 Yangi o'yin nomini yuboring:"));
adm.callbackQuery(/^a:ge:(\d+)$/, (ctx) => ask(ctx, "adm:gedit", { id: ctx.match[1] }, "✏️ O'yinning yangi nomini yuboring:"));
adm.callbackQuery(/^a:gc:(\d+)$/, (ctx) =>
  ask(ctx, "adm:gcode", { id: ctx.match[1] }, "🔑 Provayderdagi o'yin kodini yuboring (o'chirish uchun <code>-</code>):")
);
adm.callbackQuery(/^a:gs:(\d+)$/, async (ctx) => {
  const g = findGame(ctx.match[1]);
  if (g) { g.needsServer = !g.needsServer; save(); }
  await ctx.answerCallbackQuery();
  await gameMenu(ctx, ctx.match[1]);
});
adm.callbackQuery(/^a:gk:(\d+)$/, async (ctx) => {
  const g = findGame(ctx.match[1]);
  if (g) {
    g.kind = g.kind === "tg" ? "game" : "tg";
    if (g.kind === "tg") g.needsServer = false;
    save();
  }
  await ctx.answerCallbackQuery();
  await gameMenu(ctx, ctx.match[1]);
});
adm.callbackQuery("a:gtg", async (ctx) => {
  let added = 0;
  for (const [name, emoji] of [["Telegram Premium", "💎"], ["Telegram Stars", "⭐"]]) {
    if (data().games.some((g) => g.name === name)) continue;
    data().games.push({ id: nextId("game"), name, emoji, needsServer: false, active: true, providerCode: "", kind: "tg" });
    added++;
  }
  save();
  await ctx.answerCallbackQuery({ text: added ? "✅ Qo'shildi. Endi paketlarni kiriting." : "Ular allaqachon bor", show_alert: !!added });
  await gamesList(ctx);
});
adm.callbackQuery(/^a:gt:(\d+)$/, async (ctx) => {
  const g = findGame(ctx.match[1]);
  if (g) { g.active = !g.active; save(); }
  await ctx.answerCallbackQuery();
  await gameMenu(ctx, ctx.match[1]);
});
adm.callbackQuery(/^a:gd:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const g = findGame(ctx.match[1]);
  if (!g) return gamesList(ctx);
  const kb = new InlineKeyboard().text("🗑 Ha, o'chirish", `a:gdy:${g.id}`).text("⬅️ Yo'q", `a:g:${g.id}`);
  await show(ctx, `❓ <b>${esc(g.name)}</b> va uning barcha paketlari o'chirilsinmi?`, kb);
});
adm.callbackQuery(/^a:gdy:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  data().games = data().games.filter((g) => g.id !== id);
  data().packages = data().packages.filter((p) => p.gameId !== id);
  save();
  await ctx.answerCallbackQuery({ text: "O'chirildi" });
  await gamesList(ctx);
});

// ---------- Paketlar ----------
async function packagesList(ctx, gameId) {
  const g = findGame(gameId);
  if (!g) return gamesList(ctx);
  const kb = new InlineKeyboard();
  data()
    .packages.filter((p) => p.gameId === g.id)
    .forEach((p) => kb.text(`${p.active ? "✅" : "🚫"} ${p.name} — ${fmt(p.price)}`, `a:p:${p.id}`).row());
  kb.text("➕ Paket qo'shish", `a:pn:${g.id}`).row();
  kb.text("📝 Ko'p paketni birdan qo'shish", `a:pb:${g.id}`).row().text("⬅️ Orqaga", `a:g:${g.id}`);
  await show(ctx, `📦 <b>${esc(g.name)}</b> paketlari:`, kb);
}

async function pkgMenu(ctx, id) {
  const p = findPkg(id);
  if (!p) return gamesList(ctx);
  const g = findGame(p.gameId);
  const text =
    `📦 <b>${esc(p.name)}</b>\n🎮 ${esc(g ? g.name : "?")}\n💵 Narx: <b>${fmt(p.price)}</b>\n` +
    `Holat: ${p.active ? "✅ yoqilgan" : "🚫 o'chirilgan"}\n` +
    (apiOn() ? `Provayder SKU: ${p.sku ? "<code>" + esc(p.sku) + "</code>" : "—"}\n` : "") +
    `Yetkazish: ${p.delivery === "code" ? "🎟 avtomatik kod (ombor: " + (p.stock || []).length + " ta)" : "👤 ID bo'yicha (qo'lda" + (apiOn() ? " yoki API" : "") + ")"}\n` +
    `Tannarx: ${p.cost ? fmt(p.cost) : "—"} <i>(hisobotda foyda hisoblash uchun)</i>`;
  const kb = new InlineKeyboard()
    .text("✏️ Nomi", `a:pe:${p.id}`)
    .text("💵 Narxi", `a:pp:${p.id}`)
    .row()
    .text(p.delivery === "code" ? "🎟 Turi: avto kod" : "👤 Turi: ID bo'yicha", `a:sd:${p.id}`)
    .row();
  if (p.delivery === "code") kb.text(`🗂 Kod ombori (${(p.stock || []).length})`, `a:sk:${p.id}`).row();
  if (apiOn()) kb.text("🔑 Provayder SKU", `a:pk:${p.id}`);
  kb.text("💰 Tannarx", `a:pco:${p.id}`)
    .row()
    .text(p.active ? "🚫 O'chirib qo'yish" : "✅ Yoqish", `a:pt:${p.id}`)
    .row()
    .text("🗑 O'chirish", `a:pd:${p.id}`)
    .row()
    .text("⬅️ Orqaga", `a:pl:${p.gameId}`);
  await show(ctx, text, kb);
}

adm.callbackQuery(/^a:pb:(\d+)$/, (ctx) =>
  ask(
    ctx,
    "adm:pbulk",
    { gameId: Number(ctx.match[1]) },
    "📝 Paketlarni bitta xabarda yuboring — <b>har qatorga bitta paket</b>: nomi va narxi (so'mda).\n\nMasalan:\n<code>60 UC - 12000\n325 UC - 60000\n660 UC - 120000</code>"
  )
);
adm.callbackQuery(/^a:pl:(\d+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await packagesList(ctx, ctx.match[1]); });
adm.callbackQuery(/^a:p:(\d+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await pkgMenu(ctx, ctx.match[1]); });
adm.callbackQuery(/^a:pn:(\d+)$/, (ctx) =>
  ask(ctx, "adm:pname", { gameId: Number(ctx.match[1]) }, "➕ Yangi paket nomini yuboring (masalan: <code>60 UC</code>):")
);
adm.callbackQuery(/^a:pe:(\d+)$/, (ctx) => ask(ctx, "adm:pedit", { id: ctx.match[1] }, "✏️ Paketning yangi nomini yuboring:"));
adm.callbackQuery(/^a:pp:(\d+)$/, (ctx) => ask(ctx, "adm:pnewprice", { id: ctx.match[1] }, "💵 Yangi narxni yuboring (so'mda, faqat raqam):"));
adm.callbackQuery(/^a:pk:(\d+)$/, (ctx) =>
  ask(ctx, "adm:psku", { id: ctx.match[1] }, "🔑 Provayderdagi paket kodini (SKU) yuboring (o'chirish uchun <code>-</code>):")
);
adm.callbackQuery(/^a:pco:(\d+)$/, (ctx) =>
  ask(ctx, "adm:pcost", { id: ctx.match[1] }, "💰 Paketning tannarxini yuboring (so'mda — siz qancha to'laysiz). Olib tashlash uchun <code>0</code>:")
);
adm.callbackQuery(/^a:sd:(\d+)$/, async (ctx) => {
  const p = findPkg(ctx.match[1]);
  if (p) { p.delivery = p.delivery === "code" ? "" : "code"; if (!p.stock) p.stock = []; save(); }
  await ctx.answerCallbackQuery();
  await pkgMenu(ctx, ctx.match[1]);
});
adm.callbackQuery(/^a:sk:(\d+)$/, async (ctx) => {
  const p = findPkg(ctx.match[1]);
  if (!p) return ctx.answerCallbackQuery();
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard()
    .text("➕ Kod qo'shish", `a:ska:${p.id}`)
    .row()
    .text("🧹 Omborni tozalash", `a:skc:${p.id}`)
    .row()
    .text("⬅️ Orqaga", `a:p:${p.id}`);
  await show(ctx, `🗂 <b>${esc(p.name)}</b> — kod ombori: <b>${(p.stock || []).length}</b> ta kod.\nMijoz sotib olganda kod shu yerdan avtomatik yuboriladi.`, kb);
});
adm.callbackQuery(/^a:ska:(\d+)$/, (ctx) =>
  ask(ctx, "adm:stock", { id: ctx.match[1] }, "🎟 Kodlarni yuboring — <b>har qatorga bitta kod</b> (bir nechta qator yozishingiz mumkin):")
);
adm.callbackQuery(/^a:skc:(\d+)$/, async (ctx) => {
  const p = findPkg(ctx.match[1]);
  if (p) { p.stock = []; save(); }
  await ctx.answerCallbackQuery({ text: "Ombor tozalandi" });
  await pkgMenu(ctx, ctx.match[1]);
});
adm.callbackQuery(/^a:pt:(\d+)$/, async (ctx) => {
  const p = findPkg(ctx.match[1]);
  if (p) { p.active = !p.active; save(); }
  await ctx.answerCallbackQuery();
  await pkgMenu(ctx, ctx.match[1]);
});
adm.callbackQuery(/^a:pd:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = findPkg(ctx.match[1]);
  if (!p) return gamesList(ctx);
  const kb = new InlineKeyboard().text("🗑 Ha, o'chirish", `a:pdy:${p.id}`).text("⬅️ Yo'q", `a:p:${p.id}`);
  await show(ctx, `❓ <b>${esc(p.name)}</b> paketi o'chirilsinmi?`, kb);
});
adm.callbackQuery(/^a:pdy:(\d+)$/, async (ctx) => {
  const p = findPkg(ctx.match[1]);
  const gid = p ? p.gameId : null;
  data().packages = data().packages.filter((x) => x.id !== Number(ctx.match[1]));
  save();
  await ctx.answerCallbackQuery({ text: "O'chirildi" });
  if (gid) await packagesList(ctx, gid);
  else await gamesList(ctx);
});

// ---------- Buyurtmalar ----------
async function markDone(ctx, suffix) {
  const m = ctx.callbackQuery.message;
  if (!m) return;
  const empty = { inline_keyboard: [] };
  try {
    if (m.photo) {
      await ctx.editMessageCaption({ caption: (m.caption || "") + suffix, reply_markup: empty });
    } else {
      await ctx.editMessageText((m.text || "") + suffix, { reply_markup: empty });
    }
  } catch (e) {
    console.error("Xabarni yangilab bo'lmadi:", e.message);
  }
}

adm.callbackQuery("a:orders", async (ctx) => {
  await ctx.answerCallbackQuery();
  const list = data().orders.filter((o) => o.status === "pending");
  await ctx.reply(`📦 Yetkazilishi kutilayotgan buyurtmalar: ${list.length} ta`, {
    reply_markup: new InlineKeyboard().text("⬅️ Panel", "a:home"),
  });
  for (const o of list.slice(0, 15)) {
    await safeSend(ctx.api, ctx.from.id, adminOrderText(o), orderKb(o.id));
  }
});

adm.callbackQuery(/^a:od:(\d+)$/, async (ctx) => {
  const o = data().orders.find((x) => x.id === Number(ctx.match[1]));
  if (!o || o.status !== "pending") {
    return ctx.answerCallbackQuery({ text: "Bu buyurtma allaqachon yopilgan", show_alert: true });
  }
  await completeOrder(ctx.api, o, "manual");
  await ctx.answerCallbackQuery({ text: "Bajarildi deb belgilandi" });
  await markDone(ctx, "\n\n✅ Bajarildi");
});

adm.callbackQuery(/^a:oc:(\d+)$/, async (ctx) => {
  const o = data().orders.find((x) => x.id === Number(ctx.match[1]));
  if (!o || o.status !== "pending") {
    return ctx.answerCallbackQuery({ text: "Bu buyurtma allaqachon yopilgan", show_alert: true });
  }
  await cancelOrder(ctx.api, o);
  await ctx.answerCallbackQuery({ text: "Bekor qilindi, pul qaytarildi" });
  await markDone(ctx, "\n\n❌ Bekor qilindi, pul qaytarildi");
});

// ---------- To'lov cheklari ----------
adm.callbackQuery("a:topups", async (ctx) => {
  await ctx.answerCallbackQuery();
  const list = data().topups.filter((t) => t.status === "pending");
  await ctx.reply(`💳 Kutilayotgan cheklar: ${list.length} ta`, {
    reply_markup: new InlineKeyboard().text("⬅️ Panel", "a:home"),
  });
  for (const t of list.slice(0, 15)) {
    const u = data().users[t.userId] || {};
    const caption = `💳 To'lov #${t.id}\n👤 ${u.name || ""} ${u.username ? "@" + u.username : ""} (ID: ${t.userId})\n💵 ${fmt(t.amount)}`;
    const kb = new InlineKeyboard().text("✅ Tasdiqlash", `a:ta:${t.id}`).text("❌ Rad etish", `a:tr:${t.id}`);
    try {
      await ctx.api.sendPhoto(ctx.from.id, t.fileId, { caption, reply_markup: kb });
    } catch (e) {
      console.error(e.message);
    }
  }
});

adm.callbackQuery(/^a:ta:(\d+)$/, async (ctx) => {
  const t = data().topups.find((x) => x.id === Number(ctx.match[1]));
  if (!t || t.status !== "pending") {
    return ctx.answerCallbackQuery({ text: "Allaqachon ko'rib chiqilgan", show_alert: true });
  }
  const u = data().users[t.userId];
  t.status = "approved";
  t.approvedAt = Date.now();
  t.by = ctx.from.id;
  // Do'st taklif bonusi: taklif qilingan foydalanuvchining birinchi tasdiqlangan to'ldirishi uchun
  const { inviter, bonus } = u ? payments.grantBalance(u, t.amount) : { inviter: null, bonus: 0 };
  save();
  await ctx.answerCallbackQuery({ text: "Tasdiqlandi" });
  await markDone(ctx, `\n\n✅ Tasdiqlandi (${ctx.from.first_name})`);
  if (inviter) {
    await safeSend(
      ctx.api,
      inviter.id,
      `🎉 Siz taklif qilgan do'stingiz hisobini to'ldirdi! Sizga ${fmt(bonus)} bonus berildi.\n💰 Balans: ${fmt(inviter.balance)}`
    );
  }
  await safeSend(
    ctx.api,
    t.userId,
    `✅ Hisobingiz <b>${fmt(t.amount)}</b> ga to'ldirildi.\n💰 Balans: ${fmt(u ? u.balance : t.amount)}`
  );
});

adm.callbackQuery(/^a:tr:(\d+)$/, async (ctx) => {
  const t = data().topups.find((x) => x.id === Number(ctx.match[1]));
  if (!t || t.status !== "pending") {
    return ctx.answerCallbackQuery({ text: "Allaqachon ko'rib chiqilgan", show_alert: true });
  }
  t.status = "rejected";
  t.by = ctx.from.id;
  save();
  await ctx.answerCallbackQuery({ text: "Rad etildi" });
  await markDone(ctx, `\n\n❌ Rad etildi (${ctx.from.first_name})`);
  await safeSend(
    ctx.api,
    t.userId,
    `❌ To'lov #${t.id} tasdiqlanmadi. Muammo bo'lsa admin bilan bog'laning: ${esc(data().settings.contact)}`
  );
});

// ---------- Foydalanuvchilar ----------
adm.callbackQuery("a:users", async (ctx) => {
  await ctx.answerCallbackQuery();
  const users = Object.values(data().users);
  const total = users.reduce((s, u) => s + u.balance, 0);
  const top = [...users]
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5)
    .map((u) => `• ${esc(u.name)} (<code>${u.id}</code>) — ${fmt(u.balance)}`)
    .join("\n");
  const kb = new InlineKeyboard().text("➕ Balans qo'shish/ayirish", "a:ub").row().text("⬅️ Orqaga", "a:home");
  await show(
    ctx,
    `👥 <b>Foydalanuvchilar</b>: ${users.length} ta\n💰 Umumiy balans: ${fmt(total)}\n\n<b>Eng katta balanslar:</b>\n${top || "—"}`,
    kb
  );
});
adm.callbackQuery("a:ub", (ctx) => ask(ctx, "adm:uid", {}, "👤 Foydalanuvchining Telegram ID sini yuboring:"));

// ---------- Sozlamalar ----------
async function settingsScreen(ctx) {
  const st = data().settings;
  const lines = Object.keys(SETTINGS).map((k) => {
    let v = st[k];
    if (k === "minTopup" || k === "refBonus") v = fmt(v);
    if (k === "welcome" && String(v).length > 60) v = String(v).slice(0, 60) + "…";
    return `${SETTINGS[k]}: <b>${esc(v)}</b>`;
  });
  const kb = new InlineKeyboard();
  Object.keys(SETTINGS).forEach((k) => kb.text(SETTINGS[k], `a:s:${k}`).row());
  kb.text("⬅️ Orqaga", "a:home");
  await show(
    ctx,
    "⚙️ <b>Sozlamalar</b>\n\n" + lines.join("\n") + "\n\n<i>Yetkazish rejimi: manual — admin qo'lda bajaradi; api — provayder orqali avtomatik.</i>",
    kb
  );
}
adm.callbackQuery("a:settings", async (ctx) => { await ctx.answerCallbackQuery(); await settingsScreen(ctx); });
adm.callbackQuery(/^a:s:(\w+)$/, async (ctx) => {
  const key = ctx.match[1];
  if (!SETTINGS[key]) return ctx.answerCallbackQuery();
  if (key === "providerMode") {
    const st = data().settings;
    st.providerMode = st.providerMode === "api" ? "manual" : "api";
    save();
    await ctx.answerCallbackQuery({ text: "Rejim: " + st.providerMode });
    return settingsScreen(ctx);
  }
  await ask(ctx, "adm:set", { key }, `${SETTINGS[key]}\nJoriy qiymat: <b>${esc(data().settings[key])}</b>\n\nYangi qiymatni yuboring:`);
});

// ---------- Xabar yuborish ----------
adm.callbackQuery("a:bc", (ctx) => ask(ctx, "adm:bc", {}, "📢 Barcha foydalanuvchilarga yuboriladigan xabar matnini yozing:"));
adm.callbackQuery("a:bcy", async (ctx) => {
  const text = ctx.session.tmp && ctx.session.tmp.text;
  if (!text) return ctx.answerCallbackQuery({ text: "Xabar topilmadi", show_alert: true });
  reset(ctx);
  await ctx.answerCallbackQuery();
  await ctx.reply("📤 Yuborish boshlandi. Tugagach xabar beraman.");
  const api = ctx.api;
  const adminId = ctx.from.id;
  // Bot to'xtab qolmasligi uchun fonda yuboriladi
  (async () => {
    let ok = 0, fail = 0;
    for (const u of Object.values(data().users)) {
      try { await api.sendMessage(u.id, text, { reply_markup: mainKb() }); ok++; } catch (e) { fail++; }
      await sleep(60);
    }
    await safeSend(api, adminId, `✅ Yuborildi: ${ok} ta, xato: ${fail} ta`);
  })();
});

// ---------- Promo kodlar ----------
async function promoList(ctx) {
  const kb = new InlineKeyboard();
  data().promos.forEach((p) =>
    kb.text(`${p.active ? "✅" : "🚫"} ${p.code} — ${fmt(p.amount)} (${p.usedBy.length}/${p.maxUses || "∞"})`, `a:pr:${p.code}`).row()
  );
  kb.text("➕ Yangi promo kod", "a:prn").row().text("⬅️ Orqaga", "a:home");
  await show(
    ctx,
    "🎁 <b>Promo kodlar</b>\nPromo kod foydalanuvchi hisobiga belgilangan summani qo'shadi. Har bir foydalanuvchi bitta kodni bir marta ishlatadi.",
    kb
  );
}

async function promoMenu(ctx, code) {
  const p = data().promos.find((x) => x.code === code);
  if (!p) return promoList(ctx);
  const kb = new InlineKeyboard()
    .text(p.active ? "🚫 O'chirib qo'yish" : "✅ Yoqish", `a:prt:${p.code}`)
    .row()
    .text("🗑 O'chirish", `a:prd:${p.code}`)
    .row()
    .text("⬅️ Orqaga", "a:promo");
  await show(
    ctx,
    `🎁 <b>${esc(p.code)}</b>\n💵 Summa: ${fmt(p.amount)}\n👥 Ishlatilgan: ${p.usedBy.length} / ${p.maxUses || "cheksiz"}\nHolat: ${p.active ? "✅ yoqilgan" : "🚫 o'chirilgan"}`,
    kb
  );
}

adm.callbackQuery("a:promo", async (ctx) => { await ctx.answerCallbackQuery(); await promoList(ctx); });
adm.callbackQuery(/^a:pr:([A-Z0-9]+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await promoMenu(ctx, ctx.match[1]); });
adm.callbackQuery("a:prn", (ctx) =>
  ask(ctx, "adm:prcode", {}, "🎁 Yangi promo kodni yozing (lotin harf va raqam, 3–20 belgi), masalan: <code>YANGI2026</code>")
);
adm.callbackQuery(/^a:prt:([A-Z0-9]+)$/, async (ctx) => {
  const p = data().promos.find((x) => x.code === ctx.match[1]);
  if (p) { p.active = !p.active; save(); }
  await ctx.answerCallbackQuery();
  await promoMenu(ctx, ctx.match[1]);
});
adm.callbackQuery(/^a:prd:([A-Z0-9]+)$/, async (ctx) => {
  data().promos = data().promos.filter((x) => x.code !== ctx.match[1]);
  save();
  await ctx.answerCallbackQuery({ text: "O'chirildi" });
  await promoList(ctx);
});

// ---------- Kanal va guruhlar ----------
function normChat(t) {
  const x = String(t).trim().replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "");
  if (/^-?\d{5,}$/.test(x)) return x;
  if (/^[A-Za-z][A-Za-z0-9_]{4,}$/.test(x)) return "@" + x;
  return null;
}

async function chanScreen(ctx) {
  const st = data().settings;
  const kb = new InlineKeyboard();
  st.requiredChannels.forEach((c, i) => kb.text(`🗑 ${c}`, `a:cd:${i}`).row());
  kb.text("➕ Majburiy obuna kanali", "a:cn").row();
  kb.text("📣 Buyurtmalar guruhi/kanali", "a:co").row();
  if (st.ordersChat) kb.text("🔌 Guruhni uzish", "a:cod").row();
  kb.text("⬅️ Orqaga", "a:home");
  const list = st.requiredChannels.length ? st.requiredChannels.map(esc).join("\n") : "— yo'q";
  await show(
    ctx,
    `📡 <b>Kanal va guruhlar</b>\n\n📢 <b>Majburiy obuna</b> (a'zo bo'lmaganlar botdan foydalana olmaydi):\n${list}\n\n📣 <b>Buyurtmalar guruhi/kanali:</b> ${st.ordersChat ? esc(st.ordersChat) : "— yo'q"}\n\n<i>Bot kanal/guruhda admin bo'lishi shart.</i>`,
    kb
  );
}

adm.callbackQuery("a:chan", async (ctx) => { await ctx.answerCallbackQuery(); await chanScreen(ctx); });
adm.callbackQuery("a:cn", (ctx) =>
  ask(ctx, "adm:chadd", {}, "📢 Kanal username'ini yuboring (masalan <code>@mening_kanalim</code>).\nBot avval shu kanalga admin qilib qo'shilgan bo'lishi kerak.")
);
adm.callbackQuery(/^a:cd:(\d+)$/, async (ctx) => {
  data().settings.requiredChannels.splice(Number(ctx.match[1]), 1);
  save();
  await ctx.answerCallbackQuery({ text: "Olib tashlandi" });
  await chanScreen(ctx);
});
adm.callbackQuery("a:co", (ctx) =>
  ask(ctx, "adm:chorders", {}, "📣 Buyurtma xabarlari boradigan guruh yoki kanalni yuboring: username (<code>@nom</code>) yoki ID.\nGuruh ID sini bilish uchun botni guruhga qo'shib, guruhda <code>/chatid</code> deb yozing.")
);
adm.callbackQuery("a:cod", async (ctx) => {
  data().settings.ordersChat = "";
  save();
  await ctx.answerCallbackQuery({ text: "Uzildi" });
  await chanScreen(ctx);
});

// ---------- API (mijozlarga kalit berish) ----------
const apiKeyMsg = (key) =>
  `🔑 <b>Sizga API kalit berildi</b>\n<code>${key}</code>\n\nManzil: <code>${esc(apiSvc.baseUrl())}</code>\n⚠️ Kalitni hech kimga bermang va xabarni saqlab qo'ying — u boshqa ko'rsatilmaydi.\n\n` + apiSvc.docsText();

async function apiScreen(ctx) {
  const all = Object.values(data().users);
  const withKey = all.filter((u) => u.apiHash);
  const reqs = all.filter((u) => u.apiReq && !u.apiHash);
  const kb = new InlineKeyboard();
  reqs.forEach((u) => kb.text(`📨 So'rov: ${u.name || u.id}`, `a:aku:${u.id}`).row());
  withKey.forEach((u) => kb.text(`🔑 ${u.name || "Foydalanuvchi"} (${u.id})`, `a:aku:${u.id}`).row());
  kb.text("➕ ID bo'yicha API berish", "a:akn").row();
  kb.text(apiSvc.enabled() ? "🟢 API: yoqilgan (o'chirish)" : "🔴 API: o'chiq (yoqish)", "a:ake").row();
  kb.text("⬅️ Orqaga", "a:home");
  await show(
    ctx,
    `🔌 <b>API (mijozlar uchun)</b>\nManzil: <code>${esc(apiSvc.baseUrl())}</code>\nAPI egalari: ${withKey.length} ta • So'rovlar: ${reqs.length} ta\n\nFoydalanuvchi botdagi «🔌 API» tugmasi orqali so'raydi, siz shu yerdan tasdiqlaysiz. API orqali buyurtmalar foydalanuvchining bot balansidan to'lanadi.`,
    kb
  );
}
async function giveKey(ctx, u) {
  const key = apiSvc.issueKey(u);
  await safeSend(ctx.api, u.id, apiKeyMsg(key));
}
adm.callbackQuery("a:akl", async (ctx) => { await ctx.answerCallbackQuery(); await apiScreen(ctx); });
adm.callbackQuery("a:ake", async (ctx) => {
  data().settings.apiEnabled = !apiSvc.enabled();
  save();
  await ctx.answerCallbackQuery({ text: apiSvc.enabled() ? "API yoqildi" : "API o'chirildi" });
  await apiScreen(ctx);
});
adm.callbackQuery("a:akn", (ctx) => ask(ctx, "adm:apiuser", {}, "👤 API beriladigan foydalanuvchining Telegram ID sini yuboring (u botga /start bosgan bo'lishi kerak):"));
adm.callbackQuery(/^a:aku:(\d+)$/, async (ctx) => {
  const u = data().users[ctx.match[1]];
  if (!u) return ctx.answerCallbackQuery({ text: "Foydalanuvchi topilmadi", show_alert: true });
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard()
    .text(u.apiHash ? "🔄 Yangi kalit berish" : "✅ Kalit berish", `a:akg:${u.id}`)
    .row();
  if (u.apiHash) kb.text("🗑 API ni olib tashlash", `a:akd:${u.id}`).row();
  kb.text("⬅️ Orqaga", "a:akl");
  const apiOrders = data().orders.filter((o) => o.userId === u.id && o.via === "api").length;
  await show(ctx, `👤 ${esc(u.name || "")} ${u.username ? "@" + esc(u.username) : ""} (<code>${u.id}</code>)\n💰 Balans: ${fmt(u.balance)}\n🔌 API: ${u.apiHash ? "ulangan" : u.apiReq ? "so'rov yuborgan" : "yo'q"}\nAPI orqali buyurtmalar: ${apiOrders} ta`, kb);
});
adm.callbackQuery(/^a:akg:(\d+)$/, async (ctx) => {
  const u = data().users[ctx.match[1]];
  if (!u) return ctx.answerCallbackQuery({ text: "Foydalanuvchi topilmadi", show_alert: true });
  await giveKey(ctx, u);
  await ctx.answerCallbackQuery({ text: "Kalit foydalanuvchiga yuborildi" });
});
adm.callbackQuery(/^a:akr:(\d+)$/, async (ctx) => {
  const u = data().users[ctx.match[1]];
  if (u && !u.apiHash) {
    delete u.apiReq;
    save();
    await safeSend(ctx.api, u.id, "😔 API so'rovingiz rad etildi. Savollar bo'lsa admin bilan bog'laning: " + esc(data().settings.contact));
  }
  await ctx.answerCallbackQuery({ text: "Rad etildi" });
});
adm.callbackQuery(/^a:akd:(\d+)$/, async (ctx) => {
  const u = data().users[ctx.match[1]];
  if (u) {
    apiSvc.revokeKey(u);
    await safeSend(ctx.api, u.id, "ℹ️ API kalitingiz o'chirildi.");
  }
  await ctx.answerCallbackQuery({ text: "Olib tashlandi" });
  await apiScreen(ctx);
});

// ---------- Adminlar (faqat bosh adminlar boshqaradi) ----------
async function mainOnly(ctx) {
  if (isMainAdmin(ctx.from.id)) return true;
  await ctx.answerCallbackQuery({ text: "Bu bo'lim faqat bosh admin uchun", show_alert: true });
  return false;
}

async function adminsScreen(ctx) {
  const extra = data().settings.admins || [];
  const kb = new InlineKeyboard();
  extra.forEach((id) => {
    const u = data().users[id];
    kb.text(`🗑 ${u ? u.name : "Admin"} (${id})`, `a:ad:${id}`).row();
  });
  kb.text("➕ Admin qo'shish", "a:an").row().text("⬅️ Orqaga", "a:home");
  const main = adminIds.map((id) => `🔒 <code>${id}</code>`).join("\n") || "—";
  await show(
    ctx,
    `👮 <b>Adminlar</b>\n\n<b>Bosh adminlar</b> (.env da, o'chirib bo'lmaydi):\n${main}\n\n<b>Qo'shilgan adminlar:</b> ${extra.length ? "(o'chirish uchun tugmani bosing)" : "— yo'q"}`,
    kb
  );
}

adm.callbackQuery("a:admins", async (ctx) => {
  if (!(await mainOnly(ctx))) return;
  await ctx.answerCallbackQuery();
  await adminsScreen(ctx);
});
adm.callbackQuery("a:an", async (ctx) => {
  if (!(await mainOnly(ctx))) return;
  await ask(
    ctx,
    "adm:addadmin",
    {},
    "➕ Yangi adminning Telegram ID sini yuboring.\nID ni bilish uchun u botga <code>/myid</code> yozishi kerak."
  );
});
adm.callbackQuery(/^a:ad:(\d+)$/, async (ctx) => {
  if (!(await mainOnly(ctx))) return;
  const id = Number(ctx.match[1]);
  data().settings.admins = (data().settings.admins || []).filter((x) => x !== id);
  save();
  await ctx.answerCallbackQuery({ text: "Admin olib tashlandi" });
  await safeSend(ctx.api, id, "ℹ️ Sizning adminlik huquqingiz olib tashlandi.");
  await adminsScreen(ctx);
});

// ---------- Provayder (faqat bosh adminlar) ----------
const PGROUPS = {
  main: ["baseUrl", "key", "method", "authHeader", "authValue"],
  check: ["checkPath", "checkBody", "checkOk", "checkNick"],
  order: ["orderPath", "orderBody", "orderOk", "orderRef", "orderErr"],
};
const PLABEL = {
  baseUrl: "🌐 Manzil (URL)",
  key: "🔑 API kalit",
  method: "↔️ So'rov usuli",
  authHeader: "🛡 Sarlavha nomi",
  authValue: "🛡 Sarlavha qiymati",
  checkPath: "📍 Yo'l",
  checkBody: "📝 So'rov shabloni",
  checkOk: "✅ Muvaffaqiyat sharti",
  checkNick: "👤 Nik yo'li",
  orderPath: "📍 Yo'l",
  orderBody: "📝 So'rov shabloni",
  orderOk: "✅ Muvaffaqiyat sharti",
  orderRef: "🧾 Buyurtma raqami yo'li",
  orderErr: "⚠️ Xato matni yo'li",
};
const PHELP = {
  baseUrl: "Provayderning asosiy manzili, masalan <code>https://api.provayder.com/v1</code>",
  key: "Provayder bergan API kalit (xabaringiz xavfsizlik uchun o'chirib yuboriladi)",
  method: "<code>POST</code> yoki <code>GET</code>",
  authHeader: "Kalit yuboriladigan sarlavha nomi, masalan <code>Authorization</code> yoki <code>X-API-Key</code>. Sarlavha kerak bo'lmasa <code>-</code> yuboring",
  authValue: "Sarlavha qiymati. Kalit o'rniga <code>{key}</code> yozing, masalan <code>Bearer {key}</code>. Kerak bo'lmasa <code>-</code>",
  checkPath: "ID tekshirish manzilining oxiri, masalan <code>/check-id</code>",
  checkBody: "JSON shablon. O'rinbosarlar: {game} {player_id} {server_id} {key}",
  checkOk: "Javobda muvaffaqiyatni bildiruvchi maydon yo'li, masalan <code>success</code> yoki <code>status==ok</code> (nuqta bilan: <code>data.found</code>)",
  checkNick: "Javobda nik joylashgan yo'l, masalan <code>nickname</code> yoki <code>data.name</code>",
  orderPath: "Buyurtma yuborish manzilining oxiri, masalan <code>/order</code>",
  orderBody: "JSON shablon. O'rinbosarlar: {game} {sku} {player_id} {server_id} {order_id} {key}",
  orderOk: "Buyurtma qabul qilinganini bildiruvchi maydon yo'li, masalan <code>success</code> yoki <code>status==success</code>",
  orderRef: "Javobda provayder buyurtma raqami yo'li, masalan <code>order_id</code>",
  orderErr: "Xato bo'lsa sabab yozilgan maydon yo'li, masalan <code>message</code>",
};

const pshow = (k, v) => {
  if (k === "key") return v ? "••••" + String(v).slice(-4) : "—";
  if (v === "" || v === undefined) return "—";
  const s = String(v);
  return esc(s.length > 70 ? s.slice(0, 70) + "…" : s);
};

async function provScreen(ctx, group = "main") {
  const c = provider.cfg();
  const st = data().settings;
  const kb = new InlineKeyboard();
  let text;
  if (group === "main") {
    const games = data().games;
    const pk = data().packages;
    text =
      `🔌 <b>Provayder</b>\n\nRejim: <b>${st.providerMode === "api" ? "API (avtomatik)" : "qo'lda"}</b>\n` +
      `Provayder kodi kiritilgan o'yinlar: ${games.filter((g) => g.providerCode).length}/${games.length}\n` +
      `SKU kiritilgan paketlar: ${pk.filter((p) => p.sku).length}/${pk.length}\n\n` +
      PGROUPS.main.map((k) => `${PLABEL[k]}: <code>${pshow(k, c[k])}</code>`).join("\n");
    kb.text(st.providerMode === "api" ? "🔌 Rejim: API ✅ (qo'lda qilish)" : "🔌 Rejim: qo'lda (API yoqish)", "a:pm").row();
    PGROUPS.main.forEach((k, i) => {
      kb.text(PLABEL[k], `a:pf:${k}`);
      if (i % 2 === 1) kb.row();
    });
    kb.row().text("⚡ Ludovex ni ulash", "a:plx").row();
    kb.text("📋 Ludovex katalogi (kod va SKU)", "a:plc").row();
    kb.text("📥 Bir nechta o'yinni birdan import", "a:plm").row();
    kb.text("🔎 ID tekshirish sozlamasi", "a:pg:check").row();
    kb.text("📦 Buyurtma sozlamasi", "a:pg:order").row();
    kb.text("🧪 ID tekshirishni sinash", "a:pt").row();
    kb.text("⬅️ Orqaga", "a:home");
  } else {
    const title = group === "check" ? "🔎 <b>ID tekshirish sozlamasi</b>" : "📦 <b>Buyurtma sozlamasi</b>";
    text = title + "\n\n" + PGROUPS[group].map((k) => `${PLABEL[k]}: <code>${pshow(k, c[k])}</code>`).join("\n");
    PGROUPS[group].forEach((k) => kb.text(PLABEL[k], `a:pf:${k}`).row());
    kb.text("⬅️ Orqaga", "a:prov");
  }
  await show(ctx, text, kb);
}

// Ludovex: bir tugma bilan sozlash va katalogdan provayder kodi / SKU ni topish
const lxCache = new Map(); // adminId -> [{key,name}]
adm.callbackQuery("a:plx", async (ctx) => {
  if (!(await mainOnly(ctx))) return;
  const st = data().settings;
  st.provider = { ...(st.provider || {}), ...provider.LUDOVEX };
  st.providerMode = "api";
  save();
  await ask(
    ctx,
    "adm:pf",
    { key: "key" },
    "⚡ Ludovex sozlamalari qo'yildi va rejim API ga o'tdi.\n\n🔑 Endi Ludovex kabinetidan (Кабинет → API-ключи) olgan API kalitingizni yuboring. Kalitga <b>read</b> va <b>order</b> ruxsatlarini bering. Xabaringiz xavfsizlik uchun o'chiriladi."
  );
});
adm.callbackQuery("a:plm", async (ctx) => {
  if (!(await mainOnly(ctx))) return;
  await ask(
    ctx,
    "adm:lxm",
    {},
    "📥 Birinchi qatorga <b>kurs va ustama foiz</b>, keyingi qatorlarga o'yin nomlarini yozing (har qatorga bitta, 10 tagacha):\n\n<code>12800 10\nfree fire cis\nmobile legends uz\npubg mobile auto</code>\n\nBot har bir o'yinni katalogdan topib, barcha paketlarini narxi bilan qo'shadi. Noaniq yoki topilmaganlarini alohida aytadi."
  );
});
adm.callbackQuery("a:plc", async (ctx) => {
  if (!(await mainOnly(ctx))) return;
  await ask(ctx, "adm:lxs", {}, "📋 O'yin nomining bir qismini yozing (masalan <code>pubg</code>) yoki hammasini ko'rish uchun <code>*</code> yuboring:");
});
adm.callbackQuery(/^a:plv:(\d+)$/, async (ctx) => {
  if (!(await mainOnly(ctx))) return;
  const g = (lxCache.get(ctx.from.id) || [])[Number(ctx.match[1])];
  if (!g) return ctx.answerCallbackQuery({ text: "Qaytadan qidiring", show_alert: true });
  await ctx.answerCallbackQuery();
  try {
    const r = await provider.offers(g.key);
    const head = `🎮 <b>${esc(g.name || "O'yin")}</b>\nProvayder kodi (o'yinga yozing):\n<code>${esc(g.key)}</code>\n\n`;
    if (!r.offers.length) {
      return ctx.reply(head + "Paketlar taniy olinmadi. Xom javob:\n<pre>" + esc(r.raw.slice(0, 1500)) + "</pre>", { parse_mode: "HTML" });
    }
    // SKU lar juda uzun (≈100 belgi), shuning uchun ro'yxatda faqat nomi va narxi; SKU larni import o'zi yozadi
    const lines = r.offers.map((o, i) => `${i + 1}. ${esc(o.name || "?")}${o.price !== "" ? " — " + esc(String(o.price)) + " USDT" : ""}`);
    const chunks = [];
    let cur = "";
    for (const ln of lines) {
      if ((cur + ln + "\n").length > 3300) { chunks.push(cur); cur = ""; }
      cur += ln + "\n";
    }
    if (cur) chunks.push(cur);
    const intro = head + `Paketlar: <b>${r.offers.length}</b> ta. SKU lar juda uzun, shuning uchun ularni quyidagi tugma o'zi yozadi.\n\n`;
    await ctx.reply(intro + chunks[0], {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("📥 Hammasini botga avtomatik qo'shish", `a:pli:${ctx.match[1]}`),
    });
    for (const c of chunks.slice(1, 6)) await ctx.reply(c, { parse_mode: "HTML" });
  } catch (e) {
    await ctx.reply("❌ Xato: " + esc(e.message), { parse_mode: "HTML" });
  }
});

adm.callbackQuery(/^a:pli:(\d+)$/, async (ctx) => {
  if (!(await mainOnly(ctx))) return;
  const g = (lxCache.get(ctx.from.id) || [])[Number(ctx.match[1])];
  if (!g) return ctx.answerCallbackQuery({ text: "Qaytadan qidiring", show_alert: true });
  await ask(
    ctx,
    "adm:lxi",
    { key: g.key, name: g.name },
    "📥 Import: <b>kurs</b> va <b>ustama foiz</b> ni bo'sh joy bilan yuboring.\n\nMasalan <code>12800 10</code> — 1 USDT = 12 800 so'm, ustama 10%.\nPaket narxi: Ludovex narxi × kurs × (1 + ustama), 100 so'mgacha yaxlitlanadi. Tannarx ham yoziladi (hisobotda foyda chiqadi)."
  );
});
adm.callbackQuery("a:prov", async (ctx) => {
  if (!(await mainOnly(ctx))) return;
  await ctx.answerCallbackQuery();
  await provScreen(ctx, "main");
});
adm.callbackQuery(/^a:pg:(check|order)$/, async (ctx) => {
  if (!(await mainOnly(ctx))) return;
  await ctx.answerCallbackQuery();
  await provScreen(ctx, ctx.match[1]);
});
adm.callbackQuery("a:pm", async (ctx) => {
  if (!(await mainOnly(ctx))) return;
  const st = data().settings;
  st.providerMode = st.providerMode === "api" ? "manual" : "api";
  save();
  await ctx.answerCallbackQuery({ text: "Rejim: " + st.providerMode });
  await provScreen(ctx, "main");
});
adm.callbackQuery(/^a:pf:(\w+)$/, async (ctx) => {
  if (!(await mainOnly(ctx))) return;
  const key = ctx.match[1];
  if (!PLABEL[key]) return ctx.answerCallbackQuery();
  const cur = provider.cfg()[key];
  await ask(
    ctx,
    "adm:pf",
    { key },
    `${PLABEL[key]}\nJoriy qiymat: <code>${pshow(key, cur)}</code>\n\n${PHELP[key]}\n\nStandart qiymatni qaytarish uchun <code>default</code> yozing.\n\nYangi qiymatni yuboring:`
  );
});
adm.callbackQuery("a:pt", async (ctx) => {
  if (!(await mainOnly(ctx))) return;
  await ask(
    ctx,
    "adm:ptest",
    {},
    "🧪 Sinov: <code>o'yin_kodi playerID [serverID]</code> shaklida yuboring, masalan:\n<code>mlbb 12345678 2001</code>\n\nProvayderga haqiqiy so'rov yuboriladi va xom javob ko'rsatiladi. Buyurtma yuborilmaydi."
  );
});

// ---------- To'lov tizimlari (faqat bosh adminlar) ----------
const maskSecret = (v) => (v ? "••••" + String(v).slice(-4) : "—");

async function paySysScreen(ctx) {
  const c = payments.pcfg();
  const state = (sys) => {
    if (!c[sys].enabled) return "🚫 o'chiq";
    return payments.isReady(sys) ? "✅ ishlayapti" : "⚠️ sozlanmagan";
  };
  const kb = new InlineKeyboard();
  for (const [id, sys] of Object.entries(payments.SYSTEMS)) kb.text(`${sys.icon} ${sys.label}: ${state(id)}`, `a:ps:${id}`).row();
  kb.text(c.card.auto ? "🏦 Karta (avto, noyob summa): ✅" : "🏦 Karta (avto, noyob summa): 🚫", "a:pcard").row();
  kb.text(c.card.enabled !== false ? "💳 Kartaga o'tkazish (chek): ✅" : "💳 Kartaga o'tkazish (chek): 🚫", "a:psc").row();
  kb.text("⬅️ Orqaga", "a:home");
  await show(
    ctx,
    "💳 <b>To'lov tizimlari</b>\n\nAvtomatik tizimlarda mijoz to'lagach balans <b>o'zi</b> to'ldiriladi (admin tasdiqlashi shart emas).\n\n" +
      `🟦 Click: ${state("click")}\n🟩 Payme: ${state("payme")}\n💳 Kartaga o'tkazish (chek, admin tasdiqlaydi): ${c.card.enabled !== false ? "✅ yoqilgan" : "🚫 o'chiq"}\n\n` +
      "Tizimni tanlab, ma'lumotlarini kiriting va yoqing. Server manzili (webhook) kerak bo'ladi — u tizim sahifasida ko'rsatilgan.",
    kb
  );
}

async function paySysMenu(ctx, sys) {
  const S = payments.SYSTEMS[sys];
  if (!S) return paySysScreen(ctx);
  const c = payments.pcfg()[sys];
  const base = payments.baseUrl();
  const lines = Object.entries(S.fields).map(([k, label]) => `${label}: <code>${S.secret.includes(k) ? maskSecret(c[k]) : esc(c[k] || "—")}</code>`);
  const hook =
    sys === "click"
      ? `Click kabinetida (Prepare URL va Complete URL ikkalasiga ham):\n<code>${esc(base)}/click</code>`
      : `Payme kabinetida «Endpoint URL»:\n<code>${esc(base)}/payme</code>\nKassadagi hisob maydoni nomi: <code>order_id</code>`;
  const kb = new InlineKeyboard();
  kb.text(c.enabled ? "🚫 O'chirish" : "✅ Yoqish", `a:pst:${sys}`).row();
  Object.entries(S.fields).forEach(([k, label]) => kb.text(`✏️ ${label}`, `a:psf:${sys}:${k}`).row());
  kb.text("⬅️ Orqaga", "a:pay");
  await show(
    ctx,
    `${S.icon} <b>${S.label}</b> — ${c.enabled ? "✅ yoqilgan" : "🚫 o'chiq"}\n\n${lines.join("\n")}\n\n${hook}\n\n` +
      (process.env.PUBLIC_URL ? "" : "⚠️ <i>.env ga PUBLIC_URL (botingiz serveri manzili) yozilmagan — yuqoridagi SIZNING-DOMEN o'rniga haqiqiy manzilingizni qo'ying.</i>\n\n") +
      "<i>Kalit va ma'lumotlarni faqat o'zingiz ko'rasiz. Kiritilgan xabaringiz xavfsizlik uchun o'chiriladi.</i>",
    kb
  );
}

adm.callbackQuery("a:pay", async (ctx) => {
  if (!(await mainOnly(ctx))) return;
  await ctx.answerCallbackQuery();
  await paySysScreen(ctx);
});
adm.callbackQuery(/^a:ps:(click|payme)$/, async (ctx) => {
  if (!(await mainOnly(ctx))) return;
  await ctx.answerCallbackQuery();
  await paySysMenu(ctx, ctx.match[1]);
});
async function cardAutoScreen(ctx) {
  const c = payments.pcfg().card;
  const base = payments.baseUrl();
  const sec = payments.cardSecret();
  const kb = new InlineKeyboard()
    .text(c.auto ? "🚫 O'chirish" : "✅ Yoqish", "a:pcardt")
    .row()
    .text("⏱ Muddat (daqiqa)", "a:pcardm")
    .row()
    .text("🔑 Yangi maxfiy kalit", "a:pcards")
    .row()
    .text("⬅️ Orqaga", "a:pay");
  await show(
    ctx,
    `🏦 <b>Karta (avto, noyob summa)</b> — ${c.auto ? "✅ yoqilgan" : "🚫 o'chiq"}\n\n` +
      `Karta: <code>${esc(data().settings.cardNumber)}</code> (Sozlamalar → Karta raqami)\nMuddat: <b>${c.timeoutMin} daqiqa</b>\n\n` +
      "Mijozga summa + 1–99 so'm (noyob) beriladi. Kartangizga shu summa tushgani haqida xabar quyidagi manzilga kelsa, balans avtomatik to'ldiriladi.\n\n" +
      `📮 Kirim xabari manzili (POST):\n<code>${esc(base)}/card?secret=${sec}</code>\n\n` +
      "Xabar tarkibi: JSON <code>{\"amount\": 50013}</code> yoki bank SMS matni (<code>{\"text\": \"...\"}</code> yoki oddiy matn). Telefondagi SMS/bildirishnoma yuboruvchi ilova yoki kirimni kuzatuvchi xizmat shu manzilga yuboradi. Faqat KIRIM xabarlarini yuboring.\n\n" +
      "<i>Kalitni hech kimga bermang.</i>",
    kb
  );
}
adm.callbackQuery("a:pcard", async (ctx) => {
  if (!(await mainOnly(ctx))) return;
  await ctx.answerCallbackQuery();
  await cardAutoScreen(ctx);
});
adm.callbackQuery("a:pcardt", async (ctx) => {
  if (!(await mainOnly(ctx))) return;
  const c = payments.pcfg().card;
  payments.pset("card", "auto", !c.auto);
  await ctx.answerCallbackQuery({ text: c.auto ? "O'chirildi" : "Yoqildi" });
  await cardAutoScreen(ctx);
});
adm.callbackQuery("a:pcards", async (ctx) => {
  if (!(await mainOnly(ctx))) return;
  payments.pset("card", "secret", "");
  await ctx.answerCallbackQuery({ text: "Yangi kalit yaratildi. Manzilni yangilang!", show_alert: true });
  await cardAutoScreen(ctx);
});
adm.callbackQuery("a:pcardm", async (ctx) => {
  if (!(await mainOnly(ctx))) return;
  await ask(ctx, "adm:cardmin", {}, "⏱ Mijoz necha daqiqa ichida o'tkazishi kerak? (1–60, masalan 5):");
});
adm.callbackQuery("a:psc", async (ctx) => {
  if (!(await mainOnly(ctx))) return;
  const c = payments.pcfg();
  payments.pset("card", "enabled", c.card.enabled === false);
  await ctx.answerCallbackQuery({ text: c.card.enabled === false ? "Yoqildi" : "O'chirildi" });
  await paySysScreen(ctx);
});
adm.callbackQuery(/^a:pst:(click|payme)$/, async (ctx) => {
  if (!(await mainOnly(ctx))) return;
  const sys = ctx.match[1];
  const c = payments.pcfg()[sys];
  if (!c.enabled) {
    const miss = payments.missingFields(sys);
    if (miss.length) {
      return ctx.answerCallbackQuery({
        text: "Avval to'ldiring: " + miss.map((k) => payments.SYSTEMS[sys].fields[k]).join(", "),
        show_alert: true,
      });
    }
  }
  payments.pset(sys, "enabled", !c.enabled);
  await ctx.answerCallbackQuery({ text: c.enabled ? "O'chirildi" : "Yoqildi" });
  await paySysMenu(ctx, sys);
});
adm.callbackQuery(/^a:psf:(click|payme):(\w+)$/, async (ctx) => {
  if (!(await mainOnly(ctx))) return;
  const [, sys, key] = ctx.match;
  const label = payments.SYSTEMS[sys].fields[key];
  if (!label) return ctx.answerCallbackQuery();
  await ask(ctx, "adm:payf", { sys, key }, `✏️ <b>${esc(label)}</b>\n\nYangi qiymatni yuboring (kabinetdan nusxa oling, bo'sh joysiz):`);
});

// ---------- Maxsus menyu tugmalari ----------
// Tugma turlari: text, link, func, menu (ichida boshqa tugmalar bor ichki menyu).
// Har bir tugmada parent (ota menyu id si, 0 = asosiy menyu) bor.
const MAX_BUTTONS = 12; // asosiy menyuda
const MAX_SUB = 20; // bitta ichki menyuda
const BTN_ICON = { text: "📝", link: "🔗", func: "⚙️", menu: "📂" };
const FUNCS = {
  shop: "🎮 Donat olish (o'yinlar ro'yxati)",
  bal: "💰 Hisobim",
  orders: "📦 Buyurtmalarim",
  topup: "💳 Hisobni to'ldirish (usulni mijoz tanlaydi)",
  pay_click: "🟦 Click orqali to'ldirish",
  pay_payme: "🟩 Payme orqali to'ldirish",
  pay_card: "🏦 Kartaga o'tkazib to'ldirish (chek)",
  pay_cardauto: "⏱ Kartaga o'tkazish (avto, noyob summa)",
  promo: "🎁 Promo kod",
  ref: "👥 Do'st taklif qilish",
  help: "☎️ Aloqa",
};
const funcName = (fn) => {
  if (FUNCS[fn]) return FUNCS[fn];
  const m = /^game:(\d+)$/.exec(fn || "");
  const g = m && findGame(m[1]);
  return g ? `${g.emoji} ${g.name} bo'limi` : "?";
};

function normContent(type, t) {
  const x = String(t).trim();
  if (type === "menu") return x === "-" ? "" : x.length <= 500 ? x : null;
  if (type === "text") return x.length >= 1 && x.length <= 3000 ? x : null;
  if (/^@[A-Za-z0-9_]{5,}$/.test(x)) return "https://t.me/" + x.slice(1);
  return /^https?:\/\/\S+$/i.test(x) ? x : null;
}
const allBtns = () => data().settings.buttons || [];
const findBtn = (id) => allBtns().find((b) => b.id === Number(id));
const childBtns = (parent) => allBtns().filter((b) => (b.parent || 0) === Number(parent || 0));
function descendantIds(id) {
  const out = [Number(id)];
  for (let i = 0; i < out.length; i++) childBtns(out[i]).forEach((c) => out.push(c.id));
  return out;
}
const btnBack = (parent) => (parent ? `a:btd:${parent}` : "a:btns");

function addButtons(kb, parent) {
  kb.text("➕ Matnli", `a:btnew:text:${parent}`).text("➕ Havolali", `a:btnew:link:${parent}`).row();
  kb.text("➕ Funksiyali", `a:btnew:func:${parent}`).text("➕ Ichki menyu", `a:btnew:menu:${parent}`).row();
}

async function btnScreen(ctx) {
  const kb = new InlineKeyboard();
  childBtns(0).forEach((b) => kb.text(`${BTN_ICON[b.type] || "📝"} ${b.label}`, `a:btd:${b.id}`).row());
  addButtons(kb, 0);
  kb.text("⬅️ Orqaga", "a:home");
  await show(
    ctx,
    "🔘 <b>Menyu tugmalari</b>\n📝 Matnli — bosilganda botdan xabar chiqadi (qoidalar, narxlar...).\n🔗 Havolali — bosilganda havola tugmasi chiqadi (kanal, sayt...).\n⚙️ Funksiyali — bot funksiyasi ishlaydi (hisobni to'ldirish, Click/Payme, aniq bir o'yin bo'limi...).\n📂 Ichki menyu — bosilganda ichida yana tugmalar chiqadi (masalan «💳 To'lov» → Click, Payme, Karta). Ichiga matnli, havolali, funksiyali va yana ichki menyu qo'shish mumkin.\n\nTugmalar foydalanuvchi menyusiga /start bosganda yoki «Xabar yuborish» dan keyin paydo bo'ladi.",
    kb
  );
}

async function btnMenu(ctx, id) {
  const b = findBtn(id);
  if (!b) return btnScreen(ctx);
  const kb = new InlineKeyboard().text("✏️ Nomi", `a:btl:${b.id}`);
  if (b.type === "menu") kb.text("✏️ Tavsif", `a:btc:${b.id}`);
  else if (b.type !== "func") kb.text(b.type === "link" ? "✏️ Havola" : "✏️ Matn", `a:btc:${b.id}`);
  kb.row();
  if (b.type === "menu") {
    childBtns(b.id).forEach((c) => kb.text(`${BTN_ICON[c.type] || "📝"} ${c.label}`, `a:btd:${c.id}`).row());
    addButtons(kb, b.id);
  }
  kb.text("🗑 O'chirish", `a:btx:${b.id}`).row().text("⬅️ Orqaga", btnBack(b.parent));
  const content = String(b.content || "");
  const short = content.length > 300 ? content.slice(0, 300) + "…" : content;
  let body;
  if (b.type === "func") body = esc(funcName(b.content));
  else if (b.type === "menu") body = `Ichidagi tugmalar: ${childBtns(b.id).length} ta` + (short ? `\nTavsif: ${esc(short)}` : "");
  else body = esc(short);
  const typeName = { link: "🔗 havolali", func: "⚙️ funksiyali", menu: "📂 ichki menyu", text: "📝 matnli" }[b.type] || "📝 matnli";
  await show(ctx, `🔘 <b>${esc(b.label)}</b>\nTuri: ${typeName}\n\n${body}`, kb);
}

adm.callbackQuery("a:btns", async (ctx) => { await ctx.answerCallbackQuery(); await btnScreen(ctx); });
adm.callbackQuery(/^a:btnew:(text|link|func|menu):(\d+)$/, async (ctx) => {
  const parent = Number(ctx.match[2]);
  if (parent && !findBtn(parent)) return ctx.answerCallbackQuery({ text: "Menyu topilmadi", show_alert: true });
  const limit = parent ? MAX_SUB : MAX_BUTTONS;
  if (childBtns(parent).length >= limit) {
    return ctx.answerCallbackQuery({ text: `Bu yerga eng ko'pi bilan ${limit} ta tugma qo'shish mumkin`, show_alert: true });
  }
  await ask(
    ctx,
    "adm:btlabel",
    { type: ctx.match[1], parent },
    "🔘 Tugma nomini yuboring (30 belgigacha, emoji bilan chiroyli ko'rinadi), masalan: <code>📜 Qoidalar</code>"
  );
});
// Funksiya tanlash (tugma nomi session.tmp da turibdi)
adm.callbackQuery(/^a:bf:(\w+)$/, async (ctx) => {
  const s = ctx.session;
  const fn = ctx.match[1];
  if (s.step !== "adm:btfunc" || !s.tmp.label || !FUNCS[fn]) return ctx.answerCallbackQuery({ text: "Sessiya eskirdi", show_alert: true });
  await finishFuncBtn(ctx, fn);
});
adm.callbackQuery(/^a:bfg:(\d+)$/, async (ctx) => {
  const s = ctx.session;
  if (s.step !== "adm:btfunc" || !s.tmp.label || !findGame(ctx.match[1])) return ctx.answerCallbackQuery({ text: "Sessiya eskirdi", show_alert: true });
  await finishFuncBtn(ctx, "game:" + ctx.match[1]);
});
async function finishFuncBtn(ctx, fn) {
  const { label, parent } = ctx.session.tmp;
  const id = nextId("btn");
  data().settings.buttons.push({ id, label, type: "func", content: fn, parent: parent || 0 });
  save();
  reset(ctx);
  await ctx.answerCallbackQuery({ text: "✅ Qo'shildi" });
  await btnMenu(ctx, id);
}
adm.callbackQuery(/^a:btd:(\d+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await btnMenu(ctx, ctx.match[1]); });
adm.callbackQuery(/^a:btl:(\d+)$/, (ctx) => ask(ctx, "adm:btelabel", { id: ctx.match[1] }, "✏️ Tugmaning yangi nomini yuboring:"));
adm.callbackQuery(/^a:btc:(\d+)$/, async (ctx) => {
  const b = findBtn(ctx.match[1]);
  if (!b) return ctx.answerCallbackQuery();
  await ask(
    ctx,
    "adm:btecontent",
    { id: ctx.match[1] },
    b.type === "link"
      ? "🔗 Yangi havolani yuboring (https://... yoki @kanal):"
      : b.type === "menu"
      ? "✏️ Menyu ochilganda ko'rinadigan tavsifni yuboring (500 belgigacha). Tavsifni olib tashlash uchun <code>-</code> yuboring:"
      : "📝 Tugma bosilganda chiqadigan yangi matnni yuboring:"
  );
});
adm.callbackQuery(/^a:btx:(\d+)$/, async (ctx) => {
  const b = findBtn(ctx.match[1]);
  const ids = b ? descendantIds(b.id) : [];
  data().settings.buttons = allBtns().filter((x) => !ids.includes(x.id));
  save();
  await ctx.answerCallbackQuery({ text: "O'chirildi" });
  if (b && b.parent && findBtn(b.parent)) await btnMenu(ctx, b.parent);
  else await btnScreen(ctx);
});

// ---------- Moliya hisoboti ----------
const repKb = () => {
  const on = data().settings.dailyReport !== false;
  return new InlineKeyboard()
    .text("📅 Kunlar bo'yicha", "a:repd")
    .text("📆 Oylar bo'yicha", "a:repm")
    .row()
    .text(on ? "🔔 Kunlik hisobot (23:55): yoqilgan" : "🔕 Kunlik hisobot: o'chiq", "a:rept")
    .row()
    .text("⬅️ Orqaga", "a:home");
};
adm.callbackQuery("a:rep", async (ctx) => { await ctx.answerCallbackQuery(); await show(ctx, report.overview(), repKb()); });
adm.callbackQuery("a:repd", async (ctx) => {
  await ctx.answerCallbackQuery();
  await show(ctx, report.daily(), new InlineKeyboard().text("⬅️ Hisobot", "a:rep"));
});
adm.callbackQuery("a:repm", async (ctx) => {
  await ctx.answerCallbackQuery();
  await show(ctx, report.monthly(), new InlineKeyboard().text("⬅️ Hisobot", "a:rep"));
});
adm.callbackQuery("a:rept", async (ctx) => {
  const st = data().settings;
  st.dailyReport = st.dailyReport === false;
  save();
  await ctx.answerCallbackQuery({ text: st.dailyReport ? "Yoqildi" : "O'chirildi" });
  await show(ctx, report.overview(), repKb());
});

// ---------- Statistika ----------
adm.callbackQuery("a:stats", async (ctx) => {
  await ctx.answerCallbackQuery();
  const d = data();
  const count = (s) => d.orders.filter((o) => o.status === s).length;
  const revenue = d.orders.filter((o) => o.status === "done").reduce((s, o) => s + o.price, 0);
  const approved = d.topups.filter((t) => t.status === "approved").reduce((s, t) => s + t.amount, 0);
  await show(
    ctx,
    `📊 <b>Statistika</b>\n\n👥 Foydalanuvchilar: ${Object.keys(d.users).length}\n` +
      `📦 Buyurtmalar: ${d.orders.length} (✅ ${count("done")} • ⏳ ${count("pending")} • ❌ ${count("failed")})\n` +
      `💵 Bajarilgan savdo: ${fmt(revenue)}\n💳 Tasdiqlangan to'ldirishlar: ${fmt(approved)}\n` +
      `🕓 Kutilayotgan cheklar: ${d.topups.filter((t) => t.status === "pending").length}`,
    new InlineKeyboard().text("⬅️ Orqaga", "a:home")
  );
});

// ---------- Matnli kiritishlar ----------
async function adminText(ctx) {
  const s = ctx.session;
  if (!s.step || !s.step.startsWith("adm:")) return false;
  if (!isAdmin(ctx.from.id)) return false;
  const t = ctx.message.text.trim();
  if (Object.values(MENU).includes(t)) { reset(ctx); return false; }
  const tmp = s.tmp;

  switch (s.step) {
    case "adm:gname": {
      const id = nextId("game");
      data().games.push({ id, name: t.slice(0, 40), emoji: "🎮", needsServer: false, active: true, providerCode: "", kind: "game" });
      save();
      reset(ctx);
      await ctx.reply("✅ O'yin qo'shildi.");
      await gameMenu(ctx, id);
      return true;
    }
    case "adm:gedit": {
      const g = findGame(tmp.id);
      if (g) { g.name = t.slice(0, 40); save(); }
      reset(ctx);
      await gameMenu(ctx, tmp.id);
      return true;
    }
    case "adm:gcode": {
      const g = findGame(tmp.id);
      if (g) { g.providerCode = t === "-" ? "" : t; save(); }
      reset(ctx);
      await gameMenu(ctx, tmp.id);
      return true;
    }
    case "adm:pname": {
      tmp.name = t.slice(0, 40);
      s.step = "adm:pprice";
      await ctx.reply(`💵 <b>${esc(tmp.name)}</b> narxini yuboring (so'mda, faqat raqam):`, { parse_mode: "HTML" });
      return true;
    }
    case "adm:pprice": {
      const price = parseNum(t);
      if (!Number.isFinite(price) || price <= 0) {
        await ctx.reply("❗️ Narx musbat raqam bo'lishi kerak. Qayta yuboring:");
        return true;
      }
      data().packages.push({ id: nextId("pkg"), gameId: tmp.gameId, name: tmp.name, price, active: true, sku: "" });
      save();
      // Ketma-ket paket qo'shish uchun shu holatda qolamiz
      s.step = "adm:pname";
      s.tmp = { gameId: tmp.gameId };
      await ctx.reply(
        `✅ Qo'shildi: <b>${esc(tmp.name)}</b> — ${fmt(price)}\n\nKeyingi paket nomini yuboring yoki tugatish uchun tugmani bosing:`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("✅ Tugatish", `a:pl:${tmp.gameId}`) }
      );
      return true;
    }
    case "adm:pedit": {
      const p = findPkg(tmp.id);
      if (p) { p.name = t.slice(0, 40); save(); }
      reset(ctx);
      await pkgMenu(ctx, tmp.id);
      return true;
    }
    case "adm:pnewprice": {
      const price = parseNum(t);
      if (!Number.isFinite(price) || price <= 0) {
        await ctx.reply("❗️ Narx musbat raqam bo'lishi kerak. Qayta yuboring:");
        return true;
      }
      const p = findPkg(tmp.id);
      if (p) { p.price = price; save(); }
      reset(ctx);
      await pkgMenu(ctx, tmp.id);
      return true;
    }
    case "adm:pcost": {
      const n = parseNum(t);
      if (!Number.isFinite(n) || n < 0) { await ctx.reply("❗️ 0 yoki musbat raqam yuboring:"); return true; }
      const p = findPkg(tmp.id);
      if (p) { p.cost = n; save(); }
      reset(ctx);
      await pkgMenu(ctx, tmp.id);
      return true;
    }
    case "adm:pbulk": {
      const g = findGame(tmp.gameId);
      if (!g) { reset(ctx); return true; }
      const ok = [], bad = [];
      for (const line of t.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
        const tail = "([\\d][\\d\\s.,_]*)\\s*(?:so'?m|sum|uzs)?$";
        const m = new RegExp("^(.*\\S)\\s*[\\-–—:|=]\\s*" + tail, "i").exec(line) || new RegExp("^(.*?\\S)\\s+" + tail, "i").exec(line);
        const price = m ? parseInt(m[2].replace(/[\s.,_]/g, ""), 10) : NaN;
        const name = m ? m[1].trim() : "";
        if (!name || !Number.isFinite(price) || price < 100 || price > 100000000) bad.push(line);
        else ok.push({ name: name.slice(0, 40), price });
      }
      if (!ok.length) {
        await ctx.reply("❗️ Hech narsa tanilmadi. Har qatorda nomi va narxi bo'lsin, masalan: <code>60 UC - 12000</code>. Qayta yuboring:", { parse_mode: "HTML" });
        return true;
      }
      ok.forEach((x) => data().packages.push({ id: nextId("pkg"), gameId: g.id, name: x.name, price: x.price, active: true, sku: "" }));
      save();
      reset(ctx);
      await ctx.reply(`✅ ${ok.length} ta paket qo'shildi.` + (bad.length ? `\n\n⚠️ Tanilmadi (${bad.length} ta):\n` + bad.map((x) => esc(x)).join("\n") : ""), { parse_mode: "HTML" });
      await packagesList(ctx, g.id);
      return true;
    }
    case "adm:stock": {
      const p = findPkg(tmp.id);
      const codes = t.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      if (!p || !codes.length) { await ctx.reply("❗️ Hech bo'lmasa bitta kod yuboring:"); return true; }
      p.stock = [...(p.stock || []), ...codes];
      save();
      reset(ctx);
      await ctx.reply(`✅ ${codes.length} ta kod qo'shildi. Ombor: ${p.stock.length} ta.`);
      await pkgMenu(ctx, tmp.id);
      return true;
    }
    case "adm:apiuser": {
      const u = data().users[Number(t)];
      if (!u) { await ctx.reply("❗️ Bunday foydalanuvchi topilmadi (u botga /start bosgan bo'lishi kerak). Qayta yuboring:"); return true; }
      reset(ctx);
      await giveKey(ctx, u);
      await ctx.reply(`✅ ${u.name || u.id} ga API kalit yuborildi.`);
      await apiScreen(ctx);
      return true;
    }
    case "adm:psku": {
      const p = findPkg(tmp.id);
      if (p) { p.sku = t === "-" ? "" : t; save(); }
      reset(ctx);
      await pkgMenu(ctx, tmp.id);
      return true;
    }
    case "adm:set": {
      const st = data().settings;
      if (tmp.key === "minTopup" || tmp.key === "refBonus") {
        const n = parseNum(t);
        const min = tmp.key === "refBonus" ? 0 : 1;
        if (!Number.isFinite(n) || n < min) { await ctx.reply("❗️ Raqam yuboring:"); return true; }
        st[tmp.key] = n;
      } else {
        st[tmp.key] = t;
      }
      save();
      reset(ctx);
      await ctx.reply("✅ Saqlandi.");
      await settingsScreen(ctx);
      return true;
    }
    case "adm:uid": {
      const u = data().users[t.replace(/\D/g, "")];
      if (!u) { await ctx.reply("❌ Bunday foydalanuvchi topilmadi. ID ni qayta yuboring:"); return true; }
      s.tmp = { uid: u.id };
      s.step = "adm:uamt";
      await ctx.reply(
        `👤 ${u.name} — balans: ${fmt(u.balance)}\n\nQo'shiladigan summani yozing (ayirish uchun minus bilan: -5000):`
      );
      return true;
    }
    case "adm:uamt": {
      const n = parseNum(t);
      const u = data().users[tmp.uid];
      if (!u || !Number.isFinite(n) || n === 0) { await ctx.reply("❗️ To'g'ri summa yuboring (masalan 10000 yoki -5000):"); return true; }
      u.balance = Math.max(0, u.balance + n);
      save();
      reset(ctx);
      await ctx.reply(`✅ Yangi balans: ${fmt(u.balance)}`);
      await safeSend(
        ctx.api,
        u.id,
        n > 0 ? `💰 Hisobingizga ${fmt(n)} qo'shildi.` : `💰 Hisobingizdan ${fmt(-n)} ayirildi.`
      );
      return true;
    }
    case "adm:prcode": {
      const code = t.toUpperCase().replace(/\s+/g, "");
      if (!/^[A-Z0-9]{3,20}$/.test(code)) {
        await ctx.reply("❗️ Faqat lotin harf va raqam, 3–20 belgi bo'lishi kerak. Qayta yuboring:");
        return true;
      }
      if (data().promos.some((p) => p.code === code)) {
        await ctx.reply("❗️ Bunday promo kod allaqachon bor. Boshqa nom yozing:");
        return true;
      }
      tmp.code = code;
      s.step = "adm:pramount";
      await ctx.reply(`💵 <b>${esc(code)}</b> hisobga necha so'm qo'shsin? (faqat raqam)`, { parse_mode: "HTML" });
      return true;
    }
    case "adm:pramount": {
      const n = parseNum(t);
      if (!Number.isFinite(n) || n <= 0) { await ctx.reply("❗️ Musbat raqam yuboring:"); return true; }
      tmp.amount = n;
      s.step = "adm:prmax";
      await ctx.reply("👥 Nechta foydalanuvchi ishlata oladi? (cheksiz uchun 0 yozing)");
      return true;
    }
    case "adm:prmax": {
      const n = parseNum(t);
      if (!Number.isFinite(n) || n < 0) { await ctx.reply("❗️ 0 yoki musbat raqam yuboring:"); return true; }
      data().promos.push({ code: tmp.code, amount: tmp.amount, maxUses: n, usedBy: [], active: true, createdAt: Date.now() });
      save();
      reset(ctx);
      await ctx.reply("✅ Promo kod yaratildi.");
      await promoMenu(ctx, tmp.code);
      return true;
    }
    case "adm:chadd": {
      const c = normChat(t);
      if (!c || !c.startsWith("@")) {
        await ctx.reply("❗️ Kanal username'i kerak, masalan @mening_kanalim. Qayta yuboring:");
        return true;
      }
      try {
        const m = await ctx.api.getChatMember(c, ctx.me.id);
        if (!["administrator", "creator"].includes(m.status)) {
          await ctx.reply("❗️ Bot bu kanalda admin emas. Avval botni kanalga admin qilib qo'shing, so'ng qayta yuboring:");
          return true;
        }
      } catch (e) {
        await ctx.reply("❗️ Kanal topilmadi yoki bot unga qo'shilmagan. Tekshirib, qayta yuboring:");
        return true;
      }
      const st = data().settings;
      if (!st.requiredChannels.includes(c)) st.requiredChannels.push(c);
      save();
      reset(ctx);
      await ctx.reply("✅ Qo'shildi: " + c);
      await chanScreen(ctx);
      return true;
    }
    case "adm:chorders": {
      const c = normChat(t);
      if (!c) {
        await ctx.reply("❗️ @username yoki raqamli ID yuboring. Qayta yuboring:");
        return true;
      }
      try {
        await ctx.api.sendMessage(c, "✅ Bu chat buyurtma xabarlari uchun ulandi.");
      } catch (e) {
        await ctx.reply("❗️ Bu chatga xabar yuborib bo'lmadi. Bot u yerda admin ekanini tekshirib, qayta yuboring:");
        return true;
      }
      data().settings.ordersChat = c;
      save();
      reset(ctx);
      await ctx.reply("✅ Ulandi.");
      await chanScreen(ctx);
      return true;
    }
    case "adm:addadmin": {
      if (!isMainAdmin(ctx.from.id)) { reset(ctx); return true; }
      const id = Number(t.replace(/\D/g, ""));
      if (!id || String(id).length < 5) {
        await ctx.reply("❗️ Telegram ID raqamini yuboring (u botga /myid yozsa ko'rinadi):");
        return true;
      }
      if (allAdmins().includes(id)) {
        await ctx.reply("ℹ️ Bu foydalanuvchi allaqachon admin.");
        return true;
      }
      data().settings.admins.push(id);
      save();
      reset(ctx);
      await ctx.reply("✅ Admin qo'shildi: " + id);
      await safeSend(ctx.api, id, "👮 Siz botga admin qilib tayinlandingiz. Boshqaruv paneli: /admin");
      await adminsScreen(ctx);
      return true;
    }
    case "adm:pf": {
      if (!isMainAdmin(ctx.from.id)) { reset(ctx); return true; }
      const key = tmp.key;
      const group = PGROUPS.check.includes(key) ? "check" : PGROUPS.order.includes(key) ? "order" : "main";
      if (!data().settings.provider) data().settings.provider = {};
      const p = data().settings.provider;
      let v = t;
      if (t.toLowerCase() === "default") {
        delete p[key];
      } else {
        if (key === "baseUrl" && !/^https?:\/\//i.test(v)) {
          await ctx.reply("❗️ Manzil http:// yoki https:// bilan boshlanishi kerak. Qayta yuboring:");
          return true;
        }
        if (key === "method") {
          v = v.toUpperCase();
          if (!["POST", "GET"].includes(v)) { await ctx.reply("❗️ POST yoki GET yozing:"); return true; }
        }
        if (key.endsWith("Path") && !v.startsWith("/")) v = "/" + v;
        if (key.endsWith("Body")) {
          try { JSON.parse(v); } catch (e) {
            await ctx.reply("❗️ Bu to'g'ri JSON emas. Qavs va qo'shtirnoqlarni tekshirib, qayta yuboring:");
            return true;
          }
        }
        if ((key === "authHeader" || key === "authValue") && v === "-") v = "";
        p[key] = v;
      }
      save();
      if (key === "key") {
        try { await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id); } catch (e) { /* ruxsat yo'q bo'lishi mumkin */ }
      }
      reset(ctx);
      await ctx.reply("✅ Saqlandi.");
      await provScreen(ctx, group);
      return true;
    }
    case "adm:cardmin": {
      if (!isMainAdmin(ctx.from.id)) { reset(ctx); return true; }
      const n = parseNum(t);
      if (!Number.isFinite(n) || n < 1 || n > 60) { await ctx.reply("❗️ 1 dan 60 gacha raqam yuboring:"); return true; }
      payments.pset("card", "timeoutMin", n);
      reset(ctx);
      await ctx.reply("✅ Saqlandi.");
      await cardAutoScreen(ctx);
      return true;
    }
    case "adm:payf": {
      if (!isMainAdmin(ctx.from.id)) { reset(ctx); return true; }
      const v = t.replace(/\s+/g, "");
      try { await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id); } catch (e) { /* ruxsat yo'q bo'lishi mumkin */ }
      if (!v || v.length > 200) {
        await ctx.reply("❗️ Qiymat bo'sh bo'lmasligi va juda uzun bo'lmasligi kerak. Qayta yuboring:");
        return true;
      }
      payments.pset(tmp.sys, tmp.key, v);
      reset(ctx);
      await ctx.reply("✅ Saqlandi.");
      await paySysMenu(ctx, tmp.sys);
      return true;
    }
    case "adm:lxm": {
      if (!isMainAdmin(ctx.from.id)) { reset(ctx); return true; }
      const raw = t.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      // Birinchi qatordan kurs va ustamani olamiz; shu qatorda qolgan so'zlar o'yin nomi bo'ladi ("12800 10 pubg mobile" ham bo'ladi)
      const first = (raw[0] || "").replace(",", ".").split(/\s+/).filter(Boolean);
      const nums = [];
      const restWords = [];
      for (const w of first) {
        if (nums.length < 2 && /^\d+(\.\d+)?$/.test(w)) nums.push(Number(w));
        else restWords.push(w);
      }
      const [rt, mk] = nums;
      if (!Number.isFinite(rt) || rt < 1000 || rt > 100000 || !Number.isFinite(mk) || mk < 0 || mk > 500) {
        await ctx.reply("❗️ Birinchi qatorda kurs va ustama bo'lsin, masalan <code>12800 10</code>. Qayta yuboring:", { parse_mode: "HTML" });
        return true;
      }
      const lines = [raw[0], ...(restWords.length ? [restWords.join(" ")] : []), ...raw.slice(1)];
      if (lines.length < 2) {
        await ctx.reply("❗️ Kurs va ustama qabul qilindi, endi o'yin nomini ham yozing. Hammasini birga yuboring, masalan:\n<code>12800 10\nfree fire cis\npubg mobile auto</code>", { parse_mode: "HTML" });
        return true;
      }
      reset(ctx);
      await ctx.reply("⏳ Katalogdan olinmoqda, bir oz kuting...");
      try {
        const cat = await provider.catalog();
        const out = [];
        for (const line of lines.slice(1, 11)) {
          const p = provider.pickGame(cat.items, line);
          if (p.item) {
            const r = await provider.offers(p.item.key);
            if (!r.offers.length) { out.push(`⚠️ ${esc(line)}: paketlar topilmadi`); continue; }
            const res = provider.importOffers(p.item.key, p.item.name, r.offers, rt, mk);
            out.push(`✅ ${esc(res.game.name)}: ${res.added} ta qo'shildi` + (res.skipped ? `, ${res.skipped} ta avval bor` : "") + (res.noPrice ? `, ${res.noPrice} tasida narx yo'q` : "") + (res.more ? `, yana ${res.more} ta qoldi (qayta import qiling)` : ""));
          } else if (p.ambiguous) {
            out.push(`❓ ${esc(line)}: bir nechta topildi (${p.ambiguous.map(esc).join("; ")}) — aniqroq yozing`);
          } else {
            out.push(`❌ ${esc(line)}: topilmadi`);
          }
        }
        await ctx.reply(out.join("\n") + `\n\n⚠️ Server ID kerak o'yinlarda (Mobile Legends) Panel → O'yinlar → o'yin → «Server ID» ni yoqing. Narxlarni «Paketlar» bo'limida tekshiring.`, { parse_mode: "HTML" });
      } catch (e) {
        await ctx.reply("❌ Xato: " + esc(e.message), { parse_mode: "HTML" });
      }
      return true;
    }
    case "adm:lxi": {
      if (!isMainAdmin(ctx.from.id)) { reset(ctx); return true; }
      const [rt, mk] = t.replace(",", ".").split(/\s+/).map(Number);
      if (!Number.isFinite(rt) || rt < 1000 || rt > 100000 || !Number.isFinite(mk) || mk < 0 || mk > 500) {
        await ctx.reply("❗️ Format: kurs ustama%, masalan <code>12800 10</code>. Qayta yuboring:", { parse_mode: "HTML" });
        return true;
      }
      reset(ctx);
      try {
        const r = await provider.offers(tmp.key);
        if (!r.offers.length) { await ctx.reply("Paketlar topilmadi."); return true; }
        const res = provider.importOffers(tmp.key, tmp.name, r.offers, rt, mk);
        await ctx.reply(
          `✅ <b>${esc(res.game.name)}</b>${res.createdGame ? " (yangi o'yin yaratildi)" : ""}\nQo'shildi: ${res.added} ta paket` +
            (res.skipped ? `\nAvval bor edi: ${res.skipped} ta` : "") +
            (res.noPrice ? `\nNarxi noma'lum, o'tkazib yuborildi: ${res.noPrice} ta` : "") +
            (res.more ? `\nBir martada 60 tagacha qo'shiladi, yana ${res.more} ta qoldi: importni qayta bosing` : "") +
            `\n\n⚠️ Mobile Legends kabi o'yinlarda Server ID kerak bo'lsa: Panel → O'yinlar → o'yin → «Server ID» ni yoqing. Narxlarni «Paketlar» bo'limida ko'rib chiqing.`,
          { parse_mode: "HTML" }
        );
      } catch (e) {
        await ctx.reply("❌ Xato: " + esc(e.message), { parse_mode: "HTML" });
      }
      return true;
    }
    case "adm:lxs": {
      if (!isMainAdmin(ctx.from.id)) { reset(ctx); return true; }
      reset(ctx);
      await ctx.reply("⏳ Katalog olinmoqda...");
      try {
        const r = await provider.catalog();
        const q = t.toLowerCase();
        // Hamma so'z nomda yoki kodda bo'lishi kerak (qavs va belgilar e'tiborga olinmaydi): "free fire cis" -> Free Fire (CIS)
        const words = q.replace(/[^\p{L}\p{N}*]+/gu, " ").split(" ").filter(Boolean);
        const all = q === "*" ? r.items : r.items.filter((x) => {
          const hay = (x.name + " " + x.key).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");
          return words.every((w) => hay.includes(w));
        });
        const found = all.slice(0, 40);
        if (!r.items.length) {
          await ctx.reply(`Katalog taniy olinmadi (HTTP ${r.status}). Xom javob:\n<pre>${esc(r.raw.slice(0, 1500))}</pre>`, { parse_mode: "HTML" });
        } else if (!found.length) {
          await ctx.reply("Hech narsa topilmadi. 📋 tugmasi orqali boshqa so'z bilan urinib ko'ring.");
        } else {
          lxCache.set(ctx.from.id, found);
          const kb = new InlineKeyboard();
          found.forEach((g, i) => kb.text((g.name || g.key).slice(0, 40), `a:plv:${i}`).row());
          await ctx.reply(`Topildi: ${all.length} ta${all.length > found.length ? ` (birinchi ${found.length} tasi — aniqroq so'z yozing)` : ""}. Paketlarini ko'rish uchun tanlang:`, { reply_markup: kb });
        }
      } catch (e) {
        await ctx.reply("❌ Xato: " + esc(e.message) + "\nAPI kalit va ruxsatlarni (read) tekshiring.", { parse_mode: "HTML" });
      }
      return true;
    }
    case "adm:ptest": {
      if (!isMainAdmin(ctx.from.id)) { reset(ctx); return true; }
      const [code, pid, sid] = t.split(/\s+/);
      if (!code || !pid) {
        await ctx.reply("❗️ Format: o'yin_kodi playerID [serverID]. Qayta yuboring:");
        return true;
      }
      reset(ctx);
      if (!provider.cfg().checkPath) {
        await ctx.reply("ℹ️ Bu provayderda (Ludovex) ID tekshirish so'rovi yo'q, shuning uchun sinab bo'lmaydi. Bu xato emas: ulanish ishlayapti (katalog va import ishladi). Bot ID ni «tekshirilmagan» deb o'tkazadi. Mintaqani eng kichik paketni sotib olib sinang.");
        return true;
      }
      await ctx.reply("⏳ So'rov yuborilmoqda...");
      try {
        const r = await provider.testCheck(code, pid, sid || "");
        const parsed = r.parsed
          ? `ok = ${r.parsed.ok}, nik = ${esc(r.parsed.nickname || "—")}`
          : "javob JSON emas";
        await ctx.reply(`HTTP ${r.status}\n<pre>${esc(r.text.slice(0, 800))}</pre>\nBot tushungan natija: ${parsed}`, { parse_mode: "HTML" });
      } catch (e) {
        await ctx.reply("❌ Xato: " + esc(e.message), { parse_mode: "HTML" });
      }
      await provScreen(ctx, "main");
      return true;
    }
    case "adm:btlabel":
    case "adm:btelabel": {
      const label = t.trim();
      const editing = s.step === "adm:btelabel";
      const cur = editing ? findBtn(tmp.id) : null;
      const parent = editing ? (cur ? cur.parent || 0 : 0) : tmp.parent || 0;
      // Nom o'sha menyu ichida takrorlanmasligi kerak; asosiy menyuda — asosiy tugmalar nomi bilan ham
      const taken = childBtns(parent).some((b) => b.label === label && String(b.id) !== String(tmp.id));
      if (!label || label.length > 30 || (!parent && Object.values(MENU).includes(label)) || taken) {
        await ctx.reply("❗️ Nom 1–30 belgi bo'lishi, shu menyudagi boshqa tugma (yoki asosiy menyu tugmasi) nomi bilan bir xil bo'lmasligi kerak. Qayta yuboring:");
        return true;
      }
      if (editing) {
        if (cur) { cur.label = label; save(); }
        reset(ctx);
        await btnMenu(ctx, tmp.id);
        return true;
      }
      tmp.label = label;
      if (tmp.type === "menu") {
        const id = nextId("btn");
        data().settings.buttons.push({ id, label, type: "menu", content: "", parent });
        save();
        reset(ctx);
        await ctx.reply("✅ Ichki menyu yaratildi. Endi ichiga tugmalar qo'shing.");
        await btnMenu(ctx, id);
        return true;
      }
      if (tmp.type === "func") {
        s.step = "adm:btfunc";
        const fk = new InlineKeyboard();
        for (const [k, v] of Object.entries(FUNCS)) fk.text(v, `a:bf:${k}`).row();
        data().games.forEach((g) => fk.text(`${g.emoji} ${g.name} bo'limi`, `a:bfg:${g.id}`).row());
        fk.text("❌ Bekor qilish", "a:home");
        await ctx.reply("⚙️ Tugma bosilganda qaysi funksiya ishlasin?", { reply_markup: fk });
        return true;
      }
      s.step = "adm:btcontent";
      await ctx.reply(
        tmp.type === "link"
          ? "🔗 Havolani yuboring (https://... yoki @kanal):"
          : "📝 Tugma bosilganda chiqadigan matnni yuboring (3000 belgigacha):"
      );
      return true;
    }
    case "adm:btcontent":
    case "adm:btecontent": {
      const edit = s.step === "adm:btecontent";
      const b = edit ? findBtn(tmp.id) : null;
      const type = edit ? (b && b.type) : tmp.type;
      const content = normContent(type, t);
      if (content === null || content === undefined) {
        await ctx.reply(type === "link" ? "❗️ To'g'ri havola yuboring (https://... yoki @kanal):" : "❗️ Matn 1–3000 belgi bo'lishi kerak:");
        return true;
      }
      if (edit) {
        if (b) { b.content = content; save(); }
        reset(ctx);
        await btnMenu(ctx, tmp.id);
        return true;
      }
      const id = nextId("btn");
      data().settings.buttons.push({ id, label: tmp.label, type, content, parent: tmp.parent || 0 });
      save();
      reset(ctx);
      await ctx.reply(tmp.parent ? "✅ Tugma menyuga qo'shildi." : "✅ Tugma qo'shildi. Foydalanuvchilarda /start bosganda yoki «Xabar yuborish» dan keyin ko'rinadi.");
      await btnMenu(ctx, id);
      return true;
    }
    case "adm:bc": {
      tmp.text = t;
      const kb = new InlineKeyboard().text("📤 Yuborish", "a:bcy").text("❌ Bekor", "a:home");
      await ctx.reply(`Quyidagi xabar ${Object.keys(data().users).length} ta foydalanuvchiga yuboriladi:\n\n${t}`, { reply_markup: kb });
      return true;
    }
    default:
      return false;
  }
}

module.exports = { admin, adminText, panel };

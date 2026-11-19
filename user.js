// Foydalanuvchi qismi: o'yin tanlash -> paket -> ID kiritish -> tekshirish -> to'lov -> yetkazish
const { Composer, Keyboard, InlineKeyboard } = require("grammy");
const { data, save, nextId } = require("./db");
const { esc, fmt, show, MENU } = require("./util");
const provider = require("./provider");
const { processOrder, notifyAdmins, notifyChat, statusLabel } = require("./orders");
const { allAdmins } = require("./config");
const payments = require("./payments");
const apiSvc = require("./api");

const user = new Composer();

const topButtons = () => (data().settings.buttons || []).filter((b) => !b.parent);

const mainKb = () => {
  const kb = new Keyboard()
    .text(MENU.shop)
    .text(MENU.bal)
    .row()
    .text(MENU.orders)
    .text(MENU.promo)
    .row()
    .text(MENU.ref)
    .text(MENU.help);
  if (apiSvc.enabled()) kb.row().text(MENU.api);
  // Admin paneldan qo'shilgan maxsus tugmalar (qatorda 2 tadan)
  // (ichki menyudagi tugmalar bu yerda ko'rinmaydi — ular menyu ichida chiqadi)
  topButtons().forEach((b, i) => {
    if (i % 2 === 0) kb.row();
    kb.text(b.label);
  });
  return kb.resized();
};

const reset = (ctx) => {
  ctx.session.step = null;
  ctx.session.tmp = {};
};
const cancelKb = () => new InlineKeyboard().text("❌ Bekor qilish", "cancel");
const me = (ctx) => data().users[ctx.from.id];
const lookup = (pkgId) => {
  const pkg = data().packages.find((p) => p.id === Number(pkgId));
  const game = pkg && data().games.find((g) => g.id === pkg.gameId);
  return { pkg, game };
};

// ---------- O'yinlar va paketlar ----------
async function showGames(ctx) {
  const games = data().games.filter((g) => g.active);
  if (!games.length) return show(ctx, "Hozircha o'yinlar mavjud emas.");
  const kb = new InlineKeyboard();
  games.forEach((g) => kb.text(`${g.emoji} ${g.name}`, `g:${g.id}`).row());
  return show(ctx, "🎮 O'yinni tanlang:", kb);
}

user.callbackQuery("games", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showGames(ctx);
});

async function showGame(ctx, gameId) {
  const game = data().games.find((g) => g.id === Number(gameId));
  if (!game || !game.active) return show(ctx, "Bo'lim topilmadi yoki vaqtincha o'chirilgan.");
  const list = data().packages.filter((p) => p.gameId === game.id && p.active);
  const kb = new InlineKeyboard();
  list.forEach((p) => {
    const out = p.delivery === "code" && !(p.stock || []).length;
    kb.text(`${p.name} — ${fmt(p.price)}${out ? " (tugagan)" : ""}`, `p:${p.id}`).row();
  });
  kb.text("⬅️ Orqaga", "games");
  const head = `${game.emoji} <b>${esc(game.name)}</b>\n`;
  await show(ctx, head + (list.length ? "Paketni tanlang:" : "Hozircha paketlar yo'q."), kb);
}

user.callbackQuery(/^g:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showGame(ctx, ctx.match[1]);
});

user.callbackQuery(/^p:(\d+)$/, async (ctx) => {
  const { pkg, game } = lookup(ctx.match[1]);
  if (!pkg || !game || !pkg.active || !game.active) {
    return ctx.answerCallbackQuery({ text: "Bu paket hozir mavjud emas", show_alert: true });
  }
  if (pkg.delivery === "code") {
    if (!(pkg.stock || []).length) {
      return ctx.answerCallbackQuery({ text: "😔 Bu paket hozir tugagan. Keyinroq urinib ko'ring.", show_alert: true });
    }
    await ctx.answerCallbackQuery();
    ctx.session.step = "u:confirm";
    ctx.session.tmp = { pkgId: pkg.id, playerId: "" };
    const kb = new InlineKeyboard().text("✅ Tasdiqlash va to'lash", "buy").row().text("❌ Bekor", "cancel");
    return ctx.reply(
      `${game.emoji} <b>${esc(game.name)}</b> — ${esc(pkg.name)}\n💵 Narxi: <b>${fmt(pkg.price)}</b>\n\n🎟 To'lovdan so'ng kod <b>shu zahoti avtomatik</b> yuboriladi.`,
      { parse_mode: "HTML", reply_markup: kb }
    );
  }
  await ctx.answerCallbackQuery();
  ctx.session.step = "u:id";
  ctx.session.tmp = { pkgId: pkg.id };
  await ctx.reply(
    `${game.emoji} <b>${esc(game.name)}</b> — ${esc(pkg.name)}\n💵 ${fmt(pkg.price)}\n\n` +
      (game.kind === "tg"
        ? "👤 Donat yuboriladigan <b>Telegram username</b> ni yuboring (masalan: <code>@username</code>):"
        : "🆔 O'yindagi <b>Player ID</b> raqamingizni yuboring:"),
    { parse_mode: "HTML", reply_markup: cancelKb() }
  );
});

user.callbackQuery("cancel", async (ctx) => {
  reset(ctx);
  await ctx.answerCallbackQuery({ text: "Bekor qilindi" });
  await show(ctx, "❌ Bekor qilindi.");
});

// ---------- ID tekshirish ----------
async function verifyAccount(ctx) {
  const s = ctx.session;
  const { pkg, game } = lookup(s.tmp.pkgId);
  if (!pkg || !game) {
    reset(ctx);
    await ctx.reply("Paket topilmadi, qaytadan boshlang.");
    return;
  }
  await ctx.reply("🔎 ID tekshirilmoqda...");
  let r;
  try {
    r = await provider.checkId(game, s.tmp.playerId, s.tmp.serverId);
  } catch (e) {
    console.error("checkId xatosi:", e.message);
    r = { ok: true, nickname: null };
  }
  if (!r.ok) {
    s.step = "u:id";
    delete s.tmp.playerId;
    delete s.tmp.serverId;
    await ctx.reply(game.kind === "tg" ? "❌ Bunday username topilmadi. To'g'ri username yuboring:" : "❌ Bunday ID topilmadi. To'g'ri ID yuboring:", { reply_markup: cancelKb() });
    return;
  }
  s.tmp.nickname = r.nickname || "";
  s.step = "u:confirm";

  const lines = [
    `${game.emoji} <b>${esc(game.name)}</b> — ${esc(pkg.name)}`,
    `💵 Narxi: <b>${fmt(pkg.price)}</b>`,
    game.kind === "tg"
      ? `👤 Username: <code>${esc(s.tmp.playerId)}</code>`
      : `🆔 ID: <code>${esc(s.tmp.playerId)}</code>`,
  ];
  if (s.tmp.serverId) lines.push(`🌐 Server: <code>${esc(s.tmp.serverId)}</code>`);
  if (r.nickname) {
    lines.push(`👤 Nik: <b>${esc(r.nickname)}</b>`, "", "✅ Akkaunt topildi. Tasdiqlaysizmi?");
  } else {
    lines.push(
      "",
      game.kind === "tg"
        ? "⚠️ Username to'g'riligini yaxshilab tekshiring — xato akkauntga yuborilgan Premium/Stars qaytarilmaydi."
        : "⚠️ ID avtomatik tekshirilmadi. ID to'g'riligini yaxshilab tekshiring — xato ID ga yuborilgan donat qaytarilmaydi."
    );
  }
  const kb = new InlineKeyboard()
    .text("✅ Tasdiqlash va to'lash", "buy")
    .row()
    .text("🔁 ID ni o'zgartirish", `p:${pkg.id}`)
    .text("❌ Bekor", "cancel");
  await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
}

// ---------- Sotib olish ----------
user.callbackQuery("buy", async (ctx) => {
  const s = ctx.session;
  if (s.step !== "u:confirm") {
    return ctx.answerCallbackQuery({ text: "Sessiya eskirdi, qaytadan boshlang.", show_alert: true });
  }
  const { pkg, game } = lookup(s.tmp.pkgId);
  if (!pkg || !game || !pkg.active || !game.active) {
    reset(ctx);
    return ctx.answerCallbackQuery({ text: "Bu paket endi mavjud emas", show_alert: true });
  }
  if (pkg.delivery === "code" && !(pkg.stock || []).length) {
    reset(ctx);
    return ctx.answerCallbackQuery({ text: "😔 Bu paket hozirgina tugadi.", show_alert: true });
  }
  const u = me(ctx);
  if (u.balance < pkg.price) {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard().text("💳 Hisobni to'ldirish", "topup");
    return show(
      ctx,
      `❗️ Balansingiz yetarli emas.\n\nKerak: ${fmt(pkg.price)}\nBalans: ${fmt(u.balance)}\nYetishmaydi: <b>${fmt(pkg.price - u.balance)}</b>`,
      kb
    );
  }

  // Ikki marta bosilishdan himoya: avval holatni tozalab, pulni yechamiz
  const tmp = s.tmp;
  reset(ctx);
  u.balance -= pkg.price;
  const order = {
    id: nextId("order"),
    userId: u.id,
    gameId: game.id,
    gameName: game.name,
    pkgId: pkg.id,
    pkgName: pkg.name,
    price: pkg.price,
    playerId: tmp.playerId,
    serverId: tmp.serverId || "",
    nickname: tmp.nickname || "",
    kind: game.kind || "game",
    cost: pkg.cost || 0,
    status: "processing",
    createdAt: Date.now(),
  };
  data().orders.push(order);
  save();

  await ctx.answerCallbackQuery();
  await show(ctx, `⏳ Buyurtma #${order.id} qabul qilindi, bajarilmoqda...`);
  await processOrder(ctx.api, order);
});

// ---------- Hisob ----------
async function showBalance(ctx) {
  const u = me(ctx);
  const kb = new InlineKeyboard().text("💳 Hisobni to'ldirish", "topup");
  await show(
    ctx,
    `💰 Balansingiz: <b>${fmt(u.balance)}</b>\n🆔 Telegram ID: <code>${u.id}</code>`,
    kb
  );
}

async function showOrders(ctx) {
  const list = data().orders.filter((o) => o.userId === ctx.from.id).slice(-10).reverse();
  if (!list.length) return show(ctx, "Sizda hali buyurtmalar yo'q.");
  const lines = list.map(
    (o) => `#${o.id} ${esc(o.gameName)} — ${esc(o.pkgName)}\n   ${fmt(o.price)} • ${statusLabel(o.status)}`
  );
  await show(ctx, "📦 <b>Oxirgi buyurtmalar:</b>\n\n" + lines.join("\n\n"));
}

// ---------- Hisobni to'ldirish (avtomatik: Click/Payme, yoki kartaga o'tkazib chek yuborish) ----------
// method — oldindan tanlangan usul (funksiyali tugmadan), bo'lmasa mijoz o'zi tanlaydi
async function startTopup(ctx, method) {
  if (method && !payments.methods().some((m) => m.id === method)) {
    return ctx.reply("😔 Bu to'lov usuli hozircha mavjud emas.");
  }
  if (!payments.methods().length) {
    return ctx.reply("😔 Hisobni to'ldirish usullari hozircha mavjud emas. Admin bilan bog'laning: " + data().settings.contact);
  }
  ctx.session.step = "u:topamount";
  ctx.session.tmp = method ? { method } : {};
  await ctx.reply(
    `💳 Qancha summaga to'ldirmoqchisiz?\nMinimal: ${fmt(data().settings.minTopup)}\n\nSummani raqam bilan yozing (masalan: 50000):`,
    { reply_markup: cancelKb() }
  );
}

user.callbackQuery("topup", async (ctx) => {
  await ctx.answerCallbackQuery();
  await startTopup(ctx);
});

async function startMethod(ctx, method) {
  const s = ctx.session;
  const st = data().settings;
  const n = s.tmp.amount;
  if (method === "card") {
    s.step = "u:receipt";
    s.tmp = { amount: n };
    return ctx.reply(
      `💳 <b>To'lov ma'lumotlari</b>\n\nKarta: <code>${esc(st.cardNumber)}</code>\nEgasi: ${esc(st.cardOwner)}\nSumma: <b>${fmt(n)}</b>\n\nTo'lovni amalga oshirib, <b>chek (skrinshot) rasmini</b> shu yerga yuboring.`,
      { parse_mode: "HTML", reply_markup: cancelKb() }
    );
  }
  if (method === "cardauto") {
    const cp = payments.createCardPayment(ctx.from.id, n);
    reset(ctx);
    if (!cp) return ctx.reply("😔 Hozir to'lovlar ko'p, 1–2 daqiqadan keyin qayta urinib ko'ring.");
    const until = new Date(cp.expiresAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" });
    return ctx.reply(
      `🏦 <b>Kartaga o'tkazish</b>\n\nKarta: <code>${esc(st.cardNumber)}</code>\nEgasi: ${esc(st.cardOwner)}\n\n💵 Aynan shu summani o'tkazing: <b>${fmt(cp.amount)}</b>\n(<code>${cp.amount}</code>)\n\n⏳ <b>${payments.pcfg().card.timeoutMin} daqiqa ichida</b> (${until} gacha) o'tkazing. Summa aynan bir xil bo'lishi shart — shunda hisobingiz avtomatik to'ldiriladi. Muddat o'tsa yoki summa boshqacha bo'lsa, pul avtomatik tushmaydi.`,
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔄 Holatni tekshirish", `pc:${cp.id}`) }
    );
  }
  const p = payments.createPayment(ctx.from.id, n, method);
  const url = payments.payUrl(p, ctx.me.username);
  reset(ctx);
  const label = method === "click" ? "Click" : "Payme";
  await ctx.reply(
    `💳 <b>${label} orqali to'lov</b>\nSumma: <b>${fmt(n)}</b>\n\nPastdagi tugmani bosib to'lang. To'lov o'tgach hisobingiz <b>avtomatik</b> to'ldiriladi va sizga xabar keladi.`,
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().url(`💳 ${label} orqali to'lash`, url).row().text("🔄 Holatni tekshirish", `pc:${p.id}`),
    }
  );
}

// Summa yozilgach: usulni tanlatadi (yoki bitta usul bo'lsa darhol o'tadi)
async function afterAmount(ctx) {
  const s = ctx.session;
  const ms = payments.methods();
  const pre = s.tmp.method && ms.find((m) => m.id === s.tmp.method);
  if (pre) return startMethod(ctx, pre.id);
  if (ms.length === 1) return startMethod(ctx, ms[0].id);
  if (!ms.length) { reset(ctx); return ctx.reply("😔 To'lov usullari hozircha mavjud emas."); }
  s.step = "u:pmethod";
  const kb = new InlineKeyboard();
  ms.forEach((m) => kb.text(m.label, `pm:${m.id}`).row());
  kb.text("❌ Bekor qilish", "cancel");
  await ctx.reply(`💵 Summa: <b>${fmt(s.tmp.amount)}</b>\n\nTo'lov usulini tanlang:`, { parse_mode: "HTML", reply_markup: kb });
}

user.callbackQuery(/^pm:(click|payme|card|cardauto)$/, async (ctx) => {
  const s = ctx.session;
  const method = ctx.match[1];
  if (s.step !== "u:pmethod" || !s.tmp.amount || !payments.methods().some((m) => m.id === method)) {
    return ctx.answerCallbackQuery({ text: "Sessiya eskirdi, qaytadan boshlang.", show_alert: true });
  }
  await ctx.answerCallbackQuery();
  await startMethod(ctx, method);
});

user.callbackQuery(/^pc:(\d+)$/, async (ctx) => {
  const p = payments.findPayment(ctx.match[1]);
  if (!p || p.userId !== ctx.from.id) return ctx.answerCallbackQuery({ text: "To'lov topilmadi", show_alert: true });
  if (p.status === "paid") {
    return ctx.answerCallbackQuery({ text: `✅ To'langan. Balans: ${fmt(me(ctx).balance)}`, show_alert: true });
  }
  if (p.status === "expired") {
    return ctx.answerCallbackQuery({ text: "⌛️ Muddat tugagan. Hisobni qaytadan to'ldiring.", show_alert: true });
  }
  await ctx.answerCallbackQuery({ text: "⏳ To'lov hali kelmadi. To'lagan bo'lsangiz, bir daqiqa kuting.", show_alert: true });
});

// ---------- Do'st taklif qilish ----------
async function showReferral(ctx) {
  const u = me(ctx);
  const st = data().settings;
  const link = `https://t.me/${ctx.me.username}?start=ref_${u.id}`;
  const invited = Object.values(data().users).filter((x) => x.refBy === u.id);
  const paid = invited.filter((x) => x.refPaid).length;
  const bonusLine =
    st.refBonus > 0
      ? `\n🎁 Taklif qilgan do'stingiz birinchi marta hisobini to'ldirsa, sizga <b>${fmt(st.refBonus)}</b> bonus beriladi.`
      : "";
  await show(
    ctx,
    `👥 <b>Do'st taklif qilish</b>${bonusLine}\n\n🔗 Sizning havolangiz:\n<code>${link}</code>\n\nTaklif qilganlar: ${invited.length} ta (bonus olingan: ${paid} ta)`
  );
}

// ---------- API (mijozlar uchun) ----------
async function showApi(ctx) {
  const u = me(ctx);
  if (!apiSvc.enabled()) return ctx.reply("🔌 API hozircha mavjud emas.");
  const kb = new InlineKeyboard();
  let text;
  if (u.apiHash) {
    text = `🔌 <b>API ulangan</b>\nManzil: <code>${esc(apiSvc.baseUrl())}</code>\n\nKalit xavfsizlik uchun saqlanmaydi — yo'qotsangiz yangisini oling (eskisi ishlamay qoladi).`;
    kb.text("📖 Hujjat", "api:doc").row().text("🔄 Yangi kalit olish", "api:new");
  } else if (u.apiReq) {
    text = "⏳ API so'rovingiz admin tomonidan ko'rib chiqilmoqda.";
  } else {
    text = "🔌 <b>API</b>\nBotdagi buyurtmalarni o'z saytingiz yoki dasturingizdan avtomatik berish imkoniyati. Kerak bo'lsa so'rov yuboring — admin ko'rib chiqadi.";
    kb.text("📨 API so'rash", "api:req");
  }
  await show(ctx, text, kb);
}
user.callbackQuery("api:req", async (ctx) => {
  const u = me(ctx);
  if (!apiSvc.enabled()) return ctx.answerCallbackQuery({ text: "API hozircha mavjud emas", show_alert: true });
  if (u.apiHash || u.apiReq) return ctx.answerCallbackQuery({ text: "So'rov allaqachon yuborilgan yoki API ulangan", show_alert: true });
  u.apiReq = Date.now();
  save();
  await ctx.answerCallbackQuery({ text: "So'rov yuborildi" });
  await show(ctx, "⏳ API so'rovingiz adminga yuborildi. Javobni shu yerda olasiz.");
  const kb = new InlineKeyboard().text("✅ Berish", `a:akg:${u.id}`).text("❌ Rad etish", `a:akr:${u.id}`);
  await notifyAdmins(ctx.api, `🔌 <b>API so'rovi</b>\n👤 ${esc(u.name || "")} ${u.username ? "@" + esc(u.username) : ""} (<code>${u.id}</code>)\n💰 Balans: ${fmt(u.balance)}`, kb);
});
user.callbackQuery("api:new", async (ctx) => {
  const u = me(ctx);
  if (!u.apiHash || !apiSvc.enabled()) return ctx.answerCallbackQuery({ text: "API ulanmagan", show_alert: true });
  const key = apiSvc.issueKey(u);
  await ctx.answerCallbackQuery({ text: "Yangi kalit berildi" });
  await ctx.reply(`🔑 <b>Yangi API kalit</b> (eskisi o'chdi):\n<code>${key}</code>\n\n⚠️ Uni hech kimga bermang. Bu xabarni saqlab qo'ying — kalit boshqa ko'rsatilmaydi.`, { parse_mode: "HTML" });
});
user.callbackQuery("api:doc", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(apiSvc.docsText(), { parse_mode: "HTML" });
});

// ---------- Funksiyali tugmalar ----------
// content: shop | bal | orders | promo | ref | help | topup | game:<id>
async function runFunc(ctx, fn) {
  const st = data().settings;
  if (fn === "shop") return showGames(ctx);
  if (fn === "bal") return showBalance(ctx);
  if (fn === "orders") return showOrders(ctx);
  if (fn === "ref") return showReferral(ctx);
  if (fn === "help") return ctx.reply(`☎️ Aloqa: ${esc(st.contact)}`, { parse_mode: "HTML" });
  if (fn === "promo") {
    ctx.session.step = "u:promo";
    return ctx.reply("🎁 Promo kodni yuboring:", { reply_markup: cancelKb() });
  }
  if (fn === "topup") return startTopup(ctx);
  if (fn === "pay_click") return startTopup(ctx, "click");
  if (fn === "pay_payme") return startTopup(ctx, "payme");
  if (fn === "pay_card") return startTopup(ctx, "card");
  if (fn === "pay_cardauto") return startTopup(ctx, "cardauto");
  const m = /^game:(\d+)$/.exec(fn || "");
  if (m) return showGame(ctx, m[1]);
  return ctx.reply("Bu tugma hozircha ishlamaydi.");
}

// ---------- Maxsus tugmalar va ichki menyular ----------
// Tugma turlari: text (matn), link (havola), func (bot funksiyasi), menu (ichida boshqa tugmalar bor ichki menyu)
const childrenOf = (id) => (data().settings.buttons || []).filter((b) => b.parent === id);

function subMenuKb(b) {
  const kb = new InlineKeyboard();
  childrenOf(b.id).forEach((c) => {
    if (c.type === "link") kb.url(("🔗 " + c.label).slice(0, 60), c.content).row();
    else kb.text((c.type === "menu" ? "📂 " : "") + c.label, `ub:${c.id}`).row();
  });
  if (b.parent) kb.text("⬅️ Orqaga", `ub:${b.parent}`);
  else kb.text("✖️ Yopish", "ub:x");
  return kb;
}

async function runButton(ctx, b) {
  if (b.type === "func") return runFunc(ctx, b.content);
  if (b.type === "menu") {
    const text = `📂 <b>${esc(b.label)}</b>` + (b.content ? "\n\n" + esc(b.content) : "") + (childrenOf(b.id).length ? "" : "\n\nBu bo'lim hozircha bo'sh.");
    return show(ctx, text, subMenuKb(b));
  }
  if (b.type === "link") {
    return ctx.reply("👇 " + b.label, {
      reply_markup: new InlineKeyboard().url(("🔗 " + b.label).slice(0, 60), b.content),
    });
  }
  return ctx.reply(b.content);
}

user.callbackQuery("ub:x", async (ctx) => {
  await ctx.answerCallbackQuery();
  try { await ctx.deleteMessage(); } catch (e) { /* o'chirib bo'lmadi */ }
});
user.callbackQuery(/^ub:(\d+)$/, async (ctx) => {
  const b = (data().settings.buttons || []).find((x) => x.id === Number(ctx.match[1]));
  if (!b) return ctx.answerCallbackQuery({ text: "Bu tugma topilmadi", show_alert: true });
  await ctx.answerCallbackQuery();
  reset(ctx);
  await runButton(ctx, b);
});

// ---------- Matnli xabarlar ----------
async function handleText(ctx) {
  const t = ctx.message.text.trim();
  const s = ctx.session;
  const st = data().settings;

  if (t === MENU.shop) { reset(ctx); await showGames(ctx); return true; }
  if (t === MENU.bal) { reset(ctx); await showBalance(ctx); return true; }
  if (t === MENU.orders) { reset(ctx); await showOrders(ctx); return true; }
  if (t === MENU.help) {
    reset(ctx);
    await ctx.reply(`☎️ Aloqa: ${esc(st.contact)}`, { parse_mode: "HTML" });
    return true;
  }

  if (t === MENU.promo) {
    reset(ctx);
    s.step = "u:promo";
    await ctx.reply("🎁 Promo kodni yuboring:", { reply_markup: cancelKb() });
    return true;
  }
  if (t === MENU.ref) { reset(ctx); await showReferral(ctx); return true; }
  if (t === MENU.api) { reset(ctx); await showApi(ctx); return true; }

  const custom = topButtons().find((b) => b.label === t);
  if (custom) {
    reset(ctx);
    await runButton(ctx, custom);
    return true;
  }

  switch (s.step) {
    case "u:id": {
      const { game } = lookup(s.tmp.pkgId);
      if (!game) { reset(ctx); await ctx.reply("Paket topilmadi."); return true; }
      if (game.kind === "tg") {
        const uname = t.replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "");
        if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(uname)) {
          await ctx.reply("❗️ Username noto'g'ri. Masalan: @username (5–32 belgi, lotin harflari, raqam va _). Qayta yuboring:");
          return true;
        }
        s.tmp.playerId = "@" + uname;
        await verifyAccount(ctx);
        return true;
      }
      if (!/^\d{5,15}$/.test(t)) {
        await ctx.reply("❗️ ID faqat raqamlardan iborat bo'lishi kerak (5–15 ta raqam). Qayta yuboring:");
        return true;
      }
      s.tmp.playerId = t;
      if (game.needsServer) {
        s.step = "u:server";
        await ctx.reply("🌐 Endi <b>Server (Zone) ID</b> ni yuboring (masalan: 2001):", {
          parse_mode: "HTML",
          reply_markup: cancelKb(),
        });
      } else {
        await verifyAccount(ctx);
      }
      return true;
    }
    case "u:server": {
      if (!/^\d{1,7}$/.test(t)) {
        await ctx.reply("❗️ Server ID faqat raqamlardan iborat bo'lishi kerak. Qayta yuboring:");
        return true;
      }
      s.tmp.serverId = t;
      await verifyAccount(ctx);
      return true;
    }
    case "u:topamount": {
      const n = parseInt(t.replace(/[\s,._]/g, ""), 10);
      if (!Number.isFinite(n) || n < st.minTopup || n > 50000000) {
        await ctx.reply(`❗️ Summa ${fmt(st.minTopup)} dan 50 000 000 gacha bo'lishi kerak. Qayta yuboring:`);
        return true;
      }
      s.tmp.amount = n;
      await afterAmount(ctx);
      return true;
    }
    case "u:pmethod": {
      await ctx.reply("👆 Yuqoridagi tugmalardan to'lov usulini tanlang.");
      return true;
    }
    case "u:promo": {
      const code = t.toUpperCase().replace(/\s+/g, "");
      const promo = data().promos.find((p) => p.code === code);
      const u = me(ctx);
      if (!promo || !promo.active) {
        await ctx.reply("❌ Bunday promo kod topilmadi yoki o'chirilgan. Qayta yuboring:");
        return true;
      }
      if (promo.maxUses > 0 && promo.usedBy.length >= promo.maxUses) {
        reset(ctx);
        await ctx.reply("😔 Bu promo kodning limiti tugagan.");
        return true;
      }
      if (promo.usedBy.includes(u.id)) {
        reset(ctx);
        await ctx.reply("ℹ️ Siz bu promo koddan allaqachon foydalangansiz.");
        return true;
      }
      promo.usedBy.push(u.id);
      u.balance += promo.amount;
      save();
      reset(ctx);
      await ctx.reply(`🎉 Promo kod qabul qilindi! Hisobingizga ${fmt(promo.amount)} qo'shildi.\n💰 Balans: ${fmt(u.balance)}`);
      return true;
    }
    case "u:receipt":
      await ctx.reply("📷 Iltimos, to'lov chekini rasm (skrinshot) ko'rinishida yuboring.");
      return true;
    default:
      return false;
  }
}

// ---------- Chek rasmi ----------
user.on("message:photo", async (ctx) => {
  const s = ctx.session;
  if (s.step !== "u:receipt") return;
  const u = me(ctx);
  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  const t = {
    id: nextId("topup"),
    userId: u.id,
    amount: s.tmp.amount,
    fileId: photo.file_id,
    status: "pending",
    createdAt: Date.now(),
  };
  data().topups.push(t);
  save();
  reset(ctx);

  await ctx.reply(`✅ Chek yuborildi (#${t.id}). Admin tekshirib, hisobingizni to'ldiradi.`);
  await notifyChat(ctx.api, `💳 Yangi to'lov cheki #${t.id}: ${esc(u.name)} — ${fmt(t.amount)}`);

  const caption = `💳 To'lov #${t.id}\n👤 ${u.name} ${u.username ? "@" + u.username : ""} (ID: ${u.id})\n💵 ${fmt(t.amount)}`;
  const kb = new InlineKeyboard().text("✅ Tasdiqlash", `a:ta:${t.id}`).text("❌ Rad etish", `a:tr:${t.id}`);
  for (const id of allAdmins()) {
    try {
      await ctx.api.sendPhoto(id, t.fileId, { caption, reply_markup: kb });
    } catch (e) {
      console.error("Chek adminga yuborilmadi:", id, e.description || e.message);
    }
  }
});

module.exports = { user, handleText, mainKb, reset };

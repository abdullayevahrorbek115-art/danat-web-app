// Foydalanuvchi qismi: o'yin tanlash -> paket -> ID kiritish -> tekshirish -> to'lov -> yetkazish
const { Composer, Keyboard, InlineKeyboard } = require("grammy");
const { data, save, nextId } = require("./db");
const { esc, fmt, show, MENU } = require("./util");
const provider = require("./provider");
const { processOrder, notifyAdmins, notifyChat, statusLabel } = require("./orders");
const { allAdmins } = require("./config");

const user = new Composer();

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
  // Admin paneldan qo'shilgan maxsus tugmalar (qatorda 2 tadan)
  (data().settings.buttons || []).forEach((b, i) => {
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
  list.forEach((p) => kb.text(`${p.name} — ${fmt(p.price)}`, `p:${p.id}`).row());
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
    reset(ctx);
    await ctx.reply("⚠️ ID tekshirish xizmati vaqtincha ishlamayapti. Birozdan keyin urinib ko'ring.");
    return;
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

user.callbackQuery("topup", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "u:topamount";
  ctx.session.tmp = {};
  await ctx.reply(
    `💳 Qancha summaga to'ldirmoqchisiz?\nMinimal: ${fmt(data().settings.minTopup)}\n\nSummani raqam bilan yozing (masalan: 50000):`,
    { reply_markup: cancelKb() }
  );
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
  if (fn === "topup") {
    ctx.session.step = "u:topamount";
    ctx.session.tmp = {};
    return ctx.reply(
      `💳 Qancha summaga to'ldirmoqchisiz?\nMinimal: ${fmt(st.minTopup)}\n\nSummani raqam bilan yozing (masalan: 50000):`,
      { reply_markup: cancelKb() }
    );
  }
  const m = /^game:(\d+)$/.exec(fn || "");
  if (m) return showGame(ctx, m[1]);
  return ctx.reply("Bu tugma hozircha ishlamaydi.");
}

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

  const custom = (st.buttons || []).find((b) => b.label === t);
  if (custom) {
    reset(ctx);
    if (custom.type === "func") {
      await runFunc(ctx, custom.content);
      return true;
    }
    if (custom.type === "link") {
      await ctx.reply("👇 " + custom.label, {
        reply_markup: new InlineKeyboard().url(("🔗 " + custom.label).slice(0, 60), custom.content),
      });
    } else {
      await ctx.reply(custom.content);
    }
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
      s.step = "u:receipt";
      await ctx.reply(
        `💳 <b>To'lov ma'lumotlari</b>\n\nKarta: <code>${esc(st.cardNumber)}</code>\nEgasi: ${esc(st.cardOwner)}\nSumma: <b>${fmt(n)}</b>\n\nTo'lovni amalga oshirib, <b>chek (skrinshot) rasmini</b> shu yerga yuboring.`,
        { parse_mode: "HTML", reply_markup: cancelKb() }
      );
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

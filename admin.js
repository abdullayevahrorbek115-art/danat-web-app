// Admin panel: o'yinlar, paketlar, buyurtmalar, to'lovlar, sozlamalar, xabar yuborish
const { Composer, InlineKeyboard } = require("grammy");
const { data, save, nextId } = require("./db");
const { isAdmin } = require("./config");
const { esc, fmt, show, sleep, MENU } = require("./util");
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
const findPkg = (id) => data().packages.find((p) => p.id === Number(id));
const parseNum = (t) => parseInt(String(t).replace(/[\s,._]/g, ""), 10);

const SETTINGS = {
  cardNumber: "💳 Karta raqami",
  cardOwner: "👤 Karta egasi",
  contact: "☎️ Aloqa (username/telefon)",
  welcome: "👋 Salomlashish matni",
  minTopup: "💵 Minimal to'ldirish summasi",
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
    .text("📊 Statistika", "a:stats");

async function panel(ctx) {
  reset(ctx);
  await show(ctx, "🛠 <b>Boshqaruv paneli</b>", panelKb());
}

// "a:" bilan boshlanadigan har bir tugma bosilganda kutilayotgan kiritish bekor bo'ladi
adm.on("callback_query:data", async (ctx, next) => {
  const d = ctx.callbackQuery.data;
  if (d.startsWith("a:") && d !== "a:bcy") reset(ctx);
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
  kb.text("➕ O'yin qo'shish", "a:gn").row().text("⬅️ Orqaga", "a:home");
  await show(ctx, "🎮 <b>O'yinlar</b>\nTahrirlash uchun o'yinni tanlang:", kb);
}

async function gameMenu(ctx, id) {
  const g = findGame(id);
  if (!g) return gamesList(ctx);
  const n = data().packages.filter((p) => p.gameId === g.id).length;
  const text =
    `${g.emoji} <b>${esc(g.name)}</b>\n` +
    `Holat: ${g.active ? "✅ yoqilgan" : "🚫 o'chirilgan"}\n` +
    `Server ID so'rash: ${g.needsServer ? "ha" : "yo'q"}\n` +
    `Provayder kodi: ${g.providerCode ? "<code>" + esc(g.providerCode) + "</code>" : "—"}\n` +
    `Paketlar: ${n} ta`;
  const kb = new InlineKeyboard()
    .text(`📦 Paketlar (${n})`, `a:pl:${g.id}`)
    .row()
    .text("➕ Paket qo'shish", `a:pn:${g.id}`)
    .row()
    .text("✏️ Nomi", `a:ge:${g.id}`)
    .text("🔑 Provayder kodi", `a:gc:${g.id}`)
    .row()
    .text(g.needsServer ? "🌐 Server ID: yoqilgan" : "🌐 Server ID: o'chiq", `a:gs:${g.id}`)
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
  kb.text("➕ Paket qo'shish", `a:pn:${g.id}`).row().text("⬅️ Orqaga", `a:g:${g.id}`);
  await show(ctx, `📦 <b>${esc(g.name)}</b> paketlari:`, kb);
}

async function pkgMenu(ctx, id) {
  const p = findPkg(id);
  if (!p) return gamesList(ctx);
  const g = findGame(p.gameId);
  const text =
    `📦 <b>${esc(p.name)}</b>\n🎮 ${esc(g ? g.name : "?")}\n💵 Narx: <b>${fmt(p.price)}</b>\n` +
    `Holat: ${p.active ? "✅ yoqilgan" : "🚫 o'chirilgan"}\n` +
    `Provayder SKU: ${p.sku ? "<code>" + esc(p.sku) + "</code>" : "—"}`;
  const kb = new InlineKeyboard()
    .text("✏️ Nomi", `a:pe:${p.id}`)
    .text("💵 Narxi", `a:pp:${p.id}`)
    .row()
    .text("🔑 Provayder SKU", `a:pk:${p.id}`)
    .row()
    .text(p.active ? "🚫 O'chirib qo'yish" : "✅ Yoqish", `a:pt:${p.id}`)
    .row()
    .text("🗑 O'chirish", `a:pd:${p.id}`)
    .row()
    .text("⬅️ Orqaga", `a:pl:${p.gameId}`);
  await show(ctx, text, kb);
}

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
  t.by = ctx.from.id;
  if (u) u.balance += t.amount;
  save();
  await ctx.answerCallbackQuery({ text: "Tasdiqlandi" });
  await markDone(ctx, `\n\n✅ Tasdiqlandi (${ctx.from.first_name})`);
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
    if (k === "minTopup") v = fmt(v);
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
      try { await api.sendMessage(u.id, text); ok++; } catch (e) { fail++; }
      await sleep(60);
    }
    await safeSend(api, adminId, `✅ Yuborildi: ${ok} ta, xato: ${fail} ta`);
  })();
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
      data().games.push({ id, name: t.slice(0, 40), emoji: "🎮", needsServer: false, active: true, providerCode: "" });
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
    case "adm:psku": {
      const p = findPkg(tmp.id);
      if (p) { p.sku = t === "-" ? "" : t; save(); }
      reset(ctx);
      await pkgMenu(ctx, tmp.id);
      return true;
    }
    case "adm:set": {
      const st = data().settings;
      if (tmp.key === "minTopup") {
        const n = parseNum(t);
        if (!Number.isFinite(n) || n <= 0) { await ctx.reply("❗️ Raqam yuboring:"); return true; }
        st.minTopup = n;
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

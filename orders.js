const { InlineKeyboard } = require("grammy");
const { data, save } = require("./db");
const { allAdmins } = require("./config");
const provider = require("./provider");
const { esc, fmt } = require("./util");

const STATUS = {
  processing: "⏳ Jarayonda",
  pending: "⏳ Yetkazilmoqda",
  done: "✅ Bajarildi",
  failed: "❌ Bekor qilindi (pul qaytarilgan)",
};
const statusLabel = (s) => STATUS[s] || s;

async function safeSend(api, chatId, text, kb) {
  try {
    const extra = { parse_mode: "HTML" };
    if (kb) extra.reply_markup = kb;
    await api.sendMessage(chatId, text, extra);
  } catch (e) {
    console.error("Xabar yuborilmadi:", chatId, e.description || e.message);
  }
}

// Sozlangan guruh/kanalga (tugmalarsiz) xabar yuboradi
async function notifyChat(api, text) {
  const chat = data().settings.ordersChat;
  if (chat) await safeSend(api, chat, text);
}

async function notifyAdmins(api, text, kb) {
  for (const id of allAdmins()) await safeSend(api, id, text, kb);
  await notifyChat(api, text);
}

function adminOrderText(o) {
  const u = data().users[o.userId] || {};
  const lines = [
    `🆕 <b>Buyurtma #${o.id}</b>`,
    `👤 ${esc(u.name || "")} ${u.username ? "@" + esc(u.username) : ""} (<code>${o.userId}</code>)`,
    `🎮 ${esc(o.gameName)} — ${esc(o.pkgName)}`,
    `💵 ${fmt(o.price)}`,
    o.kind === "tg" ? `👤 Username: <code>${esc(o.playerId)}</code>` : `🆔 ID: <code>${esc(o.playerId)}</code>`,
  ];
  if (o.serverId) lines.push(`🌐 Server: <code>${esc(o.serverId)}</code>`);
  if (o.nickname) lines.push(`👤 Nik: ${esc(o.nickname)}`);
  return lines.join("\n");
}

const orderKb = (id) =>
  new InlineKeyboard()
    .text("✅ Bajarildi", `a:od:${id}`)
    .text("❌ Bekor qilish", `a:oc:${id}`);

// Buyurtmani yetkazishni boshlaydi (avtomatik yoki adminga yuboradi)
async function processOrder(api, order) {
  const game = data().games.find((g) => g.id === order.gameId);
  const pkg = data().packages.find((p) => p.id === order.pkgId);
  let r;
  try {
    r = await provider.deliver(order, game, pkg);
  } catch (e) {
    console.error("deliver xatosi:", e.message);
    // Natija noaniq (tarmoq xatosi, vaqt tugashi, 5xx): provayder buyurtmani bajargan bo'lishi mumkin,
    // shuning uchun pul qaytarilmaydi — adminga qo'lda tekshirish uchun beriladi.
    r = { ok: true, manual: true };
    await notifyAdmins(
      api,
      `⚠️ Buyurtma #${order.id}: provayderdan aniq javob olinmadi (${esc(e.message)}). Avval provayder panelida buyurtma bajarilganini tekshiring, so'ng "Bajarildi" yoki "Bekor qilish" ni bosing.`
    );
  }

  if (r.ok && r.manual) {
    order.status = "pending";
    save();
    await safeSend(
      api,
      order.userId,
      `📨 Buyurtma #${order.id} qabul qilindi. Tez orada yetkaziladi, tayyor bo'lganda xabar beramiz.`
    );
    await notifyAdmins(api, adminOrderText(order), orderKb(order.id));
  } else if (r.ok) {
    await completeOrder(api, order, r.ref);
  } else {
    await cancelOrder(api, order);
    await notifyAdmins(
      api,
      `⚠️ Buyurtma #${order.id} provayder tomonidan rad etildi: ${esc(r.error || "sabab ko'rsatilmagan")}\nPul mijozga qaytarildi.`
    );
  }
}

async function completeOrder(api, order, ref) {
  if (order.status === "done" || order.status === "failed") return false;
  order.status = "done";
  order.ref = ref || "";
  order.doneAt = Date.now();
  save();
  await safeSend(
    api,
    order.userId,
    `✅ Buyurtma #${order.id} yetkazildi!\n🎮 ${esc(order.gameName)} — ${esc(order.pkgName)}\n🆔 <code>${esc(order.playerId)}</code>\n\nRahmat! 🙌`
  );
  await notifyChat(api, `✅ Buyurtma #${order.id} bajarildi: ${esc(order.gameName)} — ${esc(order.pkgName)}`);
  return true;
}

// Pulni qaytarib, buyurtmani bekor qiladi
async function cancelOrder(api, order) {
  if (order.status === "done" || order.status === "failed") return false;
  const u = data().users[order.userId];
  if (u) u.balance += order.price;
  order.status = "failed";
  save();
  await safeSend(
    api,
    order.userId,
    `❌ Buyurtma #${order.id} bajarilmadi. ${fmt(order.price)} balansingizga qaytarildi.`
  );
  return true;
}

module.exports = {
  processOrder,
  completeOrder,
  cancelOrder,
  notifyAdmins,
  notifyChat,
  safeSend,
  adminOrderText,
  orderKb,
  statusLabel,
};

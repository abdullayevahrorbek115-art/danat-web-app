const { InlineKeyboard } = require("grammy");
const { data, save } = require("./db");
const { adminIds } = require("./config");
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

async function notifyAdmins(api, text, kb) {
  for (const id of adminIds) await safeSend(api, id, text, kb);
}

function adminOrderText(o) {
  const u = data().users[o.userId] || {};
  const lines = [
    `🆕 <b>Buyurtma #${o.id}</b>`,
    `👤 ${esc(u.name || "")} ${u.username ? "@" + esc(u.username) : ""} (<code>${o.userId}</code>)`,
    `🎮 ${esc(o.gameName)} — ${esc(o.pkgName)}`,
    `💵 ${fmt(o.price)}`,
    `🆔 ID: <code>${esc(o.playerId)}</code>`,
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
    r = { ok: false, error: e.message };
    await notifyAdmins(
      api,
      `⚠️ Buyurtma #${order.id} avtomatik yetkazilmadi: ${esc(e.message)}\nPul foydalanuvchiga qaytarildi.`
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
    await cancelOrder(api, order, r.error);
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
  safeSend,
  adminOrderText,
  orderKb,
  statusLabel,
};

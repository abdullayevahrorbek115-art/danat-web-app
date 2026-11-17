// ID tekshirish va avtomatik yetkazish uchun provayder qatlami.
//
// MUHIM: PUBG / Free Fire / Mobile Legends / Standoff 2 akkaunt nikini tekshirish
// va donatni avtomatik yetkazish uchun yetkazib beruvchi (supplier) xizmatining
// API si kerak. Pastdagi `apiProvider` — SHABLON. So'rov manzillari va maydon
// nomlari shartli; o'zingiz tanlagan provayder hujjatiga qarab moslang.
//
// Ishlash tartibi:
//  - Sozlamalarda rejim "manual" bo'lsa: ID tekshirilmaydi, buyurtmani admin qo'lda bajaradi.
//  - Rejim "api" bo'lsa VA o'yinda "provayder kodi", paketda "SKU" kiritilgan bo'lsa:
//    ID avtomatik tekshiriladi va buyurtma avtomatik yetkaziladi.
//  - Kod/SKU kiritilmagan o'yin yoki paket "manual" bo'lib qoladi.
const { data } = require("./db");

async function request(endpoint, body) {
  const base = process.env.PROVIDER_URL;
  const key = process.env.PROVIDER_KEY;
  if (!base || !key) {
    throw new Error("PROVIDER_URL va PROVIDER_KEY .env faylida ko'rsatilmagan");
  }
  const res = await fetch(base.replace(/\/$/, "") + endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + key,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Provayder HTTP ${res.status}`);
  return res.json();
}

// ====== SHABLON: provayder hujjatiga qarab moslang ======
const apiProvider = {
  async checkId(game, playerId, serverId) {
    const r = await request("/check-id", {
      game: game.providerCode,
      player_id: playerId,
      server_id: serverId || undefined,
    });
    return { ok: !!r.success, nickname: r.nickname || null };
  },

  async deliver(order, game, pkg) {
    const r = await request("/order", {
      game: game.providerCode,
      sku: pkg.sku,
      player_id: order.playerId,
      server_id: order.serverId || undefined,
      order_ref: String(order.id),
    });
    if (r.success) return { ok: true, ref: r.order_id };
    return { ok: false, error: r.message || "Provayder buyurtmani rad etdi" };
  },
};
// ========================================================

const apiEnabled = () => data().settings.providerMode === "api";

// -> { ok, nickname } ; nickname null bo'lsa — tekshirilmagan
async function checkId(game, playerId, serverId) {
  if (!apiEnabled() || !game.providerCode) return { ok: true, nickname: null };
  return apiProvider.checkId(game, playerId, serverId);
}

// -> { ok:true, manual:true } | { ok:true, ref } | { ok:false, error }
async function deliver(order, game, pkg) {
  if (!apiEnabled() || !game.providerCode || !pkg.sku) {
    return { ok: true, manual: true };
  }
  return apiProvider.deliver(order, game, pkg);
}

module.exports = { checkId, deliver };

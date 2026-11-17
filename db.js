// Oddiy JSON-fayl ma'lumotlar bazasi (data/db.json).
// Kichik va o'rta botlar uchun yetarli. Katta oqim bo'lsa SQLite/PostgreSQL ga o'tkazing.
const fs = require("fs");
const path = require("path");

// Doimiy disk ulangan bo'lsa, DATA_DIR orqali uning yo'lini bering (masalan /data)
const FILE = path.join(process.env.DATA_DIR || path.join(__dirname, "data"), "db.json");

const defaults = () => ({
  settings: {
    cardNumber: "0000 0000 0000 0000",
    cardOwner: "Ism Familiya",
    contact: "@admin",
    welcome:
      "Xush kelibsiz! Bu yerda o'yinlar uchun tez va ishonchli donat qilishingiz mumkin.",
    minTopup: 5000,
    providerMode: "manual", // manual | api
    buttons: [], // maxsus menyu tugmalari { id, label, type: "text"|"link", content }
    provider: {}, // provayder sozlamalari (panel → Provayder)
    admins: [], // panel orqali qo'shilgan adminlar (Telegram ID)
    refBonus: 0, // taklif qilgan foydalanuvchiga bonus (so'm), 0 = o'chiq
    requiredChannels: [], // majburiy obuna kanallari (@username)
    ordersChat: "", // buyurtma xabarlari boradigan guruh/kanal (ID yoki @username)
  },
  games: [
    { id: 1, name: "PUBG Mobile", emoji: "🔫", needsServer: false, active: true, providerCode: "" },
    { id: 2, name: "Free Fire", emoji: "🔥", needsServer: false, active: true, providerCode: "" },
    { id: 3, name: "Mobile Legends", emoji: "⚔️", needsServer: true, active: true, providerCode: "" },
    { id: 4, name: "Standoff 2", emoji: "🎯", needsServer: false, active: true, providerCode: "" },
  ],
  packages: [], // { id, gameId, name, price, active, sku }
  users: {}, // { id, name, username, balance, joined }
  orders: [],
  topups: [],
  promos: [], // { code, amount, maxUses, usedBy: [], active }
  seq: { game: 4, pkg: 0, order: 0, topup: 0 },
});

function load() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const d = defaults();
  if (fs.existsSync(FILE)) {
    const saved = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return {
      ...d,
      ...saved,
      settings: { ...d.settings, ...saved.settings },
      seq: { ...d.seq, ...saved.seq },
    };
  }
  fs.writeFileSync(FILE, JSON.stringify(d, null, 2));
  return d;
}

let db = load();

const data = () => db;

function save() {
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}

function nextId(key) {
  db.seq[key] = (db.seq[key] || 0) + 1;
  return db.seq[key];
}

function getUser(from) {
  let created = false;
  if (!db.users[from.id]) {
    db.users[from.id] = { id: from.id, balance: 0, joined: Date.now() };
    created = true;
  }
  const u = db.users[from.id];
  u.name = [from.first_name, from.last_name].filter(Boolean).join(" ");
  u.username = from.username || "";
  if (created) save();
  return u;
}

module.exports = { data, save, nextId, getUser };

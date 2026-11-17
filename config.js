require("dotenv").config();

const token = process.env.BOT_TOKEN || "";

// ADMIN_IDS=123456789,987654321
const adminIds = (process.env.ADMIN_IDS || "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter(Boolean);

const isAdmin = (id) => adminIds.includes(id);

module.exports = { token, adminIds, isAdmin };

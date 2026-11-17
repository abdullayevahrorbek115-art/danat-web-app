require("dotenv").config();
const { data } = require("./db");

const token = process.env.BOT_TOKEN || "";

// ADMIN_IDS=123456789,987654321 — bosh adminlar (.env da; panelda o'chirib bo'lmaydi,
// faqat ular boshqa admin qo'sha oladi va olib tashlay oladi)
const adminIds = (process.env.ADMIN_IDS || "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter(Boolean);

// Bosh adminlar + panel orqali qo'shilgan adminlar
const allAdmins = () => [...new Set([...adminIds, ...(data().settings.admins || [])])];
const isAdmin = (id) => allAdmins().includes(id);
const isMainAdmin = (id) => adminIds.includes(id);

module.exports = { token, adminIds, allAdmins, isAdmin, isMainAdmin };

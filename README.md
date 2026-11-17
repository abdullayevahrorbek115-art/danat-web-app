# Donat bot (Telegram, Node.js + grammY)

PUBG Mobile, Free Fire, Mobile Legends va Standoff 2 uchun donat boti. Admin paneldan o'yin va paketlarni o'zingiz qo'shasiz, o'zgartirasiz, o'chirasiz.

## Ishga tushirish
1. **Token**: @BotFather → `/newbot`. Tokenni hech kimga ko'rsatmang.
2. `npm install`
3. `.env.example` ni `.env` deb nusxalang va `BOT_TOKEN` ni yozing.
4. Botga `/myid` yuboring, chiqqan raqamni `.env` dagi `ADMIN_IDS=` ga yozing.
5. `npm start` va botga `/admin` yuboring.

## Mijoz uchun oqim
O'yin → paket → Player ID (Mobile Legends uchun Server ID ham) → ID tekshiruvi → tasdiqlash → balansdan to'lash → yetkazish.

Balans to'ldirish: mijoz summani yozadi, kartaga o'tkazadi, chek rasmini yuboradi, admin "Tasdiqlash" bosadi.

## Admin panel (/admin)
- 🎮 O'yinlar: qo'shish, nomini o'zgartirish, yoqish/o'chirish, Server ID talabi, o'chirish
- 📦 Paketlar: qo'shish (ketma-ket), nom, narx, yoqish/o'chirish, o'chirish
- 📦 Buyurtmalar: qo'lda yetkazish ("Bajarildi" / "Bekor qilish" — pul qaytadi)
- 💳 Chekslar: balans to'ldirishni tasdiqlash/rad etish
- 👥 Foydalanuvchilar: balansga qo'shish/ayirish
- ⚙️ Sozlamalar: karta, aloqa, salomlashish matni, minimal summa, yetkazish rejimi
- 📢 Barcha foydalanuvchilarga xabar, 📊 statistika

## ID tekshirish va avtomatik yetkazish
Bot o'zi o'yin serverlariga ulana olmaydi. Nikni ko'rsatish va donatni avtomatik yetkazish uchun **yetkazib beruvchi (supplier) xizmatining API si** kerak.

- Standart rejim `manual`: ID faqat raqam sifatida tekshiriladi, buyurtma adminga keladi, admin yetkazib "Bajarildi" bosadi.
- `api` rejimi uchun `provider.js` dagi `apiProvider` shablonini provayder hujjatiga moslang, `.env` ga `PROVIDER_URL` va `PROVIDER_KEY` yozing, panelda o'yinga "Provayder kodi", paketga "SKU" kiriting va Sozlamalarda rejimni `api` qiling.
- Kodi/SKU kiritilmagan o'yin yoki paket avtomatik `manual` bo'lib qoladi.
- Avtomatik yetkazish xato bersa, pul mijozga o'zi qaytariladi.

## Ma'lumotlar
Hammasi `data/db.json` da saqlanadi. Uni vaqti-vaqti bilan zaxiralab turing.

## Serverga joylash
Doimiy ishlashi uchun VPS/Railway/Render da `pm2 start bot.js --name donat-bot` kabi ishga tushiring.

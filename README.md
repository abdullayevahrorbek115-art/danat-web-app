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

## Qo'shimcha imkoniyatlar
- 🎁 **Promo kodlar**: panel → Promo kodlar. Kod, summa va limit belgilanadi; foydalanuvchi menyudagi "Promo kod" tugmasi orqali kiritadi va hisobiga summa qo'shiladi (bir kishi bir marta).
- 👥 **Do'st taklif qilish**: har bir foydalanuvchining shaxsiy havolasi bor. Taklif qilingan do'st birinchi marta hisobini to'ldirganda (admin chekni tasdiqlaganda) taklif qilgan kishiga bonus beriladi. Bonus summasi: panel → Sozlamalar → "Do'st taklif bonusi" (0 = o'chiq).
- 📡 **Kanal/guruh**: panel → Kanal/guruh.
  - *Majburiy obuna*: kanal username'ini qo'shing (bot kanalda admin bo'lishi shart). A'zo bo'lmaganlar botdan foydalana olmaydi.
  - *Buyurtmalar guruhi/kanali*: yangi buyurtma, chek va bajarilgan buyurtma xabarlari shu yerga ham boradi. Guruh ID sini bilish uchun botni guruhga qo'shib, guruhda `/chatid` yozing.

## Adminlar
Panel → 👮 Adminlar. `.env` dagi `ADMIN_IDS` — bosh adminlar: ular boshqa admin qo'sha oladi va olib tashlay oladi. Qo'shilgan adminlar panelni to'liq ishlata oladi, lekin adminlarni boshqara olmaydi. Yangi adminning ID sini bilish uchun u botga `/myid` yozadi.

## Provayderni admin paneldan ulash (🔌 Provayder)
Kod yozish shart emas. Panel → 🔌 Provayder (faqat bosh adminlar):
1. **Manzil** va **API kalit** ni kiriting; kalit qaysi sarlavhada yuborilishini ko'rsating.
2. **ID tekshirish** va **Buyurtma** bo'limlarida so'rov yo'li, JSON shabloni va javobdagi maydon yo'llarini provayder hujjatiga moslang (standart qiymatlar bor).
3. **🧪 Sinash** tugmasi bilan haqiqiy ID ni tekshirib, provayderning xom javobini ko'ring va yo'llarni shunga qarab to'g'rilang.
4. Har bir o'yinga **provayder kodi**, paketga **SKU** kiriting, rejimni **API** ga o'tkazing va avval kichik buyurtma bilan sinang.

Cheklov: faqat oddiy JSON API lar (kalit sarlavhada yoki so'rovda) qo'llab-quvvatlanadi. Imzo (MD5/HMAC) talab qiladigan yoki natijani keyin webhook orqali yuboradigan provayderlar uchun qo'shimcha kod kerak.

Xavfsizlik: provayder javobi noaniq bo'lsa (tarmoq xatosi, vaqt tugashi, 5xx), pul qaytarilmaydi — buyurtma adminga qo'lda tekshirish uchun beriladi. Provayder aniq rad etsa, pul mijozga avtomatik qaytadi.

## Menyu tugmalari
Panel → 🔘 Tugmalar. Foydalanuvchi menyusiga o'zingizning tugmalaringizni qo'shasiz (12 tagacha):
- 📝 **Matnli**: bosilganda botdan matn chiqadi (qoidalar, narxlar, aloqa...).
- 🔗 **Havolali**: bosilganda havola tugmasi chiqadi (kanal, sayt...).
Yangi tugma foydalanuvchida /start bosganda yoki «📢 Xabar yuborish» dan keyin paydo bo'ladi (xabar yuborganda menyu ham yangilanadi).

## ⭐ Telegram Premium / Stars
Panel → 🎮 O'yinlar → «⭐ Telegram Premium/Stars qo'shish». Ikkita bo'lim yaratiladi (turi: Telegram). Keyin har biriga **📦 Paketlar** orqali paket va narx kiriting (masalan: Premium 3 oy, Stars 100 ta).
- Bunday bo'limda mijozdan Player ID o'rniga **Telegram username** (@username) so'raladi.
- Istalgan o'yinni ham ⭐ turiga o'tkazish mumkin (o'yin menyusida «Turi» tugmasi).
- Username Telegram orqali tekshirib bo'lmaydi, shuning uchun u qo'lda yetkaziladi (admin «Bajarildi» bosadi) yoki provayder API si orqali.

## ⚙️ Funksiyali tugmalar
Panel → 🔘 Tugmalar → «➕ Funksiyali tugma». Nomini yozing, so'ng funksiyani tanlang: o'yinlar ro'yxati, hisob, buyurtmalar, hisobni to'ldirish, promo kod, do'st taklif qilish, aloqa yoki **aniq bir bo'lim** (masalan «⭐ Stars» → Stars paketlari).

## 👤 ID tekshirishda nik
Nik faqat provayder API si orqali olinadi (rejim `api`, o'yinda provayder kodi bor). Nik chiqmasa: 🔌 Provayder → 🧪 Sinash bilan xom javobni ko'ring va «Javobdagi nik yo'li» ni shunga moslang. Bot endi yo'l noto'g'ri bo'lsa ham `nickname`, `name`, `username` kabi keng tarqalgan nomlarni o'zi qidiradi.

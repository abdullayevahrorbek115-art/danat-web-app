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

## 💳 Avtomatik to'lov (Click va Payme)
Panel → 💳 To'lov tizimlari (faqat bosh adminlar). Mijoz summani yozadi, usulni tanlaydi (Click / Payme / kartaga chek), to'lov havolasi chiqadi. To'lov o'tgach tizim botingizning serveriga so'rov (webhook) yuboradi va balans **o'zi** to'ldiriladi — admin tasdiqlashi shart emas. Do'st taklif bonusi ham avtomatik beriladi. Kartaga o'tkazish (chek) usuli xohlasangiz qoladi, xohlasangiz panelda o'chirib qo'yasiz.

**Sozlash:**
1. Botni ochiq manzilli serverga joylang (Render/VPS) va `.env` ga `PUBLIC_URL=https://sizning-domen` yozing.
2. Panel → 💳 To'lov tizimlari → Click yoki Payme → ma'lumotlarni kiriting → ✅ Yoqish.
3. Tizim sahifasida ko'rsatilgan manzilni to'lov tizimi kabinetiga kiriting:
   - **Click**: Prepare URL va Complete URL ikkalasiga ham `PUBLIC_URL/click` (Service ID, Merchant ID, Secret key — Click kabinetidan).
   - **Payme**: Endpoint URL — `PUBLIC_URL/payme`; kassada hisob maydoni nomi aynan `order_id` bo'lsin; Merchant ID va KEY — Payme kabinetidan (avval test kassa kaliti bilan sinab ko'ring).
4. Kichik summa bilan sinab ko'ring.

Server `PORT` (bo'sh bo'lsa 3000) da ishlaydi; `https` ni hosting yoki nginx beradi. Barcha to'lovlar `data/db.json` ichida (`payments`, `paymeTx`).

## 📂 Ichki menyu tugmalari
Panel → 🔘 Tugmalar → «➕ Ichki menyu». Menyu yaratgach, uni ochib ichiga tugma qo'shasiz: 📝 matnli, 🔗 havolali, ⚙️ funksiyali yoki yana 📂 ichki menyu (masalan «💳 To'lov» → Click, Payme, Karta, Promo kod). Funksiyalar ro'yxatiga yangi: «🟦 Click orqali to'ldirish», «🟩 Payme orqali to'ldirish», «🏦 Kartaga o'tkazib to'ldirish». Asosiy menyuda 12 tagacha, har bir ichki menyuda 20 tagacha tugma bo'ladi.

## 🏦 Kartaga o'tkazish (avto, noyob summa, 5 daqiqa)
Panel → 💳 To'lov tizimlari → «🏦 Karta (avto, noyob summa)». Karta raqami — Sozlamalar → «Karta raqami».
- Mijoz summa yozadi, bot unga **noyob summa** beradi (masalan 50 000 → 50 013) va muddat (standart 5 daqiqa, panelda o'zgaradi).
- Kartangizga shu summa tushgani haqidagi xabar `PUBLIC_URL/card?secret=KALIT` manziliga (POST) kelsa, balans **avtomatik** to'ldiriladi. Muddat tugagan yoki summa mos kelmasa — avtomatik to'ldirilmaydi; muddati yaqinda tugagan to'lovga pul tushgan bo'lsa, adminga xabar boradi (qo'lda to'ldirasiz).
- Xabar formati: JSON `{"amount": 50013}` (ixtiyoriy `"id"` — takrorlanishdan himoya) yoki bank SMS matni (`{"text": "..."}` yoki oddiy matn). Kirimni kuzatuvchi xizmat yoki telefondagi SMS/bildirishnoma yuboruvchi ilova shu manzilga yuboradi. Faqat **kirim** xabarlarini yuboring.
- Kalitni kimgadir bildirib qo'ysangiz, panelda «Yangi maxfiy kalit» ni bosing va manzilni yangilang.

## 💰 Moliya hisoboti
Panel → 💰 Hisobot: bugun, kecha, oxirgi 7 kun, shu oy va umumiy **kirim** (hisob to'ldirishlar: Click, Payme, karta, chek), **savdo** (buyurtmalarga sarflangan pul), mijozlar balansida turgan pul. «Kunlar bo'yicha» (31 kun) va «Oylar bo'yicha» (12 oy) tugmalari ham bor.
- **Foyda**: paket menyusida «💰 Tannarx» ni kiriting (siz provayderga qancha to'laysiz) — hisobotda tannarx va foyda chiqadi. Tannarx faqat keyingi buyurtmalar uchun hisoblanadi.
- **Kunlik avto-hisobot**: har kuni 23:55 da adminlarga yuboriladi (panelda o'chirib qo'yish mumkin). Vaqt mintaqasi: `.env` da `TIMEZONE` (standart Asia/Tashkent).

## 🎟 Avtomatik kod ombori (API siz avto-yetkazish)
Provayder API si bo'lmasa ham bot buyurtmani **o'zi** yetkaza oladi — agar mahsulot kod ko'rinishida bo'lsa (UC/Free Fire voucher kodi, gift kartalar, Premium gift havolasi va h.k.).
1. Panel → 🎮 O'yinlar → o'yin → 📦 Paketlar → paket → «Turi» tugmasini bosib **🎟 avto kod** ga o'tkazing.
2. «🗂 Kod ombori» → «➕ Kod qo'shish» → kodlarni yuboring (har qatorda bitta).
3. Mijoz sotib olganda Player ID so'ralmaydi: to'lovdan so'ng ombordan bitta kod olinib, mijozga **shu zahoti** yuboriladi. Ombor tugasa adminga xabar boradi va paket «(tugagan)» deb ko'rinadi.

Eslatma: Player ID ga to'g'ridan-to'g'ri donat tushirish va nikni ko'rsatish faqat provayder API si bilan mumkin. Provayder kodi va SKU maydonlari panelda faqat Sozlamalarda rejim **API** bo'lganda ko'rinadi.
ID tekshirish endi mijozni noto'g'ri to'smaydi: provayder ID ni aniq «topilmadi» desagina rad etiladi; sozlama to'liq bo'lmasa yoki javob tushunarsiz bo'lsa, ID «tekshirilmagan» deb o'tkaziladi.

## 🔌 Mijozlar uchun API (reseller)
Panel → 🔌 API (mijozlar). Foydalanuvchi botdagi «🔌 API» tugmasini bosib so'rov yuboradi, siz panelda tasdiqlaysiz va kalit unga botning o'zida beriladi. API orqali buyurtmalar o'sha foydalanuvchining bot balansidan to'lanadi. Hujjat botning o'zida chiqadi; asosiy yo'llar: `GET /api/v1/balance`, `GET /api/v1/products`, `POST /api/v1/check`, `POST /api/v1/order`, `GET /api/v1/order/ID`. API ishlashi uchun `.env` da `PUBLIC_URL` (https manzil) bo'lishi shart.

## 🖥 Yaxshi serverga joylash (tavsiya: VPS)
Render/Railway bepul tarifida bot "uxlab qoladi" va `data/db.json` yo'qolishi mumkin — to'lov va API uchun bu xavfli. Arzon VPS (Ubuntu, 1 GB RAM yetadi) olish yaxshiroq:
1. Serverga kirib: `sudo apt update && sudo apt install -y nodejs npm nginx` (Node 18+ kerak; eski bo'lsa nodesource dan o'rnating).
2. Loyihani yuklab, `npm install`, `.env` ni to'ldiring (`BOT_TOKEN`, `ADMIN_IDS`, `PUBLIC_URL=https://sizning-domen`, `PORT=3000`).
3. `sudo npm i -g pm2 && pm2 start bot.js --name donat-bot && pm2 save && pm2 startup`
4. Domenni serverga yo'naltiring, nginx da `proxy_pass http://127.0.0.1:3000;` qo'ying va `sudo certbot --nginx` bilan https oling (Click/Payme/API https talab qiladi).
5. `data/db.json` ni har kuni zaxiralang (masalan cron bilan boshqa joyga nusxa).

## ⚡ Ludovex ni ulash (provayder)
Hujjat: https://ludovex.org/ru/docs
1. Ludovex kabinetida (Кабинет → API-ключи) kalit yarating, unga **read** va **order** ruxsatlarini bering.
2. Panel → 🔌 Provayder → **⚡ Ludovex ni ulash** → kalitni yuboring (rejim avtomatik API bo'ladi).
3. **📋 Ludovex katalogi**: o'yin nomini yozing (masalan pubg), o'yinni tanlang — bot **provayder kodi** (`game_key`) va paketlar **SKU** (`variation_id`) ro'yxatini ko'rsatadi. Kodni o'yinga («🔑 Provayder kodi»), SKU ni paketga («🔑 Provayder SKU») yozing.
4. Narxni o'zingiz so'mda qo'yasiz (Ludovex narxlari USDT da). Avval kichik buyurtma bilan sinang.

Eslatmalar:
- Ludovex da ID tekshirish (nik) so'rovi hujjatda yo'q, shuning uchun bot ID ni «tekshirilmagan» deb o'tkazadi.
- Ludovex buyurtmani darhol bajarmasligi mumkin (PROCESSING). Bot holatni har 15 soniyada so'raydi: COMPLETED bo'lsa mijozga xabar beradi, FAILED/REFUNDED bo'lsa pulni qaytaradi. 30 daqiqada natija bo'lmasa adminga qo'lda tekshirish uchun beriladi.
- Ludovex hamyonida (USDT) mablag' bo'lishi kerak, aks holda buyurtmalar rad etiladi va mijozga pul qaytariladi.
- Yetkazilgan kod (gift karta) javobda `code`/`codes` kabi maydonda kelsa, mijozga yuboriladi; boshqa nomda bo'lsa, Ludovex sinov muhitida (ludovex.org/ru/sandbox) javobni ko'rib, menga ayting.

### 📥 Katalogdan avtomatik import
Panel → 🔌 Provayder → 📋 Ludovex katalogi → o'yinni tanlang → **📥 Hammasini botga avtomatik qo'shish**. Kurs (1 USDT = necha so'm) va ustama foizini yozasiz (masalan `12800 10`). Bot o'yinni (provayder kodi bilan), barcha paketlarni (SKU, narx, tannarx) o'zi yaratadi. Nomi mos kelgan, kodi yo'q o'yin bo'lsa (masalan «PUBG Mobile») kodni shunga yozadi. Mobile Legends kabilarda Server ID ni qo'lda yoqing.

## 📝 Ko'p paketni birdan qo'shish
Panel → 🎮 O'yinlar → o'yin → 📦 Paketlar → «📝 Ko'p paketni birdan qo'shish». Har qatorga bitta paket yozing: `60 UC - 12000`. Provayder kodi va SKU shart emas: Sozlamalarda rejim «qo'lda» bo'lsa, bu maydonlar panelda ko'rinmaydi va buyurtmani siz «Bajarildi» bilan yopasiz.

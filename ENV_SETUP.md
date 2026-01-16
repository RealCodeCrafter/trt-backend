# Environment Variables Setup

Loyihani ishga tushirish uchun `.env` fayl yarating va quyidagi ma'lumotlarni kiriting:

## .env fayl yaratish

Loyiha ildizida `.env` fayl yarating va quyidagi ma'lumotlarni kiriting:

```env
# Database Configuration
DB_TYPE=postgres
DB_HOST=nozomi.proxy.rlwy.net
DB_PORT=43482
DB_USERNAME=postgres
DB_PASSWORD=RsGzZbKHlZwrLakJWmsKolSNEXwUgZVU
DB_DATABASE=railway
DB_SSL=false

# JWT Configuration
JWT_SECRET=juda_secret_key
JWT_EXPIRES_IN=1d

# Server Configuration
PORT=7000
HOST=0.0.0.0
BASE_URL=http://localhost:7000

# SuperAdmin Configuration
# DIQQAT: Username va Password avtomatik yaratiladi (kuchli va murakkab)
# Faqat email ni belgilash mumkin
SUPERADMIN_EMAIL=superadmin@trt-parts.com

# Email Configuration (Gmail)
EMAIL_SERVICE=gmail
EMAIL_USER=valireyimbergenov79@gmail.com
EMAIL_PASS=mmewnxpntrxxsbvz
EMAIL_FROM=sales@trt-parts.com
EMAIL_TO=reyimbergenovvali702@gmail.com

# Upload Configuration
UPLOAD_DIR=uploads

# Contact Information
CONTACT_PHONE=+998901234567
CONTACT_EMAIL=contact@trt-parts.com
CONTACT_ADDRESS=Toshkent, Chilanzar, 45-uy
```

## Qanday ishlatish

1. `.env` fayl yarating loyiha ildizida
2. Yuqoridagi ma'lumotlarni ko'chiring
3. O'z ma'lumotlaringizga moslashtiring
4. `npm run start:dev` buyrug'ini ishga tushiring

## Diqqat

- `.env` fayl `.gitignore` da bo'lishi kerak (xavfsizlik uchun)
- Production'da barcha ma'lumotlarni o'zgartiring
- Email parolini xavfsiz saqlang

## SuperAdmin avtomatik yaratiladi

SuperAdmin username va password avtomatik yaratiladi:
- **Username**: `superadmin_<random>_<timestamp>` formatida (masalan: `superadmin_k3j9x2_abc123`)
- **Password**: 24 belgili kuchli parol (katta/kichik harflar, raqamlar, maxsus belgilar)
- **Email**: `.env` fayldan o'qiladi yoki default: `superadmin@trt-parts.com`

Kod run bo'lganda console'da login ma'lumotlari ko'rsatiladi. Bu ma'lumotlarni xavfsiz saqlang!

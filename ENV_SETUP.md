# Environment Variables Setup

Loyihani ishga tushirish uchun `.env` fayl yarating va quyidagi ma'lumotlarni kiriting:

## .env fayl yaratish

Loyiha ildizida `.env` fayl yarating va quyidagi ma'lumotlarni kiriting:
(`env.example` fayldan copy qilib olishingiz mumkin)

```env
# Runtime
NODE_ENV=development

# Database Configuration
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=CHANGE_ME
DB_DATABASE=car_parts
DB_SSL=false

# TypeORM
# Development'da migrate qilmasdan tez ishlash uchun `true` bo'lishi mumkin,
# Production'da esa `false` bo'lishi shart!
DB_SYNC=true

# JWT Configuration
JWT_SECRET=CHANGE_ME
JWT_EXPIRES_IN=1d

# Server Configuration
PORT=7000
HOST=0.0.0.0
BASE_URL=http://localhost:7000

# CORS (production uchun majburiy)
# Bir nechta domen bo'lsa vergul bilan yozing:
# CORS_ORIGIN=https://app.example.com,https://admin.example.com
CORS_ORIGIN=http://localhost:3000

# Swagger
# Development'da avtomatik yoqilgan (NODE_ENV=development).
# Production'da yoqish uchun: SWAGGER_ENABLE=true
SWAGGER_ENABLE=true
SWAGGER_PATH=docs
# Production'da Swagger'ni himoyalash uchun:
SWAGGER_USER=admin
SWAGGER_PASS=CHANGE_ME_STRONG_PASSWORD

# Email Configuration (Gmail)
EMAIL_SERVICE=gmail
EMAIL_USER=your@gmail.com
EMAIL_PASS=GMAIL_APP_PASSWORD
EMAIL_FROM=sales@trt-parts.com
EMAIL_TO=contact@trt-parts.com

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
- Email parolini xavfsiz saqlang (Gmail uchun App Password ishlating)
- Production'da `DB_SYNC=false` va `CORS_ORIGIN` ni aniq domen(lar) bilan belgilang
- `JWT_SECRET` kuchli va uzun bo'lishi kerak

## SuperAdmin (faqat DB orqali qo'lda)

Xavfsizlik uchun superadmin **avtomatik yaratilmaydi**. Superadminni faqat bazadan qo'lda yarating:

- `role`: `superAdmin`
- `password`: bcrypt hash (10 salt round)

Parol hash olish uchun (loyiha ichida):

```bash
node -e "require('bcrypt').hash('YOUR_PASSWORD', 10).then(console.log)"
```

Keyin DB'ga `users` jadvaliga `username/email/password/role` ni qo'lda kiritasiz.

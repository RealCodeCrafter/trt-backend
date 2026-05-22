/**
 * Faqat catalog ma'lumotlarini tozalaydi:
 * - PostgreSQL: catalog_items jadvali (barcha qatorlar)
 * - Disk: uploads/catalog/ papkadagi rasmlar
 *
 * Boshqa jadvallar (products, categories, users) tegilmaydi.
 *
 * Ishlatish (serverda, loyiha ildizida):
 *   node scripts/clear-catalog.js --confirm
 *
 * yoki:
 *   npm run clear-catalog
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const UPLOADS_CATALOG = path.join(ROOT, 'uploads', 'catalog');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function clearUploadsCatalogDir() {
  if (!fs.existsSync(UPLOADS_CATALOG)) {
    fs.mkdirSync(UPLOADS_CATALOG, { recursive: true });
    return { removed: 0, skipped: true };
  }

  const entries = fs.readdirSync(UPLOADS_CATALOG, { withFileTypes: true });
  let removed = 0;

  for (const entry of entries) {
    const fullPath = path.join(UPLOADS_CATALOG, entry.name);
    if (entry.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      removed++;
      continue;
    }
    fs.unlinkSync(fullPath);
    removed++;
  }

  return { removed, skipped: false };
}

async function main() {
  const confirmed =
    process.argv.includes('--confirm') ||
    process.env.CLEAR_CATALOG_CONFIRM === 'yes';

  if (!confirmed) {
    console.error(
      'Xavfsizlik: faqat catalog tozalanadi, lekin tasdiq kerak.\n' +
        '  node scripts/clear-catalog.js --confirm\n' +
        'yoki: CLEAR_CATALOG_CONFIRM=yes node scripts/clear-catalog.js',
    );
    process.exit(1);
  }

  loadEnvFile(ENV_PATH);

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'trt_parts_db',
    ssl:
      process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: false }
        : undefined,
  });

  console.log('Catalog tozalash boshlandi...');
  console.log(`DB: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`);

  await client.connect();

  try {
    const countRes = await client.query('SELECT COUNT(*)::int AS count FROM catalog_items');
    const beforeCount = countRes.rows[0]?.count ?? 0;
    console.log(`Jadvalda qatorlar: ${beforeCount}`);

    await client.query('TRUNCATE TABLE catalog_items RESTART IDENTITY');

    const afterRes = await client.query('SELECT COUNT(*)::int AS count FROM catalog_items');
    const afterCount = afterRes.rows[0]?.count ?? 0;

    const files = clearUploadsCatalogDir();

    console.log('---');
    console.log(`catalog_items: ${beforeCount} -> ${afterCount} (o'chirildi)`);
    console.log(
      `uploads/catalog: ${files.skipped ? 'papka yo\'q edi, yaratildi' : `${files.removed} ta fayl o'chirildi`}`,
    );
    console.log('Tayyor. Faqat catalog tozalandi.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Xato:', err.message);
  process.exit(1);
});

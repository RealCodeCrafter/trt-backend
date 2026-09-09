/**
 * Bazadagi rasm URL larining FAQAT domen qismini almashtiradi.
 *
 * Qamrov:
 *   - part.images va part.imageUrl
 *   - category.images va category.imageUrl
 *   - catalog_items.photo
 *
 * O'zgarmaydi:
 *   - URL yo'li va fayl nomi
 *   - product/category/catalog ma'lumotlarining boshqa ustunlari
 *   - uploads ichidagi fayllar
 *
 * Ishlatish:
 *   node scripts/change-image-domain.js
 *   node scripts/change-image-domain.js --apply
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const BACKUP_DIR = path.join(ROOT, 'backup');
const NEW_ORIGIN = 'https://backtrt-parts.trtparts.com';
const MEDIA_PATHS = ['/uploads/', '/files/view/'];

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

    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function rewriteUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return { value, changed: false };
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return { value, changed: false };
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { value, changed: false };
  }

  if (!MEDIA_PATHS.some((prefix) => url.pathname.startsWith(prefix))) {
    return { value, changed: false };
  }

  if (url.origin.toLowerCase() === NEW_ORIGIN.toLowerCase()) {
    return { value, changed: false };
  }

  const rewritten = `${NEW_ORIGIN}${url.pathname}${url.search}${url.hash}`;

  // Domen almashtirilganda yo'l, query va hash o'zgarmaganini tekshiramiz.
  const nextUrl = new URL(rewritten);
  if (
    nextUrl.pathname !== url.pathname ||
    nextUrl.search !== url.search ||
    nextUrl.hash !== url.hash
  ) {
    throw new Error(`URL yo'li o'zgarib ketdi: ${value}`);
  }

  return { value: rewritten, changed: true };
}

function rewriteArray(values) {
  if (values == null) {
    return { value: values, changed: false, changedUrls: 0 };
  }
  if (!Array.isArray(values)) {
    throw new Error('images ustuni array emas');
  }

  let changedUrls = 0;
  const rewritten = values.map((value) => {
    const result = rewriteUrl(value);
    if (result.changed) changedUrls += 1;
    return result.value;
  });

  if (rewritten.length !== values.length) {
    throw new Error('Rasmlar soni o‘zgarib ketdi');
  }

  return {
    value: rewritten,
    changed: changedUrls > 0,
    changedUrls,
  };
}

function rewriteScalar(value) {
  const result = rewriteUrl(value);
  return {
    value: result.value,
    changed: result.changed,
    changedUrls: result.changed ? 1 : 0,
  };
}

function prepareChanges(parts, categories, catalogItems) {
  const changes = {
    parts: [],
    categories: [],
    catalogItems: [],
    changedUrls: 0,
  };

  for (const row of parts) {
    const images = rewriteArray(row.images);
    const imageUrl = rewriteScalar(row.imageUrl);
    if (!images.changed && !imageUrl.changed) continue;

    changes.parts.push({
      id: row.id,
      images: images.value,
      imageUrl: imageUrl.value,
    });
    changes.changedUrls += images.changedUrls + imageUrl.changedUrls;
  }

  for (const row of categories) {
    const images = rewriteArray(row.images);
    const imageUrl = rewriteScalar(row.imageUrl);
    if (!images.changed && !imageUrl.changed) continue;

    changes.categories.push({
      id: row.id,
      images: images.value,
      imageUrl: imageUrl.value,
    });
    changes.changedUrls += images.changedUrls + imageUrl.changedUrls;
  }

  for (const row of catalogItems) {
    const photo = rewriteScalar(row.photo);
    if (!photo.changed) continue;

    changes.catalogItems.push({
      id: row.id,
      photo: photo.value,
    });
    changes.changedUrls += photo.changedUrls;
  }

  return changes;
}

function assertUniqueIds(rows, label) {
  const ids = new Set();
  for (const row of rows) {
    if (!Number.isInteger(Number(row.id))) {
      throw new Error(`${label}: noto'g'ri id`);
    }
    if (ids.has(Number(row.id))) {
      throw new Error(`${label}: takrorlangan id=${row.id}`);
    }
    ids.add(Number(row.id));
  }
}

function saveBackup(parts, categories, catalogItems) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(
    BACKUP_DIR,
    `image-domains-before-${stamp}.json`,
  );

  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        newOrigin: NEW_ORIGIN,
        parts,
        categories,
        catalogItems,
      },
      null,
      2,
    ),
    'utf8',
  );

  return backupPath;
}

async function applyChanges(client, changes) {
  await client.query('BEGIN');

  try {
    for (const row of changes.parts) {
      const result = await client.query(
        `UPDATE part
         SET images = $1, "imageUrl" = $2
         WHERE id = $3`,
        [row.images, row.imageUrl, row.id],
      );
      if (result.rowCount !== 1) {
        throw new Error(`part id=${row.id} yangilanmadi`);
      }
    }

    for (const row of changes.categories) {
      const result = await client.query(
        `UPDATE category
         SET images = $1, "imageUrl" = $2
         WHERE id = $3`,
        [row.images, row.imageUrl, row.id],
      );
      if (result.rowCount !== 1) {
        throw new Error(`category id=${row.id} yangilanmadi`);
      }
    }

    for (const row of changes.catalogItems) {
      const result = await client.query(
        `UPDATE catalog_items
         SET photo = $1
         WHERE id = $2`,
        [row.photo, row.id],
      );
      if (result.rowCount !== 1) {
        throw new Error(`catalog_items id=${row.id} yangilanmadi`);
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const apply = process.argv.includes('--apply');

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

  console.log(apply ? 'Rejim: --apply' : 'Rejim: dry-run');
  console.log(`Yangi domen: ${NEW_ORIGIN}`);

  await client.connect();

  try {
    const [partsResult, categoriesResult, catalogResult] = await Promise.all([
      client.query('SELECT id, images, "imageUrl" FROM part ORDER BY id'),
      client.query('SELECT id, images, "imageUrl" FROM category ORDER BY id'),
      client.query('SELECT id, photo FROM catalog_items ORDER BY id'),
    ]);

    const parts = partsResult.rows;
    const categories = categoriesResult.rows;
    const catalogItems = catalogResult.rows;

    assertUniqueIds(parts, 'part');
    assertUniqueIds(categories, 'category');
    assertUniqueIds(catalogItems, 'catalog_items');

    const changes = prepareChanges(parts, categories, catalogItems);

    console.log(`\nProduct qatorlari: ${parts.length}`);
    console.log(`O'zgaradigan product qatorlari: ${changes.parts.length}`);
    console.log(`O'zgaradigan kategoriya qatorlari: ${changes.categories.length}`);
    console.log(
      `O'zgaradigan catalog qatorlari: ${changes.catalogItems.length}`,
    );
    console.log(`Jami o'zgaradigan URL: ${changes.changedUrls}`);

    const samples = [
      ...changes.parts.flatMap((row) => row.images || []),
      ...changes.categories.flatMap((row) => row.images || []),
      ...changes.catalogItems.map((row) => row.photo),
    ].filter(Boolean);

    console.log('\nYangi URL namunalari:');
    for (const sample of samples.slice(0, 5)) {
      console.log(`  ${sample}`);
    }

    if (!apply) {
      console.log('\nBazaga hech narsa yozilmadi.');
      console.log(
        'Yozish uchun: node scripts/change-image-domain.js --apply',
      );
      return;
    }

    if (changes.changedUrls === 0) {
      console.log('\nHamma URL allaqachon yangi domenda. O‘zgarish qilinmadi.');
      return;
    }

    const backupPath = saveBackup(parts, categories, catalogItems);
    console.log(`\nBackup saqlandi: ${backupPath}`);

    await applyChanges(client, changes);

    console.log(`\nTayyor: ${changes.changedUrls} ta URL domeni almashtirildi.`);
    console.log('Hech qanday rasm fayli o‘chirilmadi yoki ko‘chirilmadi.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Xato:', error.message);
  process.exit(1);
});

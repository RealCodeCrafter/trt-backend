/**
 * Chrome cache'dan tiklangan eski product JSON asosida part.images ni qaytaradi.
 *
 * Xavfsizlik:
 *   - dry-run default, --apply bo'lmasa bazaga yozmaydi
 *   - snapshot va baza id + trtCode bo'yicha to'liq mos bo'lishi shart
 *   - barcha rasm fayllari uploads/parts ichida mavjud bo'lishi shart
 *   - yozishdan oldin joriy images backup qilinadi
 *   - yangilash transaction ichida, id + trtCode bo'yicha bajariladi
 *   - hech qanday rasm faylini o'chirmaydi yoki ko'chirmaydi
 *
 * Ishlatish:
 *   node scripts/restore-images-from-snapshot.js --file=recovery/original-products.json
 *   node scripts/restore-images-from-snapshot.js --file=recovery/original-products.json --apply
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const PARTS_DIR = path.join(ROOT, 'uploads', 'parts');
const BACKUP_DIR = path.join(ROOT, 'backup');
const DEFAULT_BASE_URL = 'https://backend.trt-parts.com';

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

function readFileArg() {
  const arg = process.argv.find((item) => item.startsWith('--file='));
  if (!arg) {
    throw new Error(
      '--file kerak. Misol: --file=recovery/original-products.json',
    );
  }
  const value = arg.slice('--file='.length).trim();
  return path.isAbsolute(value) ? value : path.join(ROOT, value);
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function parseSnapshot(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Snapshot topilmadi: ${filePath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error('Snapshot JSON array bo‘lishi kerak');
  }

  const products = parsed.map((item) => ({
    id: Number(item.id),
    trtCode: String(item.trtCode || '').trim(),
    images: Array.isArray(item.images)
      ? item.images.map((image) => String(image).trim()).filter(Boolean)
      : [],
  }));

  const ids = new Set();
  const codes = new Set();
  for (const product of products) {
    if (!Number.isInteger(product.id) || product.id <= 0) {
      throw new Error(`Snapshotda noto‘g‘ri id: ${product.id}`);
    }
    if (!product.trtCode) {
      throw new Error(`Snapshotda trtCode yo‘q: id=${product.id}`);
    }
    const code = normalizeCode(product.trtCode);
    if (ids.has(product.id)) {
      throw new Error(`Snapshotda takrorlangan id: ${product.id}`);
    }
    if (codes.has(code)) {
      throw new Error(`Snapshotda takrorlangan trtCode: ${product.trtCode}`);
    }
    ids.add(product.id);
    codes.add(code);
  }

  return products;
}

function rewriteAndValidateImages(products, baseUrl) {
  const fileNames = new Set();
  const signatures = new Set();

  for (const product of products) {
    const rewritten = [];
    for (const image of product.images) {
      let parsed;
      try {
        parsed = new URL(image);
      } catch {
        throw new Error(
          `Noto‘g‘ri rasm URL: id=${product.id}, url=${image}`,
        );
      }

      const marker = '/uploads/parts/';
      const markerIndex = parsed.pathname.indexOf(marker);
      if (markerIndex === -1) {
        throw new Error(
          `Product rasmi uploads/parts ichida emas: id=${product.id}, url=${image}`,
        );
      }

      const relativePath = decodeURIComponent(
        parsed.pathname.slice(markerIndex + marker.length),
      );
      if (
        !relativePath ||
        relativePath.includes('/') ||
        relativePath.includes('\\') ||
        relativePath === '.' ||
        relativePath === '..'
      ) {
        throw new Error(
          `Rasm fayl nomi xavfsiz emas: id=${product.id}, url=${image}`,
        );
      }

      fileNames.add(relativePath);
      rewritten.push(`${baseUrl}${marker}${encodeURIComponent(relativePath)}`);
    }

    product.restoredImages = rewritten;
    signatures.add(rewritten.join('|'));
  }

  return { fileNames, uniqueImageSets: signatures.size };
}

function findMissingFiles(fileNames) {
  const missing = [];
  for (const fileName of fileNames) {
    if (!fs.existsSync(path.join(PARTS_DIR, fileName))) {
      missing.push(fileName);
    }
  }
  return missing;
}

function compareSnapshotWithDatabase(snapshot, databaseRows) {
  const databaseById = new Map(databaseRows.map((row) => [Number(row.id), row]));
  const snapshotIds = new Set(snapshot.map((item) => item.id));
  const mismatches = [];

  for (const product of snapshot) {
    const row = databaseById.get(product.id);
    if (!row) {
      mismatches.push(`Bazadan id=${product.id} topilmadi`);
      continue;
    }
    if (normalizeCode(row.trtCode) !== normalizeCode(product.trtCode)) {
      mismatches.push(
        `id=${product.id}: snapshot=${product.trtCode}, baza=${row.trtCode}`,
      );
    }
  }

  for (const row of databaseRows) {
    if (!snapshotIds.has(Number(row.id))) {
      mismatches.push(`Snapshotda baza id=${row.id} yo‘q`);
    }
  }

  return mismatches;
}

function saveCurrentBackup(databaseRows) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(
    BACKUP_DIR,
    `before-original-images-restore-${stamp}.json`,
  );
  const payload = databaseRows.map((row) => ({
    id: Number(row.id),
    trtCode: row.trtCode,
    images: Array.isArray(row.images) ? row.images : [],
  }));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filePath;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const snapshotPath = readFileArg();

  loadEnvFile(ENV_PATH);

  const baseUrl = String(
    process.env.BASE_URL || DEFAULT_BASE_URL,
  ).replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error('BASE_URL http(s) bilan boshlanishi kerak');
  }

  const snapshot = parseSnapshot(snapshotPath);
  const { fileNames, uniqueImageSets } = rewriteAndValidateImages(
    snapshot,
    baseUrl,
  );
  const imageUrlCount = snapshot.reduce(
    (sum, product) => sum + product.restoredImages.length,
    0,
  );
  const missingFiles = findMissingFiles(fileNames);

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

  await client.connect();

  try {
    const { rows: databaseRows } = await client.query(`
      SELECT id, "trtCode", images
      FROM part
      ORDER BY id
    `);
    const mismatches = compareSnapshotWithDatabase(snapshot, databaseRows);

    console.log(apply ? 'Rejim: --apply' : 'Rejim: dry-run');
    console.log(`Snapshot: ${snapshotPath}`);
    console.log(`Snapshot productlari: ${snapshot.length}`);
    console.log(`Bazadagi productlar: ${databaseRows.length}`);
    console.log(`Rasm URL lar: ${imageUrlCount}`);
    console.log(`Har xil rasm to‘plamlari: ${uniqueImageSets}`);
    console.log(`Har xil rasm fayllari: ${fileNames.size}`);
    console.log(`Diskda topilmagan fayllar: ${missingFiles.length}`);
    console.log(`id/trtCode nomuvofiqligi: ${mismatches.length}`);

    if (missingFiles.length) {
      console.log('\nTopilmagan fayllardan namuna:');
      for (const fileName of missingFiles.slice(0, 10)) {
        console.log(`  ${fileName}`);
      }
    }

    if (mismatches.length) {
      console.log('\nNomuvofiqliklardan namuna:');
      for (const mismatch of mismatches.slice(0, 10)) {
        console.log(`  ${mismatch}`);
      }
    }

    if (missingFiles.length || mismatches.length) {
      throw new Error(
        'Tekshiruvdan o‘tmadi. Bazaga hech narsa yozilmadi.',
      );
    }

    if (!apply) {
      console.log('\nTEKSHIRUV MUVAFFAQIYATLI. Bazaga hech narsa yozilmadi.');
      console.log(
        `Yozish: node scripts/restore-images-from-snapshot.js ` +
          `--file=${path.relative(ROOT, snapshotPath)} --apply`,
      );
      return;
    }

    const backupPath = saveCurrentBackup(databaseRows);
    console.log(`\nJoriy images backup qilindi: ${backupPath}`);

    await client.query('BEGIN');
    try {
      for (const product of snapshot) {
        const result = await client.query(
          `UPDATE part
           SET images = $1
           WHERE id = $2
             AND UPPER(TRIM("trtCode")) = $3`,
          [
            product.restoredImages,
            product.id,
            normalizeCode(product.trtCode),
          ],
        );
        if (result.rowCount !== 1) {
          throw new Error(
            `Yangilanmadi: id=${product.id}, trtCode=${product.trtCode}`,
          );
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    console.log(
      `\nTayyor: ${snapshot.length} productga ${imageUrlCount} haqiqiy rasm URL qaytarildi.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Xato:', error.message);
  process.exit(1);
});

/**
 * Productlarning rasmlarini catalog_items dan tiklaydi.
 *
 * Moslashtirish: part."trtCode" = catalog_items."trtNo" (registr va bo'shliq hisobga olinmaydi).
 * catalog_items jadvali buzilmagan, shuning uchun har product o'z rasmini oladi.
 *
 * Ishlatish:
 *   node scripts/restore-part-images.js            (faqat ko'rsatadi, yozmaydi)
 *   node scripts/restore-part-images.js --apply    (bazaga yozadi)
 *
 * --apply da:
 *   - o'zgarishdan oldingi holat backup/part-images-<vaqt>.json ga saqlanadi
 *   - catalog rasmi uploads/parts ga nusxalanadi (catalog tahrirlansa buzilmasligi uchun)
 *   - yangilash faqat id bo'yicha bajariladi
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const CATALOG_DIR = path.join(ROOT, 'uploads', 'catalog');
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
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function catalogFileName(photo) {
  const value = String(photo || '').trim();
  if (!value) return null;
  if (!value.includes('/uploads/catalog/')) return null;
  const name = value.split('/uploads/catalog/').pop();
  if (!name || name.includes('/')) return null;
  return decodeURIComponent(name.split('?')[0]);
}

function buildPartFileName(sourceName) {
  const ext = path.extname(sourceName) || '.jpg';
  const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `part-${suffix}${ext}`;
}

async function loadData(client) {
  const parts = await client.query(`
    SELECT id, sku, "trtCode", images
    FROM part
    ORDER BY id
  `);

  const catalog = await client.query(`
    SELECT id, "trtNo", photo
    FROM catalog_items
    WHERE photo <> ''
    ORDER BY id
  `);

  return { parts: parts.rows, catalog: catalog.rows };
}

function indexCatalog(catalogRows) {
  const byCode = new Map();
  const duplicates = [];

  for (const row of catalogRows) {
    const code = normalizeCode(row.trtNo);
    if (!code) continue;
    if (byCode.has(code)) {
      duplicates.push(code);
      continue;
    }
    byCode.set(code, row);
  }

  return { byCode, duplicates: [...new Set(duplicates)] };
}

function saveBackup(parts) {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(BACKUP_DIR, `part-images-${stamp}.json`);
  const payload = parts.map((part) => ({
    id: part.id,
    trtCode: part.trtCode,
    images: Array.isArray(part.images) ? part.images : [],
  }));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filePath;
}

function copyCatalogFile(fileName) {
  const source = path.join(CATALOG_DIR, fileName);
  if (!fs.existsSync(source)) {
    return { ok: false, reason: 'fayl diskda yo\'q' };
  }
  if (!fs.existsSync(PARTS_DIR)) {
    fs.mkdirSync(PARTS_DIR, { recursive: true });
  }
  const targetName = buildPartFileName(fileName);
  fs.copyFileSync(source, path.join(PARTS_DIR, targetName));
  return { ok: true, targetName };
}

async function main() {
  const apply = process.argv.includes('--apply');

  loadEnvFile(ENV_PATH);

  const baseUrl = (process.env.BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'trt_parts_db',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  console.log(apply ? 'Rejim: --apply (bazaga yoziladi)' : 'Rejim: dry-run (bazaga yozilmaydi)');
  console.log(`Domen: ${baseUrl}`);

  await client.connect();

  try {
    const { parts, catalog } = await loadData(client);
    const { byCode, duplicates } = indexCatalog(catalog);

    console.log(`\nProductlar: ${parts.length}`);
    console.log(`Rasmli catalog yozuvlari: ${catalog.length}`);
    if (duplicates.length) {
      console.log(`Catalogda takrorlangan trtNo: ${duplicates.length} ta (birinchisi olinadi)`);
    }

    let backupPath = null;
    if (apply) {
      backupPath = saveBackup(parts);
      console.log(`\nHozirgi holat saqlandi: ${backupPath}`);
      await client.query('BEGIN');
    }

    const matched = [];
    const noCatalog = [];
    const noFile = [];

    try {
      for (const part of parts) {
        const code = normalizeCode(part.trtCode);
        const catalogRow = code ? byCode.get(code) : null;

        if (!catalogRow) {
          noCatalog.push(part);
          continue;
        }

        const fileName = catalogFileName(catalogRow.photo);

        if (!fileName) {
          matched.push({ part, url: String(catalogRow.photo).trim(), copied: false });
          if (apply) {
            await client.query('UPDATE part SET images = $1 WHERE id = $2', [
              [String(catalogRow.photo).trim()],
              part.id,
            ]);
          }
          continue;
        }

        if (!apply) {
          if (!fs.existsSync(path.join(CATALOG_DIR, fileName))) {
            noFile.push({ part, fileName });
            continue;
          }
          matched.push({
            part,
            url: `${baseUrl}/uploads/parts/(nusxa)-${fileName}`,
            copied: true,
          });
          continue;
        }

        const copyResult = copyCatalogFile(fileName);
        if (!copyResult.ok) {
          noFile.push({ part, fileName });
          continue;
        }

        const url = `${baseUrl}/uploads/parts/${copyResult.targetName}`;
        await client.query('UPDATE part SET images = $1 WHERE id = $2', [[url], part.id]);
        matched.push({ part, url, copied: true });
      }

      if (apply) {
        await client.query('COMMIT');
      }
    } catch (err) {
      if (apply) {
        await client.query('ROLLBACK');
      }
      throw err;
    }

    console.log(`\nTiklandi: ${matched.length}`);
    console.log(`Catalogda mos kod topilmadi: ${noCatalog.length}`);
    console.log(`Catalog rasmi diskda yo'q: ${noFile.length}`);

    console.log('\nNamuna (birinchi 5 ta):');
    for (const item of matched.slice(0, 5)) {
      console.log(`  ${item.part.trtCode} (id ${item.part.id})`);
      console.log(`    -> ${item.url}`);
    }

    if (noCatalog.length) {
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }
      const listPath = path.join(BACKUP_DIR, 'qolda-tuzatish-kerak.txt');
      const lines = noCatalog.map((part) => `id=${part.id}\ttrtCode=${part.trtCode}`);
      fs.writeFileSync(listPath, lines.join('\n'), 'utf8');
      console.log(`\nQo'lda tuzatish kerak bo'lganlar ro'yxati: ${listPath}`);
    }

    if (!apply) {
      console.log('\nBazaga yozish uchun: node scripts/restore-part-images.js --apply');
    } else {
      console.log('\nTayyor. Saytni yangilab tekshiring.');
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Xato:', err.message);
  process.exit(1);
});

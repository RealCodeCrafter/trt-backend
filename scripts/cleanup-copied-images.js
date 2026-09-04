/**
 * uploads/parts ga catalogdan nusxalangan fayllarni o'chiradi.
 *
 * Bu fayllar restore-part-images.js ishlaganda paydo bo'lgan va endi
 * kerak emas. Faqat quyidagi uchta shart birga bajarilsa o'chiriladi:
 *   1. fayl mazmuni uploads/catalog dagi biror fayl bilan aynan bir xil
 *   2. fayl nomidagi yuklash vaqti --since dan keyin
 *   3. fayl bazada (part.images) hech qayerda ishlatilmayapti
 *
 * Ishlatish:
 *   node scripts/cleanup-copied-images.js                      (faqat ko'rsatadi)
 *   node scripts/cleanup-copied-images.js --apply              (o'chiradi)
 *   node scripts/cleanup-copied-images.js --since=2026-09-04 --apply
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const PARTS_DIR = path.join(ROOT, 'uploads', 'parts');
const CATALOG_DIR = path.join(ROOT, 'uploads', 'catalog');
const TRASH_DIR = path.join(ROOT, 'backup', 'ochirilgan-nusxalar');

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

function readSince() {
  const arg = process.argv.find((item) => item.startsWith('--since='));
  if (arg) {
    const value = arg.slice('--since='.length).trim();
    const parsed = Date.parse(value.length <= 10 ? `${value}T00:00:00Z` : value);
    if (Number.isNaN(parsed)) {
      throw new Error('--since qiymati noto\'g\'ri, misol: --since=2026-09-04');
    }
    return parsed;
  }
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readCatalogHashes() {
  const hashes = new Set();
  if (!fs.existsSync(CATALOG_DIR)) return hashes;
  for (const name of fs.readdirSync(CATALOG_DIR)) {
    const full = path.join(CATALOG_DIR, name);
    if (!fs.statSync(full).isFile()) continue;
    hashes.add(hashFile(full));
  }
  return hashes;
}

async function readReferencedFiles(client) {
  const { rows } = await client.query('SELECT images FROM part');
  const referenced = new Set();
  for (const row of rows) {
    const images = Array.isArray(row.images) ? row.images : [];
    for (const url of images) {
      const name = String(url).split('/').pop();
      if (name) referenced.add(decodeURIComponent(name.split('?')[0]));
    }
  }
  return referenced;
}

function formatTime(ms) {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const since = readSince();

  loadEnvFile(ENV_PATH);

  if (!fs.existsSync(PARTS_DIR)) {
    throw new Error(`Papka topilmadi: ${PARTS_DIR}`);
  }

  console.log(apply ? 'Rejim: --apply (fayllar ko\'chiriladi)' : 'Rejim: dry-run');
  console.log(`Chegara vaqt: ${formatTime(since)} dan keyin yuklangan fayllar`);

  const catalogHashes = readCatalogHashes();
  console.log(`Catalog fayllari: ${catalogHashes.size} xil mazmun`);

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'trt_parts_db',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  try {
    const referenced = await readReferencedFiles(client);
    console.log(`Bazada ishlatilayotgan fayllar: ${referenced.size}`);

    const all = fs.readdirSync(PARTS_DIR);
    const candidates = [];
    let newerCount = 0;

    for (const name of all) {
      const match = name.match(/^part-(\d{10,16})-(\d+)(\.[A-Za-z0-9]+)?$/);
      if (!match) continue;

      const full = path.join(PARTS_DIR, name);
      if (!fs.statSync(full).isFile()) continue;

      const ms = Number(match[1]);
      if (ms < since) continue;
      newerCount += 1;

      if (referenced.has(name)) continue;
      if (!catalogHashes.has(hashFile(full))) continue;

      candidates.push({ name, ms });
    }

    console.log(`\nuploads/parts: ${all.length} element`);
    console.log(`Chegaradan keyin yuklanganlar: ${newerCount}`);
    console.log(`O'chirishga mos: ${candidates.length}`);

    if (candidates.length === 0) {
      console.log('\nO\'chirish kerak emas.');
      return;
    }

    console.log('\nNamuna (birinchi 5 ta):');
    for (const item of candidates.slice(0, 5)) {
      console.log(`  ${item.name} (${formatTime(item.ms)})`);
    }

    if (!apply) {
      console.log('\nO\'chirish uchun: node scripts/cleanup-copied-images.js --apply');
      return;
    }

    if (!fs.existsSync(TRASH_DIR)) {
      fs.mkdirSync(TRASH_DIR, { recursive: true });
    }

    let moved = 0;
    for (const item of candidates) {
      fs.renameSync(path.join(PARTS_DIR, item.name), path.join(TRASH_DIR, item.name));
      moved += 1;
    }

    console.log(`\n${moved} fayl ko'chirildi: ${TRASH_DIR}`);
    console.log('Fayllar o\'chirilmadi, shu papkada turadi. Ishonch hosil qilgach o\'zingiz o\'chirasiz.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Xato:', err.message);
  process.exit(1);
});

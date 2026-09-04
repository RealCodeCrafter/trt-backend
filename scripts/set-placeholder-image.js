/**
 * Noto'g'ri rasm yozilgan productlarga bitta placeholder rasm qo'yadi.
 *
 * Rasmi allaqachon placeholder bo'lgan productlarga tegmaydi.
 *
 * Ishlatish:
 *   node scripts/set-placeholder-image.js           (faqat ko'rsatadi, yozmaydi)
 *   node scripts/set-placeholder-image.js --apply   (bazaga yozadi)
 *   node scripts/set-placeholder-image.js --url=https://... --apply
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const BACKUP_DIR = path.join(ROOT, 'backup');
const DEFAULT_URL =
  'https://backend.trt-parts.com/uploads/parts/part-1778557693756-816670489.png';

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

function resolveUrl() {
  const arg = process.argv.find((item) => item.startsWith('--url='));
  const value = arg ? arg.slice('--url='.length).trim() : DEFAULT_URL;
  if (!/^https?:\/\//i.test(value)) {
    throw new Error('URL http(s) bilan boshlanishi kerak');
  }
  return value;
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

async function main() {
  const apply = process.argv.includes('--apply');
  const url = resolveUrl();

  loadEnvFile(ENV_PATH);

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'trt_parts_db',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  console.log(apply ? 'Rejim: --apply (bazaga yoziladi)' : 'Rejim: dry-run (bazaga yozilmaydi)');
  console.log(`Qo'yiladigan rasm: ${url}`);

  await client.connect();

  try {
    const { rows: parts } = await client.query(`
      SELECT id, "trtCode", images
      FROM part
      ORDER BY id
    `);

    const target = parts.filter((part) => {
      const images = Array.isArray(part.images) ? part.images : [];
      return !(images.length === 1 && images[0] === url);
    });

    console.log(`\nProductlar: ${parts.length}`);
    console.log(`O'zgartirilishi kerak: ${target.length}`);
    console.log(`Allaqachon to'g'ri: ${parts.length - target.length}`);

    if (target.length === 0) {
      console.log('\nO\'zgartirish kerak emas.');
      return;
    }

    console.log('\nNamuna (birinchi 5 ta):');
    for (const part of target.slice(0, 5)) {
      const images = Array.isArray(part.images) ? part.images : [];
      console.log(`  ${part.trtCode} (id ${part.id}): ${images.length} rasm -> 1 rasm`);
    }

    if (!apply) {
      console.log('\nBazaga yozish uchun: node scripts/set-placeholder-image.js --apply');
      return;
    }

    const backupPath = saveBackup(parts);
    console.log(`\nHozirgi holat saqlandi: ${backupPath}`);

    await client.query('BEGIN');
    try {
      for (const part of target) {
        await client.query('UPDATE part SET images = $1 WHERE id = $2', [[url], part.id]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    console.log(`\n${target.length} product yangilandi.`);
    console.log('Saytni yangilab tekshiring.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Xato:', err.message);
  process.exit(1);
});

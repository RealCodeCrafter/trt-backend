/**
 * part.images ni backup/part-images-*.json faylidan qaytaradi.
 *
 * Ishlatish:
 *   node scripts/revert-part-images.js                       (oxirgi backup, faqat ko'rsatadi)
 *   node scripts/revert-part-images.js --apply               (oxirgi backup, bazaga yozadi)
 *   node scripts/revert-part-images.js --file=<yo'l> --apply (aniq fayldan)
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const BACKUP_DIR = path.join(ROOT, 'backup');

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

function findLatestBackup() {
  if (!fs.existsSync(BACKUP_DIR)) return null;
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => /^part-images-.*\.json$/.test(name))
    .map((name) => ({
      name,
      full: path.join(BACKUP_DIR, name),
      mtime: fs.statSync(path.join(BACKUP_DIR, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.length ? files[0].full : null;
}

function resolveBackupPath() {
  const arg = process.argv.find((item) => item.startsWith('--file='));
  if (arg) {
    const value = arg.slice('--file='.length);
    return path.isAbsolute(value) ? value : path.join(ROOT, value);
  }
  return findLatestBackup();
}

async function main() {
  const apply = process.argv.includes('--apply');
  const backupPath = resolveBackupPath();

  if (!backupPath || !fs.existsSync(backupPath)) {
    throw new Error('Backup fayl topilmadi (backup/part-images-*.json)');
  }

  loadEnvFile(ENV_PATH);

  const entries = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Backup fayl bo\'sh yoki noto\'g\'ri');
  }

  console.log(`Backup: ${backupPath}`);
  console.log(`Yozuvlar: ${entries.length}`);
  console.log(apply ? 'Rejim: --apply (bazaga yoziladi)' : 'Rejim: dry-run');

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
    if (apply) {
      await client.query('BEGIN');
    }

    let restored = 0;

    try {
      for (const entry of entries) {
        if (!Number.isInteger(entry.id)) continue;
        const images = Array.isArray(entry.images) ? entry.images : [];
        if (apply) {
          await client.query('UPDATE part SET images = $1 WHERE id = $2', [images, entry.id]);
        }
        restored += 1;
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

    console.log(`\n${restored} product ${apply ? 'qaytarildi' : 'qaytariladi'}.`);
    if (!apply) {
      console.log('Bazaga yozish uchun: node scripts/revert-part-images.js --apply');
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Xato:', err.message);
  process.exit(1);
});

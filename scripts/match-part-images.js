/**
 * Faqat O'QIYDI. Bazaga va fayllarga hech narsa yozmaydi.
 *
 * Nima qiladi:
 *   1. uploads/parts dagi fayllarni yuklash vaqti bo'yicha guruhlarga bo'ladi
 *      (bir guruh = bitta productga bir marta yuklangan rasmlar).
 *   2. Har faylning mazmun hash ini hisoblaydi va mazmuni bir xil guruhlarni
 *      topadi - bular muvaffaqiyatsiz yuklashdan keyin qayta yuklangan nusxalar.
 *   3. uploads/catalog bilan solishtirib, mazmuni bir xil fayllarni topadi.
 *      Bu "langar": guruhning qaysi trtNo ga tegishli ekanini aniq ko'rsatadi.
 *   4. Langarlar tartib bo'yicha moslashtirish to'g'ri ishlashini
 *      tasdiqlaydimi yoki yo'qmi - shuni hisoblab beradi.
 *
 * Ishlatish:
 *   node scripts/match-part-images.js
 *   node scripts/match-part-images.js --gap=10000
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const PARTS_DIR = path.join(ROOT, 'uploads', 'parts');
const CATALOG_DIR = path.join(ROOT, 'uploads', 'catalog');
const OUT_DIR = path.join(ROOT, 'backup');
const DEFAULT_GAP_MS = 5000;
const RETRY_WINDOW_MS = 15 * 60 * 1000;

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

function readGapArg() {
  const arg = process.argv.find((item) => item.startsWith('--gap='));
  if (!arg) return DEFAULT_GAP_MS;
  const value = parseInt(arg.slice('--gap='.length), 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_GAP_MS;
}

function hashFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readPartFiles() {
  const files = [];
  for (const name of fs.readdirSync(PARTS_DIR)) {
    const match = name.match(/^part-(\d{10,16})-(\d+)(\.[A-Za-z0-9]+)?$/);
    if (!match) continue;
    const full = path.join(PARTS_DIR, name);
    if (!fs.statSync(full).isFile()) continue;
    files.push({ name, ms: Number(match[1]), hash: hashFile(full) });
  }
  files.sort((a, b) => a.ms - b.ms || a.name.localeCompare(b.name));
  return files;
}

function readCatalogHashes() {
  const byHash = new Map();
  if (!fs.existsSync(CATALOG_DIR)) return byHash;
  for (const name of fs.readdirSync(CATALOG_DIR)) {
    const full = path.join(CATALOG_DIR, name);
    if (!fs.statSync(full).isFile()) continue;
    const hash = hashFile(full);
    if (!byHash.has(hash)) byHash.set(hash, name);
  }
  return byHash;
}

function clusterByGap(files, gapMs) {
  const groups = [];
  let current = [];
  for (const file of files) {
    if (current.length === 0) {
      current.push(file);
      continue;
    }
    if (file.ms - current[current.length - 1].ms <= gapMs) {
      current.push(file);
    } else {
      groups.push(current);
      current = [file];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

function groupSignature(group) {
  return group
    .map((file) => file.hash)
    .sort()
    .join(':');
}

/**
 * Muvaffaqiyatsiz yuklash darhol qaytariladi, shuning uchun faqat yonma-yon
 * turgan va vaqt jihatidan yaqin guruhlar solishtiriladi. Bir xil rasm turli
 * productlarda ishlatilishi mumkin, shuning uchun butun ro'yxat bo'yicha
 * solishtirish yaramaydi.
 */
function findRetryGroups(groups, windowMs) {
  const retryIndexes = new Set();

  for (let index = 1; index < groups.length; index += 1) {
    const prev = groups[index - 1];
    const current = groups[index];
    const gap = current[0].ms - prev[prev.length - 1].ms;
    if (gap > windowMs) continue;
    if (groupSignature(prev) !== groupSignature(current)) continue;
    retryIndexes.add(index - 1);
  }

  return retryIndexes;
}

async function loadDb(client) {
  const parts = await client.query(`
    SELECT id, sku, "trtCode", translations->'en'->>'name' AS name
    FROM part
    ORDER BY id
  `);
  const catalog = await client.query(`
    SELECT "trtNo", photo
    FROM catalog_items
    WHERE photo <> ''
  `);
  return { parts: parts.rows, catalog: catalog.rows };
}

function catalogFileName(photo) {
  const value = String(photo || '').trim();
  if (!value.includes('/uploads/catalog/')) return null;
  const name = value.split('/uploads/catalog/').pop();
  if (!name || name.includes('/')) return null;
  return decodeURIComponent(name.split('?')[0]);
}

function buildCatalogCodeByFile(catalogRows) {
  const map = new Map();
  for (const row of catalogRows) {
    const fileName = catalogFileName(row.photo);
    if (!fileName) continue;
    if (!map.has(fileName)) map.set(fileName, String(row.trtNo).trim());
  }
  return map;
}

function formatTime(ms) {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

async function main() {
  loadEnvFile(ENV_PATH);

  const gapMs = readGapArg();

  if (!fs.existsSync(PARTS_DIR)) {
    throw new Error(`Papka topilmadi: ${PARTS_DIR}`);
  }

  console.log('Fayllar o\'qilmoqda va hash hisoblanmoqda...');
  const partFiles = readPartFiles();
  const catalogByHash = readCatalogHashes();

  const groups = clusterByGap(partFiles, gapMs);
  const retryIndexes = findRetryGroups(groups, RETRY_WINDOW_MS);
  const cleanGroups = groups.filter((_, index) => !retryIndexes.has(index));

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
    const { parts, catalog } = await loadDb(client);
    const codeByCatalogFile = buildCatalogCodeByFile(catalog);

    console.log(`\n=== FAYLLAR ===`);
    console.log(`uploads/parts: ${partFiles.length} fayl`);
    console.log(`Vaqt oralig'i: ${gapMs} ms`);
    console.log(`Guruhlar: ${groups.length}`);
    console.log(`Qayta yuklash izlari: ${retryIndexes.size} ta olib tashlandi`);
    console.log(`Tozalangandan keyin: ${cleanGroups.length} guruh`);
    console.log(`Productlar: ${parts.length}`);

    const diff = cleanGroups.length - parts.length;
    console.log(`Farq: ${diff > 0 ? '+' : ''}${diff}`);

    console.log(`\n=== LANGARLAR (catalog bilan bir xil fayllar) ===`);
    const anchors = [];
    for (let index = 0; index < cleanGroups.length; index += 1) {
      for (const file of cleanGroups[index]) {
        const catalogFile = catalogByHash.get(file.hash);
        if (!catalogFile) continue;
        const code = codeByCatalogFile.get(catalogFile);
        if (!code) continue;
        anchors.push({ groupIndex: index, trtCode: code, file: file.name });
        break;
      }
    }

    console.log(`Topilgan langarlar: ${anchors.length}`);

    if (anchors.length > 0) {
      const partIndexByCode = new Map();
      for (let index = 0; index < parts.length; index += 1) {
        const code = String(parts[index].trtCode || '').trim().toUpperCase();
        if (code && !partIndexByCode.has(code)) partIndexByCode.set(code, index);
      }

      let agree = 0;
      let checked = 0;
      const offsets = new Map();

      for (const anchor of anchors) {
        const partIndex = partIndexByCode.get(anchor.trtCode.toUpperCase());
        if (partIndex === undefined) continue;
        checked += 1;
        const offset = anchor.groupIndex - partIndex;
        offsets.set(offset, (offsets.get(offset) || 0) + 1);
        if (offset === 0) agree += 1;
      }

      console.log(`Productda kodi topilgan langarlar: ${checked}`);
      console.log(`Tartib aynan to'g'ri kelganlari: ${agree}`);
      console.log('\nSurilish (offset) taqsimoti - eng ko\'p uchraganlari:');
      const sorted = [...offsets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      for (const [offset, count] of sorted) {
        console.log(`  surilish ${offset > 0 ? '+' : ''}${offset}: ${count} langar`);
      }

      console.log('\nNamuna langarlar (birinchi 10 ta):');
      for (const anchor of anchors.slice(0, 10)) {
        const partIndex = partIndexByCode.get(anchor.trtCode.toUpperCase());
        const partInfo =
          partIndex === undefined
            ? 'productda yo\'q'
            : `product #${partIndex} (id ${parts[partIndex].id}, ${parts[partIndex].trtCode})`;
        console.log(`  guruh #${anchor.groupIndex} -> ${anchor.trtCode} -> ${partInfo}`);
      }
    } else {
      console.log('Langar topilmadi: product va catalog rasmlari boshqa fayllar.');
    }

    console.log(`\n=== GURUHLAR NAMUNASI ===`);
    for (const index of [0, 1, 2]) {
      if (!cleanGroups[index]) continue;
      const group = cleanGroups[index];
      console.log(
        `guruh #${index} | ${formatTime(group[0].ms)} | ${group.length} rasm | ${group[0].name}`,
      );
    }

    if (!fs.existsSync(OUT_DIR)) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
    }
    const outPath = path.join(OUT_DIR, 'image-groups.json');
    fs.writeFileSync(
      outPath,
      JSON.stringify(
        {
          gapMs,
          groupCount: cleanGroups.length,
          partCount: parts.length,
          groups: cleanGroups.map((group, index) => ({
            index,
            uploadedAt: formatTime(group[0].ms),
            files: group.map((file) => file.name),
          })),
          parts: parts.map((part, index) => ({
            index,
            id: part.id,
            trtCode: part.trtCode,
            name: part.name,
          })),
          anchors,
        },
        null,
        2,
      ),
      'utf8',
    );
    console.log(`\nNatija saqlandi: ${outPath}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Xato:', err.message);
  process.exit(1);
});

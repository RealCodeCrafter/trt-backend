/**
 * Faqat O'QIYDI. Bazaga va fayllarga hech narsa yozmaydi.
 *
 * Maqsad: uploads/parts dagi fayl nomlaridagi vaqt bo'yicha rasmlarni
 * guruhlarga bo'lib, ularni productlar bilan moslashtirish mumkinmi yoki
 * yo'qmi - shuni aniqlash.
 *
 * Ishlatish:
 *   node scripts/analyze-part-images.js
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const PARTS_DIR = path.join(ROOT, 'uploads', 'parts');
const GAP_CANDIDATES = [1000, 3000, 5000, 10000, 30000, 60000];

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

function readImageFiles() {
  if (!fs.existsSync(PARTS_DIR)) {
    throw new Error(`Papka topilmadi: ${PARTS_DIR}`);
  }

  const files = [];
  const skipped = [];

  for (const name of fs.readdirSync(PARTS_DIR)) {
    const match = name.match(/^part-(\d{10,16})-(\d+)(\.[A-Za-z0-9]+)?$/);
    if (!match) {
      skipped.push(name);
      continue;
    }
    files.push({
      name,
      ms: Number(match[1]),
      ext: (match[3] || '').toLowerCase(),
    });
  }

  files.sort((a, b) => a.ms - b.ms || a.name.localeCompare(b.name));
  return { files, skipped };
}

function clusterByGap(files, gapMs) {
  const clusters = [];
  let current = [];

  for (const file of files) {
    if (current.length === 0) {
      current.push(file);
      continue;
    }
    const prev = current[current.length - 1];
    if (file.ms - prev.ms <= gapMs) {
      current.push(file);
    } else {
      clusters.push(current);
      current = [file];
    }
  }

  if (current.length > 0) clusters.push(current);
  return clusters;
}

function sizeHistogram(clusters) {
  const counts = new Map();
  for (const cluster of clusters) {
    counts.set(cluster.length, (counts.get(cluster.length) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0] - b[0]);
}

function formatTime(ms) {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

async function loadDbState(client) {
  const parts = await client.query(`
    SELECT id, sku, "trtCode",
           COALESCE(cardinality(images), 0) AS image_count,
           images
    FROM part
    ORDER BY id
  `);

  const duplicateSkus = await client.query(`
    SELECT sku, COUNT(*)::int AS soni
    FROM part
    GROUP BY sku
    HAVING COUNT(*) > 1
    ORDER BY soni DESC
  `);

  return { parts: parts.rows, duplicateSkus: duplicateSkus.rows };
}

function analyzeDamage(parts) {
  const signatures = new Map();
  let withImages = 0;

  for (const part of parts) {
    const images = Array.isArray(part.images) ? part.images : [];
    if (images.length === 0) continue;
    withImages += 1;
    const key = images.join('|');
    signatures.set(key, (signatures.get(key) || 0) + 1);
  }

  const shared = [...signatures.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1]);

  return { withImages, uniqueSignatures: signatures.size, shared };
}

function collectReferencedFiles(parts) {
  const referenced = new Set();
  for (const part of parts) {
    const images = Array.isArray(part.images) ? part.images : [];
    for (const url of images) {
      const name = String(url).split('/').pop();
      if (name) referenced.add(name);
    }
  }
  return referenced;
}

async function main() {
  loadEnvFile(ENV_PATH);

  const { files, skipped } = readImageFiles();

  console.log('=== DISKDAGI RASMLAR ===');
  console.log(`Papka: ${PARTS_DIR}`);
  console.log(`Nom shabloniga mos fayllar: ${files.length}`);
  if (skipped.length) {
    console.log(`Shablonga mos kelmagan: ${skipped.length} (masalan: ${skipped.slice(0, 3).join(', ')})`);
  }
  if (files.length === 0) {
    throw new Error('Tahlil qilinadigan fayl topilmadi');
  }
  console.log(`Eng eski yuklash: ${formatTime(files[0].ms)}`);
  console.log(`Eng yangi yuklash: ${formatTime(files[files.length - 1].ms)}`);

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
    const { parts, duplicateSkus } = await loadDbState(client);
    const damage = analyzeDamage(parts);
    const referenced = collectReferencedFiles(parts);
    const orphans = files.filter((file) => !referenced.has(file.name));

    console.log('\n=== BAZADAGI HOLAT ===');
    console.log(`Productlar: ${parts.length}`);
    console.log(`Rasmi bor productlar: ${damage.withImages}`);
    console.log(`Har xil rasm to'plamlari: ${damage.uniqueSignatures}`);
    console.log(`Bazada ishlatilgan fayllar: ${referenced.size}`);
    console.log(`Hech qayerda ishlatilmagan fayllar: ${orphans.length}`);

    console.log('\nBir xil rasm to\'plamini baham ko\'rayotgan guruhlar:');
    if (damage.shared.length === 0) {
      console.log('  yo\'q');
    } else {
      for (const [key, count] of damage.shared.slice(0, 10)) {
        const first = key.split('|')[0].split('/').pop();
        console.log(`  ${count} product <- ${first} (va yana ${key.split('|').length - 1} ta)`);
      }
    }

    console.log('\nBir xil sku li productlar:');
    if (duplicateSkus.length === 0) {
      console.log('  yo\'q');
    } else {
      for (const row of duplicateSkus.slice(0, 10)) {
        console.log(`  sku="${row.sku}" -> ${row.soni} product`);
      }
    }

    console.log('\n=== VAQT BO\'YICHA GURUHLASH ===');
    console.log('Maqsad: guruhlar soni rasmi bor productlar soniga yaqin bo\'lsa,');
    console.log('tiklash mumkin.\n');

    for (const gap of GAP_CANDIDATES) {
      const clusters = clusterByGap(files, gap);
      const hist = sizeHistogram(clusters);
      const histText = hist
        .map(([size, count]) => `${size} ta rasm: ${count} guruh`)
        .join(', ');
      console.log(`Oraliq ${gap} ms -> ${clusters.length} guruh`);
      console.log(`  ${histText}`);
    }

    console.log('\n=== XULOSA UCHUN ===');
    console.log(`Rasmi bor productlar: ${damage.withImages}`);
    console.log('Yuqoridagi guruh sonlaridan qaysi biri shu songa yaqin - shuni ko\'ring.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Xato:', err.message);
  process.exit(1);
});

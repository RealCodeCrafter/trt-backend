/**
 * Chrome cache backup ichidan faqat product JSON javoblarini ajratadi.
 * Original Chrome cache, server va bazaga tegmaydi.
 *
 * Ishlatish:
 *   node scripts/recover-chrome-products.js
 */

const fs = require('fs');
const path = require('path');

const CACHE_ROOT = path.join(
  process.env.USERPROFILE || '',
  'Desktop',
  'Chrome-cache-backup',
);
const OUTPUT_DIR = path.join(
  process.env.USERPROFILE || '',
  'Desktop',
  'Chrome-products-recovered',
);

function walk(dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, output);
    } else if (/^f_[0-9a-f]+$/i.test(entry.name)) {
      output.push(fullPath);
    }
  }
  return output;
}

function parseJsonBuffer(buffer) {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const starts = [];

  for (let index = 0; index < Math.min(text.length, 4096); index += 1) {
    if (text[index] === '[' || text[index] === '{') starts.push(index);
  }

  for (const start of starts) {
    const candidate = text.slice(start).replace(/\0+$/, '').trim();
    try {
      return JSON.parse(candidate);
    } catch {
      // Keyingi ehtimoliy JSON boshlanishini tekshiramiz.
    }
  }

  return null;
}

function collectProducts(node, products, seen) {
  if (!node || typeof node !== 'object') return;

  if (
    Object.prototype.hasOwnProperty.call(node, 'trtCode') &&
    Array.isArray(node.images)
  ) {
    const key = `${node.id ?? ''}:${String(node.trtCode)}`;
    if (!seen.has(key)) {
      seen.add(key);
      products.push(node);
    }
    return;
  }

  if (Array.isArray(node)) {
    for (const value of node) collectProducts(value, products, seen);
    return;
  }

  for (const value of Object.values(node)) {
    collectProducts(value, products, seen);
  }
}

function analyze(products) {
  const hosts = new Map();
  const signatures = new Set();
  let imageUrls = 0;

  for (const product of products) {
    const images = Array.isArray(product.images) ? product.images : [];
    signatures.add(images.join('|'));

    for (const image of images) {
      try {
        const host = new URL(String(image)).host.toLowerCase();
        hosts.set(host, (hosts.get(host) || 0) + 1);
        imageUrls += 1;
      } catch {
        // Relative yoki yaroqsiz URL hisobotga kiritilmaydi.
      }
    }
  }

  return {
    productCount: products.length,
    imageUrls,
    uniqueImageSets: signatures.size,
    hosts: [...hosts.entries()].sort((a, b) => b[1] - a[1]),
  };
}

function safeFileName(index, sourcePath) {
  const profile = path
    .relative(CACHE_ROOT, sourcePath)
    .split(path.sep)[0]
    .replace(/[^a-z0-9_-]/gi, '-');
  return `candidate-${String(index).padStart(2, '0')}-${profile}.json`;
}

function main() {
  if (!fs.existsSync(CACHE_ROOT)) {
    throw new Error(`Chrome cache backup topilmadi: ${CACHE_ROOT}`);
  }

  const cacheFiles = walk(CACHE_ROOT);
  console.log(`Tekshirilayotgan cache fayllari: ${cacheFiles.length}`);

  const candidates = [];

  for (const filePath of cacheFiles) {
    const buffer = fs.readFileSync(filePath);
    if (!buffer.includes(Buffer.from('trtCode'))) continue;
    if (!buffer.includes(Buffer.from('images'))) continue;

    const json = parseJsonBuffer(buffer);
    if (!json) continue;

    const products = [];
    collectProducts(json, products, new Set());
    if (products.length < 10) continue;

    candidates.push({
      sourcePath: filePath,
      products,
      analysis: analyze(products),
      modifiedAt: fs.statSync(filePath).mtime.toISOString(),
    });
  }

  candidates.sort((a, b) => {
    const oldA = a.analysis.hosts
      .filter(([host]) => host !== 'backend.trt-parts.com')
      .reduce((sum, [, count]) => sum + count, 0);
    const oldB = b.analysis.hosts
      .filter(([host]) => host !== 'backend.trt-parts.com')
      .reduce((sum, [, count]) => sum + count, 0);
    return (
      oldB - oldA ||
      b.analysis.uniqueImageSets - a.analysis.uniqueImageSets ||
      b.analysis.productCount - a.analysis.productCount
    );
  });

  if (candidates.length === 0) {
    console.log('To‘liq product JSON topilmadi.');
    return;
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const report = [];
  candidates.forEach((candidate, index) => {
    const fileName = safeFileName(index + 1, candidate.sourcePath);
    const outputPath = path.join(OUTPUT_DIR, fileName);
    fs.writeFileSync(
      outputPath,
      JSON.stringify(candidate.products, null, 2),
      'utf8',
    );

    report.push({
      rank: index + 1,
      fileName,
      modifiedAt: candidate.modifiedAt,
      ...candidate.analysis,
    });
  });

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'report.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  );

  console.log(`Topilgan product JSON nusxalari: ${candidates.length}`);
  console.log(`Natija papkasi: ${OUTPUT_DIR}`);
  console.log('');

  for (const item of report.slice(0, 10)) {
    const hosts = item.hosts
      .map(([host, count]) => `${host}: ${count}`)
      .join(', ');
    console.log(
      `${item.fileName}: ${item.productCount} product, ` +
        `${item.uniqueImageSets} xil rasm to'plami, ${item.imageUrls} URL`,
    );
    console.log(`  Domenlar: ${hosts || 'URL yo‘q'}`);
  }
}

try {
  main();
} catch (error) {
  console.error('Xato:', error.message);
  process.exit(1);
}

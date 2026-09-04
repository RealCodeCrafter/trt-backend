/**
 * Bazadagi rasm/fayl URL laridagi eski domenni yangisiga almashtiradi.
 *
 * Qamrov:
 *   - category.imageUrl, category.images
 *   - part.imageUrl, part.images
 *   - catalog_items.photo
 *   - boshqa text/text[]/jsonb ustunlarda /uploads/ yoki /files/view/ URL lar
 *
 * Ishlatish (loyiha ildizida, .env bor joyda):
 *   node scripts/migrate-image-urls.js
 *   node scripts/migrate-image-urls.js --apply
 *
 * Env:
 *   NEW_BASE_URL=https://backend.trt-parts.com
 *   OLD_BASE_URL=https://eski-domen.com   (ixtiyoriy; bo'sh bo'lsa har qanday eski host)
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const DEFAULT_NEW_BASE_URL = 'https://backend.trt-parts.com';

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

function normalizeOrigin(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}

function isMediaUrl(value) {
  if (!value || typeof value !== 'string') return false;
  return /\/uploads\//i.test(value) || /\/files\/view\//i.test(value);
}

function getOrigin(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`.replace(/\/+$/, '');
  } catch {
    const match = String(url).match(/^(https?:\/\/[^/]+)/i);
    return match ? match[1].replace(/\/+$/, '') : '';
  }
}

function rewriteUrl(url, newOrigin, oldOrigins) {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed) || !isMediaUrl(trimmed)) {
    return url;
  }

  const currentOrigin = getOrigin(trimmed);
  if (!currentOrigin) return url;
  if (currentOrigin.toLowerCase() === newOrigin.toLowerCase()) return url;

  if (oldOrigins.length > 0) {
    const allowed = oldOrigins.some(
      (origin) => origin.toLowerCase() === currentOrigin.toLowerCase(),
    );
    if (!allowed) return url;
  }

  try {
    const parsed = new URL(trimmed);
    return `${newOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return trimmed.replace(/^(https?:\/\/)[^/]+/i, newOrigin);
  }
}

function rewriteValue(value, newOrigin, oldOrigins) {
  if (value == null) {
    return { next: value, changed: false, samples: [] };
  }

  if (Array.isArray(value)) {
    const samples = [];
    const next = value.map((item) => {
      if (typeof item !== 'string') return item;
      const rewritten = rewriteUrl(item, newOrigin, oldOrigins);
      if (rewritten !== item) {
        samples.push({ from: item, to: rewritten });
      }
      return rewritten;
    });
    return { next, changed: samples.length > 0, samples };
  }

  if (typeof value === 'string') {
    const next = rewriteUrl(value, newOrigin, oldOrigins);
    if (next === value) {
      return { next: value, changed: false, samples: [] };
    }
    return { next, changed: true, samples: [{ from: value, to: next }] };
  }

  return { next: value, changed: false, samples: [] };
}

function rewriteJsonValue(value, newOrigin, oldOrigins) {
  if (value == null) {
    return { next: value, changed: false, samples: [] };
  }

  const samples = [];

  const walk = (node) => {
    if (typeof node === 'string') {
      const next = rewriteUrl(node, newOrigin, oldOrigins);
      if (next !== node) {
        samples.push({ from: node, to: next });
      }
      return next;
    }
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (node && typeof node === 'object') {
      const out = {};
      for (const [key, val] of Object.entries(node)) {
        out[key] = walk(val);
      }
      return out;
    }
    return node;
  };

  const next = walk(value);
  return { next, changed: samples.length > 0, samples };
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function parseOldOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);
}

async function getPublicColumns(client) {
  const { rows } = await client.query(`
    SELECT c.table_name, c.column_name, c.data_type, c.udt_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND (
        c.data_type IN ('text', 'character varying', 'json', 'jsonb')
        OR c.udt_name IN ('_text', '_varchar')
      )
    ORDER BY c.table_name, c.ordinal_position
  `);
  return rows;
}

function pickTable(tables, candidates) {
  const set = new Set(tables);
  return candidates.find((name) => set.has(name)) || null;
}

function pickColumn(columns, tableName, candidates) {
  const names = columns
    .filter((col) => col.table_name === tableName)
    .map((col) => col.column_name);
  const set = new Set(names);
  return candidates.find((name) => set.has(name)) || null;
}

function getPkColumn(columns, tableName) {
  const names = columns
    .filter((col) => col.table_name === tableName)
    .map((col) => col.column_name);
  return names.includes('id') ? 'id' : names[0];
}

function columnMeta(columns, tableName, columnName) {
  return columns.find(
    (col) => col.table_name === tableName && col.column_name === columnName,
  );
}

function isArrayColumn(meta) {
  return Boolean(meta && (meta.data_type === 'ARRAY' || meta.udt_name.startsWith('_')));
}

function isJsonColumn(meta) {
  return Boolean(meta && (meta.data_type === 'json' || meta.data_type === 'jsonb'));
}

async function migrateColumn(client, options) {
  const {
    tableName,
    columnName,
    pkColumn,
    meta,
    newOrigin,
    oldOrigins,
    apply,
  } = options;

  const tableSql = quoteIdent(tableName);
  const columnSql = quoteIdent(columnName);
  const pkSql = quoteIdent(pkColumn);

  const mediaFilter = `(
    CAST(${columnSql} AS text) ILIKE '%/uploads/%'
    OR CAST(${columnSql} AS text) ILIKE '%/files/view/%'
  )`;
  const whereSql = isArrayColumn(meta)
    ? `${columnSql} IS NOT NULL AND cardinality(${columnSql}) > 0 AND ${mediaFilter}`
    : `${columnSql} IS NOT NULL AND CAST(${columnSql} AS text) <> '' AND ${mediaFilter}`;

  const { rows } = await client.query(
    `SELECT ${pkSql} AS id, ${columnSql} AS value FROM ${tableSql} WHERE ${whereSql}`,
  );

  let updated = 0;
  const samples = [];
  const hosts = new Set();

  for (const row of rows) {
    const result = isJsonColumn(meta)
      ? rewriteJsonValue(row.value, newOrigin, oldOrigins)
      : rewriteValue(row.value, newOrigin, oldOrigins);

    if (!result.changed) continue;

    updated += 1;
    for (const sample of result.samples) {
      const fromHost = getOrigin(sample.from);
      if (fromHost) hosts.add(fromHost);
      if (samples.length < 8) samples.push(sample);
    }

    if (apply) {
      await client.query(
        `UPDATE ${tableSql} SET ${columnSql} = $1 WHERE ${pkSql} = $2`,
        [result.next, row.id],
      );
    }
  }

  return {
    table: tableName,
    column: columnName,
    scanned: rows.length,
    updated,
    hosts: [...hosts],
    samples,
  };
}

function printReport(results, apply) {
  console.log(apply ? '\nYozildi:' : '\nDry-run (bazaga yozilmadi):');
  for (const item of results) {
    if (item.scanned === 0 && item.updated === 0) continue;
    console.log(
      `  ${item.table}.${item.column}: ${item.scanned} qator, ${item.updated} yangilanadi` +
        (item.hosts.length ? ` [${item.hosts.join(', ')}]` : ''),
    );
    for (const sample of item.samples.slice(0, 3)) {
      console.log(`    - ${sample.from}`);
      console.log(`      -> ${sample.to}`);
    }
  }
}

async function main() {
  const apply = process.argv.includes('--apply');

  loadEnvFile(ENV_PATH);

  const newOrigin = normalizeOrigin(
    process.env.NEW_BASE_URL || DEFAULT_NEW_BASE_URL,
  );
  const oldOrigins = parseOldOrigins(process.env.OLD_BASE_URL);

  if (!/^https?:\/\//i.test(newOrigin)) {
    throw new Error('NEW_BASE_URL http(s) bilan boshlanishi kerak');
  }

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

  console.log('Rasm URL migratsiyasi boshlandi...');
  console.log(`Yangi domen: ${newOrigin}`);
  console.log(
    oldOrigins.length
      ? `Eski domen(lar): ${oldOrigins.join(', ')}`
      : 'Eski domen: avtomatik (/uploads/ va /files/view/ URL lar)',
  );
  console.log(apply ? 'Rejim: --apply (bazaga yoziladi)' : 'Rejim: dry-run');

  await client.connect();

  try {
    const columns = await getPublicColumns(client);
    const tables = [...new Set(columns.map((col) => col.table_name))];

    const categoryTable = pickTable(tables, ['category', 'categories']);
    const partTable = pickTable(tables, ['part', 'parts']);
    const catalogTable = pickTable(tables, ['catalog_items', 'catalog_item']);

    const targets = [];

    if (categoryTable) {
      const imageUrl = pickColumn(columns, categoryTable, ['imageUrl', 'image_url']);
      const images = pickColumn(columns, categoryTable, ['images']);
      if (imageUrl) targets.push({ table: categoryTable, column: imageUrl });
      if (images) targets.push({ table: categoryTable, column: images });
    }

    if (partTable) {
      const imageUrl = pickColumn(columns, partTable, ['imageUrl', 'image_url']);
      const images = pickColumn(columns, partTable, ['images']);
      if (imageUrl) targets.push({ table: partTable, column: imageUrl });
      if (images) targets.push({ table: partTable, column: images });
    }

    if (catalogTable) {
      const photo = pickColumn(columns, catalogTable, ['photo', 'imageUrl', 'image_url']);
      if (photo) targets.push({ table: catalogTable, column: photo });
    }

    const extraTargets = columns
      .filter((col) => {
        const already = targets.some(
          (item) => item.table === col.table_name && item.column === col.column_name,
        );
        if (already) return false;
        return /image|photo|file|url/i.test(col.column_name);
      })
      .map((col) => ({ table: col.table_name, column: col.column_name }));

    const allTargets = [...targets];
    for (const extra of extraTargets) {
      if (
        !allTargets.some(
          (item) => item.table === extra.table && item.column === extra.column,
        )
      ) {
        allTargets.push(extra);
      }
    }

    if (allTargets.length === 0) {
      throw new Error('Yangilash uchun rasm ustunlari topilmadi');
    }

    if (apply) {
      await client.query('BEGIN');
    }

    try {
      const results = [];
      for (const target of allTargets) {
        const meta = columnMeta(columns, target.table, target.column);
        const pkColumn = getPkColumn(columns, target.table);
        const result = await migrateColumn(client, {
          tableName: target.table,
          columnName: target.column,
          pkColumn,
          meta,
          newOrigin,
          oldOrigins,
          apply,
        });
        results.push(result);
      }

      if (apply) {
        await client.query('COMMIT');
      }

      printReport(results, apply);

      const totalUpdated = results.reduce((sum, item) => sum + item.updated, 0);
      console.log(`\nJami: ${totalUpdated} yozuv ${apply ? 'yangilandi' : 'yangilanadi'}.`);
      if (!apply) {
        console.log('Bazaga yozish uchun: node scripts/migrate-image-urls.js --apply');
      } else {
        console.log('Tayyor. .env dagi BASE_URL ham https://backend.trt-parts.com bo\'lishi kerak.');
      }
    } catch (err) {
      if (apply) {
        await client.query('ROLLBACK');
      }
      throw err;
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Xato:', err.message);
  process.exit(1);
});

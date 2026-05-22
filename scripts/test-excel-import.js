const fs = require('fs');
const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', '5 позиц.xlsx');
const buffer = fs.readFileSync(filePath);
const workbook = XLSX.read(buffer, { type: 'buffer' });
const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
  header: 1,
  defval: '',
  raw: false,
});

const looksLikeTrt = (v) => /^R[0-9A-Z]{2,}$/i.test((v || '').split(/\r?\n/)[0].trim());
let columnMap = null;
const items = [];

for (let rowIndex = 0; rowIndex < matrix.length; rowIndex++) {
  const row = matrix[rowIndex] || [];
  const labels = row.map((c) => String(c).replace(/\s+/g, ' ').trim().toUpperCase());
  const isHeader = labels.some((l) => l.includes('TRT')) && labels.some((l) => l.includes('OEM')) && labels.some((l) => l.includes('ENGLISH NAME'));
  if (isHeader) {
    columnMap = {};
    row.forEach((cell, i) => {
      const l = String(cell).replace(/\s+/g, ' ').trim().toUpperCase();
      if (l.includes('TRT') && l.includes('OEM')) return;
      if (l.includes('TRT')) columnMap.trt = i;
      if (l.includes('OEM')) columnMap.oem = i;
      if (l.includes('ENGLISH NAME')) columnMap.en = i;
    });
    console.log('header row', rowIndex + 1, columnMap);
    continue;
  }
  if (!columnMap || row.every((c) => !String(c).trim())) continue;
  const trt = String(row[columnMap.trt] || '').trim();
  const oem = String(row[columnMap.oem] || '').trim();
  const en = String(row[columnMap.en] || '').trim();
  if (!trt || trt.includes('TRT №')) continue;
  let trtNo = trt;
  if (!looksLikeTrt(trtNo) && looksLikeTrt(oem)) [trtNo] = [oem.split(/\r?\n/)[0]];
  if (!looksLikeTrt(trtNo)) continue;
  items.push({ row: rowIndex + 1, trtNo, en });
}

console.log('items', items);

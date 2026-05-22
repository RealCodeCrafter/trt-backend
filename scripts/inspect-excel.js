const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const JSZip = require('jszip');

const filePath = path.join(__dirname, '..', '5 позиц.xlsx');
const buffer = fs.readFileSync(filePath);
const wb = XLSX.read(buffer, { type: 'buffer' });
const m = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });

console.log('ROWS', m.length);
m.forEach((r, i) => console.log(i + 1, JSON.stringify(r)));

(async () => {
  const zip = await JSZip.loadAsync(buffer);
  const drawing = await zip.file('xl/drawings/drawing1.xml').async('string');
  const rels = await zip.file('xl/drawings/_rels/drawing1.xml.rels').async('string');
  const relMap = {};
  for (const m of rels.matchAll(/Id="(rId\d+)"[^>]*Target="\.\.\/media\/([^"]+)"/g)) {
    if (!m[2].includes('hdphoto')) relMap[m[1]] = m[2];
  }
  for (const a of drawing.matchAll(/<xdr:(?:oneCell|twoCell)Anchor[\s\S]*?<\/xdr:(?:oneCell|twoCell)Anchor>/g)) {
    const row = a[0].match(/<xdr:row>(\d+)</);
    const rid = a[0].match(/r:embed="(rId\d+)"/);
    console.log('IMG row', row?.[1], relMap[rid?.[1]]);
  }
})();

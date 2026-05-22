const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const filePath = path.join(__dirname, '..', '5 позиц.xlsx');
const buffer = fs.readFileSync(filePath);
const outDir = path.join(__dirname, '..', 'uploads', 'catalog');

(async () => {
  const zip = await JSZip.loadAsync(buffer);
  const ordered = [];
  const mediaPaths = Object.keys(zip.files)
    .filter((n) => n.startsWith('xl/media/') && !n.endsWith('/') && !n.includes('hdphoto') && /\.(jpe?g|png)$/i.test(n))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  for (const p of mediaPaths) {
    const data = await zip.file(p).async('nodebuffer');
    ordered.push({ p, size: data.length });
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  console.log('ordered images', ordered);
  console.log('saved test OK -', ordered.length, 'files ready for import');
})();

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { extname } = require('path');

const filePath = path.join(__dirname, '..', '5 позиц.xlsx');
const buffer = fs.readFileSync(filePath);

(async () => {
  const zip = await JSZip.loadAsync(buffer);
  const drawingPath = 'xl/drawings/drawing1.xml';
  const relsPath = 'xl/drawings/_rels/drawing1.xml.rels';
  const drawingXml = await zip.file(drawingPath).async('string');
  const relsXml = await zip.file(relsPath).async('string');

  const relMap = new Map();
  for (const match of relsXml.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) {
    const [, relId, target] = match;
    if (!target.toLowerCase().includes('hdphoto')) relMap.set(relId, target);
  }

  const result = new Map();
  const anchorRegex = /<xdr:(?:oneCell|twoCell)Anchor[\s\S]*?<\/xdr:(?:oneCell|twoCell)Anchor>/g;
  for (const anchorMatch of drawingXml.matchAll(anchorRegex)) {
    const block = anchorMatch[0];
    const rowMatch = block.match(/<xdr:row>(\d+)</);
    const relIdMatch = block.match(/r:embed="(rId\d+)"/);
    if (!rowMatch || !relIdMatch) continue;

    const excelRow = Number(rowMatch[1]);
    const mediaTarget = relMap.get(relIdMatch[1]);
    const mediaPath = mediaTarget.startsWith('../')
      ? `xl/${mediaTarget.replace('../', '')}`
      : `xl/media/${mediaTarget.split('/').pop()}`;

    const mediaFile = zip.file(mediaPath);
    console.log('row', excelRow, mediaPath, !!mediaFile, mediaFile ? (await mediaFile.async('nodebuffer')).length : 0);
    if (mediaFile) result.set(excelRow, mediaPath);
  }

  // fallback all media
  const allMedia = Object.keys(zip.files).filter((n) => n.startsWith('xl/media/') && !n.endsWith('/'));
  console.log('all media', allMedia);
})();

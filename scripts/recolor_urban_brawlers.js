// Перекраска спрайтов Urban Brawlers (batting_girl/brute_arms/bancho) —
// генерирует по 6 доп. вариантов (v2..v7) для каждого силуэта, тем же
// принципом, что и 7 перекрасок brawler_girl/enemy_punk: цвет одежды/обуви/
// волос сдвигается по HSL-оттенку, кожа и близкие к серому/белому/чёрному
// пиксели (контуры, блики) не трогаются. Чистый Node, без внешних
// зависимостей — свой минимальный PNG-декодер/энкодер поверх zlib.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---- CRC32 ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- PNG decode (colorType 6 RGBA, bitDepth 8, no interlace — все наши файлы такие) ----
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let offset = 8;
  let width, height, bitDepth, colorType;
  const idatChunks = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.slice(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      if (bitDepth !== 8 || colorType !== 6) throw new Error(`unsupported PNG format bitDepth=${bitDepth} colorType=${colorType}`);
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 8 + len + 4; // data + CRC
  }
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const bpp = 4; // RGBA8
  const stride = width * bpp;
  const pixels = Buffer.alloc(height * stride);
  let rawOff = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOff]; rawOff += 1;
    const rowStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rawOff + x];
      const a = x >= bpp ? pixels[rowStart + x - bpp] : 0;
      const b = y > 0 ? pixels[rowStart - stride + x] : 0;
      const c = (x >= bpp && y > 0) ? pixels[rowStart - stride + x - bpp] : 0;
      let val;
      switch (filterType) {
        case 0: val = rawByte; break;
        case 1: val = rawByte + a; break;
        case 2: val = rawByte + b; break;
        case 3: val = rawByte + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          val = rawByte + pr;
          break;
        }
        default: throw new Error('bad filter type ' + filterType);
      }
      pixels[rowStart + x] = val & 0xff;
    }
    rawOff += stride;
  }
  return { width, height, pixels };
}

// ---- PNG encode (colorType 6, bitDepth 8, filter None) ----
function encodePNG(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type None
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idatData = zlib.deflateSync(raw, { level: 9 });

  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);   // bit depth
  ihdr.writeUInt8(6, 9);   // color type RGBA
  ihdr.writeUInt8(0, 10);  // compression
  ihdr.writeUInt8(0, 11);  // filter
  ihdr.writeUInt8(0, 12);  // interlace

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- HSL ----
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return [h, s, l];
}
function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// пиксель "не трогаем", если он почти серый/белый/чёрный (контуры, блики,
// обводки) или похож на тон кожи. Диапазон кожи замерен по факту (гистограмма
// пикселей всех трёх персонажей) — общая пара цветов на весь пак: светлая
// кожа rgb(251,187,167)=hsl(14°,91%,82%) и тень rgb(205,106,116)=hsl(354°,
// 50%,61%). Диапазон узкий (0-25° и 350-360°), а не 0-45° — при 0-45° под
// него попадали и волосы (у batting_girl тёмно-золотые ~42°, у bancho рыжие
// ~8° — вот они как раз остаются нетронутыми, это компромисс: важнее не
// перекрасить кожу, чем гарантированно перекрасить волосы)
function shouldPreserve(h, s, l) {
  if (s < 0.15) return true; // почти ахроматичный — контур/блик/тень
  const hueIsSkin = (h >= 350 || h <= 25);
  if (hueIsSkin && s >= 0.35 && l >= 0.2 && l <= 0.95) return true;
  return false;
}

function recolorBuffer(pixels, hueOffset) {
  const out = Buffer.from(pixels);
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3];
    if (a === 0) continue;
    const [h, s, l] = rgbToHsl(out[i], out[i + 1], out[i + 2]);
    if (shouldPreserve(h, s, l)) continue;
    const [r2, g2, b2] = hslToRgb(h + hueOffset, s, l);
    out[i] = r2; out[i + 1] = g2; out[i + 2] = b2;
  }
  return out;
}

// ---- обход файлов ----
const VARIANTS = [
  { suffix: 'v2_yellowgreen', hue: 360 / 7 * 1 },
  { suffix: 'v3_green',       hue: 360 / 7 * 2 },
  { suffix: 'v4_teal',        hue: 360 / 7 * 3 },
  { suffix: 'v5_blue',        hue: 360 / 7 * 4 },
  { suffix: 'v6_purple',      hue: 360 / 7 * 5 },
  { suffix: 'v7_pink',        hue: 360 / 7 * 6 },
];

const ROOT = path.join(__dirname, '..', 'client', 'sprites', 'urban_brawlers');
const CHARACTERS = ['batting_girl', 'brute_arms', 'bancho'];

function walkPngFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkPngFiles(full));
    else if (entry.name.toLowerCase().endsWith('.png')) out.push(full);
  }
  return out;
}

let totalWritten = 0;
for (const charName of CHARACTERS) {
  const srcDir = path.join(ROOT, charName);
  const files = walkPngFiles(srcDir);
  for (const variant of VARIANTS) {
    const dstDir = path.join(ROOT, `${charName}_${variant.suffix}`);
    for (const srcFile of files) {
      const rel = path.relative(srcDir, srcFile);
      const dstFile = path.join(dstDir, rel);
      fs.mkdirSync(path.dirname(dstFile), { recursive: true });
      const { width, height, pixels } = decodePNG(fs.readFileSync(srcFile));
      const recolored = recolorBuffer(pixels, variant.hue);
      fs.writeFileSync(dstFile, encodePNG(width, height, recolored));
      totalWritten++;
    }
  }
  console.log(`${charName}: ${files.length} frames x 6 variants done`);
}
console.log('Total files written:', totalWritten);

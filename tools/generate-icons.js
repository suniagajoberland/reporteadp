const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT_DIR = path.join(__dirname, "..", "icons");

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// 5x7 font for E, E, P
const FONT = {
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
};

const TEXT = ["E", "E", "P"];
const GAP = 1; // columns between letters
const TEXT_COLS = TEXT.length * 5 + (TEXT.length - 1) * GAP;
const TEXT_ROWS = 7;

function glyphAt(col, row) {
  let c = col;
  for (const ch of TEXT) {
    if (c < 5) return FONT[ch][row][c] === "1";
    c -= 5 + GAP;
    if (c < 0) return false;
  }
  return false;
}

// Blue palette: vertical gradient from #2563eb to #1e3a8a
const TOP = [0x25, 0x63, 0xeb];
const BOTTOM = [0x1e, 0x3a, 0x8a];
const WHITE = [255, 255, 255];

const SAMPLES = 4; // 4x4 supersampling for antialiasing

function generateIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);

  // Text block occupies ~62% width, ~36% height, centered (inside maskable safe zone)
  const textW = size * 0.62;
  const textH = size * 0.36;
  const x0 = (size - textW) / 2;
  const y0 = (size - textH) / 2;
  const cellW = textW / TEXT_COLS;
  const cellH = textH / TEXT_ROWS;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const px = x + (sx + 0.5) / SAMPLES;
          const py = y + (sy + 0.5) / SAMPLES;
          let col = [0, 0, 0];

          const t = py / size;
          col = [
            Math.round(TOP[0] + (BOTTOM[0] - TOP[0]) * t),
            Math.round(TOP[1] + (BOTTOM[1] - TOP[1]) * t),
            Math.round(TOP[2] + (BOTTOM[2] - TOP[2]) * t),
          ];

          const inText =
            px >= x0 && px < x0 + textW && py >= y0 && py < y0 + textH;
          if (inText) {
            const c = Math.floor((px - x0) / cellW);
            const rr = Math.floor((py - y0) / cellH);
            if (c >= 0 && c < TEXT_COLS && rr >= 0 && rr < TEXT_ROWS && glyphAt(c, rr)) {
              col = WHITE;
            }
          }

          r += col[0];
          g += col[1];
          b += col[2];
          a += 255;
        }
      }
      const n = SAMPLES * SAMPLES;
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = Math.round(a / n);
    }
  }
  return encodePNG(size, size, rgba);
}

const targets = [
  ["icon-512.png", 512],
  ["icon-192.png", 192],
  ["apple-touch-icon.png", 180],
  ["favicon-32.png", 32],
  ["favicon-16.png", 16],
];

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, size] of targets) {
  fs.writeFileSync(path.join(OUT_DIR, name), generateIcon(size));
  console.log("generado:", name, size + "x" + size);
}

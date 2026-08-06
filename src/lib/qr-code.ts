/**
 * Minimal QR Code generator (Model 2, byte mode, ECC level M).
 * Uses only standard web APIs — no external packages.
 * Based on the public-domain QR algorithm (ISO/IEC 18004).
 */

const ECC_PER_BLOCK: Record<number, number[]> = {
  1: [7, 10, 13, 17],
  2: [10, 16, 22, 28],
  3: [15, 26, 36, 44],
  4: [20, 36, 52, 64],
  5: [26, 48, 72, 88],
  6: [36, 64, 96, 112],
  7: [40, 72, 108, 130],
  8: [48, 88, 132, 156],
  9: [60, 110, 160, 192],
  10: [72, 130, 192, 224],
};

const NUM_BLOCKS: Record<number, number[]> = {
  1: [1, 1, 1, 1],
  2: [1, 1, 1, 1],
  3: [1, 1, 2, 2],
  4: [1, 2, 2, 4],
  5: [1, 2, 2, 2],
  6: [2, 4, 4, 4],
  7: [2, 4, 6, 6],
  8: [2, 4, 6, 6],
  9: [2, 4, 6, 8],
  10: [2, 4, 6, 8],
};

const DATA_CAPACITY: Record<number, number[]> = {
  1: [17, 14, 11, 7],
  2: [32, 26, 20, 14],
  3: [53, 42, 32, 24],
  4: [78, 62, 46, 34],
  5: [106, 84, 60, 44],
  6: [134, 106, 74, 58],
  7: [154, 122, 86, 64],
  8: [192, 152, 108, 84],
  9: [230, 180, 130, 98],
  10: [271, 213, 151, 119],
};

const VERSION_SIZE: Record<number, number> = {
  1: 21, 2: 25, 3: 29, 4: 33, 5: 37,
  6: 41, 7: 45, 8: 49, 9: 53, 10: 57,
};

const ECC_LEVEL = 1; // M

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  let p = 0;
  let x = a;
  let y = b;
  while (y > 0) {
    if (y & 1) p ^= x;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
    y >>= 1;
  }
  return p;
}

function rsGenerator(nsym: number): number[] {
  const gen = [1];
  for (let i = 0; i < nsym; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], 1 << i);
    }
    for (let j = 0; j < next.length; j++) gen[j] = next[j] ?? 0;
    while (gen.length < next.length) gen.push(next[gen.length] ?? 0);
  }
  return gen.slice(0, nsym + 1);
}

function rsEncode(data: number[], nsym: number): number[] {
  const gen = rsGenerator(nsym);
  const parity = new Array(nsym).fill(0);
  for (const byte of data) {
    const factor = byte ^ parity[0];
    parity.shift();
    parity.push(0);
    for (let i = 0; i < nsym; i++) {
      parity[i] ^= gfMul(gen[i + 1] ?? 0, factor);
    }
  }
  return parity;
}

function pickVersion(byteLen: number): number {
  for (let v = 1; v <= 10; v++) {
    if (byteLen <= (DATA_CAPACITY[v]?.[ECC_LEVEL] ?? 0)) return v;
  }
  return 10;
}

function encodeData(text: string): number[] {
  const bytes = new TextEncoder().encode(text);
  const version = pickVersion(bytes.length + 3);
  const capacity = DATA_CAPACITY[version]?.[ECC_LEVEL] ?? 0;
  const bits: number[] = [];

  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  pushBits(0b0100, 4);
  pushBits(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) pushBits(b, 8);

  const totalDataBits = capacity * 8;
  pushBits(0, Math.min(4, totalDataBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] ?? 0);
    dataBytes.push(byte);
  }
  let pad = 0xec;
  while (dataBytes.length < capacity) {
    dataBytes.push(pad);
    pad = pad === 0xec ? 0x11 : 0xec;
  }

  const eccCount = ECC_PER_BLOCK[version]?.[ECC_LEVEL] ?? 10;
  const blockCount = NUM_BLOCKS[version]?.[ECC_LEVEL] ?? 1;
  const shortBlockLen = Math.floor(capacity / blockCount);
  const longBlocks = capacity % blockCount;
  const blocks: number[][] = [];
  let offset = 0;
  for (let i = 0; i < blockCount; i++) {
    const len = shortBlockLen + (i < longBlocks ? 1 : 0);
    const block = dataBytes.slice(offset, offset + len);
    offset += len;
    blocks.push([...block, ...rsEncode(block, eccCount)]);
  }

  const result: number[] = [];
  const maxDataLen = shortBlockLen + (longBlocks > 0 ? 1 : 0);
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of blocks) {
      if (i < block.length - eccCount) result.push(block[i] ?? 0);
    }
  }
  for (let i = 0; i < eccCount; i++) {
    for (const block of blocks) result.push(block[maxDataLen + i] ?? block[block.length - eccCount + i] ?? 0);
  }
  return result;
}

function createMatrix(version: number): (boolean | null)[][] {
  const size = VERSION_SIZE[version] ?? 21;
  return Array.from({ length: size }, () => Array(size).fill(null));
}

function setModule(m: (boolean | null)[][], r: number, c: number, val: boolean) {
  if (m[r]?.[c] === null) m[r]![c] = val;
}

function addFinder(m: (boolean | null)[][], row: number, col: number) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue;
      if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
        const isBlack =
          r === 0 || r === 6 || c === 0 || c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        setModule(m, rr, cc, isBlack);
      } else if (r === 7 || c === 7) {
        setModule(m, rr, cc, false);
      }
    }
  }
}

function addAlignment(m: (boolean | null)[][], row: number, col: number) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const isBlack =
        Math.abs(r) === 2 || Math.abs(c) === 2 ||
        (r === 0 && c === 0);
      setModule(m, row + r, col + c, isBlack);
    }
  }
}

function addTiming(m: (boolean | null)[][]) {
  const size = m.length;
  for (let i = 8; i < size - 8; i++) {
    setModule(m, 6, i, i % 2 === 0);
    setModule(m, i, 6, i % 2 === 0);
  }
}

function addFormatInfo(m: (boolean | null)[][], mask: number) {
  const size = m.length;
  const format = 0x5412 ^ mask;
  for (let i = 0; i < 15; i++) {
    const bit = ((format >> i) & 1) === 1;
    if (i < 6) setModule(m, 8, i, bit);
    else if (i === 6) setModule(m, 8, 7, bit);
    else if (i < 8) setModule(m, 14 - i, 8, bit);
    else setModule(m, size - 1 - (i - 8), 8, bit);

    if (i < 8) setModule(m, 8, size - 1 - i, bit);
    else if (i === 8) setModule(m, 8, 8, bit);
    else setModule(m, 8, 15 - i, bit);
  }
  setModule(m, size - 8, 8, true);
}

function maskFunc(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

function placeData(m: (boolean | null)[][], data: number[], mask: number) {
  const size = m.length;
  let bitIdx = 0;
  let dir = -1;
  let col = size - 1;

  while (col > 0) {
    if (col === 6) col--;
    for (let row = dir === -1 ? size - 1 : 0; dir === -1 ? row >= 0 : row < size; row += dir) {
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (m[row]?.[cc] !== null) continue;
        const byteIdx = Math.floor(bitIdx / 8);
        const bit = byteIdx < data.length
          ? ((data[byteIdx] ?? 0) >> (7 - (bitIdx % 8))) & 1
          : 0;
        bitIdx++;
        let val = bit === 1;
        if (maskFunc(mask, row, cc)) val = !val;
        setModule(m, row, cc, val);
      }
    }
    dir = -dir;
    col -= 2;
  }
}

function buildMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const version = pickVersion(bytes.length + 3);
  const data = encodeData(text);
  const m = createMatrix(version);
  const size = m.length;

  addFinder(m, 0, 0);
  addFinder(m, 0, size - 7);
  addFinder(m, size - 7, 0);
  addTiming(m);

  if (version >= 7) {
    // Version info omitted for v1-6; v7+ would need version patterns
  }

  const ALIGNMENT: Record<number, number[]> = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  };
  const positions = ALIGNMENT[version] ?? [];
  for (const row of positions) {
    for (const col of positions) {
      if ((row === 6 && col === 6) || (row === 6 && col === size - 7) || (row === size - 7 && col === 6)) continue;
      addAlignment(m, row, col);
    }
  }

  const mask = 0;
  placeData(m, data, mask);
  addFormatInfo(m, mask);

  return m.map((row) => row.map((cell) => cell === true));
}

export function getAssetScanUrl(assetId: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/scan/asset/${assetId}`;
  }
  return `/scan/asset/${assetId}`;
}

export function generateQrSvg(text: string, moduleSize = 4, quietZone = 4): string {
  const matrix = buildMatrix(text);
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const width = (cols + quietZone * 2) * moduleSize;
  const height = (rows + quietZone * 2) * moduleSize;

  let rects = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (matrix[r]?.[c]) {
        const x = (c + quietZone) * moduleSize;
        const y = (r + quietZone) * moduleSize;
        rects += `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}

export function drawQrToCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  size = 200
): void {
  const matrix = buildMatrix(text);
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const quietZone = 4;
  const totalModules = Math.max(rows, cols) + quietZone * 2;
  const moduleSize = size / totalModules;

  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000000";

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (matrix[r]?.[c]) {
        ctx.fillRect(
          (c + quietZone) * moduleSize,
          (r + quietZone) * moduleSize,
          moduleSize,
          moduleSize
        );
      }
    }
  }
}

export function downloadQrSvg(text: string, filename = "asset-qr.svg"): void {
  const svg = generateQrSvg(text);
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

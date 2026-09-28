import { deflateSync, inflateSync } from 'node:zlib';

/**
 * Just enough PNG for comparing browser screenshots: 8-bit RGB or RGBA,
 * not interlaced - what Chromium writes. Kept dependency-free on purpose.
 */
export interface Image { width: number; height: number; data: Uint8Array }

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function decodePng(file: Buffer): Image {
  if (!file.subarray(0, 8).equals(SIGNATURE)) throw new Error('Not a PNG file.');
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('latin1', offset + 4, offset + 8);
    const body = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const [depth, colorType, , , interlace] = [body[8], body[9], body[10], body[11], body[12]];
      if (depth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2)) {
        throw new Error(`Unsupported PNG (depth ${depth}, colour type ${colorType}, interlace ${interlace}).`);
      }
      channels = colorType === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(width * height * 4);
  const previous = new Uint8Array(stride);
  const current = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? current[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const [a, b, c] = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upLeft)];
        predictor = a <= b && a <= c ? left : b <= c ? up : upLeft;
      }
      current[x] = (line[x] + predictor) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const target = (y * width + x) * 4;
      pixels[target] = current[x * channels];
      pixels[target + 1] = current[x * channels + 1];
      pixels[target + 2] = current[x * channels + 2];
      pixels[target + 3] = channels === 4 ? current[x * channels + 3] : 255;
    }
    previous.set(current);
  }
  return { width, height, data: pixels };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

/** RGBA, no filtering. Used for tests and for diff images a person looks at. */
export function encodePng(image: Image): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((image.width * 4 + 1) * image.height);
  for (let y = 0; y < image.height; y++) {
    raw[y * (image.width * 4 + 1)] = 0;
    raw.set(image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4), y * (image.width * 4 + 1) + 1);
  }
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export interface Difference {
  /** Pixels whose colour moved by more than the tolerance on any channel. */
  changed: number;
  total: number;
  /** Smallest rectangle holding every changed pixel, or null when nothing changed. */
  box: { x: number; y: number; width: number; height: number } | null;
  sizeChanged: boolean;
}

/**
 * `tolerance` absorbs anti-aliasing and colour rounding; a real style change
 * moves channels far more than that.
 */
export function compareImages(a: Image, b: Image, tolerance = 16): Difference {
  if (a.width !== b.width || a.height !== b.height) {
    return { changed: Math.max(a.width * a.height, b.width * b.height), total: Math.max(a.width * a.height, b.width * b.height), box: null, sizeChanged: true };
  }
  let changed = 0;
  let [minX, minY, maxX, maxY] = [a.width, a.height, -1, -1];
  for (let i = 0; i < a.data.length; i += 4) {
    if (Math.abs(a.data[i] - b.data[i]) > tolerance || Math.abs(a.data[i + 1] - b.data[i + 1]) > tolerance
      || Math.abs(a.data[i + 2] - b.data[i + 2]) > tolerance || Math.abs(a.data[i + 3] - b.data[i + 3]) > tolerance) {
      changed++;
      const x = (i / 4) % a.width;
      const y = Math.floor(i / 4 / a.width);
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  return {
    changed,
    total: a.width * a.height,
    box: changed ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null,
    sizeChanged: false,
  };
}

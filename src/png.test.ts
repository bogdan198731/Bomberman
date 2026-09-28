import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { compareImages, decodePng, encodePng, type Image } from './png.js';

function solid(width: number, height: number, rgba: [number, number, number, number]): Image {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { width, height, data };
}

test('encode and decode round-trip exactly', () => {
  const image = solid(5, 3, [10, 200, 30, 255]);
  image.data.set([1, 2, 3, 4], 4 * 7);
  const decoded = decodePng(encodePng(image));
  assert.equal(decoded.width, 5);
  assert.equal(decoded.height, 3);
  assert.deepEqual([...decoded.data], [...image.data]);
});

test('every PNG row filter decodes to the same pixels', () => {
  // Hand-built 3x2 RGB image, one row per filter type the decoder must undo.
  const rows = [[255, 0, 0, 0, 255, 0, 0, 0, 255], [10, 20, 30, 40, 50, 60, 70, 80, 90]];
  const expected = rows.flatMap(row => [row.slice(0, 3), row.slice(3, 6), row.slice(6, 9)].flatMap(px => [...px, 255]));
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c;
    const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  const encodeRow = (filter: number, row: number[], prior: number[]) => [filter, ...row.map((value, x) => {
    const left = x >= 3 ? row[x - 3] : 0;
    const up = prior[x];
    const upLeft = x >= 3 ? prior[x - 3] : 0;
    const predictor = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter];
    return (value - predictor) & 0xff;
  })];
  for (const filter of [0, 1, 2, 3, 4]) {
    const raw = Buffer.from([...encodeRow(filter, rows[0], [0, 0, 0, 0, 0, 0, 0, 0, 0]), ...encodeRow(filter, rows[1], rows[0])]);
    const header = Buffer.alloc(13);
    header.writeUInt32BE(3, 0);
    header.writeUInt32BE(2, 4);
    header.set([8, 2, 0, 0, 0], 8);
    // Reuse the encoder's chunk framing by swapping in this IHDR and IDAT.
    const reference = encodePng(solid(3, 2, [0, 0, 0, 255]));
    const withChunks = Buffer.concat([
      reference.subarray(0, 8),
      frame('IHDR', header),
      frame('IDAT', deflateSync(raw)),
      frame('IEND', Buffer.alloc(0)),
    ]);
    assert.deepEqual([...decodePng(withChunks).data], expected, `filter ${filter}`);
  }
});

function frame(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  // The decoder does not verify CRCs, so a placeholder is enough here.
  return Buffer.concat([head, body, Buffer.alloc(4)]);
}

test('comparison ignores anti-aliasing noise and boxes real changes', () => {
  const before = solid(10, 10, [20, 30, 40, 255]);
  const noisy = { ...before, data: before.data.map((value, i) => (i % 4 === 3 ? value : Math.min(255, value + 8))) };
  assert.equal(compareImages(before, noisy).changed, 0);
  const after = { ...before, data: new Uint8Array(before.data) };
  for (const [x, y] of [[2, 3], [6, 7]]) after.data.set([200, 30, 40, 255], (y * 10 + x) * 4);
  assert.deepEqual(compareImages(before, after), { changed: 2, total: 100, box: { x: 2, y: 3, width: 5, height: 5 }, sizeChanged: false });
  assert.equal(compareImages(before, solid(10, 12, [20, 30, 40, 255])).sizeChanged, true);
});

test('a PNG it cannot read is refused rather than misread', () => {
  assert.throws(() => decodePng(Buffer.from('not a png')), /Not a PNG/);
});

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Locator, type Page } from '@playwright/test';

/**
 * Measurements for browser tests of what players see. Specs stay short and
 * declarative by calling these; they are also the only module a generated
 * spec may import besides @playwright/test.
 */

export interface Rgb { r: number; g: number; b: number }

/**
 * Opens a game the way a returning player sees it: its how-to-play guide
 * already seen, animations and sound off.
 */
export async function openGame(page: Page, game: string): Promise<void> {
  await page.addInitScript(id => {
    try {
      localStorage.setItem('blast-arcade-settings-v1', JSON.stringify({
        soundEnabled: false, volume: 0, reducedMotion: true, highContrast: false, language: 'en', touchControls: 'auto',
      }));
      localStorage.setItem('blast-arcade-guides-v1', JSON.stringify([id]));
    } catch { /* storage blocked: defaults are fine */ }
  }, game);
  await page.goto(`/play/${game}`);
  await page.waitForLoadState('networkidle');
}

/**
 * The colour a player actually sees on an element: the most common pixel in
 * its screenshot. Works for gradients, images and canvas, unlike computed styles.
 */
export async function renderedColor(locator: Locator): Promise<Rgb> {
  await locator.scrollIntoViewIfNeeded();
  await captureEvidence(locator);
  const png = (await locator.screenshot({ animations: 'disabled' })).toString('base64');
  return locator.page().evaluate(async data => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const counts = new Map<number, { count: number; r: number; g: number; b: number }>();
    for (let i = 0; i < pixels.length; i += 4) {
      // Buckets of 8 per channel absorb gradients and anti-aliasing.
      const key = ((pixels[i] >> 3) << 10) | ((pixels[i + 1] >> 3) << 5) | (pixels[i + 2] >> 3);
      const entry = counts.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      entry.count++; entry.r += pixels[i]; entry.g += pixels[i + 1]; entry.b += pixels[i + 2];
      counts.set(key, entry);
    }
    const top = [...counts.values()].sort((a, b) => b.count - a.count)[0];
    return { r: Math.round(top.r / top.count), g: Math.round(top.g / top.count), b: Math.round(top.b / top.count) };
  }, png);
}

function toLab({ r, g, b }: Rgb): [number, number, number] {
  const linear = [r, g, b].map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const x = (linear[0] * 0.4124 + linear[1] * 0.3576 + linear[2] * 0.1805) / 0.95047;
  const y = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  const z = (linear[0] * 0.0193 + linear[1] * 0.1192 + linear[2] * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/**
 * Perceptual difference (CIE76 delta E). About 2 is barely noticeable;
 * CLEARLY_DIFFERENT is a difference players see at a glance.
 */
export function colorDifference(a: Rgb, b: Rgb): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
export const CLEARLY_DIFFERENT = 25;

/** WCAG contrast ratio; 4.5 is the minimum for normal text, 3 for large text and UI parts. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const luminance = ({ r, g, b: blue }: Rgb) => {
    const [lr, lg, lb] = [r, g, blue].map(value => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const lastEvidence = new Map<string, { count: number; hash: string }>();

/**
 * When the fix pipeline sets VISUAL_EVIDENCE_DIR, every state a test measures
 * is saved as a close-up with some surroundings, named
 * <project>-<test>-<step>.png. Running the same spec before and after a fix
 * yields matching names, which become the before/after table in the PR.
 * Repeated measurements of an unchanged state are saved once.
 */
async function captureEvidence(locator: Locator): Promise<void> {
  const dir = process.env.VISUAL_EVIDENCE_DIR;
  if (!dir) return;
  const found = await locator.boundingBox();
  const viewport = locator.page().viewportSize();
  if (!found || !viewport) return;
  const pad = 24;
  const x = Math.max(0, found.x - pad);
  const y = Math.max(0, found.y - pad);
  const clip = {
    x, y,
    width: Math.min(viewport.width - x, found.width + pad * 2),
    height: Math.min(viewport.height - y, found.height + pad * 2),
  };
  if (clip.width <= 0 || clip.height <= 0) return;
  const image = await locator.page().screenshot({ clip, animations: 'disabled' });
  const info = test.info();
  const key = `${info.project.name}-${info.title}`;
  const hash = createHash('sha1').update(image).digest('hex');
  const last = lastEvidence.get(key);
  if (last?.hash === hash) return;
  const count = (last?.count ?? 0) + 1;
  lastEvidence.set(key, { count, hash });
  const slug = info.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${info.project.name}-${slug}-${count}.png`), image);
}

/** Minimum contrast for readable text (WCAG AA, normal size). */
export const READABLE_TEXT = 4.5;

/**
 * Contrast between an element's text colour and the background players see
 * behind it. Check it in every state a test visits, so a fix that makes a
 * state stand out cannot make its label unreadable instead.
 */
export async function textContrast(locator: Locator): Promise<number> {
  return contrastRatio(await renderedColor(locator), await cssColor(locator, 'color'));
}

/** Computed CSS colour of a property, e.g. 'color' or 'border-top-color'. */
export async function cssColor(locator: Locator, property: string): Promise<Rgb> {
  const value = await locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
  const [r, g, b] = (value.match(/[\d.]+/g) ?? ['0', '0', '0']).map(Number);
  return { r, g, b };
}

export interface Box { x: number; y: number; width: number; height: number }

export async function box(locator: Locator): Promise<Box> {
  const found = await locator.boundingBox();
  if (!found) throw new Error('Element is not visible, so it has no box.');
  return found;
}

/** Fully on screen at the current viewport, without scrolling sideways. */
export async function insideViewport(locator: Locator): Promise<boolean> {
  const { x, y, width, height } = await box(locator);
  const viewport = locator.page().viewportSize()!;
  const pageHeight = await locator.page().evaluate(() => document.documentElement.scrollHeight);
  return x >= 0 && y >= 0 && x + width <= viewport.width + 0.5 && y + height <= Math.max(viewport.height, pageHeight) + 0.5;
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** 44 px is the smallest comfortable touch target. */
export const MIN_TAP_TARGET = 44;

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareImages, decodePng } from './png.js';

/** One captured screen: <size>-<screen>.png, where screen is "hub" or a game id. */
export interface ScreenChange { name: string; screen: string; changed: number; where: string }

export interface SideEffects {
  checked: number;
  /** Differed between two captures of the same code, so they cannot be judged. */
  unstable: string[];
  /** Changes on the reported game's own screens: expected, shown for review. */
  own: ScreenChange[];
  /** Changes anywhere else: the side effects that block a fix. */
  others: ScreenChange[];
}

export function screenOf(name: string): string {
  return name.replace(/\.png$/, '').replace(/^[a-z]+-/, '');
}

function pngs(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter(name => name.endsWith('.png')).sort() : [];
}

function difference(a: string, b: string): { changed: number; where: string } {
  const result = compareImages(decodePng(readFileSync(a)), decodePng(readFileSync(b)));
  const where = result.sizeChanged ? 'page size changed' : result.box ? `${result.box.width}x${result.box.height} px at ${result.box.x},${result.box.y}` : '';
  return { changed: result.changed, where };
}

/** Screens whose two baseline captures differ. */
export function findUnstable(baselineA: string, baselineB: string): string[] {
  return pngs(baselineA).filter(name => !existsSync(join(baselineB, name)) || difference(join(baselineA, name), join(baselineB, name)).changed > 0);
}

/**
 * Compares every stable baseline screen with the same screen after the fix.
 * A screen missing afterwards counts as changed: a fix that breaks a page
 * must not pass for having no picture.
 */
export function compareScreens(baseline: string, after: string, unstable: readonly string[], ownGame: string): SideEffects {
  const own: ScreenChange[] = [];
  const others: ScreenChange[] = [];
  let checked = 0;
  for (const name of pngs(baseline)) {
    if (unstable.includes(name)) continue;
    checked++;
    const change = existsSync(join(after, name)) ? difference(join(baseline, name), join(after, name)) : { changed: 1, where: 'missing after the fix' };
    if (!change.changed) continue;
    const entry = { name, screen: screenOf(name), ...change };
    (entry.screen === ownGame ? own : others).push(entry);
  }
  return { checked, unstable: [...unstable], own, others };
}

export function sideEffectFeedback(effects: SideEffects, ownGame: string): string {
  const list = effects.others.map(change => `- ${change.name}: ${change.changed} pixels changed (${change.where})`).join('\n');
  return `The tests pass, but your change also altered screens outside ${ownGame}. A fix for one game must not change other games or the hub, so scope the selector to ${ownGame}'s own elements (for example by its id or a class only it uses) instead of editing a shared rule:\n${list}`;
}

export function sideEffectSummary(effects: SideEffects | undefined): string {
  if (!effects) return 'not checked';
  const parts = [`${effects.checked} screens compared`, `${effects.own.length} changed on the reported game`, `${effects.others.length} changed elsewhere`];
  if (effects.unstable.length) parts.push(`${effects.unstable.length} skipped as unstable (${effects.unstable.join(', ')})`);
  return parts.join(', ');
}

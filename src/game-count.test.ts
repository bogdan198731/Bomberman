import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARCADE_GAME_IDS } from './game-metadata.js';
import { ACHIEVEMENTS } from './stats.js';
import { HUB_SEO, gameCountWord, renderSeoTags } from './seo.js';

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const ENGLISH: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};
const ROMANIAN: Record<string, number> = {
  zece: 10, unsprezece: 11, douăsprezece: 12, treisprezece: 13, paisprezece: 14, cincisprezece: 15,
  șaisprezece: 16, șaptesprezece: 17, optsprezece: 18, nouăsprezece: 19, douăzeci: 20,
};

/**
 * Only phrases that state the arcade's total. "Play 4 different games" is a
 * quest target, not the size of the catalogue, and must not be caught.
 */
function statedTotals(text: string): { phrase: string; count: number }[] {
  const found: { phrase: string; count: number }[] = [];
  const english = /\b(\d+|[a-z]+) (?:free browser|instant browser|browser|instant|live) games\b|\ball (\d+|[a-z]+) games\b|>(\d+) games</gi;
  for (const match of text.matchAll(english)) {
    const token = (match[1] ?? match[2] ?? match[3]).toLowerCase();
    const count = /^\d+$/.test(token) ? Number(token) : ENGLISH[token];
    if (count !== undefined) found.push({ phrase: match[0], count });
  }
  const romanian = /(\d+|[a-zăâîșț]+) jocuri (?:instant|active)\b|toate cele (\d+) jocuri/gi;
  for (const match of text.matchAll(romanian)) {
    const token = (match[1] ?? match[2]).toLowerCase();
    const count = /^\d+$/.test(token) ? Number(token) : ROMANIAN[token];
    if (count !== undefined) found.push({ phrase: match[0], count });
  }
  return found;
}

test('every place that states the size of the arcade matches the game list', () => {
  const sources: Record<string, string> = {
    'index.html': read('index.html'),
    'manifest': read('public/manifest.webmanifest'),
    'i18n.ts': read('src/i18n.ts'),
    'hub SEO': `${HUB_SEO.title} ${HUB_SEO.description} ${renderSeoTags('hub')}`,
    'achievements': ACHIEVEMENTS.map(achievement => achievement.description).join(' '),
  };
  const all: string[] = [];
  for (const [source, text] of Object.entries(sources)) {
    for (const { phrase, count } of statedTotals(text)) {
      all.push(`${source}: ${phrase}`);
      assert.equal(count, ARCADE_GAME_IDS.length, `${source} says "${phrase}" but there are ${ARCADE_GAME_IDS.length} games`);
    }
  }
  // Guard against the scan quietly matching nothing and passing forever.
  assert.ok(all.length >= 10, `expected to find the counts, found only: ${all.join(' | ')}`);
});

test('the counting helpers read the game list rather than a number', () => {
  assert.equal(gameCountWord(12), 'twelve');
  assert.equal(gameCountWord(17), 'seventeen');
  assert.equal(gameCountWord(99), '99', 'falls back to digits');
  assert.match(HUB_SEO.title, new RegExp(`\\b${ARCADE_GAME_IDS.length} Free Browser Games`));
  const tour = ACHIEVEMENTS.find(achievement => achievement.id === 'world-tour');
  assert.equal(tour?.description, `Finish a match in all ${ARCADE_GAME_IDS.length} games.`);
});

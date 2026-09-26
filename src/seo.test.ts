import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GAME_SEO,
  HUB_SEO,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_PATH,
  OG_IMAGE_WIDTH,
  SEO_BLOCK_END,
  SEO_BLOCK_START,
  SITE_ORIGIN,
  applyRouteMeta,
  buildRobotsTxt,
  buildSitemapXml,
  canonicalUrl,
  gameFromPath,
  injectSeoTags,
  renderPageForView,
  renderSeoTags,
  structuredDataForView,
  viewElementId,
  type SeoView,
} from './seo.js';
import { ARCADE_GAME_IDS, GAME_META } from './game-metadata.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const views: SeoView[] = ['hub', ...ARCADE_GAME_IDS];

test('every game has unique, length-appropriate title and description copy', () => {
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const view of views) {
    const { title, description } = view === 'hub' ? HUB_SEO : GAME_SEO[view];
    assert.ok(title.length <= 65, `${view} title is ${title.length} chars, too long for search results`);
    assert.ok(description.length >= 70 && description.length <= 170,
      `${view} description is ${description.length} chars, outside the useful snippet range`);
    titles.add(title);
    descriptions.add(description);
  }
  assert.equal(titles.size, views.length, 'duplicate titles make pages compete with each other');
  assert.equal(descriptions.size, views.length, 'duplicate descriptions look like thin content');
});

test('each game names itself in its own metadata', () => {
  for (const gameId of ARCADE_GAME_IDS) {
    const { title, description } = GAME_SEO[gameId];
    const name = GAME_META[gameId].name;
    assert.ok(title.includes(name), `${gameId} title should name the game`);
    assert.ok(description.includes(name), `${gameId} description should name the game`);
  }
});

test('canonicals are absolute, unique, and free of fragments or query strings', () => {
  const seen = new Set<string>();
  for (const view of views) {
    const url = canonicalUrl(view);
    assert.ok(url.startsWith(`${SITE_ORIGIN}/`), `${view} canonical must be absolute`);
    assert.equal(new URL(url).hash, '');
    assert.equal(new URL(url).search, '');
    seen.add(url);
  }
  assert.equal(seen.size, views.length);
  assert.equal(canonicalUrl('hub'), `${SITE_ORIGIN}/`);
  assert.equal(canonicalUrl('snake'), `${SITE_ORIGIN}/play/snake`);
});

test('path parsing accepts only real games', () => {
  for (const gameId of ARCADE_GAME_IDS) {
    assert.equal(gameFromPath(`/play/${gameId}`), gameId);
    assert.equal(gameFromPath(`/play/${gameId}/`), gameId);
  }
  for (const path of ['/', '/play/', '/play/nope', '/index.html', '/dist/index.js', '/playsnake']) {
    assert.equal(gameFromPath(path), undefined, `${path} must not resolve to a game`);
  }
});

test('rendered tags carry the route title, canonical, and social card', () => {
  const tags = renderSeoTags('tanks');
  assert.match(tags, /<title>Mini Tanks[^<]*<\/title>/);
  assert.match(tags, new RegExp(`<link rel="canonical" href="${SITE_ORIGIN}/play/tanks">`));
  assert.match(tags, new RegExp(`<meta property="og:url" content="${SITE_ORIGIN}/play/tanks">`));
  assert.match(tags, new RegExp(`<meta property="og:image" content="${SITE_ORIGIN}/public/og-v4\\.jpg">`));
  assert.match(tags, /<meta name="twitter:card" content="summary_large_image">/);
  // Absolute image URLs are required: scrapers do not resolve relative paths.
  assert.doesNotMatch(tags, /content="\/public/);
});

test('structured data is valid JSON-LD that lists every game', () => {
  const hub = JSON.parse(JSON.stringify(structuredDataForView('hub'))) as {
    '@graph': [{ '@type': string }, { itemListElement: { item: { name: string; url: string } }[] }];
  };
  assert.equal(hub['@graph'][0]['@type'], 'WebSite');
  const listed = hub['@graph'][1].itemListElement;
  assert.equal(listed.length, ARCADE_GAME_IDS.length);
  assert.deepEqual(
    listed.map(entry => entry.item.name).sort(),
    ARCADE_GAME_IDS.map(id => GAME_META[id].name).sort(),
  );

  const game = JSON.parse(JSON.stringify(structuredDataForView('sudoku'))) as {
    '@graph': [{ '@type': string; name: string }, { itemListElement: unknown[] }];
  };
  assert.equal(game['@graph'][0]['@type'], 'VideoGame');
  assert.equal(game['@graph'][0].name, 'Sudoku');
  assert.equal(game['@graph'][1].itemListElement.length, 2, 'breadcrumb should be hub then game');
});

test('JSON-LD cannot break out of its script tag', () => {
  assert.doesNotMatch(renderSeoTags('hub'), /<\/script>(?!$)/);
  for (const view of views) {
    const embedded = renderSeoTags(view).match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1];
    assert.ok(embedded, `${view} should embed JSON-LD`);
    assert.doesNotMatch(embedded, /</, 'raw < would let markup escape the script block');
  }
});

test('index.html exposes the markers the server rewrites, and injection swaps them', () => {
  assert.ok(html.includes(SEO_BLOCK_START), 'index.html must carry the SEO start marker');
  assert.ok(html.includes(SEO_BLOCK_END), 'index.html must carry the SEO end marker');
  assert.equal(html.indexOf(SEO_BLOCK_START) < html.indexOf(SEO_BLOCK_END), true);

  const injected = injectSeoTags(html, 'racing');
  assert.match(injected, /<title>Micro Racers[^<]*<\/title>/);
  assert.match(injected, new RegExp(`<link rel="canonical" href="${SITE_ORIGIN}/play/racing">`));
  assert.equal(injected.match(/<title>/g)?.length, 1, 'exactly one title survives injection');
  assert.equal(injected.match(/rel="canonical"/g)?.length, 1, 'exactly one canonical survives injection');
  assert.ok(injected.includes('<body>'), 'the page body is untouched');

  // Repeated injection must stay stable rather than nesting blocks.
  assert.equal(injectSeoTags(injected, 'racing'), injected);
});

test('the static index.html head already reads as the hub page', () => {
  const head = html.slice(html.indexOf(SEO_BLOCK_START), html.indexOf(SEO_BLOCK_END));
  assert.ok(head.includes(`<title>${HUB_SEO.title}</title>`), 'static title should match the hub copy');
  assert.ok(head.includes(`href="${SITE_ORIGIN}/"`), 'static canonical should point at the hub');
});

test('each route ships only its own view, so the 13 pages are not duplicates', () => {
  const visibleViews = (page: string): string[] =>
    [...page.matchAll(/<main id="(\w+)" class="([^"]*)"/g)]
      .filter(match => !match[2].split(/\s+/).includes('view-hidden'))
      .map(match => match[1]);

  for (const view of views) {
    const page = renderPageForView(html, view);
    assert.deepEqual(visibleViews(page), [viewElementId(view)], `${view} should expose exactly its own panel`);
  }
  assert.deepEqual(visibleViews(renderPageForView(html, 'bomberman')), ['gameView']);

  // Rendering must not damage the markup or drop the other panels from the DOM.
  const snakePage = renderPageForView(html, 'snake');
  assert.equal((snakePage.match(/<main id="/g) ?? []).length, (html.match(/<main id="/g) ?? []).length);
  assert.doesNotMatch(snakePage, /class="[^"]*view-hidden[^"]*view-hidden/, 'no duplicated class names');
  assert.equal(renderPageForView(snakePage, 'snake'), snakePage, 'rendering twice is stable');
  assert.ok(snakePage.includes('<main id="snakeView" class="paddle-app">'));
});

test('page assets use absolute paths so nested /play routes still load them', () => {
  // A relative "./dist/index.js" resolves to /play/dist/index.js on a game page
  // and 404s, leaving a blank screen. Every asset reference must start at root.
  const relative = [...html.matchAll(/(?:src|href)="(\.\/?[^"]*)"/g)].map(match => match[1]);
  assert.deepEqual(relative, [], `relative asset paths break /play/<game>: ${relative.join(', ')}`);
  assert.match(html, /<script type="module" src="\/dist\/index\.js"><\/script>/);
});

test('robots points at the sitemap and keeps private invite links out', () => {
  const robots = buildRobotsTxt();
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, new RegExp(`^Sitemap: ${SITE_ORIGIN}/sitemap\\.xml$`, 'm'));
  assert.match(robots, /Disallow: \/\*\?room=/);
});

test('sitemap lists the hub and all twelve games with a valid namespace', () => {
  const sitemap = buildSitemapXml('2026-09-24');
  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.ok(sitemap.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.deepEqual(locations, views.map(view => canonicalUrl(view)));
  assert.equal(new Set(locations).size, locations.length, 'no duplicate sitemap entries');
  assert.equal(sitemap.match(/<lastmod>2026-09-24<\/lastmod>/g)?.length, views.length);
});

test('client-side navigation rewrites the document metadata it owns', () => {
  const tags = new Map<string, Record<string, string>>();
  let scriptText: string | null = null;
  const doc = {
    title: '',
    querySelector(selector: string) {
      if (selector.startsWith('script')) {
        return { setAttribute() {}, get textContent() { return scriptText; }, set textContent(value: string | null) { scriptText = value; } };
      }
      const attributes = tags.get(selector) ?? {};
      tags.set(selector, attributes);
      return {
        setAttribute(name: string, value: string) { attributes[name] = value; },
        textContent: null as string | null,
      };
    },
  };

  applyRouteMeta('blocks', doc);
  assert.equal(doc.title, GAME_SEO.blocks.title);
  assert.equal(tags.get('link[rel="canonical"]')?.href, `${SITE_ORIGIN}/play/blocks`);
  assert.equal(tags.get('meta[property="og:url"]')?.content, `${SITE_ORIGIN}/play/blocks`);
  assert.equal(tags.get('meta[name="description"]')?.content, GAME_SEO.blocks.description);
  assert.equal(JSON.parse(scriptText ?? 'null')['@graph'][0].name, 'Block Drop Duel');

  applyRouteMeta('hub', doc);
  assert.equal(doc.title, HUB_SEO.title);
  assert.equal(tags.get('link[rel="canonical"]')?.href, `${SITE_ORIGIN}/`);
});

test('applying metadata survives a document that is missing the tags', () => {
  const doc = { title: '', querySelector: () => null };
  applyRouteMeta('star', doc);
  assert.equal(doc.title, GAME_SEO.star.title);
});

test('the share image exists at the standard card size and stays light', () => {
  const bytes = readFileSync(new URL(`..${OG_IMAGE_PATH}`, import.meta.url));
  // Read the frame size from the JPEG's start-of-frame marker - no image library needed.
  let offset = 2;
  let size: [number, number] | null = null;
  while (offset < bytes.length) {
    const marker = bytes.readUInt16BE(offset);
    const length = bytes.readUInt16BE(offset + 2);
    if (marker === 0xffc0 || marker === 0xffc2) {
      size = [bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5)];
      break;
    }
    offset += 2 + length;
  }
  assert.deepEqual(size, [OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT], 'declared size matches the file');
  assert.deepEqual([OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT], [1200, 630], 'the size social networks crop to');
  assert.ok(bytes.length < 400_000, `share image is ${Math.round(bytes.length / 1024)} KB; keep it small, it is also precached`);
});

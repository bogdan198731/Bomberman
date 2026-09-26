import { ARCADE_GAME_IDS, GAME_META, isArcadeGameId, type ArcadeGameId } from './game-metadata.js';

export const SITE_ORIGIN = 'https://bomberman-mixj.onrender.com';
export const SITE_NAME = 'Blast Arcade';
export const OG_IMAGE_PATH = '/public/og-v3.png';
export const OG_IMAGE_WIDTH = 1730;
export const OG_IMAGE_HEIGHT = 909;
export const GAME_PATH_PREFIX = '/play/';

/** Marks the block in index.html that the server rewrites per route. */
export const SEO_BLOCK_START = '<!--seo:start-->';
export const SEO_BLOCK_END = '<!--seo:end-->';

export interface PageSeo {
  title: string;
  description: string;
}

export const HUB_SEO: PageSeo = {
  title: 'Blast Arcade — 12 Free Browser Games, No Download',
  description:
    'Play twelve free browser games instantly — Bomberman, Snake, 2048, Sudoku, Pong and more. Solo against bots, local co-op on one device, or online with friends.',
};

export const GAME_SEO: Record<ArcadeGameId, PageSeo> = {
  bomberman: {
    title: 'Blast Buddies — Free Online Bomberman Game',
    description:
      'Play Blast Buddies free in your browser. Outsmart bots or invite a friend into a fast explosive maze battle — solo, same device, or online PvP.',
  },
  tintar: {
    title: "Țintar — Romanian Nine Men's Morris Online",
    description:
      "Play Țintar free in your browser. Build mills, capture rival pieces, and master Romania's classic strategy board game against a bot or a friend.",
  },
  paddle: {
    title: 'Paddle Clash — Free Online Pong Game',
    description:
      'Play Paddle Clash free in your browser. A quick-fire paddle duel with accelerating rallies, sharp angles, and local or online rivalry.',
  },
  snake: {
    title: 'Neon Snake Arena — Free Online Snake Game',
    description:
      'Play Neon Snake Arena free in your browser. Chase glowing cells in a solo high-score run or survive a two-snake duel on one device or online.',
  },
  tanks: {
    title: 'Mini Tanks — Free 2-Player Tank Battle',
    description:
      'Play Mini Tanks free in your browser. Break cover, bank one-bounce shots, and battle a bot or a friend to five rounds, locally or online.',
  },
  septica: {
    title: 'Șeptică — Play the Romanian Card Game Online',
    description:
      'Play Șeptică free in your browser. Cut with sevens, capture aces and tens, and outplay the Coral dealer, a friend beside you, or an online rival.',
  },
  survival: {
    title: 'Survival Arena — Free Online Wave Shooter',
    description:
      'Play Survival Arena free in your browser. Hold the center, auto-aim at neon crawlers, and power up through endless waves solo or in co-op.',
  },
  star: {
    title: 'Star Defender — Free Space Invaders Game',
    description:
      'Play Star Defender free in your browser. Break invader formations, collect weapon boosts, and challenge a command ship every fifth wave.',
  },
  racing: {
    title: 'Micro Racers — Free Online Racing Game',
    description:
      'Play Micro Racers free in your browser. Drift around a neon circuit, collect turbo bolts, and race a bot or a friend through three laps.',
  },
  blocks: {
    title: 'Block Drop Duel — Free Online Block Puzzle',
    description:
      'Play Block Drop Duel free in your browser. Build clean stacks, clear lines, and bury a bot or a friend under incoming garbage blocks.',
  },
  twenty48: {
    title: '2048 — Play the Classic Number Puzzle Free',
    description:
      'Play 2048 free in your browser. Slide matching numbers together, build clever combos, and create the legendary 2048 tile. No download, no sign-up.',
  },
  sudoku: {
    title: 'Sudoku — Free Online Sudoku Puzzles',
    description:
      'Play Sudoku free in your browser. Complete every row, column, and 3×3 box across three carefully tuned difficulty levels, with hints when you need them.',
  },
  cycles: {
    title: 'Light Cycles — Free Online Neon Trail Duel',
    description:
      'Play Light Cycles free in your browser. Ride a neon grid, leave a wall of light behind you, and box a bot or a friend in first, locally or online.',
  },
  fourrow: {
    title: 'Four in a Row — Free Online Board Game vs Bot or Friend',
    description:
      'Play Four in a Row free in your browser. Drop discs and line up four before your rival, against a three-level bot, a friend beside you, or an online opponent.',
  },
  bricks: {
    title: 'Brick Breaker — Free Online Brick-Breaking Arcade Game',
    description:
      'Play Brick Breaker free in your browser. Steer the paddle, keep the ball alive, and smash through five hand-built walls of tough and steel bricks. No download.',
  },
};

/** Every route the crawler should know about: the hub plus one page per game. */
export type SeoView = 'hub' | ArcadeGameId;

export function gamePath(gameId: ArcadeGameId): string {
  return `${GAME_PATH_PREFIX}${gameId}`;
}

export function routePath(view: SeoView): string {
  return view === 'hub' ? '/' : gamePath(view);
}

/** Reads a game id out of a `/play/<id>` pathname; undefined for anything else. */
export function gameFromPath(pathname: string): ArcadeGameId | undefined {
  if (!pathname.startsWith(GAME_PATH_PREFIX)) return undefined;
  const id = pathname.slice(GAME_PATH_PREFIX.length).replace(/\/$/, '');
  return isArcadeGameId(id) ? id : undefined;
}

export function canonicalUrl(view: SeoView, origin: string = SITE_ORIGIN): string {
  return `${origin}${routePath(view)}`;
}

export function seoForView(view: SeoView): PageSeo {
  return view === 'hub' ? HUB_SEO : GAME_SEO[view];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function videoGameSchema(gameId: ArcadeGameId, origin: string): Record<string, unknown> {
  const meta = GAME_META[gameId];
  return {
    '@type': 'VideoGame',
    name: meta.name,
    url: canonicalUrl(gameId, origin),
    description: GAME_SEO[gameId].description,
    applicationCategory: 'GameApplication',
    operatingSystem: 'Any modern web browser',
    gamePlatform: 'Web browser',
    playMode: meta.modes.map(mode =>
      mode === 'solo' ? 'SinglePlayer' : mode === 'local' ? 'CoOp' : 'MultiPlayer',
    ),
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
}

/** JSON-LD describing the whole arcade, used on the hub page. */
export function hubStructuredData(origin: string = SITE_ORIGIN): unknown {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        name: SITE_NAME,
        url: `${origin}/`,
        description: HUB_SEO.description,
        inLanguage: ['en', 'ro'],
      },
      {
        '@type': 'ItemList',
        name: 'Blast Arcade games',
        numberOfItems: ARCADE_GAME_IDS.length,
        itemListElement: ARCADE_GAME_IDS.map((gameId, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          item: videoGameSchema(gameId, origin),
        })),
      },
    ],
  };
}

/** JSON-LD for a single game page, with a breadcrumb back to the hub. */
export function gameStructuredData(gameId: ArcadeGameId, origin: string = SITE_ORIGIN): unknown {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { ...videoGameSchema(gameId, origin), '@id': `${canonicalUrl(gameId, origin)}#game`, isPartOf: { '@id': `${origin}/#website` } },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: GAME_META[gameId].name, item: canonicalUrl(gameId, origin) },
        ],
      },
    ],
  };
}

export function structuredDataForView(view: SeoView, origin: string = SITE_ORIGIN): unknown {
  return view === 'hub' ? hubStructuredData(origin) : gameStructuredData(view, origin);
}

/**
 * The full <head> metadata block for a route. The server swaps this into
 * index.html so crawlers see per-game tags without executing JavaScript.
 */
export function renderSeoTags(view: SeoView, origin: string = SITE_ORIGIN): string {
  const { title, description } = seoForView(view);
  const canonical = canonicalUrl(view, origin);
  const image = `${origin}${OG_IMAGE_PATH}`;
  const json = JSON.stringify(structuredDataForView(view, origin)).replace(/</g, '\\u003c');
  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${canonical}">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="en">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:width" content="${OG_IMAGE_WIDTH}">`,
    `<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}">`,
    `<meta property="og:image:alt" content="${SITE_NAME} — twelve browser games in one hub">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:image" content="${image}">`,
    `<meta name="twitter:image:alt" content="${SITE_NAME} — twelve browser games in one hub">`,
    `<script type="application/ld+json">${json}</script>`,
  ].join('\n  ');
}

/** Replaces the marked SEO block in index.html with this route's tags. */
export function injectSeoTags(html: string, view: SeoView, origin: string = SITE_ORIGIN): string {
  const start = html.indexOf(SEO_BLOCK_START);
  const end = html.indexOf(SEO_BLOCK_END);
  if (start === -1 || end === -1 || end < start) return html;
  return (
    html.slice(0, start + SEO_BLOCK_START.length) +
    '\n  ' +
    renderSeoTags(view, origin) +
    '\n  ' +
    html.slice(end)
  );
}

/** The <main> element that holds each view's markup in index.html. */
export function viewElementId(view: SeoView): string {
  return view === 'hub' ? 'hubView' : view === 'bomberman' ? 'gameView' : `${view}View`;
}

function setViewHidden(html: string, elementId: string, hidden: boolean): string {
  return html.replace(
    new RegExp(`(<main id="${elementId}" class=")([^"]*)(")`),
    (_match, prefix: string, classes: string, suffix: string) => {
      const list = classes.split(/\s+/).filter(name => name && name !== 'view-hidden');
      if (hidden) list.push('view-hidden');
      return prefix + list.join(' ') + suffix;
    },
  );
}

/**
 * Shows only the requested view in the served HTML, mirroring what the client
 * does on boot. Without this every /play/<game> URL would ship identical body
 * content, which reads as duplicate pages and flashes the hub before hydration.
 */
export function applyInitialView(html: string, view: SeoView): string {
  const active = viewElementId(view);
  return (['hub', ...ARCADE_GAME_IDS] as SeoView[]).reduce(
    (current, candidate) => setViewHidden(current, viewElementId(candidate), viewElementId(candidate) !== active),
    html,
  );
}

/** Everything the server changes about index.html for a given route. */
export function renderPageForView(html: string, view: SeoView, origin: string = SITE_ORIGIN): string {
  return applyInitialView(injectSeoTags(html, view, origin), view);
}

export function buildRobotsTxt(origin: string = SITE_ORIGIN): string {
  return [
    'User-agent: *',
    'Allow: /',
    // Invite links are per-match and carry a room code; indexing them is noise.
    'Disallow: /*?room=',
    'Disallow: /*?game=',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

export function buildSitemapXml(lastModified: string, origin: string = SITE_ORIGIN): string {
  const entries: { view: SeoView; priority: string }[] = [
    { view: 'hub', priority: '1.0' },
    ...ARCADE_GAME_IDS.map(gameId => ({ view: gameId as SeoView, priority: '0.8' })),
  ];
  const urls = entries
    .map(({ view, priority }) =>
      [
        '  <url>',
        `    <loc>${canonicalUrl(view, origin)}</loc>`,
        `    <lastmod>${lastModified}</lastmod>`,
        '    <changefreq>weekly</changefreq>',
        `    <priority>${priority}</priority>`,
        '  </url>',
      ].join('\n'),
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

interface MetaElement {
  setAttribute(name: string, value: string): void;
  textContent: string | null;
}

interface MetaDocument {
  title: string;
  querySelector(selectors: string): MetaElement | null;
}

/**
 * Keeps the document's metadata honest during client-side navigation, so an
 * in-app move to another game updates the tab title, canonical, and share tags.
 */
export function applyRouteMeta(view: SeoView, doc: MetaDocument, origin: string = SITE_ORIGIN): void {
  const { title, description } = seoForView(view);
  const canonical = canonicalUrl(view, origin);
  doc.title = title;
  const set = (selector: string, attribute: string, value: string): void => {
    doc.querySelector(selector)?.setAttribute(attribute, value);
  };
  set('meta[name="description"]', 'content', description);
  set('link[rel="canonical"]', 'href', canonical);
  set('meta[property="og:title"]', 'content', title);
  set('meta[property="og:description"]', 'content', description);
  set('meta[property="og:url"]', 'content', canonical);
  set('meta[name="twitter:title"]', 'content', title);
  set('meta[name="twitter:description"]', 'content', description);
  const script = doc.querySelector('script[type="application/ld+json"]');
  if (script) script.textContent = JSON.stringify(structuredDataForView(view, origin));
}

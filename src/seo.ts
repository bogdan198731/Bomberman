import { ARCADE_GAME_IDS, GAME_META, isArcadeGameId, type ArcadeGameId } from './game-metadata.js';
import type { ArcadeLanguage } from './i18n.js';

export const SITE_ORIGIN = 'https://blastarcade.ro';
export const SITE_NAME = 'Blast Arcade';
// Tagline carries no game count, so it cannot go stale as games are added.
export const OG_IMAGE_PATH = '/public/og-v4.jpg';
/** Each game's own share card, made by `npm run share-images`. */
export const GAME_OG_IMAGE_DIR = '/public/og/';
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const GAME_PATH_PREFIX = '/play/';
/** Romanian pages live under their own URLs so search engines can index them. */
export const ROMANIAN_HUB_PATH = '/ro/';
export const ROMANIAN_GAME_PATH_PREFIX = '/ro/joc/';
export const SEO_LANGUAGES: readonly ArcadeLanguage[] = ['en', 'ro'];

/** Marks the block in index.html that the server rewrites per route. */
export const SEO_BLOCK_START = '<!--seo:start-->';
export const SEO_BLOCK_END = '<!--seo:end-->';

export interface PageSeo {
  title: string;
  description: string;
}

const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
  'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

/** "seventeen", or the digits once the arcade outgrows the words. */
export function gameCountWord(count: number = ARCADE_GAME_IDS.length): string {
  return COUNT_WORDS[count] ?? String(count);
}

// Counted from the game list, so adding a game can never leave the copy stale.
export const HUB_SEO: PageSeo = {
  title: `Blast Arcade — ${ARCADE_GAME_IDS.length} Free Browser Games, No Download`,
  description:
    `Play ${gameCountWord()} free browser games instantly — Bomberman, Snake, Minesweeper, Air Hockey and more. Solo vs bots, same-device play, or online with friends.`,
};

export const HUB_SEO_RO: PageSeo = {
  title: `Blast Arcade — ${ARCADE_GAME_IDS.length} jocuri online gratuite, fără descărcare`,
  description:
    `Joacă ${ARCADE_GAME_IDS.length} jocuri gratuite direct în browser — Șeptică, Țintar, Bomberman, Snake, 2048 și altele. Singur cu boți, doi pe același dispozitiv sau online cu prietenii.`,
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
  mines: {
    title: 'Minesweeper — Free Online Puzzle With a Safe First Click',
    description:
      'Play Minesweeper free in your browser. Clear the field on three phone-sized boards, flag mines with a long press, and beat your best time. No download.',
  },
  hockey: {
    title: 'Air Hockey — Free Online Air Hockey vs Bot or Friend',
    description:
      'Play Air Hockey free in your browser. Guard your goal, bank shots off the walls, and race to seven against a bot, a friend on the same screen, or online.',
  },
  reversi: {
    title: 'Reversi — Free Online Reversi vs Bot or Friend',
    description:
      'Play Reversi free in your browser. Outflank and flip your rival\'s discs, grab the corners, and finish ahead against a three-level bot, a friend, or online.',
  },
  solitaire: {
    title: 'Solitaire — Free Online Klondike Solitaire, No Download',
    description:
      'Play Klondike Solitaire free in your browser. Draw one or three, undo any move, and pick up where you left off - built for phones and desktops alike.',
  },
  hangman: {
    title: 'Hangman — Free Online Word Guessing Game',
    description:
      'Play Hangman free in your browser. Guess the hidden word one letter at a time across six categories, in English or Romanian, before the figure is drawn.',
  },
};

export const GAME_SEO_RO: Record<ArcadeGameId, PageSeo> = {
  bomberman: {
    title: 'Blast Buddies — Joc Bomberman online gratuit',
    description:
      'Joacă Blast Buddies gratuit în browser. Păcălește boții sau invită un prieten într-o luptă explozivă prin labirint — singur, pe același dispozitiv sau online.',
  },
  tintar: {
    title: 'Țintar online — Joacă moara gratuit cu botul sau un prieten',
    description:
      'Joacă Țintar gratuit în browser. Formează mori, capturează piesele adversarului și stăpânește jocul clasic românesc de strategie, cu botul sau cu un prieten.',
  },
  paddle: {
    title: 'Paddle Clash — Joc Pong online gratuit',
    description:
      'Joacă Paddle Clash gratuit în browser: un duel rapid cu palete, schimburi tot mai iuți și unghiuri ascuțite, cu botul, pe același ecran sau online.',
  },
  snake: {
    title: 'Neon Snake Arena — Jocul Șarpele online gratuit',
    description:
      'Joacă Snake gratuit în browser. Adună celulele luminoase pentru un scor record sau supraviețuiește unui duel cu doi șerpi, pe același dispozitiv sau online.',
  },
  tanks: {
    title: 'Mini Tanks — Joc cu tancuri pentru 2 jucători, gratuit',
    description:
      'Joacă Mini Tanks gratuit în browser. Distruge adăposturile, trage cu ricoșeu și înfruntă botul sau un prieten pe cinci runde, local sau online.',
  },
  septica: {
    title: 'Șeptică online — Joacă jocul de cărți românesc gratuit',
    description:
      'Joacă Șeptică gratuit în browser. Taie cu șeptari, adună ași și zeci și învinge botul, un prieten de lângă tine sau un adversar online.',
  },
  survival: {
    title: 'Survival Arena — Joc shooter online cu valuri de inamici',
    description:
      'Joacă Survival Arena gratuit în browser. Apără centrul, țintește automat creaturile neon și devino tot mai puternic prin valuri nesfârșite, singur sau în echipă.',
  },
  star: {
    title: 'Star Defender — Joc Space Invaders online gratuit',
    description:
      'Joacă Star Defender gratuit în browser. Sparge formațiile de invadatori, adună arme noi și înfruntă o navă-comandă la fiecare al cincilea val.',
  },
  racing: {
    title: 'Micro Racers — Joc de curse online gratuit',
    description:
      'Joacă Micro Racers gratuit în browser. Driftează pe un circuit neon, adună turbo și întrece botul sau un prieten în trei ture.',
  },
  blocks: {
    title: 'Block Drop Duel — Joc cu blocuri online gratuit',
    description:
      'Joacă Block Drop Duel gratuit în browser. Construiește stive curate, elimină linii și îngroapă botul sau un prieten sub blocuri.',
  },
  twenty48: {
    title: '2048 online — Jocul puzzle cu numere, gratuit',
    description:
      'Joacă 2048 gratuit în browser. Glisează numerele egale, combină-le inteligent și formează piesa 2048 — sau încearcă puterile lui 3, 5 și 7. Fără descărcare.',
  },
  sudoku: {
    title: 'Sudoku online gratuit — Trei niveluri de dificultate',
    description:
      'Joacă Sudoku gratuit în browser. Completează fiecare rând, coloană și careu 3×3 pe trei niveluri de dificultate, cu indicii când ai nevoie.',
  },
  cycles: {
    title: 'Light Cycles — Duel neon cu dâre de lumină, online',
    description:
      'Joacă Light Cycles gratuit în browser. Gonește pe o grilă neon, lasă în urmă un zid de lumină și închide-l primul pe bot sau pe prieten, local ori online.',
  },
  fourrow: {
    title: 'Patru în linie online — Joacă gratuit cu botul sau un prieten',
    description:
      'Joacă Four in a Row (Patru în linie) gratuit în browser. Aliniază patru piese înaintea adversarului: un bot cu trei niveluri, un prieten lângă tine sau online.',
  },
  bricks: {
    title: 'Brick Breaker — Joc de spart cărămizi online gratuit',
    description:
      'Joacă Brick Breaker gratuit în browser. Condu paleta, ține mingea în joc și sparge cinci ziduri construite manual, cu cărămizi dure și de oțel.',
  },
  mines: {
    title: 'Minesweeper online — Jocul cu mine, gratuit',
    description:
      'Joacă Minesweeper gratuit în browser. Curăță câmpul pe trei table potrivite pentru telefon, marchează minele cu o apăsare lungă și bate-ți recordul.',
  },
  hockey: {
    title: 'Air Hockey online — Joacă gratuit cu botul sau un prieten',
    description:
      'Joacă Air Hockey gratuit în browser. Apără-ți poarta, trage din mantinelă și ajungi primul la șapte goluri, cu botul, cu un prieten pe același ecran sau online.',
  },
  reversi: {
    title: 'Reversi online — Joacă gratuit cu botul sau un prieten',
    description:
      'Joacă Reversi gratuit în browser. Încercuiește și întoarce piesele adversarului, ocupă colțurile și termină în avantaj, cu botul, cu un prieten sau online.',
  },
  solitaire: {
    title: 'Solitaire Klondike online — Pasiențe gratuite, fără descărcare',
    description:
      'Joacă Solitaire Klondike gratuit în browser. Trage câte una sau câte trei cărți, anulează orice mutare și continuă de unde ai rămas, pe telefon sau calculator.',
  },
  hangman: {
    title: 'Spânzurătoarea online — Joc de ghicit cuvinte gratuit',
    description:
      'Joacă Spânzurătoarea (Hangman) gratuit în browser. Ghicește cuvântul ascuns literă cu literă, în română sau engleză, înainte să fie desenat omulețul.',
  },
};

/** Every route the crawler should know about: the hub plus one page per game, in each language. */
export type SeoView = 'hub' | ArcadeGameId;
export interface SeoRoute { view: SeoView; language: ArcadeLanguage }

export function gamePath(gameId: ArcadeGameId, language: ArcadeLanguage = 'en'): string {
  return `${language === 'ro' ? ROMANIAN_GAME_PATH_PREFIX : GAME_PATH_PREFIX}${gameId}`;
}

export function routePath(view: SeoView, language: ArcadeLanguage = 'en'): string {
  if (view === 'hub') return language === 'ro' ? ROMANIAN_HUB_PATH : '/';
  return gamePath(view, language);
}

/** The page a pathname names, or undefined when it is not one of ours (a 404). */
export function parseSeoPath(pathname: string): SeoRoute | undefined {
  if (pathname === '/' || pathname === '/index.html') return { view: 'hub', language: 'en' };
  if (pathname === '/ro' || pathname === ROMANIAN_HUB_PATH) return { view: 'hub', language: 'ro' };
  for (const [prefix, language] of [[GAME_PATH_PREFIX, 'en'], [ROMANIAN_GAME_PATH_PREFIX, 'ro']] as const) {
    if (!pathname.startsWith(prefix)) continue;
    const id = pathname.slice(prefix.length).replace(/\/$/, '');
    return isArcadeGameId(id) ? { view: id, language } : undefined;
  }
  return undefined;
}

/** Reads a game id out of a `/play/<id>` or `/ro/joc/<id>` pathname; undefined for anything else. */
export function gameFromPath(pathname: string): ArcadeGameId | undefined {
  const route = parseSeoPath(pathname);
  return route && route.view !== 'hub' ? route.view : undefined;
}

/** Romanian for anything under /ro, English everywhere else. */
export function languageFromPath(pathname: string): ArcadeLanguage {
  return pathname === '/ro' || pathname.startsWith(ROMANIAN_HUB_PATH) ? 'ro' : 'en';
}

export function canonicalUrl(view: SeoView, origin: string = SITE_ORIGIN, language: ArcadeLanguage = 'en'): string {
  return `${origin}${routePath(view, language)}`;
}

export function seoForView(view: SeoView, language: ArcadeLanguage = 'en'): PageSeo {
  if (language === 'ro') return view === 'hub' ? HUB_SEO_RO : GAME_SEO_RO[view];
  return view === 'hub' ? HUB_SEO : GAME_SEO[view];
}

const OPEN_GRAPH_LOCALES: Record<ArcadeLanguage, string> = { en: 'en_US', ro: 'ro_RO' };

/** A shared game link shows that game; the hub shows the whole arcade. */
export function shareImagePath(view: SeoView): string {
  return view === 'hub' ? OG_IMAGE_PATH : `${GAME_OG_IMAGE_DIR}${view}.jpg`;
}

export function shareImageAlt(view: SeoView, language: ArcadeLanguage = 'en'): string {
  if (view !== 'hub') return `${GAME_META[view].name} — ${SITE_NAME}`;
  return language === 'ro' ? `${SITE_NAME} — ${ARCADE_GAME_IDS.length} jocuri într-un singur loc` : `${SITE_NAME} — ${gameCountWord()} browser games in one hub`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function videoGameSchema(gameId: ArcadeGameId, origin: string, language: ArcadeLanguage): Record<string, unknown> {
  const meta = GAME_META[gameId];
  return {
    '@type': 'VideoGame',
    name: meta.name,
    url: canonicalUrl(gameId, origin, language),
    description: seoForView(gameId, language).description,
    inLanguage: language,
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
export function hubStructuredData(origin: string = SITE_ORIGIN, language: ArcadeLanguage = 'en'): unknown {
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
        name: language === 'ro' ? 'Jocuri Blast Arcade' : 'Blast Arcade games',
        numberOfItems: ARCADE_GAME_IDS.length,
        itemListElement: ARCADE_GAME_IDS.map((gameId, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          item: videoGameSchema(gameId, origin, language),
        })),
      },
    ],
  };
}

/** JSON-LD for a single game page, with a breadcrumb back to the hub. */
export function gameStructuredData(gameId: ArcadeGameId, origin: string = SITE_ORIGIN, language: ArcadeLanguage = 'en'): unknown {
  const url = canonicalUrl(gameId, origin, language);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { ...videoGameSchema(gameId, origin, language), '@id': `${url}#game`, isPartOf: { '@id': `${origin}/#website` } },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE_NAME, item: canonicalUrl('hub', origin, language) },
          { '@type': 'ListItem', position: 2, name: GAME_META[gameId].name, item: url },
        ],
      },
    ],
  };
}

export function structuredDataForView(view: SeoView, origin: string = SITE_ORIGIN, language: ArcadeLanguage = 'en'): unknown {
  return view === 'hub' ? hubStructuredData(origin, language) : gameStructuredData(view, origin, language);
}

/**
 * The full <head> metadata block for a route. The server swaps this into
 * index.html so crawlers see per-game tags without executing JavaScript.
 */
export function renderSeoTags(view: SeoView, origin: string = SITE_ORIGIN, language: ArcadeLanguage = 'en'): string {
  const { title, description } = seoForView(view, language);
  const canonical = canonicalUrl(view, origin, language);
  const image = `${origin}${shareImagePath(view)}`;
  const imageAlt = escapeHtml(shareImageAlt(view, language));
  const json = JSON.stringify(structuredDataForView(view, origin, language)).replace(/</g, '\\u003c');
  const other: ArcadeLanguage = language === 'ro' ? 'en' : 'ro';
  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${canonical}">`,
    // Each page names both language versions; English is the default for everyone else.
    ...SEO_LANGUAGES.map(code => `<link rel="alternate" hreflang="${code}" href="${canonicalUrl(view, origin, code)}">`),
    `<link rel="alternate" hreflang="x-default" href="${canonicalUrl(view, origin, 'en')}">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="${OPEN_GRAPH_LOCALES[language]}">`,
    `<meta property="og:locale:alternate" content="${OPEN_GRAPH_LOCALES[other]}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:width" content="${OG_IMAGE_WIDTH}">`,
    `<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}">`,
    `<meta property="og:image:alt" content="${imageAlt}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:image" content="${image}">`,
    `<meta name="twitter:image:alt" content="${imageAlt}">`,
    `<script type="application/ld+json">${json}</script>`,
  ].join('\n  ');
}

/** Replaces the marked SEO block in index.html with this route's tags. */
export function injectSeoTags(html: string, view: SeoView, origin: string = SITE_ORIGIN, language: ArcadeLanguage = 'en'): string {
  const start = html.indexOf(SEO_BLOCK_START);
  const end = html.indexOf(SEO_BLOCK_END);
  if (start === -1 || end === -1 || end < start) return html;
  return (
    html.slice(0, start + SEO_BLOCK_START.length) +
    '\n  ' +
    renderSeoTags(view, origin, language) +
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

/** `lastModified` is one date for every page, or the date of each page. */
export function buildSitemapXml(lastModified: string | Record<SeoView, string>, origin: string = SITE_ORIGIN): string {
  const views: SeoView[] = ['hub', ...ARCADE_GAME_IDS];
  const dateOf = (view: SeoView): string => typeof lastModified === 'string' ? lastModified : lastModified[view];
  const urls = views
    .flatMap(view => SEO_LANGUAGES.map(language => ({ view, language })))
    .map(({ view, language }) =>
      [
        '  <url>',
        `    <loc>${canonicalUrl(view, origin, language)}</loc>`,
        // Google wants every entry to list all of its language versions, itself included.
        ...SEO_LANGUAGES.map(code => `    <xhtml:link rel="alternate" hreflang="${code}" href="${canonicalUrl(view, origin, code)}"/>`),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${canonicalUrl(view, origin, 'en')}"/>`,
        `    <lastmod>${dateOf(view)}</lastmod>`,
        '    <changefreq>weekly</changefreq>',
        `    <priority>${view === 'hub' ? '1.0' : '0.8'}</priority>`,
        '  </url>',
      ].join('\n'),
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
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
export function applyRouteMeta(view: SeoView, doc: MetaDocument, origin: string = SITE_ORIGIN, language: ArcadeLanguage = 'en'): void {
  const { title, description } = seoForView(view, language);
  const canonical = canonicalUrl(view, origin, language);
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
  set('meta[property="og:locale"]', 'content', OPEN_GRAPH_LOCALES[language]);
  set('meta[property="og:image"]', 'content', `${origin}${shareImagePath(view)}`);
  set('meta[name="twitter:image"]', 'content', `${origin}${shareImagePath(view)}`);
  set('meta[property="og:image:alt"]', 'content', shareImageAlt(view, language));
  set('meta[name="twitter:image:alt"]', 'content', shareImageAlt(view, language));
  set('meta[property="og:locale:alternate"]', 'content', OPEN_GRAPH_LOCALES[language === 'ro' ? 'en' : 'ro']);
  SEO_LANGUAGES.forEach(code => set(`link[rel="alternate"][hreflang="${code}"]`, 'href', canonicalUrl(view, origin, code)));
  set('link[rel="alternate"][hreflang="x-default"]', 'href', canonicalUrl(view, origin, 'en'));
  const script = doc.querySelector('script[type="application/ld+json"]');
  if (script) script.textContent = JSON.stringify(structuredDataForView(view, origin, language));
}

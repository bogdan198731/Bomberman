import { translateStaticText, type ArcadeLanguage } from './i18n.js';
import { renderGameAbout } from './seo-content.js';
import { applyInitialView, injectSeoTags, SITE_ORIGIN, type SeoView } from './seo.js';

/** Where index.html takes the per-game "how to play" article. */
export const ABOUT_MARKER = '<!--game-about-->';

const TRANSLATED_ATTRIBUTES = /\s(aria-label|placeholder|title|alt)="([^"]*)"/g;
// Comments and raw-text elements pass through untouched, like the browser's translator skips them.
const HTML_TOKENS = /<!--[\s\S]*?-->|<(script|style|noscript|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>|<[^>]*>|[^<]+/gi;

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decodes the entities a text node can hold; undefined if one is unknown, so that text is left alone. */
function decodeEntities(value: string): string | undefined {
  let unknown = false;
  const decoded = value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === '#') return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
    const named = NAMED_ENTITIES[code.toLowerCase()];
    if (named === undefined) unknown = true;
    return named ?? entity;
  });
  return unknown ? undefined : decoded;
}

const encodeText = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const encodeAttribute = (value: string): string => encodeText(value).replace(/"/g, '&quot;');

/** Translates one text or attribute value, keeping its surrounding whitespace, or returns undefined. */
function translateValue(raw: string): string | undefined {
  const decoded = decodeEntities(raw);
  if (decoded === undefined) return undefined;
  const leading = decoded.match(/^\s*/)![0];
  const trailing = decoded.match(/\s*$/)![0];
  const core = decoded.slice(leading.length, decoded.length - trailing.length);
  if (!core) return undefined;
  const romanian = translateStaticText(core);
  return romanian === undefined ? undefined : `${leading}${romanian}${trailing}`;
}

/**
 * Sends the page body in Romanian, so search engines index Romanian text
 * without running JavaScript. Only fixed strings the browser can turn back
 * into English are translated here; the browser's own translator handles the rest.
 */
export function translateBodyToRomanian(html: string): string {
  const bodyStart = html.search(/<body\b/i);
  const bodyEnd = html.lastIndexOf('</body>');
  if (bodyStart === -1 || bodyEnd === -1) return html;
  const body = html.slice(bodyStart, bodyEnd).replace(HTML_TOKENS, token => {
    if (token.startsWith('<!--') || /^<(script|style|noscript|textarea)\b/i.test(token)) return token;
    if (token.startsWith('<')) {
      return token.replace(TRANSLATED_ATTRIBUTES, (attribute, name: string, value: string) => {
        const translated = translateValue(value);
        return translated === undefined ? attribute : ` ${name}="${encodeAttribute(translated)}"`;
      });
    }
    const translated = translateValue(token);
    return translated === undefined ? token : encodeText(translated);
  });
  return html.slice(0, bodyStart) + body + html.slice(bodyEnd);
}

/** Marks the page as Romanian, and as served that way, which the browser's translator relies on. */
function markRomanian(html: string): string {
  return html.replace(/<html\b([^>]*?)\slang="[^"]*"/i, '<html$1 lang="ro" data-served-lang="ro"');
}

/** Everything the server changes about index.html for a given route. */
export function renderPageForView(html: string, view: SeoView, origin: string = SITE_ORIGIN, language: ArcadeLanguage = 'en'): string {
  let page = injectSeoTags(html, view, origin, language);
  if (language === 'ro') page = translateBodyToRomanian(markRomanian(page));
  page = applyInitialView(page, view);
  return page.replace(ABOUT_MARKER, () => renderGameAbout(view, language));
}

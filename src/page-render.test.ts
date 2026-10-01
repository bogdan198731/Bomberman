import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ABOUT_MARKER, renderPageForView, translateBodyToRomanian } from './page-render.js';
import { GAME_CONTENT, gameFaq, renderGameAbout } from './seo-content.js';
import { servedSourceText, translateStaticText } from './i18n.js';
import { ARCADE_GAME_IDS, isArcadeGameId } from './game-metadata.js';
import { routePath, type SeoView } from './seo.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const views: SeoView[] = ['hub', ...ARCADE_GAME_IDS];

/** The texts and translated attributes of a page body, outside scripts, styles and the article. */
function bodyValues(page: string): string[] {
  const body = page.slice(page.search(/<body\b/), page.lastIndexOf('</body>'))
    .replace(/<section id="gameAbout"[\s\S]*?<\/section>/, '')
    .replace(/<!--[\s\S]*?-->|<(script|style|noscript|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const values: string[] = [];
  for (const [token] of body.matchAll(/<[^>]*>|[^<]+/g)) {
    if (token.startsWith('<')) for (const match of token.matchAll(/\s(aria-label|placeholder|title|alt)="([^"]*)"/g)) values.push(`@${match[1]}=${match[2]}`);
    else if (token.trim()) values.push(token);
  }
  return values;
}

test('the index.html shell has one place for the game article', () => {
  assert.equal(html.split(ABOUT_MARKER).length, 2);
});

test('Romanian pages are marked as Romanian and as sent that way', () => {
  for (const view of views) {
    const page = renderPageForView(html, view, undefined, 'ro');
    assert.match(page, /<html lang="ro" data-served-lang="ro">/, view);
    assert.doesNotMatch(renderPageForView(html, view), /data-served-lang/, `${view} in English`);
  }
});

test('every server-translated text turns back into exactly the English page', () => {
  // The browser rebuilds English from each Romanian string with servedSourceText;
  // if that ever picked the wrong English text, switching language would show it.
  for (const view of ['hub', 'septica', 'twenty48'] as const) {
    const english = bodyValues(renderPageForView(html, view));
    const romanian = bodyValues(renderPageForView(html, view, undefined, 'ro'));
    assert.equal(romanian.length, english.length, `${view}: same structure`);
    const decode = (value: string): string => value.trim()
      .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const differences = romanian.flatMap((value, index) => {
      const [, prefix = '', text] = value.match(/^(@[a-z-]+=)?([\s\S]*)$/)!;
      const restored = prefix + (servedSourceText(decode(text)) ?? decode(text));
      const [, expectedPrefix = '', expectedText] = english[index].match(/^(@[a-z-]+=)?([\s\S]*)$/)!;
      const expected = expectedPrefix + decode(expectedText);
      return restored === expected ? [] : [`${expected} -> ${restored}`];
    });
    assert.deepEqual(differences.slice(0, 5), [], `${view}: Romanian text that does not map back to its English`);
    const translated = romanian.filter((value, index) => value !== english[index]).length;
    assert.ok(translated > 300, `${view}: only ${translated} texts were sent in Romanian`);
  }
});

test('only reversible strings are translated on the server', () => {
  assert.equal(translateStaticText('Arcade settings') !== undefined, true);
  const romanian = translateStaticText('Arcade settings')!;
  assert.equal(servedSourceText(romanian), 'Arcade settings');
  assert.equal(translateStaticText('Not a string the arcade uses'), undefined);
});

test('the server translator leaves scripts, styles and comments byte for byte', () => {
  const sample = '<html lang="en"><head></head><body><button aria-label="Arcade settings">Arcade settings</button>'
    + '<script>const label = "Arcade settings";</script><style>.x::after { content: "Arcade settings"; }</style>'
    + '<!-- Arcade settings --><p>A &amp; B</p></body></html>';
  const out = translateBodyToRomanian(sample);
  const romanian = translateStaticText('Arcade settings')!;
  assert.ok(out.includes(`<button aria-label="${romanian}">${romanian}</button>`));
  assert.ok(out.includes('<script>const label = "Arcade settings";</script>'));
  assert.ok(out.includes('content: "Arcade settings"'));
  assert.ok(out.includes('<!-- Arcade settings -->'));
  assert.ok(out.includes('<p>A &amp; B</p>'), 'entities survive untouched text');
});

test('each game page carries its own article in its own language, and the hub none', () => {
  assert.equal(renderGameAbout('hub', 'en'), '');
  for (const game of ARCADE_GAME_IDS) {
    for (const language of ['en', 'ro'] as const) {
      const page = renderPageForView(html, game, undefined, language);
      const article = page.match(/<section id="gameAbout"[\s\S]*?<\/section>/)?.[0];
      assert.ok(article, `${game}/${language} has an article`);
      assert.ok(article.includes(`data-game="${game}" data-lang="${language}"`));
      assert.ok(article.includes(language === 'ro' ? '>Cum se joacă ' : '>How to play '), `${game}/${language} heading`);
      assert.ok(!page.includes(ABOUT_MARKER), 'the marker is replaced');
      // Links stay in the page's language, so crawlers walk each language separately.
      for (const [, href] of article.matchAll(/href="([^"]+)"/g)) {
        assert.ok(language === 'ro' ? href.startsWith('/ro/') : !href.startsWith('/ro'), `${game}/${language}: ${href}`);
      }
      const faq = JSON.parse(article.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1].replace(/\\u003c/g, '<'));
      assert.equal(faq['@type'], 'FAQPage');
      assert.equal(faq.mainEntity.length, gameFaq(game).length);
      assert.ok(faq.mainEntity.every((item: { name: string; acceptedAnswer: { text: string } }) => item.name.endsWith('?') && item.acceptedAnswer.text.length > 30));
    }
    assert.equal(renderPageForView(html, 'hub', undefined, 'ro').includes('id="gameAbout"'), false);
  }
});

test('the article text is substantial, bilingual and points at real, different games', () => {
  const intros = new Set<string>();
  for (const game of ARCADE_GAME_IDS) {
    const { intro, faq, related } = GAME_CONTENT[game];
    for (const [index, text] of intro.entries()) {
      assert.ok(text.split(/\s+/).length >= 25, `${game} intro ${index ? 'ro' : 'en'} is too short`);
      intros.add(text);
    }
    assert.notEqual(intro[0], intro[1], `${game} has a Romanian intro`);
    assert.notEqual(faq[0][0], faq[0][1], `${game} has a Romanian question`);
    assert.ok(gameFaq(game).length >= 3, `${game} FAQ`);
    assert.equal(new Set(gameFaq(game).map(([question]) => question[0])).size, gameFaq(game).length, `${game}: no repeated questions`);
    assert.ok(related.length >= 3 && related.every(id => isArcadeGameId(id) && id !== game), `${game} related games`);
    assert.equal(new Set(related).size, related.length);
    assert.ok(related.every(id => routePath(id, 'ro').startsWith('/ro/joc/')));
  }
  assert.equal(intros.size, ARCADE_GAME_IDS.length * 2, 'no two intros are the same');
});

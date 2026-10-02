import { GAME_META, type ArcadeGameId } from './game-metadata.js';
import { GAME_GUIDES } from './game-experience.js';
import type { ArcadeLanguage } from './i18n.js';
import { escapeHtml, routePath, type SeoView } from './seo.js';

/**
 * Crawlable text for each game page: what the game is, how to play, and a
 * short FAQ, in English and Romanian. Server-only: the browser never needs it,
 * so it stays out of the app bundle.
 */

type Copy = [en: string, ro: string];
type Faq = [question: Copy, answer: Copy];

interface GameContent {
  intro: Copy;
  /** A question players actually ask about this game; the generic ones are added for every game. */
  faq: Faq;
  related: readonly ArcadeGameId[];
}

const copy = (en: string, ro: string): Copy => [en, ro];

export const GAME_CONTENT: Record<ArcadeGameId, GameContent> = {
  bomberman: {
    intro: copy(
      'Blast Buddies is a maze battle in the spirit of the classic bomb games: drop bombs, blow open crates, collect power-ups and catch your rival in the blast. Play rounds against bots, with a friend on the same screen, or online, on the modern look or the retro pixel skin.',
      'Blast Buddies este o luptă în labirint în stilul jocurilor clasice cu bombe: pui bombe, spargi lăzi, aduni bonusuri și îți prinzi adversarul în explozie. Joacă runde cu boții, cu un prieten pe același ecran sau online, cu grafica modernă sau cu cea retro, în pixeli.',
    ),
    faq: [
      copy('Is Blast Buddies like Bomberman?', 'Blast Buddies seamănă cu Bomberman?'),
      copy('Yes. It plays like the classic maze bomb games: bombs explode in a cross, crates hide power-ups, and the last player standing wins the round. The characters, maps and art are original.',
        'Da. Se joacă la fel ca jocurile clasice cu bombe în labirint: bombele explodează în cruce, lăzile ascund bonusuri, iar ultimul jucător rămas câștigă runda. Personajele, hărțile și grafica sunt originale.'),
    ],
    related: ['tanks', 'snake', 'survival'],
  },
  tintar: {
    intro: copy(
      'Țintar is the Romanian name for Nine Men\'s Morris, one of the oldest strategy board games. Each player places nine pieces, forms mills of three in a row, and removes the rival\'s pieces until they are left with two or cannot move.',
      'Țintarul, numit și moara, este unul dintre cele mai vechi jocuri de strategie pe tablă. Fiecare jucător așază nouă piese, formează mori din trei piese în linie și scoate piesele adversarului până când acesta rămâne cu două sau nu mai poate muta.',
    ),
    faq: [
      copy('What is the difference between Țintar and Nine Men\'s Morris?', 'Care este diferența dintre Țintar și moară?'),
      copy('None in the rules: Țintar is the name the game has in Romania. Here you play the standard version with nine pieces each, and flying once a player is down to three pieces.',
        'La reguli, niciuna: țintar și moară sunt nume pentru același joc. Aici joci varianta standard, cu câte nouă piese, în care un jucător rămas cu trei piese poate sări oriunde pe tablă.'),
    ],
    related: ['septica', 'reversi', 'fourrow'],
  },
  paddle: {
    intro: copy(
      'Paddle Clash is a fast take on the original two-paddle tennis game. Rallies speed up the longer they last, and where the ball meets your paddle decides its angle, so every return is a chance to wrong-foot your opponent.',
      'Paddle Clash este o variantă rapidă a primului joc de tenis cu două palete. Schimburile se accelerează cu cât durează mai mult, iar locul în care mingea lovește paleta îi decide unghiul, așa că fiecare retur îți poate surprinde adversarul.',
    ),
    faq: [
      copy('How do I win a game of Paddle Clash?', 'Cum câștig o partidă de Paddle Clash?'),
      copy('Get the ball past your opponent\'s paddle. Each miss is a point, and the first player to seven points wins the match.',
        'Trimite mingea dincolo de paleta adversarului. Fiecare minge ratată înseamnă un punct, iar primul jucător care ajunge la șapte puncte câștigă meciul.'),
    ],
    related: ['hockey', 'bricks', 'racing'],
  },
  snake: {
    intro: copy(
      'Neon Snake Arena is the classic snake game with a neon arena and a second snake. Eat to grow longer, steer clear of walls and tails, and chase a high score on your own or outlast a rival snake on the same device or online.',
      'Neon Snake Arena este jocul clasic cu șarpele, cu o arenă neon și un al doilea șarpe. Mănâncă pentru a crește, ferește-te de pereți și de cozi și urmărește un scor record singur sau rezistă mai mult decât un șarpe rival, pe același dispozitiv sau online.',
    ),
    faq: [
      copy('Can I change the speed of the snake?', 'Pot schimba viteza șarpelui?'),
      copy('Yes. Start on the slower Chill speed while you learn the rhythm of the turns, then move up when you want a harder run. The arena also has levels with walls.',
        'Da. Începe cu viteza Chill, mai lentă, cât timp înveți ritmul virajelor, apoi treci la una mai mare când vrei o provocare. Arena are și niveluri cu ziduri.'),
    ],
    related: ['cycles', 'bomberman', 'blocks'],
  },
  tanks: {
    intro: copy(
      'Mini Tanks is a top-down tank duel. Your turret turns as you drive, shots bounce once off the arena walls, and orange cover breaks while steel holds, so the best shots are often bank shots around a corner.',
      'Mini Tanks este un duel cu tancuri văzut de sus. Turela se rotește odată cu tancul, proiectilele ricoșează o dată din pereții arenei, iar adăposturile portocalii se sparg, pe când cele de oțel rezistă, așa că cele mai bune lovituri sunt adesea cele din ricoșeu.',
    ),
    faq: [
      copy('How many rounds are in a Mini Tanks match?', 'Câte runde are un meci de Mini Tanks?'),
      copy('The first tank to win five rounds takes the match. You can also pick between several arena levels with different cover.',
        'Câștigă meciul primul tanc care adună cinci runde. Poți alege și între mai multe niveluri de arenă, cu adăposturi diferite.'),
    ],
    related: ['bomberman', 'survival', 'star'],
  },
  septica: {
    intro: copy(
      'Șeptică is a Romanian trick-taking card game played with a 32-card deck. Aces and tens are worth a point each, and any seven, or a card matching the opening rank, cuts the trick, so knowing when to spend your sevens decides the game.',
      'Șeptica este un joc românesc de cărți cu levate, jucat cu un pachet de 32 de cărți. Așii și zecile valorează câte un punct, iar orice șeptar sau o carte de aceeași valoare cu cea de deschidere taie levata, așa că decizia de a folosi un șeptar hotărăște jocul.',
    ),
    faq: [
      copy('How many players can play Șeptică?', 'Câți jucători pot juca Șeptică?'),
      copy('Two, three or four. Play against bots, pass one device around, or invite friends to an online table.',
        'Doi, trei sau patru. Joacă împotriva boților, dați telefonul de la unul la altul sau invită prieteni la o masă online.'),
    ],
    related: ['tintar', 'solitaire', 'reversi'],
  },
  survival: {
    intro: copy(
      'Survival Arena is an arena shooter about holding your ground. Waves of neon crawlers close in, your gun aims at the nearest one, and between waves you choose an upgrade, so every run builds a different loadout.',
      'Survival Arena este un joc shooter în care îți aperi poziția. Valuri de creaturi neon se apropie, arma ta țintește cea mai apropiată, iar între valuri alegi o îmbunătățire, așa că fiecare încercare îți construiește un echipament diferit.',
    ),
    faq: [
      copy('What happens between waves in Survival Arena?', 'Ce se întâmplă între valuri în Survival Arena?'),
      copy('You choose one of three upgrades instead of getting a fixed bonus: faster fire, more speed or extra protection, so each run grows the way you play.',
        'Alegi una din trei îmbunătățiri în loc să primești un bonus fix: foc mai rapid, viteză mai mare sau protecție în plus, așa că fiecare încercare crește după stilul tău.'),
    ],
    related: ['star', 'tanks', 'bomberman'],
  },
  star: {
    intro: copy(
      'Star Defender is a fixed-shooter in the tradition of the classic space invader games. Break up enemy formations, catch weapon drops for spread shots, rapid fire and shields, and take on a command ship every fifth wave.',
      'Star Defender este un shooter spațial în tradiția jocurilor clasice cu invadatori din spațiu. Sparge formațiile inamice, prinde armele care cad pentru foc dispersat, foc rapid și scut și înfruntă o navă-comandă la fiecare al cincilea val.',
    ),
    faq: [
      copy('Is Star Defender a Space Invaders game?', 'Star Defender este un joc Space Invaders?'),
      copy('It plays in the same style: your ship moves along the bottom and fires up at rows of invaders. The waves, weapons, boss ships and art are its own.',
        'Se joacă în același stil: nava ta se mișcă în partea de jos și trage în rândurile de invadatori. Valurile, armele, navele-comandă și grafica sunt proprii.'),
    ],
    related: ['survival', 'bricks', 'tanks'],
  },
  racing: {
    intro: copy(
      'Micro Racers is a top-down racing game on a neon circuit. Hit the checkpoints in order, grab turbo bolts for bursts of speed and drift through the corners to finish three laps ahead of a bot or a friend.',
      'Micro Racers este un joc de curse văzut de sus, pe un circuit neon. Treci prin puncte de control în ordine, adună turbo pentru accelerări scurte și driftează prin viraje ca să termini trei ture înaintea botului sau a unui prieten.',
    ),
    faq: [
      copy('Does the car accelerate on its own?', 'Mașina accelerează singură?'),
      copy('You can turn on Auto-accelerate and only steer, which is easiest on a phone. Otherwise hold Go to drive and brake for the tight turns.',
        'Poți porni accelerarea automată și doar să virezi, ceea ce e cel mai simplu pe telefon. Altfel ții apăsat Go pentru a merge și frânezi în virajele strânse.'),
    ],
    related: ['cycles', 'paddle', 'hockey'],
  },
  blocks: {
    intro: copy(
      'Block Drop Duel is a falling-block puzzle built for head-to-head play. Clear lines to score, and clear several at once to send garbage rows to your opponent, who loses when their stack reaches the top.',
      'Block Drop Duel este un puzzle cu blocuri care cad, gândit pentru dueluri. Elimină linii pentru puncte, iar dacă elimini mai multe deodată îi trimiți adversarului rânduri de blocuri; pierde cel a cărui stivă ajunge sus.',
    ),
    faq: [
      copy('Can I play Block Drop Duel alone?', 'Pot juca Block Drop Duel singur?'),
      copy('Yes. Duel a bot that clears lines and sends garbage back, or play a friend on the same device or online.',
        'Da. Joacă împotriva unui bot care elimină linii și îți trimite blocuri înapoi sau împotriva unui prieten, pe același dispozitiv sau online.'),
    ],
    related: ['twenty48', 'sudoku', 'bricks'],
  },
  twenty48: {
    intro: copy(
      '2048 is the sliding number puzzle: every move slides all the tiles, two equal tiles merge into one, and a new tile appears. Reach the 2048 tile to win, then keep going for a higher score, or switch to powers of 3, 5 or 7 for a fresh look at the same puzzle.',
      '2048 este puzzle-ul cu numere glisante: fiecare mutare glisează toate piesele, două piese egale se unesc într-una, iar apoi apare o piesă nouă. Formează piesa 2048 ca să câștigi, apoi continuă pentru un scor mai mare sau treci la puterile lui 3, 5 ori 7 pentru o variantă nouă a aceluiași puzzle.',
    ),
    faq: [
      copy('What is the best strategy for 2048?', 'Care este cea mai bună strategie la 2048?'),
      copy('Keep your largest tile in one corner and build a chain of decreasing tiles next to it. Avoid the move that pulls the big tile out of its corner.',
        'Ține cea mai mare piesă într-un colț și construiește lângă ea un șir de piese tot mai mici. Evită mutarea care scoate piesa mare din colț.'),
    ],
    related: ['sudoku', 'mines', 'blocks'],
  },
  sudoku: {
    intro: copy(
      'Sudoku is the logic puzzle on a 9×9 grid: fill every row, column and 3×3 box with the numbers 1 to 9, each exactly once. Pick one of three difficulty levels, pencil in notes, and use a limited number of hints when you get stuck.',
      'Sudoku este puzzle-ul de logică pe o grilă de 9×9: completezi fiecare rând, coloană și careu de 3×3 cu cifrele de la 1 la 9, fiecare o singură dată. Alege unul dintre cele trei niveluri de dificultate, notează-ți candidații și folosește un număr limitat de indicii când te blochezi.',
    ),
    faq: [
      copy('What are notes in Sudoku?', 'Ce sunt notițele la Sudoku?'),
      copy('Notes let you pencil small candidate numbers into a cell while you work out which one fits. Only conflicts you can see in a row, column or box count as mistakes.',
        'Notițele îți permit să scrii cu cifre mici candidații dintr-o celulă până afli care se potrivește. Doar conflictele vizibile într-un rând, o coloană sau un careu contează ca greșeli.'),
    ],
    related: ['mines', 'twenty48', 'solitaire'],
  },
  cycles: {
    intro: copy(
      'Light Cycles is a neon duel on a grid. Both riders leave a solid wall of light behind them and the walls never fade, so the arena keeps shrinking until someone runs out of room. Crash last to win the round.',
      'Light Cycles este un duel neon pe o grilă. Ambii motocicliști lasă în urmă un zid de lumină care nu dispare, așa că arena se tot micșorează până când cineva rămâne fără loc. Ultimul care se lovește câștigă runda.',
    ),
    faq: [
      copy('How do you win at Light Cycles?', 'Cum câștigi la Light Cycles?'),
      copy('Make your rival hit a wall or a trail before you do. The first rider to three rounds wins; if both crash at the same moment, nobody scores.',
        'Fă-ți adversarul să se lovească de un zid sau de o dâră înaintea ta. Primul care ajunge la trei runde câștigă; dacă vă loviți amândoi în același moment, nimeni nu primește punct.'),
    ],
    related: ['snake', 'racing', 'tanks'],
  },
  fourrow: {
    intro: copy(
      'Four in a Row is the classic disc-dropping strategy game. Take turns dropping discs into a seven-column grid; the first player to line up four across, down or diagonally wins.',
      'Four in a Row (Patru în linie) este jocul clasic de strategie în care lași să cadă piese într-o grilă cu șapte coloane. Jucătorii mută pe rând, iar primul care aliniază patru piese pe orizontală, verticală sau diagonală câștigă.',
    ),
    faq: [
      copy('How strong is the Four in a Row bot?', 'Cât de puternic este botul de la Patru în linie?'),
      copy('It has three levels. Easy looks only a couple of moves ahead, while Hard searches much deeper and punishes loose moves.',
        'Are trei niveluri. Cel ușor se uită doar câteva mutări înainte, pe când cel greu caută mult mai adânc și profită de orice greșeală.'),
    ],
    related: ['reversi', 'tintar', 'sudoku'],
  },
  bricks: {
    intro: copy(
      'Brick Breaker is the bat-and-ball wall-smashing game. Keep the ball in play with your paddle, aim with the edges for sharper angles, and break every brick across ten hand-built walls with tough bricks and steel that never breaks.',
      'Brick Breaker este jocul în care spargi un zid de cărămizi cu o minge și o paletă. Ține mingea în joc, lovește cu marginile paletei pentru unghiuri mai ascuțite și sparge toate cărămizile din zece ziduri construite manual, cu cărămizi dure și de oțel care nu se sparg.',
    ),
    faq: [
      copy('How many lives do you get in Brick Breaker?', 'Câte vieți ai la Brick Breaker?'),
      copy('Three to start. Each time the ball gets past your paddle you lose one; catch a heart capsule from a broken brick to win one back, up to five.',
        'Trei la început. De fiecare dată când mingea trece de paletă pierzi una; prinde o capsulă cu inimă dintr-o cărămidă spartă ca să câștigi una înapoi, până la cinci.'),
    ],
    related: ['paddle', 'star', 'blocks'],
  },
  mines: {
    intro: copy(
      'Minesweeper is the logic puzzle of hidden mines: each number shows how many mines touch that square. Uncover every safe square without hitting a mine, on three board sizes made to fit a phone.',
      'Minesweeper este puzzle-ul de logică cu mine ascunse: fiecare număr arată câte mine ating acel pătrat. Descoperă toate pătratele sigure fără să calci pe o mină, pe trei mărimi de tablă potrivite pentru telefon.',
    ),
    faq: [
      copy('Can I hit a mine on the first click?', 'Pot nimeri o mină la prima apăsare?'),
      copy('No. The first square you open is always safe and clears an area around it, so every game starts with something to work from.',
        'Nu. Primul pătrat pe care îl deschizi este mereu sigur și deschide o zonă în jurul lui, așa că fiecare joc începe cu informații de la care să pornești.'),
    ],
    related: ['sudoku', 'twenty48', 'solitaire'],
  },
  hockey: {
    intro: copy(
      'Air Hockey brings the arcade table to your screen. Drag your mallet, bank the puck off the side walls and score in the rival goal; the first to seven goals wins.',
      'Air Hockey aduce masa din sala de jocuri pe ecranul tău. Trage de crosă, trimite pucul din mantinelă și înscrie în poarta adversarului; câștigă primul care ajunge la șapte goluri.',
    ),
    faq: [
      copy('Can two people play Air Hockey on one phone?', 'Pot juca doi oameni Air Hockey pe un singur telefon?'),
      copy('Yes. Each player drags on their own half of the screen, so you can sit across from each other with the phone or tablet between you.',
        'Da. Fiecare jucător trage pe jumătatea lui de ecran, așa că puteți sta față în față cu telefonul sau tableta între voi.'),
    ],
    related: ['paddle', 'bricks', 'racing'],
  },
  reversi: {
    intro: copy(
      'Reversi is the classic disc-flipping strategy game on an 8×8 board. Place a disc so that it traps a line of your rival\'s discs and they all flip to your colour; the player with more discs when the board is full wins.',
      'Reversi este jocul clasic de strategie pe o tablă de 8×8 în care întorci piesele adversarului. Așază o piesă astfel încât să încercuiești un șir de piese ale adversarului, iar acestea trec de partea ta; câștigă cine are mai multe piese la final.',
    ),
    faq: [
      copy('Is Reversi the same as Othello?', 'Reversi este același joc cu Othello?'),
      copy('They share the same core rules. Othello is a trademarked edition of Reversi with a fixed starting position, which this game also uses.',
        'Au aceleași reguli de bază. Othello este o ediție înregistrată ca marcă a jocului Reversi, cu o poziție de start fixă, pe care o folosește și acest joc.'),
    ],
    related: ['fourrow', 'tintar', 'septica'],
  },
  solitaire: {
    intro: copy(
      'Solitaire here is Klondike, the patience card game most people know: build four foundations from ace to king by suit, moving cards between seven columns in alternating colours. Draw one card at a time or three, and undo any move.',
      'Solitaire este aici varianta Klondike, pasiența pe care o știe toată lumea: construiești patru fundații de la as la rege, pe culori, mutând cărțile între șapte coloane în culori alternante. Trage câte o carte sau câte trei și anulează orice mutare.',
    ),
    faq: [
      copy('Is every game of Solitaire winnable?', 'Se poate câștiga orice joc de Solitaire?'),
      copy('No. Some Klondike deals cannot be won whatever you do. If a game reaches a point where no move can help, the game tells you so you can deal again.',
        'Nu. Unele împărțiri Klondike nu pot fi câștigate orice ai face. Dacă jocul ajunge într-un punct în care nicio mutare nu mai ajută, ești anunțat ca să poți împărți din nou.'),
    ],
    related: ['septica', 'mines', 'sudoku'],
  },
  hangman: {
    intro: copy(
      'Hangman is the word-guessing game: find the hidden word one letter at a time before the figure is finished. Choose a category and a difficulty, and play with English or Romanian words.',
      'Spânzurătoarea este jocul în care ghicești un cuvânt: găsește cuvântul ascuns literă cu literă înainte să fie desenat omulețul. Alege o categorie și o dificultate și joacă cu cuvinte în română sau în engleză.',
    ),
    faq: [
      copy('Can I play Hangman in Romanian?', 'Pot juca Spânzurătoarea în română?'),
      copy('Yes. Switch the arcade to Romanian and the words are Romanian too. Guessing A also finds Ă and Â, I finds Î, S finds Ș and T finds Ț.',
        'Da. Treci arcade-ul pe limba română și cuvintele vor fi tot în română. Litera A găsește și Ă și Â, I găsește Î, S găsește Ș, iar T găsește Ț.'),
    ],
    related: ['sudoku', 'mines', 'twenty48'],
  },
};

const pick = (text: Copy, language: ArcadeLanguage): string => text[language === 'ro' ? 1 : 0];

/** Questions every game answers the same way, so each page still has a full FAQ. */
function standardFaq(gameId: ArcadeGameId): Faq[] {
  const { name, modes } = GAME_META[gameId];
  const faq: Faq[] = [[
    copy(`Is ${name} free to play?`, `${name} este gratuit?`),
    copy(`Yes. ${name} is free and runs straight in your browser, with no download and no sign-up.`,
      `Da. ${name} este gratuit și rulează direct în browser, fără descărcare și fără cont.`),
  ]];
  if (modes.includes('online')) {
    faq.push([
      copy(`Can I play ${name} with a friend?`, `Pot juca ${name} cu un prieten?`),
      copy('Yes. Play side by side on the same device, or online: create a room and send your friend the invite link or code.',
        'Da. Jucați unul lângă altul pe același dispozitiv sau online: creează o cameră și trimite-i prietenului linkul sau codul de invitație.'),
    ]);
  } else if (modes.includes('local')) {
    faq.push([
      copy(`Can I play ${name} with a friend?`, `Pot juca ${name} cu un prieten?`),
      copy('Yes, on the same device: a second player joins in co-op beside you.',
        'Da, pe același dispozitiv: un al doilea jucător ți se alătură în cooperare.'),
    ]);
  }
  faq.push([
    copy(`Does ${name} work on a phone?`, `${name} merge pe telefon?`),
    copy(`Yes. ${name} works in any modern browser on phones, tablets and computers, and its controls are made for touch screens as well as keyboards.`,
      `Da. ${name} merge în orice browser modern, pe telefon, tabletă sau calculator, iar comenzile sunt făcute atât pentru ecrane tactile, cât și pentru tastatură.`),
  ]);
  return faq;
}

export function gameFaq(gameId: ArcadeGameId): Faq[] {
  return [GAME_CONTENT[gameId].faq, ...standardFaq(gameId)];
}

const LABELS = {
  howTo: copy('How to play', 'Cum se joacă'),
  goal: copy('Goal', 'Scopul jocului'),
  controls: copy('Controls', 'Comenzi'),
  rules: copy('Rules', 'Reguli'),
  tip: copy('Tip', 'Sfat'),
  faq: copy('Questions about', 'Întrebări despre'),
  more: copy('More free games', 'Alte jocuri gratuite'),
  all: copy('All games', 'Toate jocurile'),
};

/** FAQPage structured data, so the answers can show up directly in search results. */
export function faqStructuredData(gameId: ArcadeGameId, language: ArcadeLanguage): unknown {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: language,
    mainEntity: gameFaq(gameId).map(([question, answer]) => ({
      '@type': 'Question',
      name: pick(question, language),
      acceptedAnswer: { '@type': 'Answer', text: pick(answer, language) },
    })),
  };
}

/** The "how to play" article under a game, in the page's language. Empty for the hub. */
export function renderGameAbout(view: SeoView, language: ArcadeLanguage): string {
  if (view === 'hub') return '';
  const { name } = GAME_META[view];
  const guide = GAME_GUIDES[view];
  const content = GAME_CONTENT[view];
  const text = (value: Copy): string => escapeHtml(pick(value, language));
  const label = (value: Copy): string => pick(value, language);
  const json = JSON.stringify(faqStructuredData(view, language)).replace(/</g, '\\u003c');
  const links = content.related
    .map(id => `<li><a href="${routePath(id, language)}" data-about-game="${id}">${escapeHtml(GAME_META[id].name)}</a></li>`)
    .concat(`<li><a href="${routePath('hub', language)}">${label(LABELS.all)}</a></li>`)
    .join('');
  return [
    `<section id="gameAbout" class="game-about" data-game="${view}" data-lang="${language}" aria-labelledby="gameAboutTitle">`,
    `<h2 id="gameAboutTitle">${label(LABELS.howTo)} ${escapeHtml(name)}</h2>`,
    `<p class="game-about-intro">${text(content.intro)}</p>`,
    `<div class="game-about-grid">`,
    `<div><h3>${label(LABELS.goal)}</h3><p>${text(guide.objective)}</p></div>`,
    `<div><h3>${label(LABELS.controls)}</h3><p>${text(guide.controls)}</p></div>`,
    `</div>`,
    `<h3>${label(LABELS.rules)}</h3>`,
    `<ul>${guide.rules.map(rule => `<li>${text(rule)}</li>`).join('')}</ul>`,
    `<p class="game-about-tip"><strong>${label(LABELS.tip)}:</strong> ${text(guide.tip)}</p>`,
    `<h3>${label(LABELS.faq)} ${escapeHtml(name)}</h3>`,
    gameFaq(view).map(([question, answer]) => `<details><summary>${text(question)}</summary><p>${text(answer)}</p></details>`).join(''),
    `<h3>${label(LABELS.more)}</h3>`,
    `<ul class="game-about-links">${links}</ul>`,
    `<script type="application/ld+json">${json}</script>`,
    `</section>`,
  ].join('\n');
}

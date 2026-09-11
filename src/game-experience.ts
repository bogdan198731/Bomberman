import { currentArcadeLanguage, translateArcadeText } from './i18n.js';
import { circuitCurrentGame, circuitIsComplete, loadCircuitProgress } from './circuit.js';
import { GAME_META, type ArcadeGameId, type ArcadeResult } from './stats.js';

export const GAME_GUIDE_STORAGE_KEY = 'blast-arcade-guides-v1';

interface GuideCopy {
  objective: [string, string];
  controls: [string, string];
  rules: [string, string][];
  tip: [string, string];
}

const copy = (en: string, ro: string): [string, string] => [en, ro];
export const GAME_GUIDES: Record<ArcadeGameId, GuideCopy> = {
  bomberman: {
    objective: copy('Trap Coral with an explosion and be the last buddy standing.', 'Prinde-l pe Coral într-o explozie și rămâi ultimul jucător în viață.'),
    controls: copy('Move with WASD, arrows, or the joystick. Place a bomb with Space, Enter, or Bomb.', 'Mișcă-te cu WASD, săgețile sau joystickul. Pune o bombă cu Spațiu, Enter sau Bombă.'),
    rules: [copy('Practice: place one bomb beside a crate, then turn a corner before its fuse ends.', 'Exercițiu: pune o bombă lângă o ladă, apoi treci după colț înainte să expire fitilul.'), copy('Bomb Up adds capacity, Fire Up extends the blast, and Speed Up improves movement.', 'Bomb Up mărește capacitatea, Fire Up extinde explozia, iar Speed Up grăbește mișcarea.'), copy('First to 3 rounds wins; danger tiles appear late to stop stalemates.', 'Primul la 3 runde câștigă; spre final apar zone periculoase pentru a evita blocajele.')],
    tip: copy('Never place a bomb without spotting an escape corner first.', 'Nu pune o bombă înainte să vezi un colț sigur pentru retragere.'),
  },
  tintar: {
    objective: copy('Form mills—three pieces in a line—to capture pieces and reduce Coral below three.', 'Formează mori—trei piese în linie—pentru a captura și a-l lăsa pe Coral cu mai puțin de trei.'),
    controls: copy('Tap or click a highlighted point. In movement, select a piece then its destination.', 'Apasă un punct evidențiat. La mutare, alege o piesă și apoi destinația.'),
    rules: [copy('Placement: players alternate placing all nine pieces.', 'Așezare: jucătorii pun alternativ toate cele nouă piese.'), copy('A new mill lets you remove one unprotected rival piece.', 'O moară nouă îți permite să elimini o piesă adversă neprotejată.'), copy('Movement follows lines; with only three pieces you may fly anywhere.', 'Mutarea urmează liniile; cu doar trei piese poți zbura oriunde.')],
    tip: copy('Build two nearly complete mills so one move can reopen either threat.', 'Construiește două mori aproape complete pentru a putea redeschide oricare amenințare.'),
  },
  paddle: {
    objective: copy('Return the ball past Coral. The first player to 7 wins.', 'Trimite mingea dincolo de Coral. Primul jucător la 7 puncte câștigă.'),
    controls: copy('Practice: drag the Mint paddle directly. Keyboard uses W/S; local Coral uses arrows.', 'Antrenament: trage direct paleta Mint. Tastatura folosește W/S; Coral local folosește săgețile.'),
    rules: [copy('Hit nearer a paddle edge for a sharper angle.', 'Lovește mai aproape de marginea paletei pentru un unghi mai ascuțit.'), copy('Long rallies gradually accelerate the ball.', 'Schimburile lungi accelerează treptat mingea.')],
    tip: copy('Return toward open space instead of chasing the ball at the last moment.', 'Trimite spre spațiul liber în loc să urmărești mingea în ultima clipă.'),
  },
  snake: {
    objective: copy('Collect fruit, grow, and avoid walls, trails, and the rival snake.', 'Colectează fructe, crește și evită pereții, urmele și șarpele rival.'),
    controls: copy('Swipe the arena, use the direction pad/joystick, or press WASD and arrows.', 'Glisează pe arenă, folosește padul/joystickul sau tastele WASD și săgețile.'),
    rules: [copy('You cannot reverse directly into your own body.', 'Nu poți întoarce direct în propriul corp.'), copy('Start on Chill speed while learning the turn rhythm.', 'Începe pe viteza Calm pentru a învăța ritmul virajelor.')],
    tip: copy('Leave yourself an exit before circling a fruit.', 'Lasă-ți o ieșire înainte să înconjori un fruct.'),
  },
  tanks: {
    objective: copy('Bank shots around cover and win five rounds.', 'Ricoșează proiectilele în jurul obstacolelor și câștigă cinci runde.'),
    controls: copy('Moving also turns your turret. Use Fire only when the readiness ring is full.', 'Mișcarea rotește și turela. Trage doar când indicatorul de pregătire este plin.'),
    rules: [copy('Shots bounce once from the arena wall.', 'Proiectilele ricoșează o dată din peretele arenei.'), copy('Orange cover breaks; steel cover does not.', 'Adăpostul portocaliu se sparge; cel de oțel nu.')],
    tip: copy('Aim at a wall angle to reach a tank hiding behind cover.', 'Țintește într-un unghi de perete pentru a lovi un tanc ascuns după adăpost.'),
  },
  septica: {
    objective: copy('Capture aces and tens; each is worth one point.', 'Capturează așii și zecarii; fiecare valorează un punct.'),
    controls: copy('Tap a card to play. When cut, continue with a 7/opening rank or concede.', 'Apasă o carte. Când ești tăiat, continuă cu un 7/figura de deschidere sau cedează.'),
    rules: [copy('Sample: Mint leads A, Coral plays 9—Mint takes the trick.', 'Exemplu: Mint deschide cu A, Coral pune 9—Mint ia masa.'), copy('Any 7 or a card matching the opening rank cuts.', 'Orice 7 sau o carte cu aceeași figură ca deschiderea taie.'), copy('After a cut back, the responder still plays one final card before the exchange ends.', 'După o tăiere înapoi, adversarul mai joacă o carte înainte ca schimbul să se încheie.')],
    tip: copy('Save sevens to contest valuable ace-and-ten tricks.', 'Păstrează șeptarii pentru mesele valoroase cu ași și zecari.'),
  },
  survival: {
    objective: copy('Survive waves, protect the center, and build a stronger loadout.', 'Supraviețuiește valurilor, apără centrul și construiește un echipament mai puternic.'),
    controls: copy('Move with the joystick/WASD. Hold Fire, or enable Auto-fire, to shoot the nearest enemy.', 'Mișcă-te cu joystickul/WASD. Ține Foc sau activează Foc automat pentru a trage în cel mai apropiat inamic.'),
    rules: [copy('Fast scouts flank; heavy enemies are slower but tougher.', 'Cercetașii rapizi flanchează; inamicii grei sunt mai lenți, dar rezistenți.'), copy('Choose one upgrade between waves instead of receiving a fixed bonus.', 'Alege o îmbunătățire între valuri în locul unui bonus fix.')],
    tip: copy('Keep moving across the center so auto-aim can isolate the nearest threat.', 'Mișcă-te prin centru pentru ca țintirea automată să izoleze amenințarea apropiată.'),
  },
  star: {
    objective: copy('Break formations, collect weapon drops, and defeat every fifth-wave command ship.', 'Sparge formațiile, colectează arme și învinge nava de comandă la fiecare al cincilea val.'),
    controls: copy('Move with joystick/WASD and hold Fire. Coral joins in local co-op.', 'Mișcă-te cu joystickul/WASD și ține Foc. Coral intră în cooperativ local.'),
    rules: [copy('Weapon drops rotate through spread, rapid fire, and shield.', 'Bonusurile alternează între dispersie, foc rapid și scut.'), copy('Clearing a co-op wave rescues a defeated wingmate once.', 'Finalizarea unui val cooperativ salvează o dată coechipierul învins.')],
    tip: copy('Clear one side first to create a safe lane through enemy fire.', 'Curăță întâi o parte pentru a crea un culoar sigur printre proiectile.'),
  },
  racing: {
    objective: copy('Pass checkpoints in order and finish three laps before Coral.', 'Treci punctele de control în ordine și termină trei ture înaintea lui Coral.'),
    controls: copy('Steer left/right; hold Go or enable Auto-accelerate. Brake for tight turns.', 'Virează stânga/dreapta; ține Accelerează sau activează Auto-accelerare. Frânează în viraje strânse.'),
    rules: [copy('The highlighted gate and arrow show your next checkpoint.', 'Poarta evidențiată și săgeata indică următorul punct de control.'), copy('Turbo bolts give a short speed boost.', 'Bonusurile turbo oferă o creștere scurtă de viteză.')],
    tip: copy('Release steering just before exiting a corner to settle the car.', 'Eliberează direcția chiar înainte de ieșirea din viraj pentru a stabiliza mașina.'),
  },
  blocks: {
    objective: copy('Clear lines and send garbage until Coral tops out.', 'Elimină linii și trimite blocuri până când Coral nu mai are loc.'),
    controls: copy('Move, rotate, soft drop, or hard drop with the on-screen controls or keyboard.', 'Mută, rotește, coboară lent sau instant cu comenzile de pe ecran ori tastatura.'),
    rules: [copy('The ghost shows exactly where the piece will land.', 'Umbra arată exact unde va ateriza piesa.'), copy('Clearing multiple lines sends more garbage; clears can cancel incoming rows.', 'Eliminarea mai multor linii trimite mai multe blocuri; liniile pot anula rândurile primite.')],
    tip: copy('Keep one vertical well open for the long I piece.', 'Păstrează un puț vertical liber pentru piesa I lungă.'),
  },
  twenty48: {
    objective: copy('Merge equal tiles until you create 2048.', 'Unește piesele egale până creezi 2048.'),
    controls: copy('Swipe anywhere on the board, use arrow keys, or use the direction buttons.', 'Glisează pe tablă, folosește săgețile sau butoanele de direcție.'),
    rules: [copy('Each tile merges only once per move.', 'Fiecare piesă se unește o singură dată la o mutare.'), copy('Casual mode keeps one undo; using it restores the exact previous board.', 'Modul relaxat păstrează o anulare; aceasta restaurează exact tabla anterioară.')],
    tip: copy('Build your largest tile in one corner and avoid moving it away.', 'Construiește cea mai mare piesă într-un colț și evită să o muți de acolo.'),
  },
  sudoku: {
    objective: copy('Fill every row, column, and 3×3 box with 1 through 9 once each.', 'Completează fiecare rând, coloană și careu 3×3 cu cifrele 1–9 o singură dată.'),
    controls: copy('Select a cell, then a number. Notes adds small candidates; Erase removes your entry.', 'Alege o celulă, apoi un număr. Notițe adaugă candidați mici; Șterge elimină valoarea.'),
    rules: [copy('Only visible row, column, or box conflicts count as mistakes.', 'Doar conflictele vizibile din rând, coloană sau careu sunt greșeli.'), copy('Relaxed view hides time and score pressure; hints remain limited by difficulty.', 'Modul relaxat ascunde presiunea timpului și scorului; indiciile rămân limitate de dificultate.')],
    tip: copy('Start with rows, columns, or boxes that have the fewest empty cells.', 'Începe cu rândurile, coloanele sau careurile cu cele mai puține celule goale.'),
  },
};

const REPLAY_SELECTORS: Record<ArcadeGameId, string> = {
  bomberman: '#restartButton', tintar: '#tintarRevengeButton, #tintarRestartButton', paddle: '#paddleRestartButton',
  snake: '#snakeRestartButton', tanks: '#tanksRestartButton', septica: '#septicaRestartButton',
  survival: '#survivalRestartButton', star: '#starRestartButton', racing: '#racingRestartButton',
  blocks: '#blocksRestartButton', twenty48: '[data-twenty48-reset]', sudoku: '[data-sudoku-new]',
};

const RESULT_STATUS_SELECTORS: Record<ArcadeGameId, string> = {
  bomberman: '#statusText', tintar: '#tintarStatus', paddle: '#paddleStatus', snake: '#snakeStatus',
  tanks: '#tanksStatus', septica: '#septicaStatus', survival: '#survivalStatus', star: '#starStatus',
  racing: '#racingStatus', blocks: '#blocksStatus', twenty48: '#twenty48Status', sudoku: '#sudokuStatus',
};

function localized(pair: [string, string]): string { return pair[currentArcadeLanguage() === 'ro' ? 1 : 0]; }

function seenGuides(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(GAME_GUIDE_STORAGE_KEY) ?? '[]') as string[]); }
  catch { return new Set(); }
}

function saveSeen(gameId: ArcadeGameId): void {
  const seen = seenGuides();
  seen.add(gameId);
  try { localStorage.setItem(GAME_GUIDE_STORAGE_KEY, JSON.stringify([...seen])); }
  catch { /* The guide may repeat if private storage is unavailable. */ }
}

export function initGameExperience(): void {
  if (typeof document === 'undefined') return;
  const guideOverlay = document.createElement('div');
  guideOverlay.className = 'game-help-overlay';
  guideOverlay.hidden = true;
  guideOverlay.innerHTML = '<section class="game-help-card" role="dialog" aria-modal="true" aria-labelledby="gameHelpTitle"><span class="game-help-kicker"></span><h2 id="gameHelpTitle"></h2><p class="game-help-objective"></p><h3></h3><p class="game-help-controls"></p><ol class="game-help-rules"></ol><p class="game-help-tip"></p><button class="game-help-close" type="button"></button></section>';
  document.body.append(guideOverlay);
  let activeGuide: ArcadeGameId = 'bomberman';

  const renderGuide = (gameId: ArcadeGameId): void => {
    activeGuide = gameId;
    const guide = GAME_GUIDES[gameId];
    const ro = currentArcadeLanguage() === 'ro';
    guideOverlay.querySelector<HTMLElement>('.game-help-kicker')!.textContent = ro ? 'GHID RAPID · POȚI SĂRI' : 'QUICK GUIDE · SKIPPABLE';
    guideOverlay.querySelector<HTMLElement>('#gameHelpTitle')!.textContent = GAME_META[gameId].name;
    guideOverlay.querySelector<HTMLElement>('.game-help-objective')!.textContent = localized(guide.objective);
    guideOverlay.querySelector<HTMLElement>('h3')!.textContent = ro ? 'Comenzi și reguli' : 'Controls & rules';
    guideOverlay.querySelector<HTMLElement>('.game-help-controls')!.textContent = localized(guide.controls);
    const list = guideOverlay.querySelector<HTMLOListElement>('.game-help-rules')!;
    list.replaceChildren(...guide.rules.map(rule => {
      const item = document.createElement('li'); item.textContent = localized(rule); return item;
    }));
    guideOverlay.querySelector<HTMLElement>('.game-help-tip')!.textContent = `${ro ? 'Sfat' : 'Player tip'}: ${localized(guide.tip)}`;
    guideOverlay.querySelector<HTMLButtonElement>('.game-help-close')!.textContent = ro ? 'Am înțeles — joacă' : 'Got it — play';
  };
  const openGuide = (gameId: ArcadeGameId): void => {
    renderGuide(gameId);
    guideOverlay.hidden = false;
    saveSeen(gameId);
    guideOverlay.querySelector<HTMLButtonElement>('.game-help-close')?.focus();
  };
  const closeGuide = (): void => { guideOverlay.hidden = true; };
  guideOverlay.querySelector('.game-help-close')?.addEventListener('click', closeGuide);
  guideOverlay.addEventListener('click', event => { if (event.target === guideOverlay) closeGuide(); });

  document.querySelectorAll<HTMLElement>('[id$="View"]:not(#hubView)').forEach(view => {
    const gameId = (view.id === 'gameView' ? 'bomberman' : view.id.replace(/View$/, '')) as ArcadeGameId;
    if (!GAME_GUIDES[gameId]) return;
    const actions = view.querySelector<HTMLElement>('.game-nav-actions');
    if (!actions) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'game-help-button'; button.dataset.gameHelp = gameId;
    button.textContent = '? How to play';
    button.addEventListener('click', () => openGuide(gameId));
    actions.insertBefore(button, actions.querySelector('[data-pause-game]'));
  });

  const resultOverlay = document.createElement('div');
  resultOverlay.className = 'arcade-result-overlay';
  resultOverlay.hidden = true;
  resultOverlay.innerHTML = '<section class="arcade-result-card" role="dialog" aria-modal="true" aria-labelledby="arcadeResultTitle"><span class="arcade-result-kicker"></span><h2 id="arcadeResultTitle"></h2><p class="arcade-result-explanation"></p><div class="arcade-result-actions"><button type="button" data-result-replay></button><button type="button" data-result-next hidden></button><button type="button" data-result-close></button></div></section>';
  document.body.append(resultOverlay);
  let resultGame: ArcadeGameId = 'bomberman';
  const closeResult = (): void => { resultOverlay.hidden = true; };
  resultOverlay.querySelector('[data-result-close]')?.addEventListener('click', closeResult);
  resultOverlay.querySelector('[data-result-replay]')?.addEventListener('click', () => {
    closeResult();
    document.querySelector<HTMLElement>(REPLAY_SELECTORS[resultGame])?.click();
  });
  resultOverlay.querySelector('[data-result-next]')?.addEventListener('click', () => {
    const circuit = loadCircuitProgress().current;
    const next = circuit && !circuitIsComplete(circuit) ? circuitCurrentGame(circuit) : null;
    if (!next) return;
    const mode = circuit?.mode === 'friends' ? 'local' : 'solo';
    closeResult();
    window.dispatchEvent(new CustomEvent('arcade-request-launch', { detail: { gameId: next, mode } }));
  });

  window.addEventListener('arcade-view-changed', event => {
    closeResult();
    const view = (event as CustomEvent<{ view?: string }>).detail?.view as ArcadeGameId | undefined;
    if (view && GAME_GUIDES[view] && !seenGuides().has(view)) window.setTimeout(() => openGuide(view), 180);
  });
  window.addEventListener('arcade-language-change', () => { if (!guideOverlay.hidden) renderGuide(activeGuide); });
  window.addEventListener('arcade-game-result', event => {
    const detail = (event as CustomEvent<{ gameId: ArcadeGameId; result: ArcadeResult }>).detail;
    if (!detail || !GAME_GUIDES[detail.gameId]) return;
    resultGame = detail.gameId;
    const ro = currentArcadeLanguage() === 'ro';
    const label = detail.result.outcome === 'win' ? (ro ? 'VICTORIE' : 'VICTORY')
      : detail.result.outcome === 'loss' ? (ro ? 'ÎNFRÂNGERE' : 'DEFEAT')
        : detail.result.outcome === 'draw' ? (ro ? 'EGALITATE' : 'DRAW') : (ro ? 'COMPLET' : 'COMPLETE');
    resultOverlay.querySelector<HTMLElement>('.arcade-result-kicker')!.textContent = GAME_META[detail.gameId].name;
    resultOverlay.querySelector<HTMLElement>('#arcadeResultTitle')!.textContent = label;
    const statusText = document.querySelector<HTMLElement>(RESULT_STATUS_SELECTORS[detail.gameId])?.textContent?.trim();
    const fallback = ro
      ? label === 'VICTORIE' ? 'Obiectiv atins.' : label === 'COMPLET' ? 'Sesiune încheiată.'
        : label === 'EGALITATE' ? 'Niciun jucător nu a obținut avantajul decisiv.' : 'Rivalul a îndeplinit primul obiectivul.'
      : label === 'VICTORY' ? 'Objective achieved.' : label === 'COMPLETE' ? 'Session complete.'
        : label === 'DRAW' ? 'Neither player found the deciding advantage.' : 'The rival completed the objective first.';
    const explanation = statusText ? translateArcadeText(statusText, currentArcadeLanguage()) : fallback;
    resultOverlay.querySelector<HTMLElement>('.arcade-result-explanation')!.textContent = `${explanation} ${ro ? 'Scor' : 'Score'}: ${Math.max(0, Math.floor(detail.result.score ?? 0)).toLocaleString()}.`;
    resultOverlay.querySelector<HTMLButtonElement>('[data-result-replay]')!.textContent = ro ? 'Joacă din nou' : 'Play again';
    resultOverlay.querySelector<HTMLButtonElement>('[data-result-close]')!.textContent = ro ? 'Închide' : 'Close';
    const circuit = loadCircuitProgress().current;
    const nextButton = resultOverlay.querySelector<HTMLButtonElement>('[data-result-next]')!;
    const next = circuit && !circuitIsComplete(circuit) ? circuitCurrentGame(circuit) : null;
    nextButton.hidden = !next;
    if (next) nextButton.textContent = `${ro ? 'Etapa următoare' : 'Next stage'} · ${GAME_META[next].name}`;
    resultOverlay.hidden = false;
    resultOverlay.querySelector<HTMLButtonElement>('[data-result-replay]')?.focus();
  });
}

export type ArcadeLanguage = 'en' | 'ro';

const ROMANIAN_TRANSLATIONS: Record<string, string> = {
  '⚙ Settings': '⚙ Setări',
  'Open arcade settings': 'Deschide setările arcadei',
  'Close arcade settings': 'Închide setările arcadei',
  'Browser gaming hub': 'Centru de jocuri în browser',
  'Legends': 'Legende',
  'Open local leaderboards': 'Deschide clasamentele locale',
  'Arcade Player': 'Jucător Arcade',
  'Profile': 'Profil',
  'Open your player profile': 'Deschide profilul de jucător',
  'Online': 'Online',
  'Your pocket arcade': 'Arcada ta de buzunar',
  'Pick a game.': 'Alege un joc.',
  'Make some noise.': 'Fă puțină gălăgie.',
  'Fast browser games built for solo runs, couch-sized rivalries, and online challenges. No download—just choose and play.':
    'Jocuri rapide în browser pentru aventuri solo, dueluri pe aceeași canapea și provocări online. Fără descărcare—alegi și joci.',
  'Play Blast Buddies': 'Joacă Blast Buddies',
  'Browse games': 'Vezi jocurile',
  'Install app': 'Instalează aplicația',
  'Bot levels': 'Niveluri bot',
  'Online rooms': 'Camere online',
  'Mobile ready': 'Pregătit pentru mobil',
  'Arcade features': 'Funcțiile arcadei',
  'Quick Play pick': 'Recomandare Joc Rapid',
  'Choose a Quick Play mode': 'Alege un mod de Joc Rapid',
  'Any mode': 'Orice mod',
  'Solo': 'Solo',
  'Local 2P': 'Local 2P',
  'Shuffle Quick Play recommendation': 'Schimbă recomandarea de Joc Rapid',
  'Three-game challenge': 'Provocare în trei jocuri',
  'Arcade Circuit': 'Circuit Arcade',
  'Ready for a new three-game run': 'Pregătit pentru o nouă serie de trei jocuri',
  'Circuit game lineup': 'Lista jocurilor din circuit',
  'Mystery game': 'Joc misterios',
  'Revealed when you start': 'Se dezvăluie la start',
  'Points': 'Puncte',
  'Wins': 'Victorii',
  'Best': 'Record',
  'Runs': 'Serii',
  'Start a new circuit': 'Pornește un circuit nou',
  'Replace this circuit with a new lineup': 'Înlocuiește circuitul cu o listă nouă',
  'New lineup': 'Listă nouă',
  'Player profile': 'Profil jucător',
  'Your arcade record': 'Recordul tău în arcadă',
  'Player name': 'Numele jucătorului',
  'Save': 'Salvează',
  'Progress to next level': 'Progres până la nivelul următor',
  'Saved privately on this device': 'Salvat privat pe acest dispozitiv',
  'Player totals': 'Totaluri jucător',
  'Played': 'Jucate',
  'Score': 'Scor',
  'Records by game': 'Recorduri pe joc',
  'Today in the arcade': 'Astăzi în arcadă',
  'Daily challenge': 'Provocarea zilnică',
  'Resets daily': 'Se resetează zilnic',
  'Finish 2 matches today to earn +100 XP.': 'Termină 2 meciuri astăzi pentru +100 XP.',
  'Daily progress': 'Progres zilnic',
  'Daily challenge progress': 'Progresul provocării zilnice',
  'Longer goals': 'Obiective mai lungi',
  'Weekly quests': 'Misiuni săptămânale',
  'Ends Sunday': 'Se încheie duminică',
  'Quest board': 'Panou de misiuni',
  'Weekly quest progress': 'Progresul misiunilor săptămânale',
  'Milestones': 'Repere',
  'Achievement cabinet': 'Colecție de realizări',
  'Player achievements': 'Realizările jucătorului',
  'Personal insights': 'Statistici personale',
  'Your recent arcade form': 'Forma ta recentă în arcadă',
  'Player insights': 'Statistici jucător',
  'Recent win rate': 'Rata recentă de victorii',
  'Most played': 'Cel mai jucat',
  'Best score': 'Cel mai bun scor',
  'Current win streak': 'Seria actuală de victorii',
  'Latest results': 'Ultimele rezultate',
  'Finish a match to start your activity feed.': 'Termină un meci pentru a începe istoricul activității.',
  'Couch competition': 'Competiție locală',
  'Arcade Legends': 'Legendele Arcadei',
  'Each player name keeps its best result. Switch the profile name above when friends take a turn.':
    'Fiecare nume de jucător își păstrează cel mai bun rezultat. Schimbă numele profilului când joacă un prieten.',
  'Choose a game leaderboard': 'Alege clasamentul unui joc',
  'Local top five': 'Top cinci local',
  'Waiting for the first result · saved on this device': 'Se așteaptă primul rezultat · salvat pe acest dispozitiv',
  'Finish a match to claim the first spot.': 'Termină un meci pentru a ocupa primul loc.',
  'Game library': 'Bibliotecă de jocuri',
  'Choose your next round': 'Alege următoarea rundă',
  'Twelve instant games, from explosive duels and Romanian classics to Sudoku and number puzzles, neon racing, co-op survival, and star-fighter missions.':
    'Douăsprezece jocuri instant, de la dueluri explozive și clasice românești la Sudoku și puzzle-uri cu numere, curse neon, supraviețuire cooperativă și misiuni stelare.',
  'Search games': 'Caută jocuri',
  'Clear game search': 'Șterge căutarea',
  'Filter games by play mode': 'Filtrează jocurile după modul de joc',
  'All games': 'Toate jocurile',
  '★ Favorites': '★ Favorite',
  'Live now': 'Disponibil acum',
  'New race': 'Cursă nouă',
  'New battle': 'Luptă nouă',
  'New mission': 'Misiune nouă',
  'New puzzle': 'Puzzle nou',
  'Play now': 'Joacă acum',
  'Choose how to play': 'Alege cum vrei să joci',
  'Share this device, battle a smart bot, or challenge a friend online.': 'Folosește același dispozitiv, luptă cu un bot inteligent sau provoacă un prieten online.',
  'Play local 2P': 'Joacă local 2P',
  'or challenge a bot': 'sau provoacă un bot',
  'Single player vs bot': 'Un jucător contra bot',
  'Easy': 'Ușor',
  'Normal': 'Normal',
  'Hard': 'Greu',
  'Bot difficulty': 'Dificultatea botului',
  'Swipe for online play': 'Glisează pentru joc online',
  'or play online': 'sau joacă online',
  'or create a private room': 'sau creează o cameră privată',
  'Create invite code': 'Creează cod de invitație',
  'or join a friend': 'sau intră la un prieten',
  'Create a room or enter an invitation code.': 'Creează o cameră sau introdu un cod de invitație.',
  'Outsmart bots or invite a friend into a fast explosive maze battle.':
    'Păcălește boții sau invită un prieten într-o luptă rapidă printr-un labirint exploziv.',
  "Build mills, capture rival pieces, and master Romania's classic strategy board game.":
    'Formează mori, capturează piesele adversarului și stăpânește jocul clasic românesc de strategie.',
  'A quick-fire paddle duel with accelerating rallies, sharp angles, and local rivalry.':
    'Un duel rapid cu palete, schimburi tot mai rapide, unghiuri precise și rivalitate locală.',
  'Chase glowing cells in a solo high-score run or survive a local two-snake duel.':
    'Urmărește celulele luminoase pentru un record solo sau supraviețuiește unui duel local între doi șerpi.',
  'Break cover, bank one-bounce shots, and battle a bot or a friend to five rounds.':
    'Distruge adăposturile, ricoșează proiectile și luptă cu un bot sau un prieten până la cinci runde.',
  'Drift around a neon circuit, collect turbo bolts, and race a bot or friend through three laps.':
    'Derapează pe un circuit neon, colectează turbo și întrece un bot sau un prieten timp de trei ture.',
  'Build clean stacks, clear lines, and bury a bot or friend under incoming garbage blocks.':
    'Construiește stive curate, elimină linii și îngroapă un bot sau un prieten sub blocuri.',
  'Slide matching numbers together, build clever combos, and create the legendary 2048 tile.':
    'Glisează numerele identice, creează combinații inteligente și formează legendara piesă 2048.',
  'Complete every row, column, and 3×3 box across three carefully tuned difficulty levels.':
    'Completează fiecare rând, coloană și careu 3×3 în trei niveluri de dificultate atent echilibrate.',
  'Cut with sevens, capture aces and tens, and outplay the Coral dealer.':
    'Taie cu șeptari, capturează ași și zecari și învinge dealerul Coral.',
  'Hold the center, auto-aim at neon crawlers, and power up through endless waves.':
    'Apără centrul, țintește automat inamicii neon și evoluează prin valuri nesfârșite.',
  'Break invader formations, collect weapon boosts, and challenge a command ship every fifth wave.':
    'Sparge formațiile invadatorilor, colectează arme și înfruntă o navă de comandă la fiecare al cincilea val.',
  'No games found': 'Nu s-au găsit jocuri',
  'Try another search or show the complete arcade.': 'Încearcă altă căutare sau afișează întreaga arcadă.',
  'Show all games': 'Arată toate jocurile',
  'Blast Arcade · Play instantly in your browser': 'Blast Arcade · Joacă instant în browser',
  'Twelve live games · Keyboard, touch, bots, and online rooms': 'Douăsprezece jocuri active · Tastatură, atingere, boți și camere online',
  'Blast Arcade heroes surrounded by twelve game arenas': 'Eroii Blast Arcade înconjurați de douăsprezece arene de joc',
  'Bot · Local · Online PvP': 'Bot · Local · PvP online',
  'Bot · Local · Online': 'Bot · Local · Online',
  'Solo · Local · Online': 'Solo · Local · Online',
  'Solo · Local · Online co-op': 'Solo · Local · Cooperativ online',
  'Solo · Local co-op': 'Solo · Cooperativ local',
  'Solo puzzle': 'Puzzle solo',
  'Make it yours': 'Personalizează',
  'Arcade settings': 'Setările arcadei',
  'Sound': 'Sunet',
  'Sound effects': 'Efecte sonore',
  'Play lightweight cues for launches, results, and rewards.': 'Redă sunete discrete pentru lansări, rezultate și recompense.',
  'Effects volume': 'Volumul efectelor',
  'Test sound': 'Testează sunetul',
  'Accessibility': 'Accesibilitate',
  'Reduce motion': 'Redu animațiile',
  'Remove animated transitions and smooth scrolling.': 'Elimină tranzițiile animate și derularea lină.',
  'Higher contrast': 'Contrast mărit',
  'Strengthen borders and secondary text throughout the arcade.': 'Accentuează marginile și textele secundare în întreaga arcadă.',
  'Language': 'Limbă',
  'Interface language': 'Limba interfeței',
  'Choose the language used throughout the arcade.': 'Alege limba folosită în întreaga arcadă.',
  'English': 'Engleză',
  'Enter fullscreen': 'Intră pe ecran complet',
  'Exit fullscreen': 'Ieși din ecran complet',
  'Reset settings': 'Resetează setările',
  'Settings are saved privately on this device and apply to every game.':
    'Setările sunt salvate privat pe acest dispozitiv și se aplică tuturor jocurilor.',
  '← Arcade': '← Arcadă',
  'Nine Men\'s Morris · Local or online': 'Moara cu nouă piese · Local sau online',
  'Classic strategy': 'Strategie clasică',
  'Make a mill.': 'Formează o moară.',
  'Take control.': 'Preia controlul.',
  'Place nine pieces each, align three to form a mill, then remove one rival piece.':
    'Așezați câte nouă piese, aliniați trei pentru a forma o moară, apoi eliminați o piesă adversă.',
  'Placement phase': 'Faza de așezare',
  'Movement phase': 'Faza de mutare',
  'Mill formed': 'Moară formată',
  'Match finished': 'Meci încheiat',
  'Player pieces': 'Piesele jucătorilor',
  'hand ·': 'în mână ·',
  'board': 'pe tablă',
  'Place pieces on empty points, one turn at a time.': 'Așază piesele pe punctele libere, pe rând.',
  'Three in a line makes a mill and captures a rival piece.': 'Trei piese în linie formează o moară și capturează o piesă adversă.',
  'After placement, move along connected lines.': 'După așezare, mută piesele pe liniile conectate.',
  'With only three pieces, you may fly to any empty point.': 'Cu doar trei piese, poți zbura către orice punct liber.',
  'Start a new match': 'Începe un meci nou',
  'Full screen board': 'Tablă pe ecran complet',
  'Exit full screen': 'Ieși din ecran complet',
  'Țintar board with 24 playable points': 'Tablă de Țintar cu 24 de puncte de joc',
  'Match complete': 'Meci încheiat',
  'Play revenge match': 'Joacă revanșa',
  'Waiting for Mint…': 'Se așteaptă Mint…',
  'Online room': 'Cameră online',
  'Play locally, or create an invite code for a friend.': 'Joacă local sau creează un cod de invitație pentru un prieten.',
  'Play local': 'Joacă local',
  'Quick Match': 'Meci rapid',
  'Create code': 'Creează cod',
  'Room code': 'Codul camerei',
  'Join': 'Intră',
  'Code': 'Cod',
  'Copy link': 'Copiază linkul',
  'Share': 'Distribuie',
  'Leave': 'Ieși',
  'Local two-player mode ready on this device.': 'Modul local pentru doi jucători este pregătit pe acest dispozitiv.',
  'Looking for a Quick Match opponent…': 'Se caută un adversar pentru Meci rapid…',
  'Connecting to the arcade server…': 'Se conectează la serverul arcadei…',
  'Could not reach the online server.': 'Serverul online nu poate fi contactat.',
  'Enter the five-character invite code.': 'Introdu codul de invitație format din cinci caractere.',
  'The online room closed. Local play is still available.': 'Camera online s-a închis. Jocul local este încă disponibil.',
  'Connection closed. Try again.': 'Conexiunea s-a închis. Încearcă din nou.',
  'Searching for a Quick Match opponent…': 'Se caută un adversar pentru Meci rapid…',
  'Opponent found. Preparing the match…': 'Adversar găsit. Se pregătește meciul…',
  'Joined as Coral. Waiting for Mint…': 'Ai intrat ca Coral. Se așteaptă Mint…',
  'Invite Coral with this code.': 'Invită Coral folosind acest cod.',
  'Waiting for Mint to reconnect…': 'Se așteaptă reconectarea lui Mint…',
  'Shared!': 'Distribuit!',
  'Link copied!': 'Link copiat!',
  'Try again': 'Încearcă din nou',
  'Draw — 50 turns without a capture.': 'Remiză — 50 de ture fără captură.',
  'Slide, merge, and reach 2048': 'Glisează, combină și ajungi la 2048',
  '2048 number puzzle': 'Puzzle numeric 2048',
  'Classic number puzzle': 'Puzzle numeric clasic',
  'Join equal numbers. Build 2048.': 'Unește numere egale. Construiește 2048.',
  'Every move slides the whole board. Matching tiles merge once, and a new tile appears after each successful move.':
    'Fiecare mutare glisează întreaga tablă. Piesele egale se combină o singură dată, iar după fiecare mutare reușită apare o piesă nouă.',
  'New game': 'Joc nou',
  '2048 score': 'Scor 2048',
  '2048 board': 'Tabla 2048',
  'You made 2048!': 'Ai format 2048!',
  'Brilliant run. Keep going or start fresh.': 'Serie excelentă. Continuă sau începe din nou.',
  'Continue playing': 'Continuă jocul',
  'Keep merging — your next move is ready.': 'Continuă să combini — următoarea mutare este pregătită.',
  'That direction is blocked. Try another move.': 'Direcția este blocată. Încearcă altă mutare.',
  '2048 reached — keep building your high score!': 'Ai ajuns la 2048 — continuă să-ți mărești recordul!',
  '2048 touch controls': 'Comenzi tactile 2048',
  'Slide tiles up': 'Glisează piesele în sus',
  'Slide tiles left': 'Glisează piesele la stânga',
  'Slide tiles down': 'Glisează piesele în jos',
  'Slide tiles right': 'Glisează piesele la dreapta',
  'Use arrow keys or WASD. Swipe the board on touch screens.': 'Folosește săgețile sau WASD. Glisează tabla pe ecranele tactile.',
  'No moves left': 'Nu mai sunt mutări',
  'Classic logic puzzle · Easy, medium, or hard': 'Puzzle logic clasic · Ușor, mediu sau greu',
  'Sudoku logic puzzle': 'Puzzle logic Sudoku',
  'Classic logic puzzle': 'Puzzle logic clasic',
  'Every number has one place.': 'Fiecare număr are un singur loc.',
  'Fill each row, column, and 3×3 box with the numbers 1 through 9.':
    'Completează fiecare rând, coloană și careu 3×3 cu numerele de la 1 la 9.',
  'Sudoku difficulty': 'Dificultate Sudoku',
  'Medium': 'Mediu',
  'Sudoku progress': 'Progres Sudoku',
  'Time': 'Timp',
  'Mistakes': 'Greșeli',
  'Hints': 'Indicii',
  'Sudoku board': 'Tabla Sudoku',
  'Puzzle complete!': 'Puzzle finalizat!',
  'Excellent logic. Your score is ready.': 'Logică excelentă. Scorul tău este gata.',
  'Select a cell and place a number from 1 to 9.': 'Selectează o celulă și alege un număr de la 1 la 9.',
  'Sudoku number pad': 'Tastatură numerică Sudoku',
  'Erase': 'Șterge',
  'Hint': 'Indiciu',
  'Tap a cell and number, or use your keyboard. Arrow keys move around the board.':
    'Atinge o celulă și un număr sau folosește tastatura. Săgețile te deplasează pe tablă.',
  'That number is part of the puzzle.': 'Acest număr face parte din puzzle.',
  'That number conflicts with this row, column, or box.': 'Acest număr intră în conflict cu rândul, coloana sau careul.',
  'Cell cleared. Choose another number.': 'Celulă ștearsă. Alege alt număr.',
  'Great — keep going.': 'Foarte bine — continuă.',
  'Given number selected.': 'Ai selectat un număr dat.',
  'Choose a number for this cell.': 'Alege un număr pentru această celulă.',
  'Hint placed — keep going.': 'Indiciu plasat — continuă.',
  'Finish a match in all 12 games.': 'Termină un meci în toate cele 12 jocuri.',
};

let activeLanguage: ArcadeLanguage = 'en';
let initialized = false;
let observer: MutationObserver | null = null;

const textRecords = new WeakMap<Text, { source: string; rendered: string }>();
const attributeRecords = new WeakMap<Element, Map<string, { source: string; rendered: string }>>();
const translatedAttributes = ['aria-label', 'placeholder', 'title', 'alt'] as const;

function translateRomanianPattern(value: string): string | null {
  let match = value.match(/^(\d+) games live$/);
  if (match) return `${match[1]} jocuri active`;
  match = value.match(/^(\d+) games$/);
  if (match) return `${match[1]} jocuri`;
  match = value.match(/^(\d+) available$/);
  if (match) return `${match[1]} disponibile`;
  match = value.match(/^Level (\d+)$/);
  if (match) return `Nivelul ${match[1]}`;
  match = value.match(/^(\d+) saved$/);
  if (match) return `${match[1]} salvate`;
  match = value.match(/^(\d+)\/([0-9]+) matches$/);
  if (match) return `${match[1]}/${match[2]} meciuri`;
  match = value.match(/^(\d+)\/([0-9]+) complete$/);
  if (match) return `${match[1]}/${match[2]} finalizate`;
  match = value.match(/^(\d+)\/([0-9]+) unlocked$/);
  if (match) return `${match[1]}/${match[2]} deblocate`;
  match = value.match(/^(Mint|Coral): place a piece \((\d+) left\)\.$/);
  if (match) return `${match[1]}: așază o piesă (${match[2]} rămase).`;
  match = value.match(/^(Mint|Coral) formed a mill — remove one rival piece\.$/);
  if (match) return `${match[1]} a format o moară — elimină o piesă adversă.`;
  match = value.match(/^(Mint|Coral): fly to any empty point\.$/);
  if (match) return `${match[1]}: zboară către orice punct liber.`;
  match = value.match(/^(Mint|Coral): choose a connected empty point\.$/);
  if (match) return `${match[1]}: alege un punct liber conectat.`;
  match = value.match(/^(Mint|Coral): select a piece to move\.$/);
  if (match) return `${match[1]}: selectează o piesă de mutat.`;
  match = value.match(/^(Mint|Coral) wins the match!$/);
  if (match) return `${match[1]} câștigă meciul!`;
  match = value.match(/^(Mint|Coral) wins!$/);
  if (match) return `${match[1]} câștigă!`;
  match = value.match(/^Great move — \+([\d.,]+) points\.$/);
  if (match) return `Mutare excelentă — +${match[1]} puncte.`;
  match = value.match(/^No moves left\. Final score: ([\d.,]+)\.$/);
  if (match) return `Nu mai sunt mutări. Scor final: ${match[1]}.`;
  match = value.match(/^Final score: ([\d.,]+) points\.$/);
  if (match) return `Scor final: ${match[1]} puncte.`;
  match = value.match(/^Brilliant run — ([\d.,]+) points\. Keep going or start fresh\.$/);
  if (match) return `Serie excelentă — ${match[1]} puncte. Continuă sau începe din nou.`;
  match = value.match(/^Tile (\d+) at row (\d+), column (\d+)$/);
  if (match) return `Piesa ${match[1]} pe rândul ${match[2]}, coloana ${match[3]}`;
  match = value.match(/^Empty tile at row (\d+), column (\d+)$/);
  if (match) return `Loc liber pe rândul ${match[1]}, coloana ${match[2]}`;
  match = value.match(/^Completed in ([0-9:]+) · (\d+) mistakes · ([\d.,]+) points\.$/);
  if (match) return `Finalizat în ${match[1]} · ${match[2]} greșeli · ${match[3]} puncte.`;
  match = value.match(/^(Given|Entered) (\d+), row (\d+), column (\d+)$/);
  if (match) return `${match[1] === 'Given' ? 'Număr dat' : 'Număr introdus'} ${match[2]}, rândul ${match[3]}, coloana ${match[4]}`;
  match = value.match(/^Empty cell, row (\d+), column (\d+)$/);
  if (match) return `Celulă goală, rândul ${match[1]}, coloana ${match[2]}`;
  match = value.match(/^(Empty point|Mint piece|Coral piece), position (\d+)$/);
  if (match) {
    const occupant = match[1] === 'Empty point' ? 'Punct liber' : match[1] === 'Mint piece' ? 'Piesă Mint' : 'Piesă Coral';
    return `${occupant}, poziția ${match[2]}`;
  }
  match = value.match(/^Online match ready · You are (Mint|Coral)$/);
  if (match) return `Meci online pregătit · Ești ${match[1]}`;
  match = value.match(/^Add (.+) to favorites$/);
  if (match) return `Adaugă ${match[1]} la favorite`;
  match = value.match(/^Remove (.+) from favorites$/);
  if (match) return `Elimină ${match[1]} din favorite`;
  return null;
}

export function translateArcadeText(value: string, language: ArcadeLanguage = activeLanguage): string {
  if (language === 'en' || !value) return value;
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  const core = value.slice(leading.length, value.length - trailing.length);
  if (!core) return value;
  const translated = ROMANIAN_TRANSLATIONS[core] ?? translateRomanianPattern(core) ?? core;
  return `${leading}${translated}${trailing}`;
}

export function currentArcadeLanguage(): ArcadeLanguage {
  return activeLanguage;
}

function canTranslateText(node: Text): boolean {
  const parent = node.parentElement;
  return Boolean(parent && !parent.closest('script, style, noscript'));
}

function localizeTextNode(node: Text): void {
  if (!canTranslateText(node)) return;
  const current = node.data;
  let record = textRecords.get(node);
  if (!record) {
    record = { source: current, rendered: current };
    textRecords.set(node, record);
  } else if (current !== record.rendered) {
    record.source = current;
  }
  const rendered = translateArcadeText(record.source);
  record.rendered = rendered;
  if (node.data !== rendered) node.data = rendered;
}

function localizeAttribute(element: Element, attribute: string): void {
  const current = element.getAttribute(attribute);
  if (current === null) return;
  let records = attributeRecords.get(element);
  if (!records) {
    records = new Map();
    attributeRecords.set(element, records);
  }
  let record = records.get(attribute);
  if (!record) {
    record = { source: current, rendered: current };
    records.set(attribute, record);
  } else if (current !== record.rendered) {
    record.source = current;
  }
  const rendered = translateArcadeText(record.source);
  record.rendered = rendered;
  if (current !== rendered) element.setAttribute(attribute, rendered);
}

function localizeElement(root: Element): void {
  translatedAttributes.forEach(attribute => localizeAttribute(root, attribute));
  root.querySelectorAll('*').forEach(element => {
    translatedAttributes.forEach(attribute => localizeAttribute(element, attribute));
  });
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    localizeTextNode(node as Text);
    node = walker.nextNode();
  }
}

function startObserver(): void {
  if (observer || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.type === 'characterData') {
        localizeTextNode(mutation.target as Text);
        return;
      }
      if (mutation.type === 'attributes') {
        localizeAttribute(mutation.target as Element, mutation.attributeName!);
        return;
      }
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) localizeTextNode(node as Text);
        else if (node instanceof Element) localizeElement(node);
      });
    });
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...translatedAttributes],
  });
}

export function setArcadeLanguage(language: ArcadeLanguage): void {
  const changed = language !== activeLanguage;
  activeLanguage = language;
  if (typeof document === 'undefined') return;
  document.documentElement.lang = language;
  startObserver();
  if (changed || !initialized) {
    localizeElement(document.documentElement);
    initialized = true;
    window.dispatchEvent(new CustomEvent('arcade-language-change', { detail: { language } }));
  }
}

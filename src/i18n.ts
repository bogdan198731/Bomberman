export type ArcadeLanguage = 'en' | 'ro';

const ROMANIAN_TRANSLATIONS: Record<string, string> = {
  'Guess the word · Solo word game': 'Ghicește cuvântul · Joc de cuvinte solo',
  'Guess the hidden word letter by letter across six categories, in English or Romanian.': 'Ghicește cuvântul ascuns literă cu literă, în șase categorii, în engleză sau română.',
  'Play Hangman': 'Joacă Hangman',
  'Add Hangman to favorites': 'Adaugă Hangman la favorite',
  'Solo · Word game': 'Solo · Joc de cuvinte',
  'Hangman game': 'Joc Hangman',
  'Hangman gallows. One part is drawn for each wrong letter': 'Spânzurătoarea Hangman. Se desenează o parte pentru fiecare literă greșită',
  'Hangman difficulty': 'Dificultatea Hangman',
  'Letter keyboard': 'Tastatura cu litere',
  'Tries': 'Încercări',
  'Streak': 'Serie',
  'Difficulty': 'Dificultate',
  'Easy · 8 tries': 'Ușor · 8 încercări',
  'Normal · 6 tries': 'Normal · 6 încercări',
  'Hard · 4 tries': 'Greu · 4 încercări',
  'Animals': 'Animale',
  'Food': 'Mâncare',
  'Countries': 'Țări',
  'Sports': 'Sporturi',
  'Nature': 'Natură',
  'Jobs': 'Meserii',
  'Pick a letter to start.': 'Alege o literă pentru a începe.',
  'Saved word restored - keep guessing.': 'Cuvânt salvat restaurat - continuă să ghicești.',
  '1 try left.': 'O încercare rămasă.',
  'New word': 'Cuvânt nou',
  'Guess': 'Ghicește',
  'Vowels first': 'Vocalele întâi',
  'Klondike · Solo card game': 'Klondike · Joc de cărți solo',
  'Classic Klondike: build the foundations from ace to king, with undo and saved games.': 'Klondike clasic: construiește fundațiile de la as la rege, cu anulare și jocuri salvate.',
  'Play Solitaire': 'Joacă Solitaire',
  'Add Solitaire to favorites': 'Adaugă Solitaire la favorite',
  'Solitaire table. Tap a card to pick it up, then tap where it goes': 'Masa Solitaire. Apasă o carte pentru a o ridica, apoi apasă unde merge',
  'Solitaire difficulty': 'Dificultate Solitaire',
  'Solitaire table': 'Masa Solitaire',
  'Solo · Klondike': 'Solo · Klondike',
  'Everything is face up - finish it off.': 'Totul este cu fața în sus - termină jocul.',
  'No moves left - this deal can no longer be won. Deal again.': 'Nu mai sunt mutări - jocul acesta nu mai poate fi câștigat. Împarte din nou.',
  'Saved game restored - carry on.': 'Joc salvat restaurat - continuă.',
  'Moves': 'Mutări',
  'Easy · draw 1': 'Ușor · trage 1',
  'Hard · draw 3': 'Greu · trage 3',
  'Auto-play': 'Joc automat',
  'Finish': 'Termină',
  'Draw': 'Trage',
  'Outflank and flip · Bot, local, or online': 'Încercuiește și întoarce · Bot, local sau online',
  'Mint to play.': 'Mint mută.',
  'Coral to play.': 'Coral mută.',
  'Mint has no move - Coral plays again.': 'Mint nu are mutare - Coral mută din nou.',
  'Coral has no move - Mint plays again.': 'Coral nu are mutare - Mint mută din nou.',
  'Trap your rival\'s discs between yours, grab the corners, and finish with the most.': 'Prinde discurile rivalului între ale tale, ocupă colțurile și termină cu cele mai multe.',
  'Play Reversi': 'Joacă Reversi',
  'Add Reversi to favorites': 'Adaugă Reversi la favorite',
  'Reversi board. Tap a highlighted square to place a disc': 'Tabla Reversi. Apasă un pătrat evidențiat pentru a pune un disc',
  'Reversi bot level': 'Nivelul botului Reversi',
  'Reversi match': 'Meci Reversi',
  'Place': 'Plasează',
  'Race to seven · Bot, local, or online': 'Până la șapte · Bot, local sau online',
  'Beat the Coral bot to 7. Start when ready.': 'Învinge botul Coral până la 7. Pornește când ești gata.',
  'First to 7 goals wins.': 'Primul la 7 goluri câștigă.',
  'Guard your goal and strike through the puck.': 'Apără-ți poarta și lovește prin puc.',
  'Mint scores!': 'Mint înscrie!',
  'Coral scores!': 'Coral înscrie!',
  'Mint wins the table!': 'Mint câștigă masa!',
  'Coral wins the table!': 'Coral câștigă masa!',
  'Face off': 'Pune pucul în joc',
  'First to 7': 'Primul la 7',
  'Guard your goal, bank shots off the walls, and race to seven against a bot or a friend.': 'Apără-ți poarta, ricoșează din pereți și ajungi primul la șapte contra unui bot sau a unui prieten.',
  'Play Air Hockey': 'Joacă Air Hockey',
  'Add Air Hockey to favorites': 'Adaugă Air Hockey la favorite',
  'Air Hockey table. Drag to move your mallet': 'Masa Air Hockey. Trage pentru a-ți muta crosa',
  'Air Hockey bot level': 'Nivelul botului Air Hockey',
  'Air Hockey match': 'Meci Air Hockey',
  'MINT GOAL': 'GOL MINT',
  'CORAL GOAL': 'GOL CORAL',
  'Clear the field · Solo puzzle': 'Curăță terenul · Puzzle solo',
  'Tap any square - the first one is always safe.': 'Apasă orice pătrat - primul este mereu sigur.',
  'Saved board restored - keep sweeping.': 'Tablă salvată restaurată - continuă căutarea.',
  'Boom - that was a mine. Try again.': 'Bum - a fost o mină. Încearcă din nou.',
  'Read the numbers, flag the mines, and clear the field on three phone-sized boards.': 'Citește numerele, marchează minele și curăță terenul pe trei table potrivite pentru telefon.',
  'Play Minesweeper': 'Joacă Minesweeper',
  'Add Minesweeper to favorites': 'Adaugă Minesweeper la favorite',
  'Minesweeper field. Tap to uncover, long-press to flag': 'Terenul Minesweeper. Apasă pentru a descoperi, ține apăsat pentru steag',
  'Minesweeper board size': 'Mărimea tablei Minesweeper',
  'Minesweeper board': 'Tabla Minesweeper',
  'Mines': 'Mine',
  'Minefield': 'Câmp minat',
  'Board': 'Tablă',
  'Easy · 9×9': 'Ușor · 9×9',
  'Medium · 12×12': 'Mediu · 12×12',
  'Hard · 16×16': 'Greu · 16×16',
  '⚑ Flag mode': '⚑ Mod steag',
  'Flag': 'Steag',
  'or long-press': 'sau ține apăsat',
  'New board': 'Tablă nouă',
  'Move': 'Mută',
  'Break the wall · Solo, ten levels': 'Sparge zidul · Solo, zece niveluri',
  'Keep the ball alive and smash through ten walls of tough and steel bricks.': 'Ține mingea în joc și sparge zece ziduri de cărămizi rezistente și de oțel.',
  'Play Brick Breaker': 'Joacă Brick Breaker',
  'Add Brick Breaker to favorites': 'Adaugă Brick Breaker la favorite',
  'Brick Breaker wall. Drag to steer the paddle, tap to launch': 'Zidul Brick Breaker. Trage pentru a conduce paleta, apasă pentru lansare',
  'Brick Breaker starting level': 'Nivelul de start Brick Breaker',
  'Brick Breaker run': 'Rundă Brick Breaker',
  'Solo · 10 levels': 'Solo · 10 niveluri',
  'Balls': 'Mingi',
  'Start at': 'Începe la',
  'Steer': 'Conduce',
  'Launch': 'Lansează',
  'In play': 'În joc',
  'Next wall': 'Zidul următor',
  'Restart level': 'Reia nivelul',
  'First Wall': 'Primul zid',
  'Checkerboard': 'Tablă de șah',
  'Pyramid': 'Piramidă',
  'Fortress': 'Fortăreață',
  'Vault': 'Seif',
  '1 · First Wall': '1 · Primul zid',
  '2 · Checkerboard': '2 · Tablă de șah',
  '3 · Pyramid': '3 · Piramidă',
  '5 · Vault': '5 · Seif',
  'Diamond': 'Diamant',
  'Stripes': 'Dungi',
  'Castle': 'Castel',
  'Hive': 'Stup',
  'The Core': 'Miezul',
  '6 · Diamond': '6 · Diamant',
  '7 · Stripes': '7 · Dungi',
  '8 · Castle': '8 · Castel',
  '9 · Hive': '9 · Stup',
  '10 · The Core': '10 · Miezul',
  'Four rows of single-hit bricks.': 'Patru rânduri de cărămizi care se sparg dintr-o lovitură.',
  'Tougher bricks with gaps to slip the ball through.': 'Cărămizi mai dure, cu goluri prin care să strecori mingea.',
  'A three-hit peak on a wide base.': 'Un vârf de trei lovituri pe o bază largă.',
  'Steel towers guard a tough core.': 'Turnuri de oțel păzesc un miez dur.',
  'Crack the steel-lined vault.': 'Sparge seiful căptușit cu oțel.',
  'A three-hit gem wrapped in a tough shell.': 'O bijuterie de trei lovituri într-o carcasă dură.',
  'Tough rows behind staggered steel shutters.': 'Rânduri dure în spatele unor obloane de oțel decalate.',
  'Battlements on top, steel walls and arrow slits below.': 'Creneluri sus, ziduri de oțel și ambrazuri dedesubt.',
  'Eight packed rows of tough cells.': 'Opt rânduri dese de celule dure.',
  'A steel-cased core of three-hit bricks. The final wall.': 'Un miez de cărămizi de trei lovituri, îmbrăcat în oțel. Zidul final.',
  'Drop four · Bot, local, or online': 'Patru în linie · Bot, local sau online',
  'Mint to drop a disc.': 'Mint lasă un disc.',
  'Coral to drop a disc.': 'Coral lasă un disc.',
  'Coral bot is thinking…': 'Botul Coral se gândește…',
  'Board full - a draw.': 'Tablă plină - remiză.',
  'Mint connects four!': 'Mint aliniază patru!',
  'Coral connects four!': 'Coral aliniază patru!',
  'Next game': 'Jocul următor',
  'Reset series': 'Resetează seria',
  'Series': 'Serie',
  'Columns': 'Coloane',
  'Aim': 'Țintește',
  'Drop discs, block your rival, and line up four in a row against a bot or a friend.': 'Lasă discuri, blochează-ți rivalul și aliniază patru în linie contra unui bot sau a unui prieten.',
  'Play Four in a Row': 'Joacă Four in a Row',
  'Add Four in a Row to favorites': 'Adaugă Four in a Row la favorite',
  'Four in a Row board. Tap a column to drop a disc': 'Tabla Four in a Row. Apasă o coloană pentru a lăsa un disc',
  'Four in a Row bot level': 'Nivelul botului Four in a Row',
  'Four in a Row match': 'Meci Four in a Row',
  'Ride the grid · Bot, local, or online': 'Călărește grila · Bot, local sau online',
  'Outlast the Coral bot. First to 3 rounds.': 'Rezistă mai mult decât botul Coral. Primul la 3 runde.',
  'Two riders, one grid. First to 3 rounds.': 'Doi piloți, o singură grilă. Primul la 3 runde.',
  'Box your rival in - never cross a trail.': 'Închide-ți rivalul - nu trece niciodată peste o dâră.',
  'Both crashed - no point this round.': 'Amândoi s-au izbit - niciun punct în această rundă.',
  'Mint takes the round.': 'Mint câștigă runda.',
  'Coral takes the round.': 'Coral câștigă runda.',
  'Mint wins the grid!': 'Mint câștigă grila!',
  'Coral wins the grid!': 'Coral câștigă grila!',
  'Start round': 'Pornește runda',
  'Next round': 'Runda următoare',
  'Riding': 'În cursă',
  'First to 3': 'Primul la 3',
  'Ride a neon grid, leave a wall of light behind you, and box your rival in first.': 'Călărește o grilă de neon, lasă în urmă un zid de lumină și închide-ți primul rivalul.',
  'Play Light Cycles': 'Joacă Light Cycles',
  'Add Light Cycles to favorites': 'Adaugă Light Cycles la favorite',
  'Light Cycles grid arena': 'Arena grilei Light Cycles',
  'Light Cycles bot level': 'Nivelul botului Light Cycles',
  'Touch light cycle controls': 'Controale tactile Light Cycles',
  'Light Cycles match': 'Meci Light Cycles',
  'New': 'Nou',
  '⚙ Settings': '⚙ Setări',
  'Open arcade settings': 'Deschide setările arcadei',
  'Close arcade settings': 'Închide setările arcadei',
  'Browser gaming hub': 'Centru de jocuri în browser',
  'Legends': 'Legende',
  'Open local leaderboards': 'Deschide clasamentele locale',
  'Arcade Player': 'Jucător Arcade',
  'Profile': 'Profil',
  'Home': 'Acasă',
  'Games': 'Jocuri',
  'Quick': 'Rapid',
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
  'A new arcade version is ready.': 'O versiune nouă a arcadei este pregătită.',
  'Refresh now': 'Actualizează acum',
  'Refreshing…': 'Se actualizează…',
  'Retro graphics': 'Grafică retro',
  'Modern graphics': 'Grafică modernă',
  'Switch between modern and retro graphics': 'Comută între grafica modernă și cea retro',
  'Bot levels': 'Niveluri bot',
  'Online rooms': 'Camere online',
  'Mobile ready': 'Pregătit pentru mobil',
  'Arcade features': 'Funcțiile arcadei',
  'Quick Play pick': 'Recomandare Joc Rapid',
  'Choose a Quick Play mode': 'Alege un mod de Joc Rapid',
  'Any mode': 'Orice mod',
  'Solo': 'Solo',
  'Local 2P': 'Local 2P',
  'Local co-op': 'Cooperativ local',
  'Local race': 'Cursă locală',
  'Local duel': 'Duel local',
  'Vs bot': 'Contra bot',
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
  'This device': 'Acest dispozitiv',
  'Everyone': 'Toată lumea',
  'Whose scores': 'Ale cui scoruri',
  'Your name on the Everyone board': 'Numele tău în clasamentul tuturor',
  'Leave it empty to stay Unknown.': 'Lasă gol ca să rămâi Necunoscut.',
  'Unknown': 'Necunoscut',
  'Everyone · top ten': 'Toată lumea · primii zece',
  'Loading…': 'Se încarcă…',
  'Offline': 'Offline',
  'Loading the Everyone board…': 'Se încarcă clasamentul tuturor…',
  'The Everyone board is offline right now. Your scores still count on this device.': 'Clasamentul tuturor nu e disponibil acum. Scorurile tale contează în continuare pe acest dispozitiv.',
  'No scores yet · all players': 'Încă niciun scor · toți jucătorii',
  'Posting your score…': 'Se publică scorul…',
  'Post my name': 'Publică numele meu',
  'Post anonymously': 'Publică anonim',
  'Keep private': 'Păstrează privat',
  'Kept private · saved on this device only.': 'Păstrat privat · salvat doar pe acest dispozitiv.',
  'The Everyone board is offline right now. Your score still counts on this device.': 'Clasamentul tuturor nu e disponibil acum. Scorul tău contează în continuare pe acest dispozitiv.',
  'Finish a match to claim the first spot.': 'Termină un meci pentru a ocupa primul loc.',
  'Game library': 'Bibliotecă de jocuri',
  'Choose your next round': 'Alege următoarea rundă',
  'Twenty-one instant games, from explosive duels and Romanian classics to Sudoku, Minesweeper, Hangman and number puzzles like Math Crossword, neon racing, air hockey, co-op survival, and star-fighter missions.':
    'Douăzeci și unu de jocuri instant, de la dueluri explozive și clasice românești la Sudoku, Minesweeper, Spânzurătoarea și puzzle-uri cu numere precum integramele matematice, curse neon, air hockey, supraviețuire cooperativă și misiuni stelare.',
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
  'Choose a mode': 'Alege un mod',
  'Pick how you want to play.': 'Alege cum vrei să joci.',
  'Share this device, battle a smart bot, or challenge a friend online.': 'Folosește același dispozitiv, luptă cu un bot inteligent sau provoacă un prieten online.',
  'Play local 2P': 'Joacă local 2P',
  'Start local match': 'Pornește meciul local',
  'Choose bot difficulty': 'Alege dificultatea botului',
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
  'Movement joystick. Drag and hold to move, or use arrow keys.':
    'Joystick de mișcare. Trage și ține apăsat pentru a te deplasa sau folosește săgețile.',
  'Swap sides': 'Schimbă părțile',
  'Joystick is on the right. Move joystick to the left and swap the bomb button.':
    'Joystickul este în dreapta. Mută joystickul în stânga și schimbă poziția butonului pentru bombă.',
  'Joystick is on the left. Move joystick to the right and swap the bomb button.':
    'Joystickul este în stânga. Mută joystickul în dreapta și schimbă poziția butonului pentru bombă.',
  'Mint movement joystick': 'Joystick de mișcare Mint',
  'Coral movement joystick': 'Joystick de mișcare Coral',
  'Mint driving joystick': 'Joystick de condus Mint',
  'Coral driving joystick': 'Joystick de condus Coral',
  'Mint steering joystick': 'Joystick de direcție Mint',
  'Coral steering joystick': 'Joystick de direcție Coral',
  'Hold to brake Mint': 'Ține apăsat pentru a frâna cu Mint',
  'Hold to accelerate Mint': 'Ține apăsat pentru a accelera cu Mint',
  'Hold to brake Coral': 'Ține apăsat pentru a frâna cu Coral',
  'Hold to accelerate Coral': 'Ține apăsat pentru a accelera cu Coral',
  'Brake': 'Frână',
  'Go': 'Accelerează',
  'Waiting for rival': 'Se așteaptă adversarul',
  'Tap Serve to start the rally.': 'Apasă Serviciu pentru a începe schimbul.',
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
  'No favorites yet': 'Încă nu ai favorite',
  'Minesweeper field': 'Câmpul de mine',
  'Reversi board': 'Tabla de Reversi',
  'Four in a Row board': 'Tabla Patru în linie',
  'Nothing to draw.': 'Nu mai e nimic de tras.',
  'No move there.': 'Nicio mutare acolo.',
  'Tap the ☆ star on any game card to keep it here.': 'Apasă steaua ☆ de pe orice joc ca să-l păstrezi aici.',
  'Try another search or show the complete arcade.': 'Încearcă altă căutare sau afișează întreaga arcadă.',
  'Show all games': 'Arată toate jocurile',
  'Blast Arcade · Play instantly in your browser': 'Blast Arcade · Joacă instant în browser',
  'Twenty-one live games · Keyboard, touch, bots, and online rooms': 'Douăzeci și unu de jocuri active · Tastatură, atingere, boți și camere online',
  'Blast Arcade heroes surrounded by twelve game arenas': 'Eroii Blast Arcade înconjurați de douăsprezece arene de joc',
  'Bot · Local · Online PvP': 'Bot · Local · PvP online',
  'Bot · Local · Online': 'Bot · Local · Online',
  'Bot · Local · Online 2P': 'Bot · Local · Online 2P',
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
  'Appearance': 'Aspect',
  'Color theme': 'Temă de culori',
  'Recolor the backdrop, menus and panels of every game.': 'Recolorează fundalul, meniurile și panourile fiecărui joc.',
  'Midnight': 'Miez de noapte',
  'Ocean': 'Ocean',
  'Sunset': 'Apus',
  'Forest': 'Pădure',
  'Galaxy': 'Galaxie',
  'Choose the language used throughout the arcade.': 'Alege limba folosită în întreaga arcadă.',
  'English': 'Engleză',
  'Enter fullscreen': 'Intră pe ecran complet',
  'Exit fullscreen': 'Ieși din ecran complet',
  'Reset settings': 'Resetează setările',
  'Settings are saved privately on this device and apply to every game.':
    'Setările sunt salvate privat pe acest dispozitiv și se aplică tuturor jocurilor.',
  '← Arcade': '← Arcadă',
  'Nine Men\'s Morris · Bot, local, or online': 'Moara cu nouă piese · Bot, local sau online',
  'Țintar bot difficulty': 'Dificultatea botului de Țintar',
  'Play as Mint against the Coral bot.': 'Joacă drept Mint împotriva botului Coral.',
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
  'Start match': 'Pornește meciul',
  'Reset match': 'Resetează meciul',
  'Full screen board': 'Tablă pe ecran complet',
  'Exit full screen': 'Ieși din ecran complet',
  'Țintar board with 24 playable points': 'Tablă de Țintar cu 24 de puncte de joc',
  'Match complete': 'Meci încheiat',
  'Play revenge match': 'Joacă revanșa',
  'Waiting for Mint…': 'Se așteaptă Mint…',
  'Draw — each player captured four points.': 'Egalitate — fiecare a capturat patru puncte.',
  'The cards stay on the table for a moment…': 'Cărțile rămân o clipă pe masă…',
  'Coral is thinking…': 'Coral se gândește…',
  'Sky is thinking…': 'Sky se gândește…',
  'Gold is thinking…': 'Gold se gândește…',
  'Șeptică players': 'Jucători Șeptică',
  'Players': 'Jucători',
  'Players online': 'Jucători online',
  'Fill with bots': 'Completează cu boți',
  '4 · teams': '4 · echipe',
  'Mint & Sky': 'Mint și Sky',
  'Coral & Gold': 'Coral și Gold',
  'Coral · Sky': 'Coral · Sky',
  'Most points wins': 'Câștigă cine are cele mai multe puncte',
  'Draw — both teams captured four points.': 'Egalitate — ambele echipe au capturat patru puncte.',
  'Draw — the top score is shared.': 'Egalitate — scorul maxim este împărțit.',
  'Change the number of players? The current Șeptică deal will be lost.': 'Schimbi numărul de jucători? Jocul curent de Șeptică se va pierde.',
  'You were cut. Continue with a 7 or the opening rank, or concede the trick.':
    'Ai fost tăiat. Continuă cu un 7 sau aceeași figură, ori cedează masa.',
  'Your turn: lead a new trick.': 'Rândul tău: deschide o mână nouă.',
  'Play any card. A 7 or the opening rank cuts.': 'Joacă orice carte. Un 7 sau aceeași figură taie.',
  'Your turn: play any card. A 7 or the opening rank cuts.':
    'Rândul tău: joacă orice carte. Un 7 sau aceeași figură taie.',
  'Concede trick': 'Cedează masa',
  'Shuffle again': 'Amestecă din nou',
  'New deal': 'Mână nouă',
  'Cards remaining:': 'Cărți rămase:',
  'Online room': 'Cameră online',
  'Quick match, create an invite, or join with a code.': 'Joacă rapid, creează o invitație sau intră cu un cod.',
  'Two players share this device.': 'Doi jucători folosesc același dispozitiv.',
  'Two players can share this device.': 'Doi jucători pot folosi același dispozitiv.',
  'Two snakes share this device.': 'Doi șerpi împart același dispozitiv.',
  'Chase fruit and your own high score.': 'Urmărește fructele și propriul record.',
  'Two tank crews share this device.': 'Două echipaje de tanc împart acest dispozitiv.',
  'Battle the Coral computer tank.': 'Luptă cu tancul Coral controlat de calculator.',
  'Two players survive together on this device.': 'Doi jucători supraviețuiesc împreună pe acest dispozitiv.',
  'Hold the arena alone.': 'Apără arena de unul singur.',
  'Two drivers share this device.': 'Doi piloți împart acest dispozitiv.',
  'Race the Coral computer driver.': 'Întrece pilotul Coral controlat de calculator.',
  'Two builders share this device.': 'Doi constructori împart acest dispozitiv.',
  'Outbuild the Coral computer.': 'Construiește mai bine decât calculatorul Coral.',
  'Pass the device between players.': 'Dați dispozitivul de la un jucător la altul.',
  'Pass the device between 2, 3 or 4 players.': 'Dați dispozitivul de la un jucător la altul, între 2, 3 sau 4 jucători.',
  'Play Mint against the Coral bot.': 'Joacă drept Mint împotriva botului Coral.',
  'Two players share the same board.': 'Doi jucători folosesc aceeași tablă.',
  'Choose a bot difficulty to start.': 'Alege dificultatea botului pentru a începe.',
  'Ready to play on this device.': 'Pregătit de joc pe acest dispozitiv.',
  'Play locally, or create an invite code for a friend.': 'Joacă local sau creează un cod de invitație pentru un prieten.',
  'Play local': 'Joacă local',
  'Quick Match': 'Meci rapid',
  'Map': 'Hartă',
  'Arena': 'Arenă',
  'Blast Buddies map': 'Harta Blast Buddies',
  'Snake arena': 'Arena șarpelui',
  'Tank arena': 'Arena tancurilor',
  'Quick Match always plays Classic.': 'Meciul rapid se joacă mereu pe harta Clasic.',
  '1 · Classic': '1 · Clasic',
  '2 · Open Field': '2 · Câmp deschis',
  '3 · Crate Maze': '3 · Labirint de lăzi',
  '4 · Crossroads': '4 · Intersecție',
  '1 · Open Arena': '1 · Arenă deschisă',
  '2 · Pillars': '2 · Stâlpi',
  '3 · Lanes': '3 · Culoare',
  '4 · Fortress': '4 · Fortăreață',
  '2 · Bunkers': '2 · Buncăre',
  '3 · Crossfire': '3 · Foc încrucișat',
  '4 · Crate Field': '4 · Câmp de lăzi',
  '5 · Bare Floor': '5 · Podea goală',
  '6 · Citadel': '6 · Citadelă',
  '7 · Corridors': '7 · Coridoare',
  '8 · Packed Crates': '8 · Lăzi înghesuite',
  '9 · Hot Cross': '9 · Cruce fierbinte',
  '10 · Gauntlet': '10 · Proba de foc',
  '5 · Divider': '5 · Despărțitor',
  '6 · Blocks': '6 · Blocuri',
  '7 · Switchback': '7 · Serpentine',
  '8 · Crossbars': '8 · Bare încrucișate',
  '9 · Comb': '9 · Pieptene',
  '10 · Labyrinth': '10 · Labirint',
  '5 · Pillboxes': '5 · Cazemate',
  '6 · Trenches': '6 · Tranșee',
  '7 · Maze Run': '7 · Prin labirint',
  '8 · Grid Lock': '8 · Grilă blocată',
  '9 · Fort Knox': '9 · Fort Knox',
  '10 · Warzone': '10 · Zonă de război',
  'The original pillar grid with a steady spread of crates.': 'Grila originală de stâlpi, cu lăzi răspândite uniform.',
  'Few crates - fast, exposed fights from the first second.': 'Puține lăzi - lupte rapide și expuse din prima secundă.',
  'Packed with crates; blast your own path to the rival.': 'Plin de lăzi; deschide-ți singur drumul spre rival.',
  'Two open lanes cross the centre - control them or get caught in them.': 'Două culoare libere se încrucișează în centru - controlează-le sau vei fi prins în ele.',
  'No pillars to hide behind - only crates stand between you.': 'Fără stâlpi după care să te ascunzi - doar lăzi stau între voi.',
  'A steel ring guards the centre, with a gate on every side.': 'Un inel de oțel păzește centrul, cu câte o poartă pe fiecare latură.',
  'Long steel walls with a few doors - every route is a choke point.': 'Ziduri lungi de oțel cu câteva uși - fiecare drum e o strâmtoare.',
  'Crates wall to wall; every step has to be blasted open.': 'Lăzi de la un perete la altul; fiecare pas trebuie deschis cu bombe.',
  'Open lanes through a packed field - the centre is a shooting gallery.': 'Culoare libere printr-un câmp plin - centrul e un poligon de tragere.',
  'Choke-point corridors stuffed with crates. The final test.': 'Coridoare strâmte pline de lăzi. Proba finală.',
  'No walls, just the edges.': 'Fără ziduri, doar marginile.',
  'Four blocks to weave between.': 'Patru blocuri printre care să te strecori.',
  'Two long walls split the arena, with a gap in the middle.': 'Două ziduri lungi împart arena, cu o deschidere la mijloc.',
  'An inner ring with a gate on every side.': 'Un inel interior cu câte o poartă pe fiecare latură.',
  'A wall cuts the arena in two, open only through the middle.': 'Un zid taie arena în două, deschis doar prin mijloc.',
  'Sixteen blocks in a grid - plan every turn.': 'Șaisprezece blocuri într-o grilă - plănuiește fiecare viraj.',
  'Long walls from either side force wide detours.': 'Ziduri lungi din ambele părți te obligă la ocolișuri mari.',
  'Bars from every edge leave four corner rooms to slip in and out of.': 'Bare de pe fiecare margine lasă patru camere în colțuri prin care să intri și să ieși.',
  'Teeth from the top and bottom - one wrong turn and you are boxed in.': 'Dinți de sus și de jos - un viraj greșit și ești prins.',
  'Dense walls everywhere. The ultimate test of steering.': 'Ziduri dese peste tot. Testul suprem de condus.',
  'Two steel walls and a crate cluster in the middle.': 'Două ziduri de oțel și un grup de lăzi la mijloc.',
  'Steel bunkers in each corner, crates guarding the centre.': 'Buncăre de oțel în fiecare colț, lăzi care păzesc centrul.',
  'A steel spine splits the field - go over, under, or bank a shot.': 'O coloană de oțel împarte terenul - ocolește pe sus, pe jos sau trage din ricoșeu.',
  'A grid of crates to blast through, anchored by two steel posts.': 'O grilă de lăzi de spart, ancorată de doi stâlpi de oțel.',
  'Four steel pillboxes ring a crate at the centre.': 'Patru cazemate de oțel înconjoară o ladă din centru.',
  'Four long steel trenches; the open lane between them is a firing range.': 'Patru tranșee lungi de oțel; culoarul liber dintre ele e un poligon de tragere.',
  'Staggered steel walls - weave through the gaps to find your rival.': 'Ziduri de oțel decalate - strecoară-te prin goluri ca să-ți găsești rivalul.',
  'A grid of steel posts with crates plugging the lanes.': 'O grilă de stâlpi de oțel, cu lăzi care blochează culoarele.',
  'Each tank starts in a steel fort with crates across the door.': 'Fiecare tanc pornește dintr-un fort de oțel cu lăzi în fața ușii.',
  'Steel and crates everywhere. The final battlefield.': 'Oțel și lăzi peste tot. Câmpul de luptă final.',
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
  'The online room closed. Choose a room option to reconnect.': 'Camera online s-a închis. Alege o opțiune pentru a te reconecta.',
  'Disconnected. Create or join a room to reconnect.': 'Conexiune întreruptă. Creează o cameră sau intră într-una pentru reconectare.',
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
  'Tiles': 'Piese',
  'Tile numbers': 'Numerele pieselor',
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
  'Hints left': 'Indicii rămase',
  'Live score': 'Scor actual',
  'Sudoku board': 'Tabla Sudoku',
  'Puzzle complete!': 'Puzzle finalizat!',
  'Excellent logic. Your score is ready.': 'Logică excelentă. Scorul tău este gata.',
  'Select a cell and place a number from 1 to 9.': 'Selectează o celulă și alege un număr de la 1 la 9.',
  'Sudoku number pad': 'Tastatură numerică Sudoku',
  'Erase': 'Șterge',
  'Hint': 'Indiciu',
  'Tap a cell and number, or use your keyboard. Tougher puzzles start with a higher score; time, mistakes, and hints reduce it.':
    'Atinge o celulă și un număr sau folosește tastatura. Puzzle-urile mai dificile pornesc cu un scor mai mare; timpul, greșelile și indiciile îl reduc.',
  'That number is part of the puzzle.': 'Acest număr face parte din puzzle.',
  'That number conflicts with this row, column, or box.': 'Acest număr intră în conflict cu rândul, coloana sau careul.',
  'Cell cleared. Choose another number.': 'Celulă ștearsă. Alege alt număr.',
  'Great — keep going.': 'Foarte bine — continuă.',
  'Given number selected.': 'Ai selectat un număr dat.',
  'Choose a number for this cell.': 'Alege un număr pentru această celulă.',
  'Hint placed — keep going.': 'Indiciu plasat — continuă.',
  'Notes': 'Notițe',
  'Notes mode off': 'Mod notițe oprit',
  'Notes mode on': 'Mod notițe pornit',
  'Notes mode on — add possible numbers.': 'Mod notițe pornit — adaugă numere posibile.',
  'Notes mode off — enter final numbers.': 'Mod notițe oprit — introdu numerele finale.',
  'Clear the cell before adding notes.': 'Șterge celula înainte de a adăuga notițe.',
  'Formation': 'Formație',
  'Boss next': 'Urmează boss-ul',
  'Boss fight': 'Luptă cu boss-ul',
  'Danger close': 'Pericol aproape',
  'No hints remaining': 'Nu mai sunt indicii',
  'No hints remaining for this puzzle.': 'Nu mai sunt indicii pentru acest puzzle.',
  'Play mode': 'Mod de joc',
  'Fly solo or share the mission on this device.': 'Zboară solo sau împarte misiunea pe acest dispozitiv.',
  'Start a new 2048 game? Your current board and score will be lost.':
    'Începi un joc 2048 nou? Tabla și scorul actual vor fi pierdute.',
  'Start a new Sudoku puzzle? Your current entries, notes, and score will be lost.':
    'Începi un Sudoku nou? Valorile, notițele și scorul actual vor fi pierdute.',
  'Start a new deal? The current Șeptică hand will be lost.':
    'Începi o mână nouă? Mâna actuală de Șeptică va fi pierdută.',
  'Change play mode? The current Șeptică deal will be lost.':
    'Schimbi modul de joc? Mâna actuală de Șeptică va fi pierdută.',
  'Reset this Țintar match? The current board will be lost.':
    'Resetezi acest meci de Țintar? Tabla actuală va fi pierdută.',
  'Touch controls': 'Comenzi tactile',
  'Automatically detect touch, always show controls, or hide them on hybrid devices.':
    'Detectează automat atingerea, afișează mereu comenzile sau ascunde-le pe dispozitive hibride.',
  'Automatic': 'Automat',
  'Always show': 'Afișează mereu',
  'Hide': 'Ascunde',
  '? How to play': '? Cum se joacă',
  'Ⅱ Pause': 'Ⅱ Pauză',
  'Online stays live': 'Jocul online continuă',
  'Session protected': 'Sesiune protejată',
  'Game paused': 'Joc în pauză',
  'Gameplay is paused. Your held controls were released.': 'Jocul este în pauză. Comenzile ținute apăsat au fost eliberate.',
  'Resume game': 'Continuă jocul',
  'Resume unavailable': 'Continuarea nu este disponibilă',
  'Finish changing settings, then resume when you are ready.': 'Termină modificarea setărilor, apoi continuă când ești pregătit.',
  'The page was hidden. Return to the game, then resume safely.': 'Pagina a fost ascunsă. Revino la joc, apoi continuă în siguranță.',
  'The game lost focus. Resume when your controls are ready.': 'Jocul a pierdut focalizarea. Continuă când comenzile sunt pregătite.',
  'This game is paused while Settings is open.': 'Jocul este în pauză cât timp Setările sunt deschise.',
  'Online play continues while Settings is open. Your held controls were released.':
    'Jocul online continuă cât timp Setările sunt deschise. Comenzile ținute apăsat au fost eliberate.',
  'Speed': 'Viteză',
  'Chill': 'Calm',
  'Turbo': 'Turbo',
  '● Shot ready': '● Proiectil pregătit',
  'Rookie': 'Începător',
  'Ace': 'As',
  'Auto-fire': 'Foc automat',
  'Choose your upgrade': 'Alege îmbunătățirea',
  'Choose a survival upgrade': 'Alege o îmbunătățire de supraviețuire',
  'Rapid fire': 'Foc rapid',
  'Move speed': 'Viteză de mișcare',
  'Armor + heal': 'Armură + vindecare',
  'Auto-accelerate': 'Accelerare automată',
  'Relaxed': 'Relaxat',
  'Expert': 'Expert',
  'Undo': 'Anulează',
  'Continue': 'Continuă',
  'Relaxed view': 'Mod relaxat',
  'DANGER': 'PERICOL',
  'HIT': 'LOVITURĂ',
  'POWER UP': 'BONUS',
  'RICOCHET': 'RICOȘEU',
  'LINE CLEAR': 'LINIE ELIMINATĂ',
  'Shared daily lineup': 'Listă zilnică comună',
  'Up next': 'Urmează',
  'Locked': 'Blocat',
  'Victory': 'Victorie',
  'Run complete': 'Serie finalizată',
};

let activeLanguage: ArcadeLanguage = 'en';
let initialized = false;
let observer: MutationObserver | null = null;

const textRecords = new WeakMap<Text, { source: string; rendered: string }>();
const attributeRecords = new WeakMap<Element, Map<string, { source: string; rendered: string }>>();
const translatedAttributes = ['aria-label', 'placeholder', 'title', 'alt'] as const;

const CARD_RANKS_RO: Record<string, string> = { Ace: 'As', Jack: 'Valet', Queen: 'Damă', King: 'Popă' };
const CARD_SUITS_RO: Record<string, string> = { spades: 'pică', hearts: 'inimă roșie', diamonds: 'romb', clubs: 'treflă' };
const CELL_STATES_RO: Record<string, string> = {
  hidden: 'acoperit', flagged: 'cu steag', mine: 'mină', clear: 'liber', empty: 'gol', Mint: 'Mint', Coral: 'Coral',
  'empty, you can play here': 'gol, poți juca aici',
};

/** Card names and square states on the canvas boards' buttons (board-access.ts). */
function translateBoardPart(value: string): string | null {
  const card = value.match(/^(Ace|[2-9]|10|Jack|Queen|King) of (spades|hearts|diamonds|clubs)$/);
  if (card) return `${CARD_RANKS_RO[card[1]] ?? card[1]} de ${CARD_SUITS_RO[card[2]]}`;
  if (value in CELL_STATES_RO) return CELL_STATES_RO[value];
  const near = value.match(/^(\d+) mines? next to it$/);
  if (near) return `${near[1]} ${near[1] === '1' ? 'mină' : 'mine'} alături`;
  return null;
}

function translateBoardText(value: string): string | null {
  const ro = (text: string): string => translateArcadeText(text, 'ro');
  const part = (text: string): string => translateBoardPart(text) ?? text;
  const cards = (list: string): string => list.split(', ').map(part).join(', ');
  let match = value.match(/^Row (\d+), column (\d+): (.+)$/);
  if (match) return `Rândul ${match[1]}, coloana ${match[2]}: ${part(match[3])}`;
  match = value.match(/^(Mint|Coral) played row (\d+), column (\d+), flipping (\d+)\.(?: (.+))?$/);
  if (match) return `${match[1]} a jucat rândul ${match[2]}, coloana ${match[3]}, întorcând ${match[4]}.${match[5] ? ` ${ro(match[5])}` : ''}`;
  match = value.match(/^Column (\d+): (full|(\d+) spaces? free)(?:\. From the bottom: (.+))?$/);
  if (match) {
    const room = match[2] === 'full' ? 'plină' : `${match[3]} ${match[3] === '1' ? 'loc liber' : 'locuri libere'}`;
    return `Coloana ${match[1]}: ${room}${match[4] ? `. De jos în sus: ${match[4]}` : ''}`;
  }
  match = value.match(/^(Mint|Coral) dropped in column (\d+)\.(?: (.+))?$/);
  if (match) return `${match[1]} a pus în coloana ${match[2]}.${match[3] ? ` ${ro(match[3])}` : ''}`;
  match = value.match(/^Column (\d+): (.+?)(?:, covering (\d+) face-down cards?)?$/);
  if (match) return `Coloana ${match[1]}: ${part(match[2])}${match[3] ? `, peste ${match[3]} ${match[3] === '1' ? 'carte cu fața în jos' : 'cărți cu fața în jos'}` : ''}`;
  match = value.match(/^Stock: (\d+) cards?$/);
  if (match) return `Pachet: ${match[1]} ${match[1] === '1' ? 'carte' : 'cărți'}`;
  if (value === 'Stock: empty, turn the waste over') return 'Pachet: gol, întoarce cărțile trase';
  if (value === 'Stock: empty') return 'Pachet: gol';
  match = value.match(/^Waste: (.+)$/);
  if (match) return `Cărți trase: ${part(match[1])}`;
  match = value.match(/^Foundation (\d+): (.+)$/);
  if (match) return `Fundația ${match[1]}: ${part(match[2])}`;
  match = value.match(/^Drew (.+)\.$/);
  if (match) return `Ai tras ${part(match[1])}.`;
  match = value.match(/^Picked up (.+)\. Choose where it goes\.$/);
  if (match) return `Ai ridicat ${cards(match[1])}. Alege unde o pui.`;
  match = value.match(/^Moved\. (.+)$/);
  if (match) return `Mutat. ${ro(match[1])}`;
  return translateBoardPart(value);
}

function translateRomanianPattern(value: string): string | null {
  const board = translateBoardText(value);
  if (board) return board;
  // Hangman
  const tries = value.match(/^(\d+) tries left\.$/);
  if (tries) return `${tries[1]} încercări rămase.`;
  const solvedWord = value.match(/^Solved! (\d+) points\.$/);
  if (solvedWord) return `Rezolvat! ${solvedWord[1]} puncte.`;
  const lostWord = value.match(/^Out of tries - the word was (.+)\.$/);
  if (lostWord) return `Nu mai ai încercări - cuvântul era ${lostWord[1]}.`;
  const shownWord = value.match(/^Word: (.+)$/);
  if (shownWord) return `Cuvânt: ${shownWord[1]}`;
  // Solitaire
  const home = value.match(/^(\d+) of 52 cards home · (\d+) moves\.$/);
  if (home) return `${home[1]} din 52 de cărți la locul lor · ${home[2]} mutări.`;
  const solved = value.match(/^Solved in (\d+) moves and (\d+)s - (\d+) points!$/);
  if (solved) return `Rezolvat în ${solved[1]} mutări și ${solved[2]}s - ${solved[3]} puncte!`;
  // Reversi
  const reversiWin = value.match(/^(Mint|Coral) wins (\d+)-(\d+)!$/);
  if (reversiWin) return `${reversiWin[1]} câștigă cu ${reversiWin[2]}-${reversiWin[3]}!`;
  const reversiDraw = value.match(/^A draw at (\d+)-(\d+)\.$/);
  if (reversiDraw) return `Remiză la ${reversiDraw[1]}-${reversiDraw[2]}.`;
  const reversiSeries = value.match(/^Series (\d+)-(\d+)$/);
  if (reversiSeries) return `Serie ${reversiSeries[1]}-${reversiSeries[2]}`;
  // Math Crossword
  const circles = value.match(/^(\d+) circles left to fill\.$/);
  if (circles) return `${circles[1]} cercuri rămase de completat.`;
  const solvedSums = value.match(/^Solved in (\d+:\d{2})! (\d+) points\.$/);
  if (solvedSums) return `Rezolvat în ${solvedSums[1]}! ${solvedSums[2]} puncte.`;
  const circle = value.match(/^Row (\d+), column (\d+): (empty|\d+)$/);
  if (circle) return `Rândul ${circle[1]}, coloana ${circle[2]}: ${circle[3] === 'empty' ? 'gol' : circle[3]}`;
  // Minesweeper
  const mines = value.match(/^(\d+) mines left to find\.$/);
  if (mines) return `${mines[1]} mine rămase de găsit.`;
  const cleared = value.match(/^Field cleared in (\d+)s - (\d+) points!$/);
  if (cleared) return `Teren curățat în ${cleared[1]}s - ${cleared[2]} puncte!`;
  // Brick Breaker: level names come from the same table as the level picker.
  const brickName = (name: string): string => ROMANIAN_TRANSLATIONS[name] ?? name;
  const tour = value.match(/^Finish a match in all (\d+) games\.$/);
  // Romanian puts "de" after numbers from twenty on.
  if (tour) return `Termină un meci în toate cele ${tour[1]}${Number(tour[1]) >= 20 ? ' de' : ''} jocuri.`;
  let brick = value.match(/^Level (\d+) · (.+)\. Launch when ready\.$/);
  if (brick) return `Nivelul ${brick[1]} · ${brickName(brick[2])}. Lansează când ești gata.`;
  brick = value.match(/^Level (\d+) · (\d+) bricks to go\.$/);
  if (brick) return `Nivelul ${brick[1]} · încă ${brick[2]} cărămizi.`;
  brick = value.match(/^Level (\d+) · (.+)$/);
  if (brick) return `Nivelul ${brick[1]} · ${brickName(brick[2])}`;
  brick = value.match(/^(.+) cleared! Launch for level (\d+)\.$/);
  if (brick) return `${brickName(brick[1])} terminat! Lansează pentru nivelul ${brick[2]}.`;
  brick = value.match(/^Every wall broken - final score (\d+)!$/);
  if (brick) return `Toate zidurile sparte - scor final ${brick[1]}!`;
  brick = value.match(/^Out of balls on level (\d+) - final score (\d+)\.$/);
  if (brick) return `Fără mingi la nivelul ${brick[1]} - scor final ${brick[2]}.`;
  let match = value.match(/^Round (\d+) · First to 3$/);
  if (match) return `Runda ${match[1]} · Primul la 3`;
  match = value.match(/^ROUND (\d+)$/);
  if (match) return `RUNDA ${match[1]}`;
  match = value.match(/^Play (.+)$/);
  if (match) return `Joacă ${match[1]}`;
  match = value.match(/^Race starts in (\d+)…$/);
  if (match) return `Cursa începe în ${match[1]}…`;
  match = value.match(/^(\d+) games live$/);
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
  // A duel bonus notice names who caught it.
  match = value.match(/^(Mint|Coral): (.+)$/);
  if (match && UX_TRANSLATIONS[match[2]]) return `${match[1]}: ${UX_TRANSLATIONS[match[2]]}`;
  // The Everyone scoreboard
  match = value.match(/^Top (\d+) · all players$/);
  if (match) return `Primii ${match[1]} · toți jucătorii`;
  match = value.match(/^New high score! #(\d+) on the public Everyone board for (.+)\.$/);
  if (match) return `Scor record! Locul #${match[1]} în clasamentul public al tuturor la ${match[2]}.`;
  match = value.match(/^Posted as (.+) · #(\d+) on the Everyone board\.$/);
  if (match) return `Publicat ca ${match[1] === 'Unknown' ? 'Necunoscut' : match[1]} · locul #${match[2]} în clasamentul tuturor.`;
  match = value.match(/^Your earlier score as (.+) is still your best\.$/);
  if (match) return `Scorul tău de dinainte ca ${match[1]} rămâne cel mai bun.`;
  match = value.match(/^No scores yet\. Finish a (.+) game to take first place\.$/);
  if (match) return `Încă niciun scor. Termină un joc de ${match[1]} ca să iei primul loc.`;
  // Online rooms for three or four
  match = value.match(/^You are (Mint|Coral|Sky|Gold) · (\d+) of (\d+) players here\. (Finding more players…|Share the code with the others\.)( Or fill the empty seats with bots\.)?$/);
  if (match) return `Ești ${match[1]} · ${match[2]} din ${match[3]} jucători aici. ${match[4].startsWith('Finding') ? 'Căutăm alți jucători…' : 'Trimite codul celorlalți.'}${match[5] ? ' Sau completează locurile goale cu boți.' : ''}`;
  // Șeptică with three or four players
  match = value.match(/^(Mint|Coral|Sky|Gold) takes (\d+) cards with the last cut · (?:no points|(\d+) points?)\.$/);
  if (match) return `${match[1]} ia ${match[2]} cărți cu ultima tăietură · ${match[3] ? `${match[3]} ${match[3] === '1' ? 'punct' : 'puncte'}` : 'fără puncte'}.`;
  match = value.match(/^(Mint|Coral|Sky|Gold) wins with (\d+) points!$/);
  if (match) return `${match[1]} câștigă cu ${match[2]} puncte!`;
  match = value.match(/^(Mint & Sky|Coral & Gold) win (\d+)-(\d+)!$/);
  if (match) return `${match[1].replace(' & ', ' și ')} câștigă cu ${match[2]}-${match[3]}!`;
  match = value.match(/^(Mint|Coral|Sky|Gold) · partner · bot$/);
  if (match) return `${match[1]} · partener · bot`;
  match = value.match(/^(Mint|Coral|Sky|Gold) · bot$/);
  if (match) return `${match[1]} · bot`;
  match = value.match(/^(Mint|Coral|Sky|Gold) · partner$/);
  if (match) return `${match[1]} · partener`;
  match = value.match(/^(\d+) cards · (\d+) pts$/);
  if (match) return `${match[1]} cărți · ${match[2]} pct`;
  match = value.match(/^(Mint|Coral) wins the game!$/);
  if (match) return `${match[1]} câștigă partida!`;
  match = value.match(/^(Mint|Coral|Sky|Gold) is choosing a card…$/);
  if (match) return `${match[1]} își alege cartea…`;
  match = value.match(/^Pass the device to (Mint|Coral|Sky|Gold), then reveal the hand\.$/);
  if (match) return `Dă dispozitivul lui ${match[1]}, apoi arată cărțile.`;
  match = value.match(/^Coral Bot · (Easy|Normal|Hard)$/);
  if (match) {
    const difficulty = match[1] === 'Easy' ? 'Ușor' : match[1] === 'Hard' ? 'Greu' : 'Normal';
    return `Bot Coral · ${difficulty}`;
  }
  match = value.match(/^Coral bot \((Easy|Normal|Hard)\) is thinking…$/);
  if (match) {
    const difficulty = match[1] === 'Easy' ? 'Ușor' : match[1] === 'Hard' ? 'Greu' : 'Normal';
    return `Botul Coral (${difficulty}) se gândește…`;
  }
  match = value.match(/^Great move — \+([\d.,]+) points\.$/);
  if (match) return `Mutare excelentă — +${match[1]} puncte.`;
  match = value.match(/^No moves left\. Final score: ([\d.,]+)\.$/);
  if (match) return `Nu mai sunt mutări. Scor final: ${match[1]}.`;
  match = value.match(/^Final score: ([\d.,]+) points\.$/);
  if (match) return `Scor final: ${match[1]} puncte.`;
  match = value.match(/^Brilliant run — ([\d.,]+) points\. Keep going or start fresh\.$/);
  if (match) return `Serie excelentă — ${match[1]} puncte. Continuă sau începe din nou.`;
  // 2048 in powers of 3, 5 and 7
  match = value.match(/^Join equal numbers\. Build ([\d.,]+)\.$/);
  if (match) return `Unește numere egale. Construiește ${match[1]}.`;
  match = value.match(/^Slide, merge, and reach ([\d.,]+)$/);
  if (match) return `Glisează, combină și ajungi la ${match[1]}`;
  match = value.match(/^You made ([\d.,]+)!$/);
  if (match) return `Ai format ${match[1]}!`;
  match = value.match(/^([\d.,]+) reached — keep building your high score!$/);
  if (match) return `Ai ajuns la ${match[1]} — continuă să-ți mărești recordul!`;
  match = value.match(/^Powers of (\d+) — merge your way to ([\d.,]+)\.$/);
  if (match) return `Puteri ale lui ${match[1]} — combină până ajungi la ${match[2]}.`;
  match = value.match(/^Tile (\d+) at row (\d+), column (\d+)$/);
  if (match) return `Piesa ${match[1]} pe rândul ${match[2]}, coloana ${match[3]}`;
  match = value.match(/^Empty tile at row (\d+), column (\d+)$/);
  if (match) return `Loc liber pe rândul ${match[1]}, coloana ${match[2]}`;
  match = value.match(/^Completed in ([0-9:]+) · (\d+) mistakes? · (\d+) hints? · ([\d.,]+) points\.$/);
  if (match) {
    const mistakes = Number(match[2]) === 1 ? 'greșeală' : 'greșeli';
    const hints = Number(match[3]) === 1 ? 'indiciu' : 'indicii';
    return `Finalizat în ${match[1]} · ${match[2]} ${mistakes} · ${match[3]} ${hints} · ${match[4]} puncte.`;
  }
  match = value.match(/^Hint, (\d+) remaining$/);
  if (match) return `Indiciu, ${match[1]} ${Number(match[1]) === 1 ? 'rămas' : 'rămase'}`;
  match = value.match(/^(Given|Entered) (\d+), row (\d+), column (\d+)$/);
  if (match) return `${match[1] === 'Given' ? 'Număr dat' : 'Număr introdus'} ${match[2]}, rândul ${match[3]}, coloana ${match[4]}`;
  match = value.match(/^Empty cell, row (\d+), column (\d+)$/);
  if (match) return `Celulă goală, rândul ${match[1]}, coloana ${match[2]}`;
  match = value.match(/^Note (\d+) (added|removed)\.$/);
  if (match) return `Notița ${match[1]} a fost ${match[2] === 'added' ? 'adăugată' : 'ștearsă'}.`;
  match = value.match(/^Empty cell, row (\d+), column (\d+), notes (.+)$/);
  if (match) return `Celulă goală, rândul ${match[1]}, coloana ${match[2]}, notițe ${match[3]}`;
  match = value.match(/^(Empty point|Mint piece|Coral piece), position (\d+)$/);
  if (match) {
    const occupant = match[1] === 'Empty point' ? 'Punct liber' : match[1] === 'Mint piece' ? 'Piesă Mint' : 'Piesă Coral';
    return `${occupant}, poziția ${match[2]}`;
  }
  match = value.match(/^Online match ready · You are (Mint|Coral|Sky|Gold)$/);
  if (match) return `Meci online pregătit · Ești ${match[1]}`;
  match = value.match(/^Add (.+) to favorites$/);
  if (match) return `Adaugă ${match[1]} la favorite`;
  match = value.match(/^Remove (.+) from favorites$/);
  if (match) return `Elimină ${match[1]} din favorite`;
  return null;
}

const UX_TRANSLATIONS: Record<string, string> = {
  // Math Crossword
  'Fill the empty circles so every sum across and down adds up, on three difficulty levels.': 'Completează cercurile goale astfel încât fiecare calcul, pe orizontală și pe verticală, să fie corect, pe trei niveluri de dificultate.',
  'Solo · Number puzzle': 'Solo · Puzzle cu numere',
  'Play Math Crossword': 'Joacă Math Crossword',
  'Fill in the sums · Solo number puzzle': 'Completează calculele · Puzzle solo cu numere',
  'Math Crossword game': 'Joc Math Crossword',
  'Math crossword grid': 'Grila de integramă matematică',
  'Number keypad': 'Tastatură numerică',
  'Math Crossword difficulty': 'Dificultatea Math Crossword',
  'To fill': 'De completat',
  'Easy · up to 20': 'Ușor · până la 20',
  'Normal · up to 50': 'Normal · până la 50',
  'Hard · up to 99': 'Greu · până la 99',
  'Type': 'Scrie',
  'Tap an empty circle, then pick its number.': 'Apasă un cerc gol, apoi alege numărul lui.',
  'Not quite - the red circles break an equation.': 'Nu chiar - cercurile roșii strică o ecuație.',
  'Saved puzzle restored - keep going.': 'Puzzle salvat restaurat - continuă.',
  '1 circle left to fill.': 'Un cerc rămas de completat.',
  'games': 'jocuri',
  'You': 'Tu', 'Local P1': 'Jucător 1', 'Local P2': 'Jucător 2',
  'easy bot': 'Bot ușor', 'normal bot': 'Bot normal', 'hard bot': 'Bot greu',
  'New round': 'Rundă nouă', 'Bomb': 'Bombă',
  'A saved puzzle with notes is ready.': 'Ai un puzzle salvat, cu notițe.',
  'Saved puzzle restored. Continue when you are ready.': 'Puzzle restaurat. Continuă când ești pregătit.',
  'Saved puzzle continued. Only visible row, column, and box conflicts are flagged.': 'Puzzle reluat. Sunt marcate doar conflictele din rând, coloană sau careu.',
  'A saved run is ready on this device.': 'Ai un joc salvat pe acest dispozitiv.',
  'Saved run restored. Continue when you are ready.': 'Joc restaurat. Continuă când ești pregătit.',
  'Saved run continued — swipe or use the arrow controls.': 'Joc reluat — glisează sau folosește săgețile.',
  'Arcade sections': 'Secțiunile arcadei', 'Quick Play recommendation': 'Recomandare de Joc Rapid',
  'Change': 'Schimbă', 'Start race': 'Pornește cursa', 'Reset race': 'Resetează cursa',
  'Get ready': 'Pregătește-te', 'Mint lap': 'Tură Mint', 'Coral lap': 'Tură Coral', 'First to finish': 'Primul la sosire',
  'Race the Coral bot through three turbo-charged laps.': 'Întrece botul Coral în trei ture cu turbo.',
  'Find your next game.': 'Găsește următorul joc.',
  'Play solo, share a device, or invite a friend online.': 'Joacă solo, pe același dispozitiv sau invită un prieten online.',
  'Back to games': 'Înapoi la jocuri',
  'Solo, same device, or online arcade duel': 'Duel arcade solo, pe același dispozitiv sau online',
  'Game setup': 'Configurarea jocului',
  'Challenges': 'Provocări', 'Recently played': 'Jucate recent',
  'Same device': 'Același dispozitiv', 'Solo · vs bot': 'Solo · cu bot',
  'Solo · Same device · Online': 'Solo · Același dispozitiv · Online',
  'Solo · Same device': 'Solo · Același dispozitiv',
  'Got it': 'Am înțeles', 'Take a break': 'Ia o pauză',
  'Game paused': 'Joc în pauză', 'Pause game': 'Pune jocul în pauză',
  'Resume game': 'Reia jocul', 'Resume unavailable': 'Reluare indisponibilă',
  '▶ Resume': '▶ Reia', 'Ⅱ Pause': 'Ⅱ Pauză', '● Live': '● În direct',
  'Close — stay paused': 'Închide — păstrează pauza',
  'Take your time. Resume when you are ready.': 'Ia-ți timpul necesar. Reia jocul când ești pregătit.',
  'Read the guide, then resume when you are ready.': 'Citește ghidul, apoi reia jocul când ești pregătit.',
  'Finish changing settings, then resume when you are ready.': 'Termină setările, apoi reia jocul când ești pregătit.',
  'The page was hidden. Return to the game, then resume safely.': 'Pagina a fost ascunsă. Revino la joc și reia când ești pregătit.',
  'The game lost focus. Resume when your controls are ready.': 'Ai părăsit fereastra jocului. Reia când ești pregătit.',
  'Get your hands back on the controls.': 'Pregătește comenzile.',
  'Gameplay resumed.': 'Jocul a fost reluat.', 'Go!': 'Start!',
  'How to play': 'Cum se joacă', '? How to play': '? Cum se joacă',
  'Settings': 'Setări', 'Online play continues': 'Jocul online continuă',
  'This game is paused while Settings is open.': 'Jocul este în pauză cât timp setările sunt deschise.',
  'Online play continues while Settings is open. Your held controls were released.': 'Meciul online continuă cât timp setările sunt deschise. Comenzile apăsate au fost eliberate.',
  'Online stays live': 'Meciul online continuă',
  'Restart game': 'Reîncepe jocul', 'Continue playing': 'Continuă jocul',
  'Feedback': 'Feedback', 'Found a problem?': 'Ai găsit o problemă?',
  'Tell us about a bug or share an idea to make the arcade better.': 'Spune-ne despre o eroare sau propune o idee pentru a îmbunătăți arcada.',
  'Report a bug or idea': 'Raportează o eroare sau o idee', 'Help us improve': 'Ajută-ne să ne îmbunătățim',
  'Close bug report': 'Închide raportul', 'What is it?': 'Ce este?',
  'Something is broken': 'Ceva nu funcționează', 'An idea or improvement': 'O idee sau o îmbunătățire',
  'Describe it': 'Descrie', 'Send report': 'Trimite raportul', 'Sending…': 'Se trimite…',
  'What happened, and what did you expect? Which game, and what were you doing?': 'Ce s-a întâmplat și ce te așteptai? Ce joc și ce făceai?',
  'We also send the page you are on, your screen size, browser, and any recent errors. No personal data.': 'Trimitem și pagina pe care ești, mărimea ecranului, browserul și erorile recente. Fără date personale.',
  'Thanks! Your report was sent.': 'Mulțumim! Raportul a fost trimis.',
  'Choose bug or idea.': 'Alege eroare sau idee.',
  'Please describe it in at least 10 characters.': 'Te rugăm să descrii în cel puțin 10 caractere.',
  'Please keep it under 2000 characters.': 'Te rugăm să folosești sub 2000 de caractere.',
  'Too many reports right now. Please try again later.': 'Prea multe rapoarte acum. Încearcă din nou mai târziu.',
  'The report could not be sent. Try again later.': 'Raportul nu a putut fi trimis. Încearcă mai târziu.',
  'You seem to be offline. Try again when you are connected.': 'Pari offline. Încearcă din nou când ești conectat.',
  'I have a tester code': 'Am un cod de tester', 'Tester code': 'Cod de tester',
  'Saved on this device after a successful report. Clear the field to forget it.': 'Se salvează pe acest dispozitiv după un raport trimis. Golește câmpul pentru a-l uita.',
  'Thanks! Your tester report was sent.': 'Mulțumim! Raportul tău de tester a fost trimis.',
  'Tester code not recognized.': 'Codul de tester nu este recunoscut.',
  'Your tester code has expired.': 'Codul tău de tester a expirat.',
  'Your tester code was revoked.': 'Codul tău de tester a fost revocat.',
  'You reached your daily tester report limit.': 'Ai atins limita zilnică de rapoarte de tester.',
  // Brick Breaker capsules
  'Extra life': 'Viață în plus', 'Power ball': 'Minge de foc', 'Wide paddle': 'Paletă lată', 'Multi-ball': 'Mai multe mingi', 'Slow ball': 'Minge lentă',
  'Extra life!': 'Viață în plus!', 'Power ball - smash straight through!': 'Minge de foc - trece prin cărămizi!', 'Wide paddle!': 'Paletă lată!',
  'Multi-ball!': 'Mai multe mingi!', 'Slow ball!': 'Minge lentă!', 'Balls full - 500 bonus points!': 'Mingi la maximum - 500 de puncte bonus!',
  // Neon Snake bonuses
  'Star fruit': 'Fruct stea', 'Shrink': 'Micșorare', 'Slow time': 'Timp lent', 'Ghost': 'Fantomă',
  'Star fruit - 5 points!': 'Fruct stea - 5 puncte!', 'Shrink - tail trimmed!': 'Micșorare - coada s-a scurtat!',
  'Slow time!': 'Timp lent!', 'Ghost - slip through snakes!': 'Fantomă - treci prin șerpi!',
  // Mini Tanks bonuses ('Rapid fire' is shared with Survival)
  'Shield': 'Scut', 'Triple shot': 'Tragere triplă', 'Speed boost': 'Viteză sporită',
  'Shield - blocks one hit!': 'Scut - oprește o lovitură!', 'Rapid fire!': 'Foc rapid!', 'Triple shot!': 'Tragere triplă!', 'Speed boost!': 'Viteză sporită!',
  // Paddle Clash bonuses
  'Big paddle': 'Paletă mare', 'Tiny rival': 'Rival mic', 'Goal shield': 'Scut de poartă',
  'Big paddle!': 'Paletă mare!', 'Tiny rival paddle!': 'Paleta rivalului e mică!', 'Goal shield - saves one point!': 'Scut de poartă - salvează un punct!',
  'Point at the problem': 'Arată problema', 'Include this screenshot': 'Include această captură de ecran',
  'Tap the part that looks wrong': 'Atinge partea care arată greșit', 'Cancel': 'Anulează',
  'Screenshot of the game that will be sent with the report': 'Captura de ecran a jocului care va fi trimisă cu raportul',
  'We also send the page you are on, your screen size, browser, any recent errors, and the screenshot if it is ticked. No personal data.': 'Trimitem și pagina pe care ești, mărimea ecranului, browserul, erorile recente și captura de ecran dacă este bifată. Fără date personale.',
};
export function translateArcadeText(value: string, language: ArcadeLanguage = activeLanguage): string {
  if (language === 'en' || !value) return value;
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  const core = value.slice(leading.length, value.length - trailing.length);
  if (!core) return value;
  const translated = UX_TRANSLATIONS[core] ?? (core.startsWith('Resuming in ') ? core.replace('Resuming in ', 'Reluare în ') : undefined) ?? ROMANIAN_TRANSLATIONS[core] ?? translateRomanianPattern(core) ?? core;
  return `${leading}${translated}${trailing}`;
}

export function currentArcadeLanguage(): ArcadeLanguage {
  return activeLanguage;
}

let staticTranslations: Map<string, string> | null = null;
let servedSources: Map<string, string> | null = null;

/**
 * The fixed strings that can be translated on the server and still be turned
 * back into English in the browser: each Romanian text belongs to exactly one
 * English text, and is not itself English text that means something else.
 */
function staticTranslationTables(): { forward: Map<string, string>; reverse: Map<string, string> } {
  if (staticTranslations && servedSources) return { forward: staticTranslations, reverse: servedSources };
  const all = { ...ROMANIAN_TRANSLATIONS, ...UX_TRANSLATIONS };
  const owners = new Map<string, string[]>();
  Object.entries(all).forEach(([english, romanian]) => owners.set(romanian, [...(owners.get(romanian) ?? []), english]));
  staticTranslations = new Map();
  servedSources = new Map();
  Object.entries(all).forEach(([english, romanian]) => {
    if (romanian === english || owners.get(romanian)!.length !== 1) return;
    if (romanian in all) return;
    staticTranslations!.set(english, romanian);
    servedSources!.set(romanian, english);
  });
  return { forward: staticTranslations, reverse: servedSources };
}

/** Romanian for a fixed page string, only when the browser can reverse it; otherwise undefined. */
export function translateStaticText(english: string): string | undefined {
  return staticTranslationTables().forward.get(english);
}

/** The English a server-translated Romanian string came from, so switching to English still works. */
export function servedSourceText(romanian: string): string | undefined {
  return staticTranslationTables().reverse.get(romanian);
}

/** Set when the server already sent this page in Romanian (see <html data-served-lang>). */
let servedLanguage: ArcadeLanguage = 'en';

function englishSource(value: string): string {
  if (servedLanguage === 'en') return value;
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  const source = servedSourceText(value.slice(leading.length, value.length - trailing.length));
  return source === undefined ? value : `${leading}${source}${trailing}`;
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
    record = { source: englishSource(current), rendered: current };
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
    record = { source: englishSource(current), rendered: current };
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
  if (!initialized) servedLanguage = document.documentElement.dataset.servedLang === 'ro' ? 'ro' : 'en';
  document.documentElement.lang = language;
  startObserver();
  if (changed || !initialized) {
    localizeElement(document.documentElement);
    initialized = true;
    window.dispatchEvent(new CustomEvent('arcade-language-change', { detail: { language } }));
  }
}

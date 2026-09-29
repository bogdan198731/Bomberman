import { ArcadeResultReporter } from './stats.js';
import { isArcadeSessionPaused, registerArcadeSession } from './session-control.js';
import { currentArcadeLanguage, type ArcadeLanguage } from './i18n.js';

export type HangmanDifficulty = 'easy' | 'normal' | 'hard';
export type HangmanPhase = 'playing' | 'won' | 'lost';
export type HangmanCategory = 'Animals' | 'Food' | 'Countries' | 'Sports' | 'Nature' | 'Jobs';

/** Wrong guesses allowed. The figure always has six parts; drawnParts() spreads them over these. */
export const HANGMAN_LIVES: Record<HangmanDifficulty, number> = { easy: 8, normal: 6, hard: 4 };
export const HANGMAN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export interface HangmanWord { word: string; category: HangmanCategory }

const list = (category: HangmanCategory, words: string): HangmanWord[] =>
  words.split(' ').map(word => ({ word, category }));

/** One list per language, so Romanian players guess Romanian words. */
export const HANGMAN_WORDS: Record<ArcadeLanguage, HangmanWord[]> = {
  en: [
    ...list('Animals', 'ELEPHANT GIRAFFE PENGUIN DOLPHIN KANGAROO SQUIRREL OCTOPUS HEDGEHOG TORTOISE CHEETAH BUTTERFLY FLAMINGO'),
    ...list('Food', 'PANCAKE AVOCADO SPAGHETTI PINEAPPLE CHOCOLATE SANDWICH BROCCOLI MUSHROOM PRETZEL BLUEBERRY OMELETTE'),
    ...list('Countries', 'ROMANIA PORTUGAL ICELAND MEXICO CANADA JAPAN NORWAY ARGENTINA AUSTRALIA MOROCCO VIETNAM'),
    ...list('Sports', 'FOOTBALL BASKETBALL TENNIS CYCLING SWIMMING VOLLEYBALL HANDBALL ARCHERY BOXING SKIING'),
    ...list('Nature', 'MOUNTAIN VOLCANO WATERFALL RAINBOW THUNDER GLACIER MEADOW HORIZON CANYON FOREST'),
    ...list('Jobs', 'ASTRONAUT DENTIST FIREFIGHTER CARPENTER PILOT BAKER JOURNALIST GARDENER PLUMBER ARCHITECT'),
  ],
  ro: [
    ...list('Animals', 'ELEFANT GIRAFĂ PINGUIN DELFIN CANGUR VEVERIȚĂ CARACATIȚĂ ARICI BROASCĂ FLUTURE URS LUP'),
    ...list('Food', 'CLĂTITĂ SARMALE MĂMĂLIGĂ CIORBĂ PLĂCINTĂ COZONAC ANANAS CIOCOLATĂ CIUPERCĂ BRÂNZĂ'),
    ...list('Countries', 'ROMÂNIA PORTUGALIA ISLANDA MEXIC CANADA JAPONIA NORVEGIA ARGENTINA AUSTRALIA MAROC'),
    ...list('Sports', 'FOTBAL BASCHET TENIS CICLISM ÎNOT VOLEI HANDBAL BOX SCHI GIMNASTICĂ'),
    ...list('Nature', 'MUNTE VULCAN CASCADĂ CURCUBEU FURTUNĂ GHEAȚĂ PĂDURE ORIZONT RÂU POIANĂ'),
    ...list('Jobs', 'ASTRONAUT DENTIST POMPIER TÂMPLAR PILOT BRUTAR JURNALIST GRĂDINAR INSTALATOR ARHITECT'),
  ],
};

/** The keyboard letter a word letter answers to: Ă and Â are guessed with A, Ș with S. */
export function baseLetter(letter: string): string {
  return letter.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

export const HANGMAN_SESSION_STORAGE_KEY = 'blast-arcade-hangman-session-v1';

/** An unfinished round, so a phone that reclaims the tab does not cost it. */
export interface HangmanSession {
  difficulty: HangmanDifficulty;
  word: string;
  category: HangmanCategory;
  guesses: string;
  streak: number;
}

interface HangmanStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): HangmanStorage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; }
  catch { return undefined; }
}

export function normalizeHangmanSession(value: unknown): HangmanSession | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<HangmanSession>;
  const { difficulty, word, category, guesses } = candidate;
  if (difficulty !== 'easy' && difficulty !== 'normal' && difficulty !== 'hard') return null;
  // Only words from our own lists: a tampered save must not show arbitrary text.
  const known = [...HANGMAN_WORDS.en, ...HANGMAN_WORDS.ro].find(entry => entry.word === word && entry.category === category);
  if (!known) return null;
  if (typeof guesses !== 'string' || !/^[A-Z]*$/.test(guesses) || new Set(guesses).size !== guesses.length) return null;
  const streak = Number(candidate.streak);
  return { difficulty, word: known.word, category: known.category, guesses, streak: Number.isInteger(streak) && streak >= 0 ? streak : 0 };
}

export function loadHangmanSession(storage: HangmanStorage | undefined = browserStorage()): HangmanSession | null {
  try {
    const raw = storage?.getItem(HANGMAN_SESSION_STORAGE_KEY);
    return raw ? normalizeHangmanSession(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveHangmanSession(session: HangmanSession | null, storage: HangmanStorage | undefined = browserStorage()): void {
  try {
    if (session) storage?.setItem(HANGMAN_SESSION_STORAGE_KEY, JSON.stringify(session));
    else storage?.removeItem(HANGMAN_SESSION_STORAGE_KEY);
  } catch { /* The game still plays; it just cannot be resumed. */ }
}

export class HangmanGame {
  difficulty: HangmanDifficulty = 'normal';
  word = '';
  category: HangmanCategory = 'Animals';
  guesses: string[] = [];
  phase: HangmanPhase = 'playing';
  /** Words solved in a row; a loss resets it. */
  streak = 0;
  private random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  newGame(language: ArcadeLanguage, difficulty: HangmanDifficulty = this.difficulty): void {
    const words = HANGMAN_WORDS[language];
    // Never the same word twice running.
    const choices = words.filter(entry => entry.word !== this.word);
    const pick = choices[Math.floor(this.random() * choices.length)] ?? words[0];
    this.difficulty = difficulty;
    this.word = pick.word;
    this.category = pick.category;
    this.guesses = [];
    this.phase = 'playing';
  }

  get lives(): number { return HANGMAN_LIVES[this.difficulty]; }

  private letters(): Set<string> {
    return new Set([...this.word].map(baseLetter));
  }

  mistakes(): number {
    const letters = this.letters();
    return this.guesses.filter(guess => !letters.has(guess)).length;
  }

  livesLeft(): number { return this.lives - this.mistakes(); }

  hasGuessed(letter: string): boolean { return this.guesses.includes(letter); }

  isHit(letter: string): boolean { return this.letters().has(letter); }

  /** The word as the player sees it: guessed letters, blanks for the rest (all of it once the round is over). */
  revealed(): string[] {
    return [...this.word].map(letter => (this.phase !== 'playing' || this.guesses.includes(baseLetter(letter)) ? letter : ''));
  }

  guess(raw: string): 'hit' | 'miss' | 'ignored' {
    const letter = baseLetter(raw);
    if (this.phase !== 'playing' || letter.length !== 1 || !HANGMAN_ALPHABET.includes(letter) || this.hasGuessed(letter)) return 'ignored';
    this.guesses.push(letter);
    const hit = this.isHit(letter);
    if ([...this.letters()].every(needed => this.guesses.includes(needed))) {
      this.phase = 'won';
      this.streak++;
    } else if (this.livesLeft() <= 0) {
      this.phase = 'lost';
      this.streak = 0;
    }
    return hit ? 'hit' : 'miss';
  }

  /** Longer words and spare lives pay more; harder settings multiply it. */
  score(): number {
    if (this.phase !== 'won') return 0;
    const multiplier = { easy: 1, normal: 2, hard: 3 }[this.difficulty];
    return (this.letters().size * 50 + this.livesLeft() * 40) * multiplier;
  }

  /**
   * How much of the six-part figure to draw, spread over however many lives
   * this setting has. The last part only appears on the losing guess.
   */
  drawnParts(): number {
    const mistakes = this.mistakes();
    if (mistakes >= this.lives) return 6;
    return Math.min(5, Math.ceil((mistakes * 6) / this.lives));
  }

  statusText(): string {
    if (this.phase === 'won') return `Solved! ${this.score()} points.`;
    if (this.phase === 'lost') return `Out of tries - the word was ${this.word}.`;
    const left = this.livesLeft();
    return this.guesses.length ? `${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Pick a letter to start.';
  }

  session(): HangmanSession | null {
    if (this.phase !== 'playing' || !this.guesses.length) return null;
    return { difficulty: this.difficulty, word: this.word, category: this.category, guesses: this.guesses.join(''), streak: this.streak };
  }

  restore(value: unknown): boolean {
    const session = normalizeHangmanSession(value);
    if (!session) return false;
    this.difficulty = session.difficulty;
    this.word = session.word;
    this.category = session.category;
    this.streak = session.streak;
    this.guesses = [];
    this.phase = 'playing';
    for (const letter of session.guesses) this.guess(letter);
    // A save is only written mid-round, so a finished replay means it was tampered with.
    if (this.phase !== 'playing') return false;
    return true;
  }
}

export function initHangman(): void {
  if (typeof document === 'undefined') return;
  const canvas = document.getElementById('hangmanCanvas') as HTMLCanvasElement | null;
  const context = canvas?.getContext('2d');
  const view = document.getElementById('hangmanView');
  const wordEl = document.getElementById('hangmanWord');
  const keyboard = document.getElementById('hangmanKeyboard');
  if (!canvas || !context || !view || !wordEl || !keyboard) return;
  const board = canvas;
  const ctx = context;
  const hangmanView = view;
  const wordBox = wordEl;

  const game = new HangmanGame();
  const status = document.getElementById('hangmanStatus');
  const categoryEl = document.getElementById('hangmanCategory');
  const livesEl = document.getElementById('hangmanLives');
  const streakEl = document.getElementById('hangmanStreak');
  const difficultySelect = document.getElementById('hangmanDifficulty') as HTMLSelectElement | null;
  const resultReporter = new ArcadeResultReporter('hangman');
  let resumed = false;

  const keys = new Map<string, HTMLButtonElement>();
  for (const letter of HANGMAN_ALPHABET) {
    const key = document.createElement('button');
    key.type = 'button';
    key.className = 'hangman-key';
    key.textContent = letter;
    key.dataset.letter = letter;
    key.addEventListener('click', () => play(letter));
    keyboard.append(key);
    keys.set(letter, key);
  }

  function newGame(difficulty: HangmanDifficulty = game.difficulty): void {
    game.newGame(currentArcadeLanguage(), difficulty);
    saveHangmanSession(null);
    resumed = false;
    syncUi();
  }

  function syncUi(): void {
    if (status) status.textContent = resumed ? 'Saved word restored - keep guessing.' : game.statusText();
    if (categoryEl) categoryEl.textContent = game.category;
    if (livesEl) livesEl.textContent = String(game.livesLeft());
    if (streakEl) streakEl.textContent = String(game.streak);
    // Rebuilt each time: the word is short, and each letter needs its own box.
    wordBox.replaceChildren(...game.revealed().map((letter, index) => {
      const cell = document.createElement('span');
      cell.className = 'hangman-letter';
      if (letter && game.phase === 'lost' && !game.hasGuessed(baseLetter(game.word[index]))) cell.classList.add('missed');
      cell.textContent = letter;
      return cell;
    }));
    const shown = game.revealed().map(letter => letter || '_').join(' ');
    wordBox.setAttribute('aria-label', `Word: ${shown}`);
    for (const [letter, key] of keys) {
      const used = game.hasGuessed(letter);
      key.disabled = used || game.phase !== 'playing';
      key.classList.toggle('hit', used && game.isHit(letter));
      key.classList.toggle('miss', used && !game.isHit(letter));
    }
    resultReporter.report(game.phase !== 'playing', {
      outcome: game.phase === 'won' ? 'win' : 'loss',
      score: game.score(),
    });
    render();
  }

  function play(letter: string): void {
    if (isArcadeSessionPaused('hangman')) return;
    if (game.guess(letter) === 'ignored') return;
    resumed = false;
    saveHangmanSession(game.session());
    syncUi();
  }

  function render(): void {
    const { width, height } = board;
    ctx.fillStyle = '#0a1120';
    ctx.fillRect(0, 0, width, height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Gallows
    ctx.strokeStyle = '#8a97ab';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(60, 280); ctx.lineTo(240, 280);
    ctx.moveTo(100, 280); ctx.lineTo(100, 30); ctx.lineTo(230, 30); ctx.lineTo(230, 62);
    ctx.moveTo(100, 76); ctx.lineTo(144, 30);
    ctx.stroke();
    const parts = game.drawnParts();
    ctx.strokeStyle = game.phase === 'lost' ? '#ff6b78' : game.phase === 'won' ? '#54e38e' : '#f4f6f8';
    ctx.lineWidth = 6;
    const segments: [number, number, number, number][] = [
      [230, 120, 230, 190], // body
      [230, 135, 196, 168], [230, 135, 264, 168], // arms
      [230, 190, 202, 240], [230, 190, 258, 240], // legs
    ];
    if (parts >= 1) { ctx.beginPath(); ctx.arc(230, 91, 28, 0, Math.PI * 2); ctx.stroke(); }
    segments.slice(0, Math.max(0, parts - 1)).forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });
    // Remaining tries as pips, so Easy's spare lives are visible before anything is drawn.
    for (let i = 0; i < game.lives; i++) {
      ctx.fillStyle = i < game.livesLeft() ? '#54e38e' : '#2a3a55';
      ctx.beginPath(); ctx.arc(width - 24, 30 + i * 22, 7, 0, Math.PI * 2); ctx.fill();
    }
  }

  window.addEventListener('keydown', event => {
    if (hangmanView.classList.contains('view-hidden') || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
    if (/^[a-z]$/i.test(event.key)) {
      event.preventDefault();
      play(event.key.toUpperCase());
    }
  });

  document.getElementById('hangmanNewButton')?.addEventListener('click', () => newGame());
  difficultySelect?.addEventListener('change', () => {
    const difficulty = difficultySelect.value;
    if (difficulty === 'easy' || difficulty === 'normal' || difficulty === 'hard') {
      try { localStorage.setItem('blast-arcade-hangman-difficulty-v1', difficulty); } catch { /* optional */ }
      newGame(difficulty);
    }
  });

  let difficulty: HangmanDifficulty = 'normal';
  try {
    const saved = localStorage.getItem('blast-arcade-hangman-difficulty-v1');
    if (saved === 'easy' || saved === 'normal' || saved === 'hard') difficulty = saved;
  } catch { /* keep Normal */ }
  game.newGame(currentArcadeLanguage(), difficulty);
  // An unfinished word beats a fresh one: pick up exactly where the player left off.
  if (game.restore(loadHangmanSession())) resumed = true;
  if (difficultySelect) difficultySelect.value = game.difficulty;
  // A fresh word in the new language, unless the player is part-way through one.
  window.addEventListener('arcade-language-change', () => { if (!game.guesses.length) newGame(); });

  registerArcadeSession({
    gameId: 'hangman',
    view: hangmanView,
    mode: () => 'solo',
    isActive: () => game.phase === 'playing' && game.guesses.length > 0,
    clearHeldInputs: () => undefined,
    resumeCountdown: false,
  });

  syncUi();
}

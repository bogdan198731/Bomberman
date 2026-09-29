import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HANGMAN_ALPHABET, HANGMAN_LIVES, HANGMAN_SESSION_STORAGE_KEY, HANGMAN_WORDS, HangmanGame,
  baseLetter, loadHangmanSession, normalizeHangmanSession, saveHangmanSession,
} from './hangman.js';

function gameWith(word: string, difficulty: 'easy' | 'normal' | 'hard' = 'normal'): HangmanGame {
  const game = new HangmanGame();
  game.newGame('en', difficulty);
  game.word = word;
  return game;
}

test('every word can be guessed with the A-Z keyboard in both languages', () => {
  for (const language of ['en', 'ro'] as const) {
    const words = HANGMAN_WORDS[language];
    assert.ok(words.length >= 40, `${language} needs a decent word list`);
    assert.equal(new Set(words.map(entry => entry.word)).size, words.length, `${language} has duplicate words`);
    for (const { word } of words) {
      for (const letter of word) assert.ok(HANGMAN_ALPHABET.includes(baseLetter(letter)), `${word} has un-typeable ${letter}`);
    }
  }
});

test('Romanian letters are guessed with their plain keyboard letter', () => {
  assert.deepEqual(['Ă', 'Â', 'Î', 'Ș', 'Ț', 'a'].map(baseLetter), ['A', 'A', 'I', 'S', 'T', 'A']);
  const game = gameWith('BRÂNZĂ');
  game.guess('A');
  assert.deepEqual(game.revealed(), ['', '', 'Â', '', '', 'Ă']);
  assert.equal(game.mistakes(), 0);
});

test('a right letter fills every place it occurs and costs nothing', () => {
  const game = gameWith('BANANA');
  assert.equal(game.guess('A'), 'hit');
  assert.deepEqual(game.revealed(), ['', 'A', '', 'A', '', 'A']);
  assert.equal(game.livesLeft(), HANGMAN_LIVES.normal);
  assert.equal(game.guess('a'), 'ignored', 'repeating a letter is free');
});

test('guessing every letter wins, scores, and extends the streak', () => {
  const game = gameWith('BANANA');
  game.guess('Z');
  for (const letter of 'BAN') game.guess(letter);
  assert.equal(game.phase, 'won');
  assert.equal(game.streak, 1);
  // 3 distinct letters, 5 of 6 tries left, Normal doubles it.
  assert.equal(game.score(), (3 * 50 + 5 * 40) * 2);
  assert.equal(game.statusText(), `Solved! ${game.score()} points.`);
  assert.equal(game.guess('Q'), 'ignored', 'a finished round takes no more guesses');
});

test('running out of tries loses, reveals the word, and resets the streak', () => {
  const game = gameWith('CAT', 'hard');
  game.streak = 4;
  for (const letter of 'XYZ') game.guess(letter);
  assert.equal(game.phase, 'playing');
  assert.equal(game.statusText(), '1 try left.');
  game.guess('Q');
  assert.equal(game.phase, 'lost');
  assert.equal(game.streak, 0);
  assert.equal(game.score(), 0);
  assert.deepEqual(game.revealed(), ['C', 'A', 'T']);
  assert.equal(game.statusText(), 'Out of tries - the word was CAT.');
});

test('the six-part figure is complete exactly when the tries run out', () => {
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    const game = gameWith('CAT', difficulty);
    const parts: number[] = [game.drawnParts()];
    for (const letter of 'BDEFGHIJ'.slice(0, HANGMAN_LIVES[difficulty])) { game.guess(letter); parts.push(game.drawnParts()); }
    assert.equal(parts[0], 0);
    assert.equal(parts.at(-1), 6, `${difficulty} ends on the full figure`);
    assert.equal(parts.slice(0, -1).includes(6), false, `${difficulty} shows the full figure only at the end`);
    assert.deepEqual(parts, [...parts].sort((a, b) => a - b), 'the drawing only grows');
  }
});

test('a new word is never the one just played', () => {
  const game = new HangmanGame(() => 0);
  game.newGame('en');
  const first = game.word;
  game.newGame('en');
  assert.notEqual(game.word, first);
  game.newGame('ro');
  assert.ok(HANGMAN_WORDS.ro.some(entry => entry.word === game.word));
});

test('an unfinished round saves and restores, and tampered saves are refused', () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };
  const game = gameWith('ELEPHANT', 'easy');
  game.category = 'Animals';
  game.streak = 2;
  assert.equal(game.session(), null, 'nothing to save before the first guess');
  game.guess('E'); game.guess('Z');
  saveHangmanSession(game.session(), storage);
  const restored = new HangmanGame();
  assert.equal(restored.restore(loadHangmanSession(storage)), true);
  assert.deepEqual([restored.word, restored.difficulty, restored.streak, restored.guesses], ['ELEPHANT', 'easy', 2, ['E', 'Z']]);
  assert.equal(restored.livesLeft(), HANGMAN_LIVES.easy - 1);

  const valid = { difficulty: 'easy', word: 'ELEPHANT', category: 'Animals', guesses: 'EZ', streak: 2 };
  assert.equal(normalizeHangmanSession({ ...valid, word: 'HACKED' }), null, 'only listed words');
  assert.equal(normalizeHangmanSession({ ...valid, category: 'Food' }), null);
  assert.equal(normalizeHangmanSession({ ...valid, guesses: 'EE' }), null);
  assert.equal(normalizeHangmanSession({ ...valid, difficulty: 'insane' }), null);
  // A save that would already be finished is not a round to resume.
  assert.equal(new HangmanGame().restore({ ...valid, guesses: 'ELPHANT' }), false);
  store.set(HANGMAN_SESSION_STORAGE_KEY, '{broken');
  assert.equal(loadHangmanSession(storage), null);
  saveHangmanSession(null, storage);
  assert.equal(store.has(HANGMAN_SESSION_STORAGE_KEY), false);
});

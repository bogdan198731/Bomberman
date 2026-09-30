import { GameRoomClient } from './game-room.js';
import { ArcadeResultReporter } from './stats.js';
import { translateArcadeText } from './i18n.js';
import { clearArcadePause, isArcadeSessionPaused, registerArcadeSession } from './session-control.js';

export type SepticaPlayer = 1 | 2 | 3 | 4;
/** Two or three play alone; four play as two teams, partners sitting opposite (1 & 3 vs 2 & 4). */
export type SepticaPlayerCount = 2 | 3 | 4;
export type SepticaRank = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
export type SepticaSuit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type SepticaPhase = 'playing' | 'continue-choice' | 'settling' | 'finished';
export type SepticaOfflineMode = 'bot' | 'local';
export const SEPTICA_TRICK_REVEAL_MS = 1_000;
/** Seats in turn order; with four players Sky is Mint's partner across the table. */
export const SEPTICA_PLAYER_NAMES: Record<SepticaPlayer, string> = { 1: 'Mint', 2: 'Coral', 3: 'Sky', 4: 'Gold' };

export interface SepticaCard {
  rank: SepticaRank;
  suit: SepticaSuit;
  id: string;
}

export interface SepticaOnlineState {
  localPlayer: SepticaPlayer;
  hand: SepticaCard[];
  opponentHandCount: number;
  deckCount: number;
  table: Array<{ player: SepticaPlayer; card: SepticaCard }>;
  points: Record<number, number>;
  currentPlayer: SepticaPlayer;
  leader: SepticaPlayer;
  lastCutter: SepticaPlayer;
  leadRank: SepticaRank | null;
  phase: SepticaPhase;
  winner: SepticaPlayer | 0 | null;
  lastTrickSummary: string;
}

const RANKS: SepticaRank[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS: SepticaSuit[] = ['clubs', 'diamonds', 'hearts', 'spades'];

function otherPlayer(player: SepticaPlayer): SepticaPlayer { return player === 1 ? 2 : 1; }
function cardPoints(card: SepticaCard): number { return card.rank === '10' || card.rank === 'A' ? 1 : 0; }

/** 32 cards; three players drop two eights (one black, one red) so the 30 left share out evenly. */
export function createSepticaDeck(playerCount: SepticaPlayerCount = 2): SepticaCard[] {
  const deck = SUITS.flatMap(suit => RANKS.map(rank => ({ rank, suit, id: `${rank}-${suit}` })));
  return playerCount === 3 ? deck.filter(card => card.id !== '8-clubs' && card.id !== '8-hearts') : deck;
}

export class SepticaGame {
  playerCount: SepticaPlayerCount = 2;
  deck: SepticaCard[] = [];
  hands: Record<number, SepticaCard[]> = { 1: [], 2: [] };
  table: Array<{ player: SepticaPlayer; card: SepticaCard }> = [];
  points: Record<number, number> = { 1: 0, 2: 0 };
  currentPlayer: SepticaPlayer = 1;
  leader: SepticaPlayer = 1;
  lastCutter: SepticaPlayer = 1;
  leadRank: SepticaRank | null = null;
  phase: SepticaPhase = 'playing';
  /** The winning seat, or with four players the winning team (1 = Mint & Sky, 2 = Coral & Gold); 0 is a draw. */
  winner: SepticaPlayer | 0 | null = null;
  lastTrickSummary = '';
  private random: () => number;

  constructor(random: () => number = Math.random, playerCount: SepticaPlayerCount = 2) {
    this.random = random;
    this.restart(playerCount);
  }

  restart(playerCount: SepticaPlayerCount = this.playerCount): void {
    this.playerCount = playerCount;
    this.deck = createSepticaDeck(playerCount);
    for (let index = this.deck.length - 1; index > 0; index -= 1) {
      const target = Math.floor(this.random() * (index + 1));
      [this.deck[index], this.deck[target]] = [this.deck[target], this.deck[index]];
    }
    this.hands = {};
    this.points = {};
    for (const player of this.players()) { this.hands[player] = []; this.points[player] = 0; }
    this.table = [];
    this.currentPlayer = 1;
    this.leader = 1;
    this.lastCutter = 1;
    this.leadRank = null;
    this.phase = 'playing';
    this.winner = null;
    this.lastTrickSummary = '';
    this.refillHands(1);
  }

  players(): SepticaPlayer[] {
    return ([1, 2, 3, 4] as SepticaPlayer[]).slice(0, this.playerCount);
  }

  nextPlayer(player: SepticaPlayer): SepticaPlayer {
    return ((player % this.playerCount) + 1) as SepticaPlayer;
  }

  get teams(): boolean { return this.playerCount === 4; }

  teamOf(player: SepticaPlayer): 1 | 2 { return player % 2 === 1 ? 1 : 2; }

  /** Points for a player's side: their own, or their team's when four play. */
  sidePoints(player: SepticaPlayer): number {
    if (!this.teams) return this.points[player];
    return this.players().filter(seat => this.teamOf(seat) === this.teamOf(player)).reduce((sum, seat) => sum + this.points[seat], 0);
  }

  isWinner(player: SepticaPlayer): boolean {
    if (!this.winner) return false;
    return this.teams ? this.teamOf(player) === this.winner : player === this.winner;
  }

  isCut(card: SepticaCard): boolean {
    return card.rank === '7' || card.rank === this.leadRank;
  }

  legalCardIndexes(player: SepticaPlayer): number[] {
    if (this.phase === 'finished' || this.phase === 'settling' || player !== this.currentPlayer) return [];
    if (this.phase === 'continue-choice') {
      return this.hands[player].map((card, index) => this.isCut(card) ? index : -1).filter(index => index >= 0);
    }
    return this.hands[player].map((_, index) => index);
  }

  /**
   * Everyone plays one card in turn. Once play comes back round to the
   * leader, the trick ends if the leader still holds it; if someone else cut
   * last, the leader may cut again (and everyone plays another card) or concede.
   */
  playCard(player: SepticaPlayer, cardIndex: number): boolean {
    if (!this.legalCardIndexes(player).includes(cardIndex)) return false;
    const [card] = this.hands[player].splice(cardIndex, 1);
    const openingPlay = this.table.length === 0;
    if (openingPlay) {
      this.leader = player;
      this.lastCutter = player;
      this.leadRank = card.rank;
    } else if (this.isCut(card)) this.lastCutter = player;
    this.table.push({ player, card });
    this.currentPlayer = this.nextPlayer(player);
    if (this.currentPlayer !== this.leader) this.phase = 'playing';
    else this.phase = this.lastCutter === this.leader ? 'settling' : 'continue-choice';
    return true;
  }

  settleTrick(): boolean {
    if (this.phase !== 'settling') return false;
    this.collectTrick();
    return true;
  }

  pass(player: SepticaPlayer): boolean {
    if (this.phase !== 'continue-choice' || this.currentPlayer !== player) return false;
    this.collectTrick();
    return true;
  }

  /** Plays for whoever's turn it is. */
  botMove(): boolean {
    const player = this.currentPlayer;
    if (this.phase === 'finished' || this.phase === 'settling') return false;
    const hand = this.hands[player];
    const legal = this.legalCardIndexes(player);
    const partnerHolds = this.teams && this.table.length > 0 && this.lastCutter !== player
      && this.teamOf(this.lastCutter) === this.teamOf(player);
    // No reason to fight a partner for a trick they already hold.
    if (this.phase === 'continue-choice' && (legal.length === 0 || partnerHolds)) return this.pass(player);
    if (legal.length === 0) return false;
    let chosen = legal.find(index => cardPoints(hand[index]) === 0 && hand[index].rank !== '7');
    if (partnerHolds) {
      // Feed the partner's trick an ace or ten when there is one to spare.
      chosen = legal.find(index => cardPoints(hand[index]) > 0 && hand[index].rank !== '7') ?? chosen;
    } else if (this.phase === 'playing' && this.table.length > 0) {
      const cuttingCard = legal.find(index => this.isCut(hand[index]) && cardPoints(hand[index]) === 0);
      chosen = cuttingCard ?? legal.find(index => this.isCut(hand[index])) ?? chosen;
    }
    return this.playCard(player, chosen ?? legal[0]);
  }

  statusText(): string {
    if (this.phase === 'finished') return this.resultText();
    if (this.phase === 'settling') return 'The cards stay on the table for a moment…';
    if (this.currentPlayer !== 1) return `${SEPTICA_PLAYER_NAMES[this.currentPlayer]} is thinking…`;
    if (this.phase === 'continue-choice') return 'You were cut. Continue with a 7 or the opening rank, or concede the trick.';
    if (this.table.length === 0) return this.lastTrickSummary || 'Your turn: lead a new trick.';
    return 'Play any card. A 7 or the opening rank cuts.';
  }

  private resultText(): string {
    if (this.teams) {
      const mint = this.sidePoints(1);
      const coral = this.sidePoints(2);
      if (this.winner === 0) return 'Draw — both teams captured four points.';
      return this.winner === 1 ? `Mint & Sky win ${mint}-${coral}!` : `Coral & Gold win ${coral}-${mint}!`;
    }
    if (this.playerCount === 3) {
      if (this.winner === 0) return 'Draw — the top score is shared.';
      return `${SEPTICA_PLAYER_NAMES[this.winner as SepticaPlayer]} wins with ${this.points[this.winner as SepticaPlayer]} points!`;
    }
    if (this.winner === 0) return 'Draw — each player captured four points.';
    return `${this.winner === 1 ? 'Mint' : 'Coral'} wins the game!`;
  }

  private collectTrick(): void {
    const trickPoints = this.table.reduce((total, entry) => total + cardPoints(entry.card), 0);
    const cardCount = this.table.length;
    this.points[this.lastCutter] += trickPoints;
    const nextLeader = this.lastCutter;
    this.lastTrickSummary = `${SEPTICA_PLAYER_NAMES[nextLeader]} takes ${cardCount} cards with the last cut${trickPoints ? ` · ${trickPoints} point${trickPoints === 1 ? '' : 's'}` : ' · no points'}.`;
    this.table = [];
    this.leadRank = null;
    this.refillHands(nextLeader);
    if (this.deck.length === 0 && this.players().every(player => this.hands[player].length === 0)) {
      this.phase = 'finished';
      this.winner = this.decideWinner();
      return;
    }
    this.leader = nextLeader;
    this.lastCutter = nextLeader;
    this.currentPlayer = nextLeader;
    this.phase = 'playing';
  }

  private decideWinner(): SepticaPlayer | 0 {
    if (this.teams) {
      const mint = this.sidePoints(1);
      const coral = this.sidePoints(2);
      return mint === coral ? 0 : mint > coral ? 1 : 2;
    }
    const best = Math.max(...this.players().map(player => this.points[player]));
    const leaders = this.players().filter(player => this.points[player] === best);
    return leaders.length > 1 ? 0 : leaders[0];
  }

  /** Deals one card at a time round the table from the trick winner, so the last cards are shared evenly. */
  private refillHands(firstPlayer: SepticaPlayer): void {
    const order: SepticaPlayer[] = [firstPlayer];
    while (order.length < this.playerCount) order.push(this.nextPlayer(order[order.length - 1]));
    while (this.deck.length > 0) {
      let dealtCard = false;
      for (const player of order) {
        if (this.deck.length === 0) break;
        if (this.hands[player].length < 4) {
          this.hands[player].push(this.deck.pop()!);
          dealtCard = true;
        }
      }
      if (!dealtCard) break;
    }
  }
}

export function createSepticaOnlineState(game: SepticaGame, localPlayer: SepticaPlayer): SepticaOnlineState {
  const opponent = otherPlayer(localPlayer);
  return {
    localPlayer,
    hand: game.hands[localPlayer],
    opponentHandCount: game.hands[opponent].length,
    deckCount: game.deck.length,
    table: game.table,
    points: game.points,
    currentPlayer: game.currentPlayer,
    leader: game.leader,
    lastCutter: game.lastCutter,
    leadRank: game.leadRank,
    phase: game.phase,
    winner: game.winner,
    lastTrickSummary: game.lastTrickSummary,
  };
}

export function applySepticaOnlineState(game: SepticaGame, state: SepticaOnlineState): void {
  const opponent = otherPlayer(state.localPlayer);
  const hiddenCard = (index: number): SepticaCard => ({ rank: '8', suit: 'clubs', id: `hidden-${index}` });
  // Online is always two players, whatever this device last played against bots.
  game.playerCount = 2;
  game.hands = {};
  game.hands[state.localPlayer] = state.hand;
  game.hands[opponent] = Array.from({ length: state.opponentHandCount }, (_, index) => hiddenCard(index));
  game.deck = Array.from({ length: state.deckCount }, (_, index) => hiddenCard(index));
  game.table = state.table;
  game.points = state.points;
  game.currentPlayer = state.currentPlayer;
  game.leader = state.leader;
  game.lastCutter = state.lastCutter;
  game.leadRank = state.leadRank;
  game.phase = state.phase;
  game.winner = state.winner;
  game.lastTrickSummary = state.lastTrickSummary || '';
}

export function shouldConfirmSepticaRestart(game: SepticaGame): boolean {
  const fullDeck = createSepticaDeck(game.playerCount).length - 4 * game.playerCount;
  return game.phase !== 'finished' && (
    game.table.length > 0
    || game.deck.length < fullDeck
    || game.players().some(player => game.points[player] > 0 || game.hands[player].length !== 4)
  );
}

const SUIT_SYMBOLS: Record<SepticaSuit, string> = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };

export function initSeptica(): void {
  if (typeof document === 'undefined') return;
  const view = document.getElementById('septicaView');
  const hand = document.getElementById('septicaHand');
  const botHand = document.getElementById('septicaBotHand');
  const table = document.getElementById('septicaTable');
  if (!view || !hand || !botHand || !table) return;
  const game = new SepticaGame();
  const status = document.getElementById('septicaStatus');
  const mintPoints = document.getElementById('septicaMintPoints');
  const coralPoints = document.getElementById('septicaCoralPoints');
  const mintLabel = document.getElementById('septicaMintLabel');
  const coralLabel = document.getElementById('septicaCoralLabel');
  const goal = document.getElementById('septicaGoal');
  const playersOption = document.getElementById('septicaPlayersOption');
  const playersSelect = document.getElementById('septicaPlayers') as HTMLSelectElement | null;
  const deckCount = document.getElementById('septicaDeckCount');
  const passButton = document.getElementById('septicaPassButton') as HTMLButtonElement | null;
  const revealButton = document.getElementById('septicaRevealButton') as HTMLButtonElement | null;
  const modeButtons = document.querySelectorAll<HTMLButtonElement>('[data-septica-mode]');
  const roomMount = document.querySelector<HTMLElement>('[data-game-room="septica"]');
  let botTimer = 0;
  let settleTimer = 0;
  let room: GameRoomClient | null = null;
  let offlineMode: SepticaOfflineMode = 'bot';
  let localHandVisible = false;
  // Three or four players are for games against bots; same-device and online stay two-player.
  let botPlayerCount: SepticaPlayerCount = 2;
  try {
    const saved = Number(localStorage.getItem('blast-arcade-septica-players-v1'));
    if (saved === 3 || saved === 4) botPlayerCount = saved;
  } catch { /* two players */ }
  if (playersSelect) playersSelect.value = String(botPlayerCount);
  const resultReporter = new ArcadeResultReporter('septica');
  const playingBots = (): boolean => !room?.session().online && offlineMode === 'bot';
  const offlineCount = (): SepticaPlayerCount => (offlineMode === 'bot' ? botPlayerCount : 2);
  if (botPlayerCount !== 2) game.restart(botPlayerCount);

  function localPlayer(): SepticaPlayer {
    if (!room?.session().online && offlineMode === 'local') return game.currentPlayer;
    return (room?.session().playerId as SepticaPlayer | null) ?? 1;
  }

  function onlineStatus(player: SepticaPlayer): string {
    if (game.phase === 'finished') return game.statusText();
    if (game.phase === 'settling') return 'The cards stay on the table for a moment…';
    if (game.currentPlayer !== player) return `${game.currentPlayer === 1 ? 'Mint' : 'Coral'} is choosing a card…`;
    if (game.phase === 'continue-choice') return 'You were cut. Continue with a 7 or the opening rank, or concede the trick.';
    if (game.table.length === 0) return 'Your turn: lead a new trick.';
    return 'Your turn: play any card. A 7 or the opening rank cuts.';
  }

  function broadcastState(): void {
    room?.broadcastState(createSepticaOnlineState(game, 2) as unknown as Record<string, unknown>, true);
  }

  function scheduleSettlement(): void {
    window.clearTimeout(settleTimer);
    if (game.phase !== 'settling' || room?.isGuest()) return;
    settleTimer = window.setTimeout(() => {
      if (isArcadeSessionPaused('septica')) { scheduleSettlement(); return; }
      if (!game.settleTrick()) return;
      if (!room?.session().online && offlineMode === 'local') localHandVisible = false;
      render();
      if (room?.session().online) broadcastState(); else scheduleBot();
    }, SEPTICA_TRICK_REVEAL_MS);
  }

  function afterAuthoritativeMove(): void {
    if (!room?.session().online && offlineMode === 'local') localHandVisible = game.phase === 'finished';
    render();
    if (room?.session().online) broadcastState();
    scheduleSettlement();
    if (!room?.session().online && offlineMode === 'bot' && game.phase !== 'settling') scheduleBot();
  }

  function playLocalCard(index: number): void {
    if (isArcadeSessionPaused('septica')) return;
    const player = localPlayer();
    const session = room?.session();
    if (!session?.online) {
      if (offlineMode === 'local') {
        if (!localHandVisible) return;
        if (game.playCard(player, index)) afterAuthoritativeMove();
      } else if (game.playCard(1, index)) afterAuthoritativeMove();
      return;
    }
    if (!session.ready || game.currentPlayer !== player) return;
    if (room?.isGuest()) room.sendAction({ type: 'play', index });
    else if (game.playCard(1, index)) afterAuthoritativeMove();
  }

  function cardButton(card: SepticaCard, index: number, playable: boolean): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `septica-card ${card.suit === 'diamonds' || card.suit === 'hearts' ? 'red' : ''}`;
    button.disabled = !playable;
    button.innerHTML = `<b>${card.rank}</b><span>${SUIT_SYMBOLS[card.suit]}</span>`;
    button.setAttribute('aria-label', `${card.rank} of ${card.suit}`);
    button.addEventListener('click', () => playLocalCard(index));
    return button;
  }

  function render(): void {
    const player = localPlayer();
    const opponent = otherPlayer(player);
    const localHotSeat = !room?.session().online && offlineMode === 'local';
    const legal = new Set(localHotSeat && !localHandVisible ? [] : game.legalCardIndexes(player));
    hand!.replaceChildren(...game.hands[player].map((card, index) => {
      if (!localHotSeat || localHandVisible) return cardButton(card, index, legal.has(index));
      const back = document.createElement('span'); back.className = 'septica-card card-back'; back.textContent = 'BA'; return back;
    }));
    botHand!.classList.toggle('septica-seats', game.playerCount > 2);
    if (game.playerCount > 2) {
      botHand!.replaceChildren(...game.players().filter(seat => seat !== player).map(seat => {
        const chip = document.createElement('div');
        const name = SEPTICA_PLAYER_NAMES[seat];
        chip.className = `septica-seat ${name.toLowerCase()}${seat === game.currentPlayer && game.phase !== 'finished' ? ' active' : ''}`;
        const title = document.createElement('strong');
        title.textContent = game.teams && game.teamOf(seat) === game.teamOf(player) ? `${name} · partner` : name;
        const detail = document.createElement('span');
        detail.textContent = `${game.hands[seat].length} cards · ${game.points[seat]} pts`;
        chip.append(title, detail);
        return chip;
      }));
    } else botHand!.replaceChildren(...game.hands[opponent].map(() => {
      const back = document.createElement('span'); back.className = 'septica-card card-back'; back.textContent = 'BA'; return back;
    }));
    const many = game.playerCount > 2;
    table!.classList.toggle('many-players', many);
    table!.replaceChildren(...game.table.map(entry => {
      const card = cardButton(entry.card, 0, false);
      card.classList.add(`played-${SEPTICA_PLAYER_NAMES[entry.player].toLowerCase()}`);
      if (many) card.setAttribute('aria-label', `${SEPTICA_PLAYER_NAMES[entry.player]}: ${entry.card.rank} of ${entry.card.suit}`);
      return card;
    }));
    if (status) status.textContent = game.phase === 'settling'
      ? game.statusText()
      : room?.session().online
        ? onlineStatus(player)
        : localHotSeat
          ? localHandVisible
            ? onlineStatus(player)
            : `Pass the device to ${player === 1 ? 'Mint' : 'Coral'}, then reveal the hand.`
          : game.statusText();
    // Two players: Mint vs Coral. Three: Mint vs the two rivals. Four: the two teams.
    if (mintLabel) mintLabel.textContent = game.teams ? 'Mint & Sky' : 'Mint';
    if (coralLabel) coralLabel.textContent = game.teams ? 'Coral & Gold' : game.playerCount === 3 ? 'Coral · Sky' : 'Coral';
    if (goal) goal.textContent = game.playerCount === 3 ? 'Most points wins' : 'Eight points in the deck';
    if (mintPoints) mintPoints.textContent = String(game.sidePoints(1));
    if (coralPoints) coralPoints.textContent = game.playerCount === 3 ? `${game.points[2]} · ${game.points[3]}` : String(game.sidePoints(2));
    if (playersOption) playersOption.hidden = !playingBots();
    if (deckCount) deckCount.textContent = String(game.deck.length);
    if (passButton) passButton.hidden = !(game.currentPlayer === player && game.phase === 'continue-choice' && (!localHotSeat || localHandVisible));
    if (revealButton) revealButton.hidden = !(localHotSeat && !localHandVisible && game.phase !== 'finished' && game.phase !== 'settling');
    modeButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.septicaMode === offlineMode);
      button.disabled = Boolean(room?.session().online);
    });
    const trackedPlayer = (room?.session().online ? room.session().playerId : 1) ?? 1;
    resultReporter.report(game.phase === 'finished', {
      outcome: game.winner === 0 ? 'draw' : game.isWinner(trackedPlayer as SepticaPlayer) ? 'win' : 'loss',
      score: game.sidePoints(trackedPlayer as SepticaPlayer),
    });
  }

  function scheduleBot(): void {
    window.clearTimeout(botTimer);
    if (room?.session().online || offlineMode === 'local') return;
    if (game.currentPlayer === 1 || game.phase === 'finished' || game.phase === 'settling') return;
    botTimer = window.setTimeout(() => {
      if (isArcadeSessionPaused('septica')) { scheduleBot(); return; }
      if (game.botMove()) afterAuthoritativeMove();
    }, 520);
  }

  function selectOfflineMode(mode: SepticaOfflineMode): void {
    if (mode !== offlineMode && shouldConfirmSepticaRestart(game)
      && !window.confirm(translateArcadeText('Change play mode? The current Șeptică deal will be lost.'))) return;
    window.clearTimeout(settleTimer);
    window.clearTimeout(botTimer);
    offlineMode = mode;
    localHandVisible = false;
    game.restart(offlineCount());
    render();
    scheduleBot();
  }

  playersSelect?.addEventListener('change', () => {
    const count = Number(playersSelect.value);
    if (count !== 2 && count !== 3 && count !== 4) return;
    if (!playingBots() || count === game.playerCount) return;
    if (shouldConfirmSepticaRestart(game)
      && !window.confirm(translateArcadeText('Change the number of players? The current Șeptică deal will be lost.'))) {
      playersSelect.value = String(game.playerCount);
      return;
    }
    botPlayerCount = count;
    try { localStorage.setItem('blast-arcade-septica-players-v1', String(count)); } catch { /* optional */ }
    window.clearTimeout(settleTimer);
    window.clearTimeout(botTimer);
    game.restart(count);
    render();
    scheduleBot();
  });

  passButton?.addEventListener('click', () => {
    const player = localPlayer();
    if (room?.isGuest()) room.sendAction({ type: 'pass' });
    else if (game.pass(player)) {
      if (!room?.session().online && offlineMode === 'local') localHandVisible = game.phase === 'finished';
      render();
      if (room?.session().online) broadcastState(); else scheduleBot();
    }
  });
  revealButton?.addEventListener('click', () => { localHandVisible = true; render(); });
  modeButtons.forEach(button => button.addEventListener('click', () => {
    if (room?.session().online) return;
    const mode = button.dataset.septicaMode;
    if (mode !== 'bot' && mode !== 'local') return;
    selectOfflineMode(mode);
  }));
  document.getElementById('septicaRestartButton')?.addEventListener('click', () => {
    if (shouldConfirmSepticaRestart(game)
      && !window.confirm(translateArcadeText('Start a new deal? The current Șeptică hand will be lost.'))) return;
    clearArcadePause();
    if (room?.isGuest()) room.sendAction({ type: 'restart' });
    else {
      window.clearTimeout(settleTimer);
      game.restart();
      localHandVisible = false;
      render();
      if (room?.session().online) broadcastState(); else scheduleBot();
    }
  });

  if (roomMount) {
    room = new GameRoomClient({
      game: 'septica',
      mount: roomMount,
      offlineModes: [
        { id: 'local', label: 'Local 2P', description: 'Pass the device between players.', onSelect: () => selectOfflineMode('local') },
        { id: 'bot', label: 'Vs bot', description: 'Play Mint against the Coral bot.', onSelect: () => selectOfflineMode('bot') },
      ],
      initialOfflineMode: 'bot',
      onSessionChange: session => {
        window.clearTimeout(botTimer);
        if (!session.online) {
          window.clearTimeout(settleTimer);
          offlineMode = 'bot';
          localHandVisible = false;
          game.restart(offlineCount());
          scheduleBot();
        } else if (session.ready && session.playerId === 1) {
          window.clearTimeout(settleTimer);
          localHandVisible = false;
          game.restart(2);
          broadcastState();
        }
        render();
      },
      onRemoteAction: (action, from) => {
        if (!room?.isHost() || from !== 2) return;
        let changed = false;
        if (action.type === 'play' && typeof action.index === 'number' && Number.isInteger(action.index) && game.currentPlayer === 2) {
          changed = game.playCard(2, action.index);
        } else if (action.type === 'pass' && game.currentPlayer === 2) changed = game.pass(2);
        else if (action.type === 'restart') { window.clearTimeout(settleTimer); game.restart(); changed = true; }
        if (changed) afterAuthoritativeMove();
      },
      onState: state => {
        if (!room?.isGuest()) return;
        applySepticaOnlineState(game, state as unknown as SepticaOnlineState);
        render();
      },
    });
  }
  registerArcadeSession({
    gameId: 'septica',
    view,
    mode: () => room?.session().online ? 'online' : offlineMode === 'bot' ? 'solo' : 'local',
    // A fresh deal is not under way yet, so phones still show the setup options (like Players).
    isActive: () => shouldConfirmSepticaRestart(game),
    clearHeldInputs: () => undefined,
    resumeCountdown: false,
  });
  render();
}

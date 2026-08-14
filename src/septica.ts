import { GameRoomClient } from './game-room.js';
import { ArcadeResultReporter } from './stats.js';

export type SepticaPlayer = 1 | 2;
export type SepticaRank = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
export type SepticaSuit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type SepticaPhase = 'playing' | 'continue-choice' | 'settling' | 'finished';
export type SepticaOfflineMode = 'bot' | 'local';
export const SEPTICA_TRICK_REVEAL_MS = 1_000;

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
  points: Record<SepticaPlayer, number>;
  currentPlayer: SepticaPlayer;
  leader: SepticaPlayer;
  lastCutter: SepticaPlayer;
  leadRank: SepticaRank | null;
  phase: SepticaPhase;
  winner: SepticaPlayer | 0 | null;
}

const RANKS: SepticaRank[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS: SepticaSuit[] = ['clubs', 'diamonds', 'hearts', 'spades'];

function otherPlayer(player: SepticaPlayer): SepticaPlayer { return player === 1 ? 2 : 1; }
function cardPoints(card: SepticaCard): number { return card.rank === '10' || card.rank === 'A' ? 1 : 0; }

export function createSepticaDeck(): SepticaCard[] {
  return SUITS.flatMap(suit => RANKS.map(rank => ({ rank, suit, id: `${rank}-${suit}` })));
}

export class SepticaGame {
  deck: SepticaCard[] = [];
  hands: Record<SepticaPlayer, SepticaCard[]> = { 1: [], 2: [] };
  table: Array<{ player: SepticaPlayer; card: SepticaCard }> = [];
  points: Record<SepticaPlayer, number> = { 1: 0, 2: 0 };
  currentPlayer: SepticaPlayer = 1;
  leader: SepticaPlayer = 1;
  lastCutter: SepticaPlayer = 1;
  leadRank: SepticaRank | null = null;
  phase: SepticaPhase = 'playing';
  winner: SepticaPlayer | 0 | null = null;
  private random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.restart();
  }

  restart(): void {
    this.deck = createSepticaDeck();
    for (let index = this.deck.length - 1; index > 0; index -= 1) {
      const target = Math.floor(this.random() * (index + 1));
      [this.deck[index], this.deck[target]] = [this.deck[target], this.deck[index]];
    }
    this.hands = { 1: [], 2: [] };
    this.table = [];
    this.points = { 1: 0, 2: 0 };
    this.currentPlayer = 1;
    this.leader = 1;
    this.lastCutter = 1;
    this.leadRank = null;
    this.phase = 'playing';
    this.winner = null;
    this.refillHands(1);
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

  playCard(player: SepticaPlayer, cardIndex: number): boolean {
    if (!this.legalCardIndexes(player).includes(cardIndex)) return false;
    const [card] = this.hands[player].splice(cardIndex, 1);
    const openingPlay = this.table.length === 0;
    if (openingPlay) {
      this.leader = player;
      this.lastCutter = player;
      this.leadRank = card.rank;
      this.table.push({ player, card });
      this.currentPlayer = otherPlayer(player);
      this.phase = 'playing';
      return true;
    }

    const cut = this.isCut(card);
    this.table.push({ player, card });
    if (cut) {
      this.lastCutter = player;
      this.currentPlayer = otherPlayer(player);
      this.phase = this.currentPlayer === this.leader ? 'continue-choice' : 'playing';
    } else this.phase = 'settling';
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

  botMove(): boolean {
    if (this.currentPlayer !== 2 || this.phase === 'finished' || this.phase === 'settling') return false;
    const legal = this.legalCardIndexes(2);
    if (this.phase === 'continue-choice' && legal.length === 0) return this.pass(2);
    if (legal.length === 0) return false;
    let chosen = legal.find(index => cardPoints(this.hands[2][index]) === 0 && this.hands[2][index].rank !== '7');
    if (this.phase === 'playing' && this.table.length > 0) {
      const cuttingCard = legal.find(index => this.isCut(this.hands[2][index]) && cardPoints(this.hands[2][index]) === 0);
      chosen = cuttingCard ?? legal.find(index => this.isCut(this.hands[2][index])) ?? chosen;
    }
    return this.playCard(2, chosen ?? legal[0]);
  }

  statusText(): string {
    if (this.phase === 'finished') {
      if (this.winner === 0) return 'Egalitate — fiecare a capturat patru puncte.';
      return `${this.winner === 1 ? 'Mint' : 'Coral'} câștigă partida!`;
    }
    if (this.phase === 'settling') return 'Cărțile rămân o clipă pe masă…';
    if (this.currentPlayer === 2) return 'Coral se gândește…';
    if (this.phase === 'continue-choice') return 'Ai fost tăiat. Continuă cu un 7 sau aceeași figură, ori cedează masa.';
    if (this.table.length === 0) return 'Rândul tău: deschide o mână nouă.';
    return 'Joacă orice carte. Un 7 sau aceeași figură taie.';
  }

  private collectTrick(): void {
    this.points[this.lastCutter] += this.table.reduce((total, entry) => total + cardPoints(entry.card), 0);
    const nextLeader = this.lastCutter;
    this.table = [];
    this.leadRank = null;
    this.refillHands(nextLeader);
    if (this.deck.length === 0 && this.hands[1].length === 0 && this.hands[2].length === 0) {
      this.phase = 'finished';
      this.winner = this.points[1] === this.points[2] ? 0 : this.points[1] > this.points[2] ? 1 : 2;
      return;
    }
    this.leader = nextLeader;
    this.lastCutter = nextLeader;
    this.currentPlayer = nextLeader;
    this.phase = 'playing';
  }

  private refillHands(firstPlayer: SepticaPlayer): void {
    const order: SepticaPlayer[] = [firstPlayer, otherPlayer(firstPlayer)];
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
  };
}

export function applySepticaOnlineState(game: SepticaGame, state: SepticaOnlineState): void {
  const opponent = otherPlayer(state.localPlayer);
  const hiddenCard = (index: number): SepticaCard => ({ rank: '8', suit: 'clubs', id: `hidden-${index}` });
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
  const resultReporter = new ArcadeResultReporter('septica');

  function localPlayer(): SepticaPlayer {
    if (!room?.session().online && offlineMode === 'local') return game.currentPlayer;
    return (room?.session().playerId as SepticaPlayer | null) ?? 1;
  }

  function onlineStatus(player: SepticaPlayer): string {
    if (game.phase === 'finished') return game.statusText();
    if (game.phase === 'settling') return 'Cărțile rămân o clipă pe masă…';
    if (game.currentPlayer !== player) return `${game.currentPlayer === 1 ? 'Mint' : 'Coral'} își alege cartea…`;
    if (game.phase === 'continue-choice') return 'Ai fost tăiat. Continuă cu un 7 sau aceeași figură, ori cedează masa.';
    if (game.table.length === 0) return 'Rândul tău: deschide o mână nouă.';
    return 'Rândul tău: joacă orice carte. Un 7 sau aceeași figură taie.';
  }

  function broadcastState(): void {
    room?.broadcastState(createSepticaOnlineState(game, 2) as unknown as Record<string, unknown>, true);
  }

  function scheduleSettlement(): void {
    window.clearTimeout(settleTimer);
    if (game.phase !== 'settling' || room?.isGuest()) return;
    settleTimer = window.setTimeout(() => {
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
    botHand!.replaceChildren(...game.hands[opponent].map(() => {
      const back = document.createElement('span'); back.className = 'septica-card card-back'; back.textContent = 'BA'; return back;
    }));
    table!.replaceChildren(...game.table.map(entry => {
      const card = cardButton(entry.card, 0, false);
      card.classList.add(entry.player === 1 ? 'played-mint' : 'played-coral');
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
    if (mintPoints) mintPoints.textContent = String(game.points[1]);
    if (coralPoints) coralPoints.textContent = String(game.points[2]);
    if (deckCount) deckCount.textContent = String(game.deck.length);
    if (passButton) passButton.hidden = !(game.currentPlayer === player && game.phase === 'continue-choice' && (!localHotSeat || localHandVisible));
    if (revealButton) revealButton.hidden = !(localHotSeat && !localHandVisible && game.phase !== 'finished' && game.phase !== 'settling');
    modeButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.septicaMode === offlineMode);
      button.disabled = Boolean(room?.session().online);
    });
    const trackedPlayer = (room?.session().online ? room.session().playerId : 1) ?? 1;
    resultReporter.report(game.phase === 'finished', {
      outcome: game.winner === 0 ? 'draw' : game.winner === trackedPlayer ? 'win' : 'loss',
      score: game.points[trackedPlayer],
    });
  }

  function scheduleBot(): void {
    window.clearTimeout(botTimer);
    if (room?.session().online || offlineMode === 'local') return;
    if (game.currentPlayer !== 2 || game.phase === 'finished' || game.phase === 'settling') return;
    botTimer = window.setTimeout(() => {
      if (game.botMove()) afterAuthoritativeMove();
    }, 520);
  }

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
    offlineMode = mode;
    localHandVisible = false;
    window.clearTimeout(settleTimer);
    game.restart();
    render();
    scheduleBot();
  }));
  document.getElementById('septicaRestartButton')?.addEventListener('click', () => {
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
      onPlayLocal: () => {
        window.clearTimeout(settleTimer);
        offlineMode = 'local';
        localHandVisible = false;
        game.restart();
        render();
      },
      onSessionChange: session => {
        window.clearTimeout(botTimer);
        if (!session.online) {
          window.clearTimeout(settleTimer);
          offlineMode = 'bot';
          localHandVisible = false;
          game.restart();
          scheduleBot();
        } else if (session.ready && session.playerId === 1) {
          window.clearTimeout(settleTimer);
          localHandVisible = false;
          game.restart();
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
  render();
}

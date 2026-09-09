import type { OnlineGameId, RelayPlayerId } from './relay.js';
import {
  arcadeInviteShareData,
  clearArcadeInviteUrl,
  parseArcadeInvite,
  shareOrCopyInvite,
} from './invite.js';

export interface GameRoomSession {
  online: boolean;
  ready: boolean;
  roomCode: string;
  playerId: RelayPlayerId | null;
}

export type GameRoomOfflineModeId = 'local' | 'solo' | 'bot';

export interface GameRoomOfflineMode {
  id: GameRoomOfflineModeId;
  label: string;
  description?: string;
  onSelect: () => void;
}

interface GameRoomClientOptions {
  game: OnlineGameId;
  mount: HTMLElement;
  onPlayLocal?: () => void;
  offlineModes?: readonly GameRoomOfflineMode[];
  initialOfflineMode?: GameRoomOfflineModeId;
  onSessionChange: (session: GameRoomSession) => void;
  onRemoteAction: (action: Record<string, unknown>, from: RelayPlayerId) => void;
  onState: (state: Record<string, unknown>) => void;
}

export class GameRoomClient {
  private game: OnlineGameId;
  private mount: HTMLElement;
  private options: GameRoomClientOptions;
  private socket: WebSocket | null = null;
  private roomCode = '';
  private playerId: RelayPlayerId | null = null;
  private ready = false;
  private quickMatching = false;
  private lastStateSentAt = 0;
  private offlineModes: readonly GameRoomOfflineMode[];
  private initialOfflineMode: GameRoomOfflineModeId;
  private statusElement: HTMLElement;
  private input: HTMLInputElement;
  private onlinePanel: HTMLElement;
  private onlineActions: HTMLElement;
  private joinedActions: HTMLElement;
  private codeElement: HTMLElement;

  constructor(options: GameRoomClientOptions) {
    this.options = options;
    this.game = options.game;
    this.mount = options.mount;
    this.offlineModes = options.offlineModes?.length
      ? options.offlineModes
      : [{ id: 'local', label: 'Local 2P', description: 'Two players on this device.', onSelect: options.onPlayLocal ?? (() => {}) }];
    this.initialOfflineMode = options.initialOfflineMode ?? this.offlineModes[0].id;
    if (!this.offlineModes.some(mode => mode.id === this.initialOfflineMode)) this.initialOfflineMode = this.offlineModes[0].id;
    this.mount.classList.add('game-room-panel', 'arcade-mode-panel');
    this.mount.closest('main')?.classList.add('room-mode-managed');
    const modeButtons = this.offlineModes.map(mode => `
          <button class="game-room-mode-tab" type="button" role="tab" aria-selected="false" data-room-mode="${mode.id}"${mode.description ? ` title="${mode.description}"` : ''}>${mode.label}</button>`).join('');
    this.mount.innerHTML = `
      <div class="game-room-heading">
        <div class="game-room-copy">
          <strong>Choose a mode</strong>
          <span data-room-status>Pick how you want to play.</span>
        </div>
        <div class="game-room-mode-tabs" role="tablist" aria-label="Play mode">
          ${modeButtons}
          <button class="game-room-mode-tab online" type="button" role="tab" aria-selected="false" data-room-mode="online">Online</button>
        </div>
      </div>
      <div class="game-room-online" data-room-online hidden>
        <div class="game-room-actions" data-room-local>
          <button class="game-room-matchmake" type="button" data-room-matchmake>Quick Match</button>
          <button type="button" data-room-create>Create code</button>
          <label class="game-room-join"><span class="sr-only">Room code</span><input type="text" inputmode="text" maxlength="5" placeholder="CODE" autocomplete="off" data-room-input><button type="button" data-room-join>Join</button></label>
        </div>
        <div class="game-room-actions" data-room-joined hidden>
          <span class="game-room-code">Code <b data-room-code>-----</b></span>
          <button type="button" data-room-copy>Copy link</button>
          <button type="button" data-room-share>Share</button>
          <button type="button" data-room-leave>Leave</button>
        </div>
      </div>`;
    this.statusElement = this.mount.querySelector<HTMLElement>('[data-room-status]')!;
    this.input = this.mount.querySelector<HTMLInputElement>('[data-room-input]')!;
    this.onlinePanel = this.mount.querySelector<HTMLElement>('[data-room-online]')!;
    this.onlineActions = this.mount.querySelector<HTMLElement>('[data-room-local]')!;
    this.joinedActions = this.mount.querySelector<HTMLElement>('[data-room-joined]')!;
    this.codeElement = this.mount.querySelector<HTMLElement>('[data-room-code]')!;
    this.bindUi();
    this.selectMode(this.initialOfflineMode, false);
    this.mount.closest('main')?.querySelector('[data-back-to-hub]')?.addEventListener('click', () => {
      this.leave();
    });
    const invite = parseArcadeInvite(location.search);
    if (invite?.game === this.game) {
      this.input.value = invite.roomCode;
      this.selectMode('online', false);
      this.joinFromInput();
    }
  }

  session(): GameRoomSession {
    return { online: Boolean(this.playerId), ready: this.ready, roomCode: this.roomCode, playerId: this.playerId };
  }

  isHost(): boolean { return this.playerId === 1; }
  isGuest(): boolean { return this.playerId === 2; }

  canControl(player: RelayPlayerId): boolean {
    return !this.playerId || (this.ready && this.playerId === player);
  }

  sendAction(action: Record<string, unknown>): boolean {
    if (!this.ready || !this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type: 'gameAction', action }));
    return true;
  }

  broadcastState(state: Record<string, unknown>, force: boolean = false): boolean {
    const now = performance.now();
    if (!this.isHost() || !this.ready || !this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    if (!force && now - this.lastStateSentAt < 33) return false;
    this.lastStateSentAt = now;
    this.socket.send(JSON.stringify({ type: 'gameState', state }));
    return true;
  }

  leave(): void {
    this.disconnect();
    this.selectMode(this.initialOfflineMode, false);
    history.replaceState(null, '', clearArcadeInviteUrl(location.href));
    this.options.onSessionChange(this.session());
  }

  private bindUi(): void {
    this.mount.querySelectorAll<HTMLButtonElement>('[data-room-mode]').forEach(button => {
      button.addEventListener('click', () => {
        const mode = button.dataset.roomMode;
        if (mode === 'online') {
          this.selectMode('online', false);
          return;
        }
        const offlineMode = this.offlineModes.find(candidate => candidate.id === mode);
        if (!offlineMode) return;
        this.disconnect();
        history.replaceState(null, '', clearArcadeInviteUrl(location.href));
        this.selectMode(offlineMode.id, false);
        offlineMode.onSelect();
      });
    });
    this.mount.querySelector('[data-room-matchmake]')?.addEventListener('click', () => this.connect({ type: 'quickMatchGameRoom', game: this.game }));
    this.mount.querySelector('[data-room-create]')?.addEventListener('click', () => this.connect({ type: 'createGameRoom', game: this.game }));
    this.mount.querySelector('[data-room-join]')?.addEventListener('click', () => this.joinFromInput());
    this.input.addEventListener('input', () => { this.input.value = this.input.value.toUpperCase().replace(/[^A-Z2-9]/g, ''); });
    this.input.addEventListener('keydown', event => { if (event.key === 'Enter') this.joinFromInput(); });
    this.mount.querySelector('[data-room-copy]')?.addEventListener('click', event => {
      void this.deliverInvite(event.currentTarget as HTMLButtonElement, false);
    });
    this.mount.querySelector('[data-room-share]')?.addEventListener('click', event => {
      void this.deliverInvite(event.currentTarget as HTMLButtonElement, true);
    });
    this.mount.querySelector('[data-room-leave]')?.addEventListener('click', () => this.leave());
  }

  private async copyText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const copyField = document.createElement('textarea');
    copyField.value = text;
    copyField.setAttribute('readonly', '');
    copyField.style.position = 'fixed';
    copyField.style.opacity = '0';
    document.body.append(copyField);
    copyField.select();
    const copied = document.execCommand('copy');
    copyField.remove();
    if (!copied) throw new Error('Copy unavailable');
  }

  private async deliverInvite(button: HTMLButtonElement, preferShare: boolean): Promise<void> {
    if (!this.roomCode) return;
    const data = arcadeInviteShareData(location.href, this.game, this.roomCode);
    const result = await shareOrCopyInvite(data, {
      share: preferShare && navigator.share ? value => navigator.share(value) : undefined,
      copy: value => this.copyText(value),
    });
    if (result === 'cancelled') return;
    const previous = button.textContent;
    button.textContent = result === 'shared' ? 'Shared!' : result === 'copied' ? 'Link copied!' : 'Try again';
    window.setTimeout(() => { button.textContent = previous; }, 1_400);
  }

  private joinFromInput(): void {
    const roomCode = this.input.value.trim().toUpperCase();
    if (!/^[A-Z2-9]{5}$/.test(roomCode)) {
      this.statusElement.textContent = 'Enter the five-character invite code.';
      return;
    }
    this.connect({ type: 'joinGameRoom', game: this.game, roomCode });
  }

  private connect(firstMessage: Record<string, unknown>): void {
    if (this.socket) return;
    this.selectMode('online', false);
    this.quickMatching = firstMessage.type === 'quickMatchGameRoom';
    this.statusElement.textContent = this.quickMatching ? 'Looking for a Quick Match opponent…' : 'Connecting to the arcade server…';
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}`);
    this.socket = socket;
    socket.addEventListener('open', () => socket.send(JSON.stringify(firstMessage)));
    socket.addEventListener('message', event => this.handleMessage(event.data));
    socket.addEventListener('error', () => { this.statusElement.textContent = 'Could not reach the online server.'; });
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      const wasOnline = Boolean(this.playerId);
      this.roomCode = '';
      this.playerId = null;
      this.ready = false;
      this.quickMatching = false;
      this.onlineActions.hidden = false;
      this.joinedActions.hidden = true;
      this.statusElement.textContent = wasOnline ? 'The online room closed. Choose a room option to reconnect.' : 'Connection closed. Try again.';
      this.options.onSessionChange(this.session());
    });
  }

  private handleMessage(raw: unknown): void {
    let data: Record<string, unknown>;
    try { data = JSON.parse(String(raw)) as Record<string, unknown>; }
    catch { return; }
    if (data.type === 'gameRoomError' && typeof data.message === 'string') {
      this.statusElement.textContent = data.message;
      this.socket?.close();
      return;
    }
    if (data.type === 'gameRoomJoined' && data.game === this.game && typeof data.roomCode === 'string' && (data.playerId === 1 || data.playerId === 2)) {
      this.roomCode = data.roomCode;
      this.playerId = data.playerId;
      this.ready = false;
      this.quickMatching = data.quickMatch === true;
      this.codeElement.textContent = this.roomCode;
      history.replaceState(null, '', arcadeInviteShareData(location.href, this.game, this.roomCode).url);
      this.onlineActions.hidden = true;
      this.joinedActions.hidden = false;
      this.statusElement.textContent = this.quickMatching
        ? this.playerId === 1 ? 'Searching for a Quick Match opponent…' : 'Opponent found. Preparing the match…'
        : this.playerId === 1 ? 'Invite Coral with this code.' : 'Joined as Coral. Waiting for Mint…';
      this.options.onSessionChange(this.session());
      return;
    }
    if (data.type === 'gameRoomStatus' && data.game === this.game && Array.isArray(data.connectedPlayers)) {
      const wasReady = this.ready;
      this.ready = data.connectedPlayers.includes(1) && data.connectedPlayers.includes(2);
      if (this.ready) {
        this.quickMatching = false;
        this.statusElement.textContent = `Online match ready · You are ${this.playerId === 1 ? 'Mint' : 'Coral'}`;
      } else {
        this.statusElement.textContent = this.quickMatching
          ? 'Searching for a Quick Match opponent…'
          : this.playerId === 1 ? 'Invite Coral with this code.' : 'Waiting for Mint to reconnect…';
      }
      this.options.onSessionChange(this.session());
      if (!wasReady && this.ready && this.isHost()) this.lastStateSentAt = 0;
      return;
    }
    if (data.type === 'gameAction' && data.game === this.game && (data.from === 1 || data.from === 2) && data.action && typeof data.action === 'object') {
      this.options.onRemoteAction(data.action as Record<string, unknown>, data.from);
      return;
    }
    if (data.type === 'gameState' && data.game === this.game && data.state && typeof data.state === 'object') {
      this.options.onState(data.state as Record<string, unknown>);
    }
  }

  private disconnect(): void {
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.roomCode = '';
    this.playerId = null;
    this.ready = false;
    this.quickMatching = false;
    this.onlineActions.hidden = false;
    this.joinedActions.hidden = true;
  }

  private selectMode(mode: GameRoomOfflineModeId | 'online', announce: boolean): void {
    this.mount.dataset.roomSelectedMode = mode;
    this.mount.querySelectorAll<HTMLButtonElement>('[data-room-mode]').forEach(button => {
      const selected = button.dataset.roomMode === mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
    });
    this.onlinePanel.hidden = mode !== 'online';
    if (!announce) {
      const selected = this.offlineModes.find(candidate => candidate.id === mode);
      this.statusElement.textContent = mode === 'online'
        ? 'Quick match, create an invite, or join with a code.'
        : selected?.description ?? 'Ready to play on this device.';
    }
  }
}

import type { ArcadeGameId } from './stats.js';

export type ArcadeSessionMode = 'solo' | 'local' | 'online';
export type ArcadeInterruptionReason = 'settings' | 'focus' | 'visibility' | 'manual';

export interface ArcadeSessionRegistration {
  gameId: ArcadeGameId;
  view: HTMLElement;
  mode(): ArcadeSessionMode;
  isActive(): boolean;
  clearHeldInputs(): void;
  resumeCountdown?: boolean;
}

const registrations = new Map<ArcadeGameId, ArcadeSessionRegistration>();
const blockingReasons = new Set<Exclude<ArcadeInterruptionReason, 'manual'>>();
let pausedGame: ArcadeGameId | null = null;
let resumeTimer = 0;
let resumeToken = 0;

function registrationForActiveView(): ArcadeSessionRegistration | undefined {
  const activeView = document.body.dataset.view;
  return [...registrations.values()].find(registration => (
    registration.gameId === activeView && !registration.view.classList.contains('view-hidden')
  ));
}

function overlayElements(): {
  overlay: HTMLElement | null;
  title: HTMLElement | null;
  message: HTMLElement | null;
  resume: HTMLButtonElement | null;
} {
  return {
    overlay: document.getElementById('arcadeSessionOverlay'),
    title: document.getElementById('arcadeSessionTitle'),
    message: document.getElementById('arcadeSessionMessage'),
    resume: document.getElementById('arcadeSessionResume') as HTMLButtonElement | null,
  };
}

function reasonMessage(): string {
  if (blockingReasons.has('settings')) return 'Finish changing settings, then resume when you are ready.';
  if (blockingReasons.has('visibility')) return 'The page was hidden. Return to the game, then resume safely.';
  if (blockingReasons.has('focus')) return 'The game lost focus. Resume when your controls are ready.';
  return 'Gameplay is paused. Your held controls were released.';
}

function renderPauseOverlay(): void {
  const { overlay, title, message, resume } = overlayElements();
  if (!overlay) return;
  const registration = pausedGame ? registrations.get(pausedGame) : undefined;
  overlay.hidden = !registration;
  document.body.classList.toggle('arcade-session-paused', Boolean(registration));
  if (!registration) return;
  if (title) title.textContent = 'Game paused';
  if (message) message.textContent = reasonMessage();
  if (resume) {
    resume.disabled = blockingReasons.size > 0;
    resume.textContent = blockingReasons.size > 0 ? 'Resume unavailable' : 'Resume game';
  }
}

function cancelCountdown(): void {
  resumeToken += 1;
  if (resumeTimer) window.clearTimeout(resumeTimer);
  resumeTimer = 0;
}

function interrupt(reason: ArcadeInterruptionReason): void {
  const registration = registrationForActiveView();
  if (!registration || !registration.isActive()) return;
  registration.clearHeldInputs();
  window.dispatchEvent(new CustomEvent('arcade-clear-inputs', { detail: { gameId: registration.gameId, reason } }));
  if (registration.mode() === 'online') {
    const note = document.getElementById('settingsSessionNote');
    if (note) {
      note.hidden = false;
      note.textContent = 'Online play continues while Settings is open. Your held controls were released.';
    }
    return;
  }
  cancelCountdown();
  pausedGame = registration.gameId;
  renderPauseOverlay();
}

function setBlockingReason(reason: Exclude<ArcadeInterruptionReason, 'manual'>, active: boolean): void {
  if (active) {
    blockingReasons.add(reason);
    interrupt(reason);
  } else {
    blockingReasons.delete(reason);
  }
  renderPauseOverlay();
}

function finishResume(gameId: ArcadeGameId): void {
  if (pausedGame !== gameId || blockingReasons.size) return;
  pausedGame = null;
  renderPauseOverlay();
  window.dispatchEvent(new CustomEvent('arcade-session-resumed', { detail: { gameId } }));
}

function resumeActiveGame(): void {
  if (!pausedGame || blockingReasons.size) return;
  const registration = registrations.get(pausedGame);
  if (!registration) return;
  cancelCountdown();
  if (registration.resumeCountdown === false) {
    finishResume(registration.gameId);
    return;
  }
  const token = resumeToken;
  const { title, message, resume } = overlayElements();
  if (resume) resume.disabled = true;
  let count = 3;
  const tick = (): void => {
    if (token !== resumeToken || blockingReasons.size || pausedGame !== registration.gameId) return;
    if (title) title.textContent = count > 0 ? `Resuming in ${count}` : 'Go!';
    if (message) message.textContent = count > 0 ? 'Get your hands back on the controls.' : 'Gameplay resumed.';
    if (count <= 0) {
      resumeTimer = window.setTimeout(() => finishResume(registration.gameId), 240);
      return;
    }
    count -= 1;
    resumeTimer = window.setTimeout(tick, 700);
  };
  tick();
}

export function registerArcadeSession(registration: ArcadeSessionRegistration): () => void {
  registrations.set(registration.gameId, registration);
  return () => {
    registrations.delete(registration.gameId);
    if (pausedGame === registration.gameId) {
      pausedGame = null;
      renderPauseOverlay();
    }
  };
}

export function isArcadeSessionPaused(gameId: ArcadeGameId): boolean {
  return pausedGame === gameId;
}

export function initArcadeSessionControl(): void {
  if (typeof document === 'undefined' || document.getElementById('arcadeSessionOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'arcadeSessionOverlay';
  overlay.className = 'arcade-session-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="arcade-session-card" role="dialog" aria-modal="true" aria-labelledby="arcadeSessionTitle">
      <span class="arcade-session-kicker">Session protected</span>
      <h2 id="arcadeSessionTitle">Game paused</h2>
      <p id="arcadeSessionMessage">Gameplay is paused. Your held controls were released.</p>
      <button id="arcadeSessionResume" type="button">Resume game</button>
    </section>`;
  document.body.append(overlay);
  document.getElementById('arcadeSessionResume')?.addEventListener('click', resumeActiveGame);

  document.querySelectorAll<HTMLElement>('.paddle-app > .topbar .game-nav-actions, .tintar-app > .topbar .game-nav-actions, #gameView > .topbar .game-nav-actions')
    .forEach(actions => {
      if (actions.querySelector('[data-pause-game]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pause-game-button';
      button.dataset.pauseGame = '';
      button.textContent = 'Ⅱ Pause';
      button.addEventListener('click', () => {
        const registration = registrationForActiveView();
        if (!registration || !registration.isActive()) return;
        if (registration.mode() === 'online') {
          registration.clearHeldInputs();
          window.dispatchEvent(new CustomEvent('arcade-clear-inputs', {
            detail: { gameId: registration.gameId, reason: 'manual' },
          }));
          const previous = button.textContent;
          button.textContent = 'Online stays live';
          window.setTimeout(() => { button.textContent = previous; }, 1_600);
          return;
        }
        interrupt('manual');
      });
      actions.insertBefore(button, actions.querySelector('[data-open-settings]'));
    });

  window.addEventListener('arcade-settings-change', event => {
    const open = Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open);
    const note = document.getElementById('settingsSessionNote');
    if (open) {
      const registration = registrationForActiveView();
      if (note) {
        note.hidden = !registration?.isActive();
        note.textContent = registration?.mode() === 'online'
          ? 'Online play continues while Settings is open. Your held controls were released.'
          : 'This game is paused while Settings is open.';
      }
    } else if (note) note.hidden = true;
    setBlockingReason('settings', open);
  });
  window.addEventListener('blur', () => setBlockingReason('focus', true));
  window.addEventListener('focus', () => setBlockingReason('focus', false));
  document.addEventListener('visibilitychange', () => setBlockingReason('visibility', document.hidden));
  window.addEventListener('arcade-view-changed', () => {
    registrations.forEach(registration => registration.clearHeldInputs());
    window.dispatchEvent(new CustomEvent('arcade-clear-inputs', { detail: { reason: 'view-change' } }));
    cancelCountdown();
    pausedGame = null;
    renderPauseOverlay();
  });
}

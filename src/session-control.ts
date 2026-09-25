import type { ArcadeGameId } from './stats.js';
import { FULLSCREEN_TRANSITION_EVENT } from './mobile-fullscreen.js';
import { closeArcadeDialog, isDialogOpen, openArcadeDialog, registerArcadeDialog } from './dialogs.js';
import { SessionState, type Interruption } from './session-state.js';
import { translateArcadeText } from './i18n.js';

export type ArcadeSessionMode = 'solo' | 'local' | 'online';
export type ArcadeInterruptionReason = Interruption;

export interface ArcadeSessionRegistration {
  gameId: ArcadeGameId;
  view: HTMLElement;
  mode(): ArcadeSessionMode;
  isActive(): boolean;
  clearHeldInputs(): void;
  resumeCountdown?: boolean;
}

const registrations = new Map<ArcadeGameId, ArcadeSessionRegistration>();
const sessionState = new SessionState();
const blockingReasons = sessionState.blockers;
let pauseDismissed = false;
const suspendedGames = new Set<string>();
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
  if (blockingReasons.has('help')) return 'Read the guide, then resume when you are ready.';
  if (blockingReasons.has('settings')) return 'Finish changing settings, then resume when you are ready.';
  if (blockingReasons.has('visibility')) return 'The page was hidden. Return to the game, then resume safely.';
  if (blockingReasons.has('focus')) return 'The game lost focus. Resume when your controls are ready.';
  return 'Take your time. Resume when you are ready.';
}

function renderPauseOverlay(): void {
  const { overlay, title, message, resume } = overlayElements();
  if (!overlay) return;
  const registration = sessionState.pausedGame ? registrations.get(sessionState.pausedGame as ArcadeGameId) : undefined;
  if (!registration || pauseDismissed) closeArcadeDialog('pause');
  document.body.classList.toggle('arcade-session-paused', Boolean(registration));
  if (!registration) return;
  const setup = document.getElementById('arcadeSessionSetup');
  if (setup) setup.hidden = !registration.view.querySelector('.arcade-mode-panel,.star-mode-panel,.tintar-bot-panel');
  if (title) title.textContent = translateArcadeText('Game paused');
  if (message) message.textContent = translateArcadeText(reasonMessage());
  if (resume) {
    resume.disabled = blockingReasons.size > 0;
    resume.textContent = translateArcadeText(blockingReasons.size > 0 ? 'Resume unavailable' : 'Resume game');
  }
  if (!pauseDismissed) openArcadeDialog('pause');
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
  sessionState.interrupt(registration.gameId, registration.mode(), true);
  pauseDismissed = false;
  renderPauseOverlay();
}

function setBlockingReason(reason: Exclude<ArcadeInterruptionReason, 'manual'>, active: boolean): void {
  if (active) {
    sessionState.block(reason, true);
    interrupt(reason);
  } else {
    sessionState.block(reason, false);
  }
  renderPauseOverlay();
}

function finishResume(gameId: ArcadeGameId): void {
  if (!sessionState.resume(gameId)) return;
  registrations.get(gameId)?.view.classList.remove('game-setup-open');
  renderPauseOverlay();
  window.dispatchEvent(new CustomEvent('arcade-session-resumed', { detail: { gameId } }));
}

function resumeActiveGame(): void {
  if (!sessionState.pausedGame || blockingReasons.size) return;
  const registration = registrations.get(sessionState.pausedGame as ArcadeGameId);
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
    if (token !== resumeToken || blockingReasons.size || sessionState.pausedGame !== registration.gameId) return;
    if (title) title.textContent = translateArcadeText(count > 0 ? `Resuming in ${count}` : 'Go!');
    if (message) message.textContent = translateArcadeText(count > 0 ? 'Get your hands back on the controls.' : 'Gameplay resumed.');
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
    if (sessionState.pausedGame === registration.gameId) {
      sessionState.reset();
      renderPauseOverlay();
    }
  };
}

export function isArcadeSessionPaused(gameId: ArcadeGameId): boolean {
  return registrations.get(gameId)?.mode() !== 'online' && sessionState.pausedGame === gameId;
}

export function arcadeSessionMode(gameId: ArcadeGameId): ArcadeSessionMode {
  return registrations.get(gameId)?.mode() ?? 'solo';
}

export function clearArcadePause(): void {
  cancelCountdown();
  sessionState.reset();
  pauseDismissed = false;
  renderPauseOverlay();
}

export function initArcadeSessionControl(): void {
  if (typeof document === 'undefined' || document.getElementById('arcadeSessionOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'arcadeSessionOverlay';
  overlay.className = 'arcade-session-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="arcade-session-card" role="dialog" aria-modal="true" aria-labelledby="arcadeSessionTitle">
      <span class="arcade-session-kicker">Take a break</span>
      <h2 id="arcadeSessionTitle">Game paused</h2>
      <p id="arcadeSessionMessage">Take your time. Resume when you are ready.</p>
      <button id="arcadeSessionResume" type="button">Resume game</button>
      <div class="pause-secondary-actions"><button id="arcadeSessionSetup" type="button">Game setup</button><button id="arcadeSessionHelp" type="button">How to play</button><button id="arcadeSessionSettings" type="button">Settings</button><button id="arcadeSessionRestart" type="button">Restart game</button><button id="arcadeSessionClose" type="button">Close — stay paused</button></div>
    </section>`;
  document.body.append(overlay);
  const dismissPause = (): void => { cancelCountdown(); pauseDismissed = true; closeArcadeDialog('pause'); };
  registerArcadeDialog({ id: 'pause', overlay, priority: 10, dismiss: dismissPause });
  document.getElementById('arcadeSessionSetup')?.addEventListener('click', () => {
    registrationForActiveView()?.view.classList.add('game-setup-open');
    dismissPause();
  });
  document.getElementById('arcadeSessionResume')?.addEventListener('click', resumeActiveGame);
  document.getElementById('arcadeSessionRestart')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('arcade-restart-active')));
  document.getElementById('arcadeSessionClose')?.addEventListener('click', dismissPause);
  document.getElementById('arcadeSessionHelp')?.addEventListener('click', () => registrationForActiveView()?.view.querySelector<HTMLButtonElement>('[data-game-help]')?.click());
  document.getElementById('arcadeSessionSettings')?.addEventListener('click', () => registrationForActiveView()?.view.querySelector<HTMLButtonElement>('[data-open-settings]')?.click());

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
        if (!registration || (!registration.isActive() && !isArcadeSessionPaused(registration.gameId))) return;
        if (isArcadeSessionPaused(registration.gameId)) { pauseDismissed = false; renderPauseOverlay(); return; }
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
  });
  window.addEventListener('arcade-dialog-change', () => {
    for (const reason of ['help', 'settings', 'result'] as const) {
      const open = isDialogOpen(reason);
      if (blockingReasons.has(reason) !== open) setBlockingReason(reason, open);
    }
  });
  window.addEventListener('arcade-language-change', renderPauseOverlay);
  window.addEventListener('arcade-game-result', clearArcadePause);
  /*
   * Entering or leaving fullscreen blurs the window on mobile browsers. That
   * is the immersive layout switching, not the player walking away, so it must
   * not pause the game and drop the pause overlay over the touch controls.
   */
  let lastFullscreenChange = 0;
  const duringFullscreenSwitch = (): boolean => Date.now() - lastFullscreenChange < 1500;
  const markFullscreenSwitch = (): void => { lastFullscreenChange = Date.now(); };
  // The request fires before the browser blurs us; the change event after it.
  window.addEventListener(FULLSCREEN_TRANSITION_EVENT, markFullscreenSwitch);
  document.addEventListener('fullscreenchange', markFullscreenSwitch);

  window.addEventListener('blur', () => {
    if (duringFullscreenSwitch()) return;
    setBlockingReason('focus', true);
  });
  window.addEventListener('focus', () => setBlockingReason('focus', false));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { setBlockingReason('visibility', false); return; }
    if (duringFullscreenSwitch()) return;
    setBlockingReason('visibility', true);
  });
  window.addEventListener('arcade-view-leaving', () => {
    const registration = registrationForActiveView();
    if (registration?.isActive() && registration.mode() !== 'online') suspendedGames.add(registration.gameId);
  });
  window.addEventListener('arcade-view-changed', () => {
    registrations.forEach(registration => registration.clearHeldInputs());
    window.dispatchEvent(new CustomEvent('arcade-clear-inputs', { detail: { reason: 'view-change' } }));
    clearArcadePause();
    const registration = registrationForActiveView();
    if (registration && suspendedGames.delete(registration.gameId)) interrupt('manual');
  });
  let lastControlState = '';
  const syncSessionControls = (): void => {
    const registration = registrationForActiveView();
    if (registration?.mode() === 'online' && sessionState.pausedGame === registration.gameId) clearArcadePause();
    // Async starts can become active after Help or Settings has already opened.
    if (registration?.isActive() && registration.mode() !== 'online' && blockingReasons.size && sessionState.pausedGame !== registration.gameId) {
      interrupt(blockingReasons.values().next().value!);
    }
    const key = registration ? `${registration.gameId}:${registration.isActive()}:${registration.mode()}:${isArcadeSessionPaused(registration.gameId)}` : '';
    if (key !== lastControlState) {
      lastControlState = key;
      registrations.forEach(item => {
        item.view.classList.toggle('session-active', item === registration && item.isActive());
        item.view.dataset.sessionMode = item.mode();
        const button = item.view.querySelector<HTMLButtonElement>('[data-pause-game]');
        if (button) {
          button.dataset.paused = String(isArcadeSessionPaused(item.gameId));
          button.dataset.online = String(item.mode() === 'online');
          button.disabled = !item.isActive() && !isArcadeSessionPaused(item.gameId);
          button.textContent = isArcadeSessionPaused(item.gameId) ? '▶ Resume' : item.mode() === 'online' ? '● Live' : 'Ⅱ Pause';
          button.setAttribute('aria-label', isArcadeSessionPaused(item.gameId) ? 'Resume game' : item.mode() === 'online' ? 'Online play continues' : 'Pause game');
        }
      });
    }
    requestAnimationFrame(syncSessionControls);
  };
  requestAnimationFrame(syncSessionControls);
}

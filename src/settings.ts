import type { ArcadeResult } from './stats.js';
import { setArcadeLanguage, type ArcadeLanguage } from './i18n.js';

export const SETTINGS_STORAGE_KEY = 'blast-arcade-settings-v1';

export interface ArcadeSettings {
  soundEnabled: boolean;
  volume: number;
  reducedMotion: boolean;
  highContrast: boolean;
  language: ArcadeLanguage;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type SoundCue = 'ui' | 'launch' | 'win' | 'loss' | 'draw' | 'complete' | 'reward';

const SOUND_PATTERNS: Record<SoundCue, readonly number[]> = {
  ui: [440],
  launch: [330, 495],
  win: [523, 659, 784],
  loss: [247, 196],
  draw: [330, 330],
  complete: [392, 523, 659],
  reward: [659, 784, 988],
};

export function createDefaultSettings(): ArcadeSettings {
  return { soundEnabled: true, volume: 60, reducedMotion: false, highContrast: false, language: 'en' };
}

export function normalizeSettings(value: unknown): ArcadeSettings {
  const defaults = createDefaultSettings();
  if (!value || typeof value !== 'object') return defaults;
  const candidate = value as Partial<ArcadeSettings>;
  return {
    soundEnabled: typeof candidate.soundEnabled === 'boolean' ? candidate.soundEnabled : defaults.soundEnabled,
    volume: typeof candidate.volume === 'number' && Number.isFinite(candidate.volume)
      ? Math.max(0, Math.min(100, Math.round(candidate.volume)))
      : defaults.volume,
    reducedMotion: typeof candidate.reducedMotion === 'boolean' ? candidate.reducedMotion : defaults.reducedMotion,
    highContrast: typeof candidate.highContrast === 'boolean' ? candidate.highContrast : defaults.highContrast,
    language: candidate.language === 'ro' ? 'ro' : defaults.language,
  };
}

function browserStorage(): StorageLike | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; }
  catch { return undefined; }
}

export function loadSettings(storage: StorageLike | undefined = browserStorage()): ArcadeSettings {
  if (!storage) return createDefaultSettings();
  try {
    const value = storage.getItem(SETTINGS_STORAGE_KEY);
    return value ? normalizeSettings(JSON.parse(value)) : createDefaultSettings();
  } catch {
    return createDefaultSettings();
  }
}

export function saveSettings(settings: ArcadeSettings, storage: StorageLike | undefined = browserStorage()): ArcadeSettings {
  const normalized = normalizeSettings(settings);
  try { storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized)); }
  catch { /* Accessibility preferences remain usable for the current page. */ }
  return normalized;
}

class ArcadeSoundPlayer {
  private context: AudioContext | null = null;

  play(cue: SoundCue, settings: ArcadeSettings): void {
    if (!settings.soundEnabled || settings.volume <= 0 || typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      this.context ??= new AudioContextClass();
      if (this.context.state === 'suspended') void this.context.resume();
      const now = this.context.currentTime;
      SOUND_PATTERNS[cue].forEach((frequency, index) => {
        const oscillator = this.context!.createOscillator();
        const gain = this.context!.createGain();
        const start = now + index * .085;
        const duration = cue === 'ui' ? .055 : .12;
        oscillator.type = cue === 'loss' ? 'sine' : 'triangle';
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, settings.volume / 100 * .12), start + .012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(this.context!.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + .02);
      });
    } catch {
      // Audio is optional and can be blocked by browser autoplay or privacy settings.
    }
  }
}

export function initArcadeSettings(): void {
  if (typeof document === 'undefined') return;
  Array.from(document.querySelectorAll<HTMLElement>('.game-nav-actions')).forEach(actions => {
    if (actions.querySelector('[data-open-settings]')) return;
    const button = document.createElement('button');
    button.className = 'settings-nav-button';
    button.type = 'button';
    button.dataset.openSettings = '';
    button.textContent = '⚙ Settings';
    actions.append(button);
  });
  const overlay = document.getElementById('settingsOverlay');
  const panel = document.getElementById('settingsPanel');
  const openButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-open-settings]'));
  const closeButton = document.getElementById('settingsCloseButton') as HTMLButtonElement | null;
  const soundToggle = document.getElementById('settingsSoundToggle') as HTMLInputElement | null;
  const volumeInput = document.getElementById('settingsVolume') as HTMLInputElement | null;
  const volumeValue = document.getElementById('settingsVolumeValue');
  const motionToggle = document.getElementById('settingsMotionToggle') as HTMLInputElement | null;
  const contrastToggle = document.getElementById('settingsContrastToggle') as HTMLInputElement | null;
  const languageSelect = document.getElementById('settingsLanguageSelect') as HTMLSelectElement | null;
  const testButton = document.getElementById('settingsTestSound');
  const fullscreenButton = document.getElementById('settingsFullscreenButton') as HTMLButtonElement | null;
  const resetButton = document.getElementById('settingsResetButton');
  if (!overlay || !panel || !openButtons.length) return;
  const activeOverlay = overlay;
  const activePanel = panel;

  const soundPlayer = new ArcadeSoundPlayer();
  let settings = loadSettings();
  let previouslyFocused: HTMLElement | null = null;

  function applySettings(save = true): void {
    settings = save ? saveSettings(settings) : normalizeSettings(settings);
    document.documentElement.classList.toggle('reduce-motion', settings.reducedMotion);
    document.documentElement.classList.toggle('high-contrast', settings.highContrast);
    setArcadeLanguage(settings.language);
    if (soundToggle) soundToggle.checked = settings.soundEnabled;
    if (volumeInput) volumeInput.value = String(settings.volume);
    if (volumeValue) volumeValue.textContent = `${settings.volume}%`;
    if (motionToggle) motionToggle.checked = settings.reducedMotion;
    if (contrastToggle) contrastToggle.checked = settings.highContrast;
    if (languageSelect) languageSelect.value = settings.language;
  }

  function openSettings(): void {
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    activeOverlay.hidden = false;
    document.body.classList.add('settings-open');
    closeButton?.focus();
    soundPlayer.play('ui', settings);
  }

  function closeSettings(): void {
    activeOverlay.hidden = true;
    document.body.classList.remove('settings-open');
    previouslyFocused?.focus();
  }

  function updateFullscreenLabel(): void {
    if (!fullscreenButton) return;
    fullscreenButton.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen';
    fullscreenButton.disabled = typeof document.documentElement.requestFullscreen !== 'function';
  }

  openButtons.forEach(button => button.addEventListener('click', openSettings));
  closeButton?.addEventListener('click', closeSettings);
  activeOverlay.addEventListener('click', event => { if (event.target === activeOverlay) closeSettings(); });
  window.addEventListener('keydown', event => {
    if (activeOverlay.hidden) return;
    if (event.key === 'Escape') closeSettings();
    if (event.key !== 'Tab') return;
    const focusable = Array.from(activePanel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  soundToggle?.addEventListener('change', () => {
    settings.soundEnabled = soundToggle.checked;
    applySettings();
    soundPlayer.play('ui', settings);
  });
  volumeInput?.addEventListener('input', () => {
    settings.volume = Number(volumeInput.value);
    applySettings();
  });
  volumeInput?.addEventListener('change', () => soundPlayer.play('ui', settings));
  motionToggle?.addEventListener('change', () => { settings.reducedMotion = motionToggle.checked; applySettings(); });
  contrastToggle?.addEventListener('change', () => { settings.highContrast = contrastToggle.checked; applySettings(); });
  languageSelect?.addEventListener('change', () => {
    settings.language = languageSelect.value === 'ro' ? 'ro' : 'en';
    applySettings();
  });
  testButton?.addEventListener('click', () => soundPlayer.play('reward', settings));
  resetButton?.addEventListener('click', () => { settings = createDefaultSettings(); applySettings(); soundPlayer.play('ui', settings); });
  fullscreenButton?.addEventListener('click', () => {
    const action = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    void action.catch(() => undefined);
  });
  document.addEventListener('fullscreenchange', updateFullscreenLabel);
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-launch-game]')) soundPlayer.play('launch', settings);
    else if (target?.closest('[data-catalog-filter], [data-favorite-game]')) soundPlayer.play('ui', settings);
  });
  window.addEventListener('arcade-game-result', event => {
    const result = (event as CustomEvent<{ result: ArcadeResult }>).detail.result;
    soundPlayer.play(result.outcome, settings);
  });
  window.addEventListener('arcade-progression-rewarded', () => window.setTimeout(() => soundPlayer.play('reward', settings), 240));
  window.addEventListener('storage', event => { if (event.key === SETTINGS_STORAGE_KEY) { settings = loadSettings(); applySettings(false); } });

  applySettings(false);
  updateFullscreenLabel();
}

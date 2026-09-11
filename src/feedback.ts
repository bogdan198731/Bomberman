export type ArcadeGameplayCue = 'danger' | 'hit' | 'pickup' | 'ricochet' | 'line-clear';

export function emitArcadeGameplayCue(cue: ArcadeGameplayCue, label?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('arcade-game-cue', { detail: { cue, label } }));
}

export function initArcadeGameplayFeedback(): void {
  if (typeof document === 'undefined' || document.getElementById('arcadeGameplayCue')) return;
  const toast = document.createElement('div');
  toast.id = 'arcadeGameplayCue';
  toast.className = 'arcade-gameplay-cue';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.hidden = true;
  document.body.append(toast);
  let timer = 0;
  window.addEventListener('arcade-game-cue', event => {
    const detail = (event as CustomEvent<{ cue?: ArcadeGameplayCue; label?: string }>).detail;
    if (!detail?.cue) return;
    const labels: Record<ArcadeGameplayCue, string> = {
      danger: 'DANGER', hit: 'HIT', pickup: 'POWER UP', ricochet: 'RICOCHET', 'line-clear': 'LINE CLEAR',
    };
    toast.dataset.cue = detail.cue;
    toast.textContent = detail.label ?? labels[detail.cue];
    toast.hidden = false;
    document.body.dataset.gameplayCue = detail.cue;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      toast.hidden = true;
      delete document.body.dataset.gameplayCue;
    }, 850);
  });
}

export type InstallMode = 'hidden' | 'prompt' | 'manual';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function isIosDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/i.test(userAgent) || platform === 'MacIntel' && maxTouchPoints > 1;
}

export function pwaInstallMode(standalone: boolean, hasPrompt: boolean, ios: boolean): InstallMode {
  if (standalone) return 'hidden';
  if (hasPrompt) return 'prompt';
  return ios ? 'manual' : 'hidden';
}

export function connectivityPresentation(online: boolean): { label: string; message: string } {
  return online
    ? { label: 'Online', message: 'Connection restored. Online rooms are available.' }
    : { label: 'Offline play', message: 'You are offline. Solo and local games remain available.' };
}

export function initArcadePwa(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const installButton = document.getElementById('installAppButton') as HTMLButtonElement | null;
  const connectivity = document.getElementById('connectivityStatus');
  const connectivityLabel = document.getElementById('connectivityLabel');
  const toast = document.getElementById('pwaToast');
  let deferredPrompt: BeforeInstallPromptEvent | null = null;
  let toastTimer = 0;

  const standaloneQuery = window.matchMedia('(display-mode: standalone)');
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };

  function standalone(): boolean {
    return standaloneQuery.matches || navigatorWithStandalone.standalone === true;
  }

  function ios(): boolean {
    return isIosDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
  }

  function showToast(message: string, duration: number = 5_000): void {
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, duration);
  }

  function renderInstallButton(): void {
    if (!installButton) return;
    const mode = pwaInstallMode(standalone(), Boolean(deferredPrompt), ios());
    installButton.hidden = mode === 'hidden';
    installButton.textContent = mode === 'manual' ? 'Add to Home' : 'Install app';
    installButton.dataset.installMode = mode;
  }

  function renderConnectivity(announce: boolean = false): void {
    const presentation = connectivityPresentation(navigator.onLine);
    connectivity?.classList.toggle('offline', !navigator.onLine);
    if (connectivityLabel) connectivityLabel.textContent = presentation.label;
    document.documentElement.classList.toggle('is-offline', !navigator.onLine);
    if (announce) showToast(presentation.message);
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    renderInstallButton();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    renderInstallButton();
    showToast('Blast Arcade is installed and ready from your home screen.');
  });
  window.addEventListener('online', () => renderConnectivity(true));
  window.addEventListener('offline', () => renderConnectivity(true));
  standaloneQuery.addEventListener?.('change', renderInstallButton);

  installButton?.addEventListener('click', async () => {
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      deferredPrompt = null;
      renderInstallButton();
      if (choice.outcome === 'accepted') showToast('Installing Blast Arcade…');
      return;
    }
    if (ios() && !standalone()) {
      showToast('On iPhone or iPad, tap Share, then choose “Add to Home Screen”.', 8_000);
    }
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register('/service-worker.js').catch(() => {
        /* Installation is progressive enhancement; the arcade still works online. */
      });
    }, { once: true });
  }
  renderConnectivity();
  renderInstallButton();
}

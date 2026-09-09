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

export function shouldOfferServiceWorkerUpdate(hadController: boolean, workerState: string): boolean {
  return hadController && workerState === 'installed';
}

export function initArcadePwa(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const installButton = document.getElementById('installAppButton') as HTMLButtonElement | null;
  const connectivity = document.getElementById('connectivityStatus');
  const connectivityLabel = document.getElementById('connectivityLabel');
  const toast = document.getElementById('pwaToast');
  const toastMessage = document.getElementById('pwaToastMessage');
  const refreshButton = document.getElementById('pwaRefreshButton') as HTMLButtonElement | null;
  let deferredPrompt: BeforeInstallPromptEvent | null = null;
  let pendingUpdateWorker: ServiceWorker | null = null;
  let updateActivated = false;
  let refreshRequested = false;
  let hadController = Boolean(navigator.serviceWorker?.controller);
  let lastUpdateCheck = 0;
  let toastTimer = 0;

  const standaloneQuery = window.matchMedia('(display-mode: standalone)');
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };

  function standalone(): boolean {
    return standaloneQuery.matches || navigatorWithStandalone.standalone === true;
  }

  function ios(): boolean {
    return isIosDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
  }

  function showToast(message: string, duration: number = 5_000, offerRefresh: boolean = false): void {
    if (!toast) return;
    if (toastMessage) toastMessage.textContent = message;
    else toast.textContent = message;
    if (refreshButton) {
      refreshButton.hidden = !offerRefresh;
      refreshButton.disabled = false;
      refreshButton.textContent = 'Refresh now';
    }
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    if (duration > 0) toastTimer = window.setTimeout(() => { toast.hidden = true; }, duration);
  }

  function offerUpdate(worker: ServiceWorker | null): void {
    pendingUpdateWorker = worker;
    showToast('A new arcade version is ready.', 0, true);
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

  refreshButton?.addEventListener('click', () => {
    refreshRequested = true;
    refreshButton.disabled = true;
    refreshButton.textContent = 'Refreshing…';
    if (pendingUpdateWorker) pendingUpdateWorker.postMessage({ type: 'SKIP_WAITING' });
    else if (updateActivated) location.reload();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) {
        hadController = true;
        return;
      }
      updateActivated = true;
      pendingUpdateWorker = null;
      if (refreshRequested) location.reload();
      else offerUpdate(null);
    });
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' }).then(registration => {
        const watchWorker = (worker: ServiceWorker | null): void => {
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (shouldOfferServiceWorkerUpdate(hadController, worker.state)) offerUpdate(worker);
          });
        };
        if (registration.waiting && hadController) offerUpdate(registration.waiting);
        registration.addEventListener('updatefound', () => watchWorker(registration.installing));
        const checkForUpdate = (): void => {
          if (!navigator.onLine || document.visibilityState === 'hidden' || Date.now() - lastUpdateCheck < 60_000) return;
          lastUpdateCheck = Date.now();
          void registration.update().catch(() => { /* Retry when the app becomes active again. */ });
        };
        checkForUpdate();
        document.addEventListener('visibilitychange', checkForUpdate);
        window.addEventListener('online', checkForUpdate);
        window.setInterval(checkForUpdate, 30 * 60_000);
      }).catch(() => {
        /* Installation is progressive enhancement; the arcade still works online. */
      });
    }, { once: true });
  }
  renderConnectivity();
  renderInstallButton();
}

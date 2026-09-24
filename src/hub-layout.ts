import { gamePreview } from './game-previews.js';
import { ARCADE_GAME_IDS, GAME_META } from './game-metadata.js';
import { loadArcadeProfile } from './stats.js';
import type { HubSection } from './navigation.js';

export function initHubLayout(): void {
  const hub = document.getElementById('hubView');
  if (!hub) return;
  const groups: Record<HubSection, string[]> = {
    games: ['.hub-hero', '#quickPlayPanel', '#games'],
    challenges: ['#circuitPanel', '.progression-panel'],
    profile: ['#profilePanel', '.activity-panel', '#leaderboardPanel'],
  };
  ARCADE_GAME_IDS.forEach(id => {
    const cover = hub.querySelector<HTMLElement>('[data-catalog-game="' + id + '"] .game-cover');
    if (!cover) return;
    const preview = document.createElement('img');
    preview.className = 'board-preview'; preview.alt = ''; preview.setAttribute('aria-hidden', 'true');
    preview.src = gamePreview(id); preview.width = 160; preview.height = 100;
    cover.append(preview);
  });
  const nav = hub.querySelector<HTMLElement>('.mobile-hub-nav')!;
  hub.querySelector('.hub-topbar')?.insertAdjacentElement('afterend', nav);
  for (const section of Object.keys(groups) as HubSection[]) {
    const wrapper = document.createElement('div');
    wrapper.id = `hub-${section}`;
    wrapper.className = 'hub-section';
    wrapper.dataset.hubPanel = section;
    wrapper.hidden = section !== 'games';
    groups[section].forEach(selector => { const element = hub.querySelector(selector); if (element) wrapper.append(element); });
    hub.insertBefore(wrapper, hub.querySelector('.hub-footer'));
  }
  const quickPlay = document.getElementById('quickPlayPanel');
  const modes = quickPlay?.querySelector<HTMLElement>('.quick-play-filters');
  if (quickPlay && modes) quickPlay.append(modes);
  const recent = document.createElement('section');
  recent.className = 'recent-games';
  recent.setAttribute('aria-label', 'Recently played');
  document.getElementById('games')?.before(recent);
  const renderRecent = (): void => {
    const ids = [...new Set(loadArcadeProfile().recentMatches.map(match => match.gameId))].slice(0, 4);
    recent.hidden = ids.length === 0;
    recent.replaceChildren();
    const title = document.createElement('strong'); title.textContent = 'Recently played'; recent.append(title);
    ids.forEach(id => {
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = `${GAME_META[id].icon} ${GAME_META[id].name}`;
      button.addEventListener('click', () => window.dispatchEvent(new CustomEvent('arcade-request-launch', { detail: { gameId: id } })));
      recent.append(button);
    });
  };
  renderRecent();
  window.addEventListener('arcade-profile-updated', renderRecent);
  document.querySelectorAll<HTMLElement>('[data-game-count]').forEach(element => { element.textContent = String(ARCADE_GAME_IDS.length); });

  nav.querySelectorAll<HTMLAnchorElement>('[data-hub-section]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('arcade-navigate-hub', { detail: { section: link.dataset.hubSection } }));
  }));
  window.addEventListener('arcade-hub-section', event => {
    const { section } = (event as CustomEvent<{ section: HubSection }>).detail;
    hub.querySelectorAll<HTMLElement>('[data-hub-panel]').forEach(panel => { panel.hidden = panel.dataset.hubPanel !== section; });
    nav.querySelectorAll<HTMLAnchorElement>('[data-hub-section]').forEach(link => {
      const active = link.dataset.hubSection === section;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
  });
  ['hubProfileChip', 'hubLeaderboardChip'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('arcade-navigate-hub', { detail: { section: 'profile' } }));
    }, { capture: true });
  });
}

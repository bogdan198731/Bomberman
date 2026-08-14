import { ARCADE_GAME_IDS, type ArcadeGameId } from './stats.js';

export type CatalogFilter = 'all' | 'solo' | 'local' | 'online' | 'favorites';
export type CatalogMode = Exclude<CatalogFilter, 'all' | 'favorites'>;

export const CATALOG_FILTERS: readonly CatalogFilter[] = ['all', 'solo', 'local', 'online', 'favorites'];
export const FAVORITES_STORAGE_KEY = 'blast-arcade-favorites-v1';

export interface CatalogGame {
  id: ArcadeGameId;
  title: string;
  description: string;
  modes: readonly CatalogMode[];
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function normalizeCatalogText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim().replace(/\s+/g, ' ');
}

export function normalizeFavorites(value: unknown): ArcadeGameId[] {
  if (!Array.isArray(value)) return [];
  return ARCADE_GAME_IDS.filter(gameId => value.includes(gameId));
}

export function matchesCatalogGame(game: CatalogGame, query: string, filter: CatalogFilter, favorites: readonly ArcadeGameId[]): boolean {
  const normalizedQuery = normalizeCatalogText(query);
  const matchesQuery = !normalizedQuery || normalizeCatalogText(`${game.title} ${game.description}`).includes(normalizedQuery);
  const matchesFilter = filter === 'all'
    || filter === 'favorites' && favorites.includes(game.id)
    || game.modes.includes(filter as CatalogMode);
  return matchesQuery && matchesFilter;
}

function browserStorage(): StorageLike | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; }
  catch { return undefined; }
}

export function loadFavorites(storage: StorageLike | undefined = browserStorage()): ArcadeGameId[] {
  if (!storage) return [];
  try {
    const value = storage.getItem(FAVORITES_STORAGE_KEY);
    return value ? normalizeFavorites(JSON.parse(value)) : [];
  } catch {
    return [];
  }
}

export function saveFavorites(favorites: readonly ArcadeGameId[], storage: StorageLike | undefined = browserStorage()): ArcadeGameId[] {
  const normalized = normalizeFavorites(favorites);
  try { storage?.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(normalized)); }
  catch { /* Favorites are optional when browser storage is unavailable. */ }
  return normalized;
}

export function toggleFavorite(favorites: readonly ArcadeGameId[], gameId: ArcadeGameId): ArcadeGameId[] {
  return favorites.includes(gameId)
    ? favorites.filter(id => id !== gameId)
    : normalizeFavorites([...favorites, gameId]);
}

export function initGameCatalog(): void {
  if (typeof document === 'undefined') return;
  const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-catalog-game]'));
  const search = document.getElementById('catalogSearch') as HTMLInputElement | null;
  const clearSearch = document.getElementById('catalogSearchClear') as HTMLButtonElement | null;
  const filterButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-catalog-filter]'));
  const resultCount = document.getElementById('catalogResultCount');
  const emptyState = document.getElementById('catalogEmptyState');
  const resetButton = document.getElementById('catalogResetButton');
  if (!cards.length || !search) return;
  const activeSearch = search;

  let activeFilter: CatalogFilter = 'all';
  let favorites = loadFavorites();

  function gameFromCard(card: HTMLElement): CatalogGame | null {
    const id = card.dataset.catalogGame;
    if (!ARCADE_GAME_IDS.includes(id as ArcadeGameId)) return null;
    return {
      id: id as ArcadeGameId,
      title: card.querySelector('h3')?.textContent?.trim() ?? '',
      description: card.querySelector('.catalog-card-body p')?.textContent?.trim() ?? '',
      modes: (card.dataset.catalogModes ?? '').split(' ').filter(Boolean) as CatalogMode[],
    };
  }

  function render(): void {
    let visible = 0;
    cards.forEach(card => {
      const game = gameFromCard(card);
      if (!game) return;
      const matches = matchesCatalogGame(game, activeSearch.value, activeFilter, favorites);
      card.hidden = !matches;
      if (matches) visible += 1;
      const favorite = favorites.includes(game.id);
      const button = card.querySelector<HTMLButtonElement>('[data-favorite-game]');
      if (button) {
        button.classList.toggle('active', favorite);
        button.setAttribute('aria-pressed', String(favorite));
        button.setAttribute('aria-label', `${favorite ? 'Remove' : 'Add'} ${game.title} ${favorite ? 'from' : 'to'} favorites`);
        button.textContent = favorite ? '★' : '☆';
      }
    });
    filterButtons.forEach(button => {
      const active = button.dataset.catalogFilter === activeFilter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (resultCount) resultCount.textContent = `${visible} game${visible === 1 ? '' : 's'}`;
    if (emptyState) emptyState.hidden = visible !== 0;
    if (clearSearch) clearSearch.hidden = !activeSearch.value;
  }

  filterButtons.forEach(button => button.addEventListener('click', () => {
    const filter = button.dataset.catalogFilter;
    if (!CATALOG_FILTERS.includes(filter as CatalogFilter)) return;
    activeFilter = filter as CatalogFilter;
    render();
  }));
  cards.forEach(card => card.querySelector('[data-favorite-game]')?.addEventListener('click', () => {
    const game = gameFromCard(card);
    if (!game) return;
    favorites = saveFavorites(toggleFavorite(favorites, game.id));
    render();
  }));
  activeSearch.addEventListener('input', render);
  activeSearch.addEventListener('search', render);
  clearSearch?.addEventListener('click', () => { activeSearch.value = ''; activeSearch.focus(); render(); });
  resetButton?.addEventListener('click', () => { activeSearch.value = ''; activeFilter = 'all'; render(); });
  window.addEventListener('storage', event => {
    if (event.key !== FAVORITES_STORAGE_KEY) return;
    favorites = loadFavorites();
    render();
  });
  render();
}

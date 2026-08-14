export type SurvivalPlayer = 1 | 2;
export type SurvivalMode = 'solo' | 'coop';
export type SurvivalPhase = 'ready' | 'playing' | 'finished';

export const SURVIVAL_WIDTH = 900;
export const SURVIVAL_HEIGHT = 600;
const HERO_RADIUS = 17;
const BULLET_SPEED = 520;

export interface Survivor {
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  speed: number;
  score: number;
  cooldown: number;
  alive: boolean;
}

export interface SurvivalEnemy {
  id: number;
  x: number;
  y: number;
  health: number;
  speed: number;
}

export interface SurvivalBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: SurvivalPlayer;
  age: number;
}

interface SurvivalInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  fire: boolean;
}

function emptyInput(): SurvivalInput {
  return { up: false, down: false, left: false, right: false, fire: false };
}

function createHero(player: SurvivalPlayer, active: boolean): Survivor {
  return {
    x: player === 1 ? SURVIVAL_WIDTH * .42 : SURVIVAL_WIDTH * .58,
    y: SURVIVAL_HEIGHT / 2,
    health: active ? 100 : 0,
    maxHealth: 100,
    speed: 205,
    score: 0,
    cooldown: 0,
    alive: active,
  };
}

export class SurvivalArenaGame {
  mode: SurvivalMode = 'solo';
  phase: SurvivalPhase = 'ready';
  wave = 0;
  upgradeLevel = 0;
  players: Record<SurvivalPlayer, Survivor> = { 1: createHero(1, true), 2: createHero(2, false) };
  inputs: Record<SurvivalPlayer, SurvivalInput> = { 1: emptyInput(), 2: emptyInput() };
  enemies: SurvivalEnemy[] = [];
  bullets: SurvivalBullet[] = [];
  private random: () => number;
  private nextEnemyId = 1;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  restart(mode: SurvivalMode = this.mode): void {
    this.mode = mode;
    this.phase = 'ready';
    this.wave = 0;
    this.upgradeLevel = 0;
    this.players = { 1: createHero(1, true), 2: createHero(2, mode === 'coop') };
    this.inputs = { 1: emptyInput(), 2: emptyInput() };
    this.enemies = [];
    this.bullets = [];
    this.nextEnemyId = 1;
  }

  start(): boolean {
    if (this.phase !== 'ready') return false;
    this.phase = 'playing';
    this.wave = 1;
    this.spawnWave();
    return true;
  }

  setInput(player: SurvivalPlayer, action: keyof SurvivalInput, pressed: boolean): void {
    if (!this.players[player].alive) return;
    this.inputs[player][action] = pressed;
  }

  shoot(player: SurvivalPlayer, targetX?: number, targetY?: number): boolean {
    const hero = this.players[player];
    if (this.phase !== 'playing' || !hero.alive || hero.cooldown > 0) return false;
    let target = targetX === undefined || targetY === undefined
      ? this.nearestEnemy(hero.x, hero.y)
      : { x: targetX, y: targetY };
    if (!target) return false;
    const dx = target.x - hero.x;
    const dy = target.y - hero.y;
    const distance = Math.hypot(dx, dy) || 1;
    this.bullets.push({
      x: hero.x + dx / distance * 22,
      y: hero.y + dy / distance * 22,
      vx: dx / distance * BULLET_SPEED,
      vy: dy / distance * BULLET_SPEED,
      owner: player,
      age: 0,
    });
    hero.cooldown = Math.max(.18, .42 - this.upgradeLevel * .025);
    return true;
  }

  update(seconds: number): void {
    if (this.phase !== 'playing') return;
    const dt = Math.max(0, Math.min(.05, seconds));
    ([1, 2] as SurvivalPlayer[]).forEach(player => {
      const hero = this.players[player];
      if (!hero.alive) return;
      hero.cooldown = Math.max(0, hero.cooldown - dt);
      this.moveHero(player, dt);
      if (this.inputs[player].fire) this.shoot(player);
    });
    this.updateBullets(dt);
    this.updateEnemies(dt);
    if (!this.activePlayers().length) {
      this.phase = 'finished';
      this.inputs = { 1: emptyInput(), 2: emptyInput() };
      return;
    }
    if (this.enemies.length === 0) this.advanceWave();
  }

  statusText(): string {
    if (this.phase === 'ready') return this.mode === 'solo'
      ? 'Start a solo run. Your blaster locks onto the nearest crawler.'
      : 'Start a couch co-op run and protect each other.';
    if (this.phase === 'finished') return `Run over on wave ${this.wave}. Reset and rally again.`;
    if (this.wave % 3 === 0) return `Wave ${this.wave}: overdrive active — faster movement and fire rate.`;
    return `Wave ${this.wave}: clear ${this.enemies.length} crawler${this.enemies.length === 1 ? '' : 's'}.`;
  }

  private activePlayers(): Survivor[] {
    return ([1, 2] as SurvivalPlayer[]).map(player => this.players[player]).filter(player => player.alive);
  }

  private nearestEnemy(x: number, y: number): SurvivalEnemy | undefined {
    return this.enemies.reduce<SurvivalEnemy | undefined>((nearest, enemy) => {
      if (!nearest) return enemy;
      return Math.hypot(enemy.x - x, enemy.y - y) < Math.hypot(nearest.x - x, nearest.y - y) ? enemy : nearest;
    }, undefined);
  }

  private moveHero(player: SurvivalPlayer, dt: number): void {
    const hero = this.players[player];
    const input = this.inputs[player];
    const dx = Number(input.right) - Number(input.left);
    const dy = Number(input.down) - Number(input.up);
    const length = Math.hypot(dx, dy) || 1;
    hero.x = Math.max(HERO_RADIUS, Math.min(SURVIVAL_WIDTH - HERO_RADIUS, hero.x + dx / length * hero.speed * dt));
    hero.y = Math.max(HERO_RADIUS, Math.min(SURVIVAL_HEIGHT - HERO_RADIUS, hero.y + dy / length * hero.speed * dt));
  }

  private updateBullets(dt: number): void {
    const survivors: SurvivalBullet[] = [];
    for (const bullet of this.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.age += dt;
      if (bullet.x < 0 || bullet.x > SURVIVAL_WIDTH || bullet.y < 0 || bullet.y > SURVIVAL_HEIGHT || bullet.age > 1.8) continue;
      const hitIndex = this.enemies.findIndex(enemy => Math.hypot(enemy.x - bullet.x, enemy.y - bullet.y) < 21);
      if (hitIndex >= 0) {
        const enemy = this.enemies[hitIndex];
        enemy.health -= 1;
        if (enemy.health <= 0) {
          this.enemies.splice(hitIndex, 1);
          this.players[bullet.owner].score += 10;
        }
        continue;
      }
      survivors.push(bullet);
    }
    this.bullets = survivors;
  }

  private updateEnemies(dt: number): void {
    const heroes = this.activePlayers();
    for (const enemy of this.enemies) {
      if (!heroes.length) break;
      const target = heroes.reduce((nearest, hero) =>
        Math.hypot(hero.x - enemy.x, hero.y - enemy.y) < Math.hypot(nearest.x - enemy.x, nearest.y - enemy.y) ? hero : nearest
      );
      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance < HERO_RADIUS + 15) {
        target.health = Math.max(0, target.health - 30 * dt);
        target.alive = target.health > 0;
        enemy.x -= dx / distance * 18 * dt;
        enemy.y -= dy / distance * 18 * dt;
      } else {
        enemy.x += dx / distance * enemy.speed * dt;
        enemy.y += dy / distance * enemy.speed * dt;
      }
    }
  }

  private advanceWave(): void {
    this.wave += 1;
    if (this.wave % 3 === 0) {
      this.upgradeLevel += 1;
      this.activePlayers().forEach(hero => {
        hero.speed += 14;
        hero.maxHealth += 10;
        hero.health = Math.min(hero.maxHealth, hero.health + 28);
      });
    }
    this.spawnWave();
  }

  private spawnWave(): void {
    const count = Math.min(20, 3 + this.wave * 2 + (this.mode === 'coop' ? 2 : 0));
    for (let index = 0; index < count; index += 1) {
      const side = Math.floor(this.random() * 4);
      const along = .08 + this.random() * .84;
      const position = side === 0 ? { x: 8, y: SURVIVAL_HEIGHT * along }
        : side === 1 ? { x: SURVIVAL_WIDTH - 8, y: SURVIVAL_HEIGHT * along }
        : side === 2 ? { x: SURVIVAL_WIDTH * along, y: 8 }
        : { x: SURVIVAL_WIDTH * along, y: SURVIVAL_HEIGHT - 8 };
      this.enemies.push({
        id: this.nextEnemyId++,
        ...position,
        health: 1 + Math.floor((this.wave - 1) / 4),
        speed: 64 + this.wave * 4 + this.random() * 14,
      });
    }
  }
}

export function initSurvivalArena(): void {
  if (typeof document === 'undefined') return;
  const canvasElement = document.getElementById('survivalCanvas') as HTMLCanvasElement | null;
  const contextValue = canvasElement?.getContext('2d');
  const viewElement = document.getElementById('survivalView');
  if (!canvasElement || !contextValue || !viewElement) return;
  const canvas = canvasElement;
  const ctx = contextValue;
  const view = viewElement;
  canvas.width = SURVIVAL_WIDTH;
  canvas.height = SURVIVAL_HEIGHT;
  const game = new SurvivalArenaGame();
  const status = document.getElementById('survivalStatus');
  const wave = document.getElementById('survivalWave');
  const mintScore = document.getElementById('survivalMintScore');
  const coralScore = document.getElementById('survivalCoralScore');
  const mintHealth = document.getElementById('survivalMintHealth');
  const coralHealth = document.getElementById('survivalCoralHealth');
  const startButton = document.getElementById('survivalStartButton') as HTMLButtonElement | null;
  const modeButtons = document.querySelectorAll<HTMLButtonElement>('[data-survival-mode]');
  const coralControls = document.getElementById('survivalCoralControls');

  function visible(): boolean { return !view.classList.contains('view-hidden'); }
  function syncUi(): void {
    if (status) status.textContent = game.statusText();
    if (wave) wave.textContent = String(game.wave);
    if (mintScore) mintScore.textContent = String(game.players[1].score);
    if (coralScore) coralScore.textContent = String(game.players[2].score);
    if (mintHealth) mintHealth.textContent = `${Math.ceil(game.players[1].health)} HP`;
    if (coralHealth) coralHealth.textContent = game.mode === 'solo' ? 'Solo' : `${Math.ceil(game.players[2].health)} HP`;
    if (startButton) startButton.textContent = game.phase === 'ready' ? 'Start run' : game.phase === 'finished' ? 'New run' : 'Run live';
    modeButtons.forEach(button => button.classList.toggle('active', button.dataset.survivalMode === game.mode));
    coralControls?.classList.toggle('solo-hidden', game.mode === 'solo');
  }

  function render(): void {
    const gradient = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 20, canvas.width / 2, canvas.height / 2, 620);
    gradient.addColorStop(0, '#152d31'); gradient.addColorStop(.58, '#131b2b'); gradient.addColorStop(1, '#2b1422');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 45) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y < canvas.height; y += 45) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
    const colors: Record<SurvivalPlayer, string> = { 1: '#54e38e', 2: '#ff6b78' };
    ([1, 2] as SurvivalPlayer[]).forEach(player => {
      const hero = game.players[player];
      if (!hero.alive) return;
      ctx.save(); ctx.translate(hero.x, hero.y); ctx.shadowBlur = 22; ctx.shadowColor = colors[player];
      ctx.fillStyle = colors[player]; ctx.beginPath(); ctx.arc(0, 0, HERO_RADIUS, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#101722'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(hero.x - 22, hero.y - 31, 44, 5);
      ctx.fillStyle = colors[player]; ctx.fillRect(hero.x - 22, hero.y - 31, 44 * hero.health / hero.maxHealth, 5);
    });
    game.enemies.forEach(enemy => {
      ctx.save(); ctx.translate(enemy.x, enemy.y); ctx.rotate(performance.now() / 600 + enemy.id);
      ctx.shadowBlur = 16; ctx.shadowColor = '#a064ff'; ctx.fillStyle = '#a064ff';
      ctx.fillRect(-11, -11, 22, 22); ctx.fillStyle = '#28183b'; ctx.fillRect(-4, -4, 8, 8); ctx.restore();
    });
    game.bullets.forEach(bullet => {
      ctx.fillStyle = colors[bullet.owner]; ctx.shadowBlur = 14; ctx.shadowColor = colors[bullet.owner];
      ctx.beginPath(); ctx.arc(bullet.x, bullet.y, 5, 0, Math.PI * 2); ctx.fill();
    });
    ctx.shadowBlur = 0;
  }

  const commands: Record<string, readonly [SurvivalPlayer, keyof SurvivalInput]> = {
    KeyW: [1, 'up'], KeyS: [1, 'down'], KeyA: [1, 'left'], KeyD: [1, 'right'], KeyF: [1, 'fire'],
    ArrowUp: [2, 'up'], ArrowDown: [2, 'down'], ArrowLeft: [2, 'left'], ArrowRight: [2, 'right'], Enter: [2, 'fire'],
  };
  window.addEventListener('keydown', event => {
    if (!visible()) return;
    const command = commands[event.code];
    if (command) { event.preventDefault(); game.setInput(command[0], command[1], true); }
    else if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      if (game.phase === 'finished') game.restart();
      game.start(); syncUi();
    }
  });
  window.addEventListener('keyup', event => {
    const command = commands[event.code];
    if (command) game.setInput(command[0], command[1], false);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-survival-player][data-survival-action]').forEach(button => {
    const player = Number(button.dataset.survivalPlayer) as SurvivalPlayer;
    const action = button.dataset.survivalAction as keyof SurvivalInput;
    const release = (): void => game.setInput(player, action, false);
    button.addEventListener('pointerdown', event => {
      event.preventDefault(); button.setPointerCapture?.(event.pointerId); game.setInput(player, action, true);
    });
    button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
  });
  modeButtons.forEach(button => button.addEventListener('click', () => {
    const mode = button.dataset.survivalMode;
    if (mode === 'solo' || mode === 'coop') { game.restart(mode); syncUi(); render(); }
  }));
  startButton?.addEventListener('click', () => {
    if (game.phase === 'finished') game.restart();
    game.start(); syncUi();
  });
  document.getElementById('survivalRestartButton')?.addEventListener('click', () => { game.restart(); syncUi(); render(); });

  let previous = performance.now();
  function loop(now: number): void {
    if (visible()) { game.update((now - previous) / 1000); render(); syncUi(); }
    previous = now; requestAnimationFrame(loop);
  }
  syncUi(); render(); requestAnimationFrame(loop);
}

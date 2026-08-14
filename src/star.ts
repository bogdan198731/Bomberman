export type StarPhase = 'ready' | 'playing' | 'finished';
export type StarEnemyKind = 'scout' | 'heavy' | 'boss';
export type StarPowerUpKind = 'spread' | 'rapid' | 'shield';

export const STAR_WIDTH = 900;
export const STAR_HEIGHT = 600;
const SHIP_RADIUS = 19;
const PLAYER_BULLET_SPEED = 560;

export interface StarPlayer {
  x: number;
  y: number;
  health: number;
  score: number;
  cooldown: number;
  spreadTimer: number;
  rapidTimer: number;
  shield: number;
}

export interface StarEnemy {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  health: number;
  kind: StarEnemyKind;
  vx: number;
  shootCooldown: number;
}

export interface StarBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: 'player' | 'enemy';
}

export interface StarPowerUp {
  x: number;
  y: number;
  vy: number;
  kind: StarPowerUpKind;
}

interface StarInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  fire: boolean;
}

function emptyInput(): StarInput {
  return { left: false, right: false, up: false, down: false, fire: false };
}

export class StarDefenderGame {
  phase: StarPhase = 'ready';
  wave = 0;
  kills = 0;
  player: StarPlayer = this.createPlayer();
  input: StarInput = emptyInput();
  enemies: StarEnemy[] = [];
  bullets: StarBullet[] = [];
  powerUps: StarPowerUp[] = [];
  private random: () => number;
  private nextEnemyId = 1;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  restart(): void {
    this.phase = 'ready';
    this.wave = 0;
    this.kills = 0;
    this.player = this.createPlayer();
    this.input = emptyInput();
    this.enemies = [];
    this.bullets = [];
    this.powerUps = [];
    this.nextEnemyId = 1;
  }

  start(): boolean {
    if (this.phase !== 'ready') return false;
    this.phase = 'playing';
    this.wave = 1;
    this.spawnWave();
    return true;
  }

  setInput(action: keyof StarInput, pressed: boolean): void {
    this.input[action] = pressed;
  }

  shoot(): boolean {
    if (this.phase !== 'playing' || this.player.cooldown > 0) return false;
    const angles = this.player.spreadTimer > 0 ? [-.2, 0, .2] : [0];
    angles.forEach(angle => this.bullets.push({
      x: this.player.x,
      y: this.player.y - 22,
      vx: Math.sin(angle) * PLAYER_BULLET_SPEED,
      vy: -Math.cos(angle) * PLAYER_BULLET_SPEED,
      owner: 'player',
    }));
    this.player.cooldown = this.player.rapidTimer > 0 ? .15 : .34;
    return true;
  }

  grantPowerUp(kind: StarPowerUpKind): void {
    if (kind === 'spread') this.player.spreadTimer = 9;
    else if (kind === 'rapid') this.player.rapidTimer = 9;
    else this.player.shield = Math.min(3, this.player.shield + 1);
  }

  damagePlayer(): void {
    if (this.phase !== 'playing') return;
    if (this.player.shield > 0) {
      this.player.shield -= 1;
      return;
    }
    this.player.health -= 1;
    if (this.player.health <= 0) {
      this.player.health = 0;
      this.phase = 'finished';
      this.input = emptyInput();
    }
  }

  update(seconds: number): void {
    if (this.phase !== 'playing') return;
    const dt = Math.max(0, Math.min(.05, seconds));
    this.player.cooldown = Math.max(0, this.player.cooldown - dt);
    this.player.spreadTimer = Math.max(0, this.player.spreadTimer - dt);
    this.player.rapidTimer = Math.max(0, this.player.rapidTimer - dt);
    this.movePlayer(dt);
    if (this.input.fire) this.shoot();
    this.updateBullets(dt);
    if (this.phase !== 'playing') return;
    this.updateEnemies(dt);
    this.updatePowerUps(dt);
    if (this.phase === 'playing' && this.enemies.length === 0) this.advanceWave();
  }

  statusText(): string {
    if (this.phase === 'ready') return 'Launch your fighter and clear the first invader formation.';
    if (this.phase === 'finished') return `Mission over on wave ${this.wave} with ${this.player.score} points.`;
    if (this.wave % 5 === 0) return `Boss wave ${this.wave}: break the command ship!`;
    const boost = this.player.spreadTimer > 0 ? ' · Spread shot active' : this.player.rapidTimer > 0 ? ' · Rapid fire active' : '';
    return `Wave ${this.wave}: ${this.enemies.length} invader${this.enemies.length === 1 ? '' : 's'} remain${boost}.`;
  }

  private createPlayer(): StarPlayer {
    return {
      x: STAR_WIDTH / 2,
      y: STAR_HEIGHT - 58,
      health: 3,
      score: 0,
      cooldown: 0,
      spreadTimer: 0,
      rapidTimer: 0,
      shield: 0,
    };
  }

  private movePlayer(dt: number): void {
    const dx = Number(this.input.right) - Number(this.input.left);
    const dy = Number(this.input.down) - Number(this.input.up);
    const length = Math.hypot(dx, dy) || 1;
    const speed = 270;
    this.player.x = Math.max(SHIP_RADIUS, Math.min(STAR_WIDTH - SHIP_RADIUS, this.player.x + dx / length * speed * dt));
    this.player.y = Math.max(STAR_HEIGHT * .48, Math.min(STAR_HEIGHT - SHIP_RADIUS, this.player.y + dy / length * speed * dt));
  }

  private updateBullets(dt: number): void {
    const survivors: StarBullet[] = [];
    for (const bullet of this.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.x < -15 || bullet.x > STAR_WIDTH + 15 || bullet.y < -20 || bullet.y > STAR_HEIGHT + 20) continue;
      if (bullet.owner === 'player') {
        const hitIndex = this.enemies.findIndex(enemy =>
          Math.abs(enemy.x - bullet.x) <= enemy.width / 2 && Math.abs(enemy.y - bullet.y) <= enemy.height / 2
        );
        if (hitIndex >= 0) {
          const enemy = this.enemies[hitIndex];
          enemy.health -= 1;
          if (enemy.health <= 0) this.destroyEnemy(hitIndex);
          continue;
        }
      } else if (Math.hypot(this.player.x - bullet.x, this.player.y - bullet.y) < SHIP_RADIUS + 6) {
        this.damagePlayer();
        continue;
      }
      survivors.push(bullet);
    }
    this.bullets = survivors;
  }

  private updateEnemies(dt: number): void {
    const edgeHit = this.enemies.some(enemy => enemy.x + enemy.vx * dt < enemy.width / 2 + 12 || enemy.x + enemy.vx * dt > STAR_WIDTH - enemy.width / 2 - 12);
    if (edgeHit) this.enemies.forEach(enemy => { enemy.vx *= -1; enemy.y += enemy.kind === 'boss' ? 5 : 16; });
    const survivors: StarEnemy[] = [];
    for (const enemy of this.enemies) {
      enemy.x += enemy.vx * dt;
      enemy.shootCooldown -= dt;
      if (enemy.shootCooldown <= 0 && enemy.y < this.player.y) {
        const dx = this.player.x - enemy.x;
        const dy = this.player.y - enemy.y;
        const distance = Math.hypot(dx, dy) || 1;
        const speed = enemy.kind === 'boss' ? 245 : 205;
        this.bullets.push({ x: enemy.x, y: enemy.y + enemy.height / 2, vx: dx / distance * speed, vy: dy / distance * speed, owner: 'enemy' });
        enemy.shootCooldown = (enemy.kind === 'boss' ? .65 : 2.2) + this.random() * 1.5;
      }
      if (enemy.y + enemy.height / 2 >= STAR_HEIGHT - 28 || Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) < SHIP_RADIUS + enemy.width * .35) {
        this.damagePlayer();
        if (this.phase !== 'playing') return;
      } else survivors.push(enemy);
    }
    this.enemies = survivors;
  }

  private updatePowerUps(dt: number): void {
    const survivors: StarPowerUp[] = [];
    for (const powerUp of this.powerUps) {
      powerUp.y += powerUp.vy * dt;
      if (Math.hypot(this.player.x - powerUp.x, this.player.y - powerUp.y) < SHIP_RADIUS + 14) this.grantPowerUp(powerUp.kind);
      else if (powerUp.y < STAR_HEIGHT + 20) survivors.push(powerUp);
    }
    this.powerUps = survivors;
  }

  private destroyEnemy(index: number): void {
    const [enemy] = this.enemies.splice(index, 1);
    this.player.score += enemy.kind === 'boss' ? 500 : enemy.kind === 'heavy' ? 50 : 20;
    this.kills += 1;
    if (this.kills % 4 === 0) {
      const kinds: StarPowerUpKind[] = ['spread', 'rapid', 'shield'];
      this.powerUps.push({ x: enemy.x, y: enemy.y, vy: 105, kind: kinds[(this.kills / 4 - 1) % kinds.length] });
    }
  }

  private advanceWave(): void {
    this.wave += 1;
    this.player.health = Math.min(3, this.player.health + (this.wave % 3 === 0 ? 1 : 0));
    this.spawnWave();
  }

  private spawnWave(): void {
    if (this.wave % 5 === 0) {
      this.enemies.push({
        id: this.nextEnemyId++, x: STAR_WIDTH / 2, y: 100, width: 112, height: 62,
        health: 10 + this.wave, kind: 'boss', vx: 70 + this.wave * 2, shootCooldown: .8,
      });
      return;
    }
    const columns = Math.min(9, 5 + this.wave);
    const rows = Math.min(3, 1 + Math.floor(this.wave / 2));
    const spacing = 72;
    const left = STAR_WIDTH / 2 - (columns - 1) * spacing / 2;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const heavy = row === 0 && this.wave >= 3 && column % 3 === 1;
        this.enemies.push({
          id: this.nextEnemyId++, x: left + column * spacing, y: 78 + row * 62,
          width: heavy ? 44 : 34, height: heavy ? 32 : 26, health: heavy ? 2 : 1,
          kind: heavy ? 'heavy' : 'scout', vx: 55 + this.wave * 4, shootCooldown: 1.1 + this.random() * 2.4,
        });
      }
    }
  }
}

export function initStarDefender(): void {
  if (typeof document === 'undefined') return;
  const canvasElement = document.getElementById('starCanvas') as HTMLCanvasElement | null;
  const contextValue = canvasElement?.getContext('2d');
  const viewElement = document.getElementById('starView');
  if (!canvasElement || !contextValue || !viewElement) return;
  const canvas = canvasElement;
  const ctx = contextValue;
  const view = viewElement;
  canvas.width = STAR_WIDTH;
  canvas.height = STAR_HEIGHT;
  const game = new StarDefenderGame();
  const status = document.getElementById('starStatus');
  const wave = document.getElementById('starWave');
  const score = document.getElementById('starScore');
  const health = document.getElementById('starHealth');
  const boost = document.getElementById('starBoost');
  const startButton = document.getElementById('starStartButton') as HTMLButtonElement | null;

  function visible(): boolean { return !view.classList.contains('view-hidden'); }
  function syncUi(): void {
    if (status) status.textContent = game.statusText();
    if (wave) wave.textContent = String(game.wave);
    if (score) score.textContent = String(game.player.score);
    if (health) health.textContent = `${game.player.health} hull`;
    if (boost) boost.textContent = game.player.shield > 0 ? `Shield ×${game.player.shield}` : game.player.spreadTimer > 0 ? 'Spread' : game.player.rapidTimer > 0 ? 'Rapid' : 'Standard';
    if (startButton) startButton.textContent = game.phase === 'ready' ? 'Launch' : game.phase === 'finished' ? 'Fly again' : 'Mission live';
  }

  function drawShip(): void {
    ctx.save(); ctx.translate(game.player.x, game.player.y);
    if (game.player.shield > 0) {
      ctx.strokeStyle = '#55d9ff'; ctx.lineWidth = 3; ctx.shadowBlur = 18; ctx.shadowColor = '#55d9ff';
      ctx.beginPath(); ctx.arc(0, 0, 27, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.shadowBlur = 20; ctx.shadowColor = '#54e38e'; ctx.fillStyle = '#54e38e';
    ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(18, 20); ctx.lineTo(0, 12); ctx.lineTo(-18, 20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#101722'; ctx.beginPath(); ctx.arc(0, 2, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffc857'; ctx.fillRect(-4, 17, 8, 13); ctx.restore();
  }

  function render(): void {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#070a18'); gradient.addColorStop(.56, '#101a32'); gradient.addColorStop(1, '#172035');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const now = performance.now();
    for (let index = 0; index < 72; index += 1) {
      const x = (index * 137.5) % canvas.width;
      const y = (index * 83 + now * (.012 + index % 4 * .005)) % canvas.height;
      ctx.globalAlpha = .25 + index % 5 * .13; ctx.fillStyle = index % 8 === 0 ? '#a064ff' : '#dbe7f4';
      ctx.fillRect(x, y, index % 6 === 0 ? 2 : 1, index % 6 === 0 ? 2 : 1);
    }
    ctx.globalAlpha = 1;
    game.enemies.forEach(enemy => {
      ctx.save(); ctx.translate(enemy.x, enemy.y);
      const color = enemy.kind === 'boss' ? '#ff6b78' : enemy.kind === 'heavy' ? '#ffc857' : '#a064ff';
      ctx.shadowBlur = 18; ctx.shadowColor = color; ctx.fillStyle = color;
      if (enemy.kind === 'boss') {
        ctx.beginPath(); ctx.moveTo(-56, -10); ctx.lineTo(-30, -30); ctx.lineTo(30, -30); ctx.lineTo(56, -10); ctx.lineTo(42, 26); ctx.lineTo(-42, 26); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#171325'; ctx.fillRect(-24, -10, 48, 17);
      } else {
        ctx.beginPath(); ctx.moveTo(0, -enemy.height / 2); ctx.lineTo(enemy.width / 2, 4); ctx.lineTo(enemy.width * .3, enemy.height / 2); ctx.lineTo(-enemy.width * .3, enemy.height / 2); ctx.lineTo(-enemy.width / 2, 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#171325'; ctx.fillRect(-7, 0, 14, 6);
      }
      ctx.restore();
    });
    game.bullets.forEach(bullet => {
      ctx.strokeStyle = bullet.owner === 'player' ? '#54e38e' : '#ff6b78';
      ctx.lineWidth = bullet.owner === 'player' ? 4 : 3; ctx.shadowBlur = 12; ctx.shadowColor = ctx.strokeStyle;
      ctx.beginPath(); ctx.moveTo(bullet.x, bullet.y); ctx.lineTo(bullet.x - bullet.vx * .025, bullet.y - bullet.vy * .025); ctx.stroke();
    });
    game.powerUps.forEach(powerUp => {
      const color = powerUp.kind === 'shield' ? '#55d9ff' : powerUp.kind === 'spread' ? '#ffc857' : '#ff6b78';
      ctx.fillStyle = color; ctx.shadowBlur = 18; ctx.shadowColor = color; ctx.beginPath(); ctx.arc(powerUp.x, powerUp.y, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111522'; ctx.font = '900 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(powerUp.kind === 'shield' ? 'S' : powerUp.kind === 'spread' ? '3' : 'R', powerUp.x, powerUp.y + 1);
    });
    ctx.shadowBlur = 0; drawShip();
  }

  const commands: Record<string, keyof StarInput> = {
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyF: 'fire', Space: 'fire', Enter: 'fire',
  };
  window.addEventListener('keydown', event => {
    if (!visible()) return;
    const command = commands[event.code];
    if (command) { event.preventDefault(); game.setInput(command, true); }
    else if (event.code === 'KeyR' && !event.repeat) { game.restart(); syncUi(); }
  });
  window.addEventListener('keyup', event => {
    const command = commands[event.code];
    if (command) game.setInput(command, false);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-star-action]').forEach(button => {
    const action = button.dataset.starAction as keyof StarInput;
    const release = (): void => game.setInput(action, false);
    button.addEventListener('pointerdown', event => {
      event.preventDefault(); button.setPointerCapture?.(event.pointerId); game.setInput(action, true);
    });
    button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
  });
  startButton?.addEventListener('click', () => {
    if (game.phase === 'finished') game.restart();
    game.start(); syncUi();
  });
  document.getElementById('starRestartButton')?.addEventListener('click', () => { game.restart(); syncUi(); render(); });

  let previous = performance.now();
  function loop(now: number): void {
    if (visible()) { game.update((now - previous) / 1000); render(); syncUi(); }
    previous = now; requestAnimationFrame(loop);
  }
  syncUi(); render(); requestAnimationFrame(loop);
}

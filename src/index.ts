const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas?.getContext('2d');

export function initGame() {
  if (!canvas || !ctx) {
    console.error('Canvas not found');
    return;
  }

  canvas.width = 512;
  canvas.height = 512;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = '20px Arial';
  ctx.fillText('Bomberman - Coming Soon', 150, 250);
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initGame);
}

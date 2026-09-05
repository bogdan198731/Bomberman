export interface JoystickDirection {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
}

export interface JoystickOffset {
  x: number;
  y: number;
}

export function joystickDirection(
  deltaX: number,
  deltaY: number,
  radius: number,
  deadZoneRatio = 0.24,
): JoystickDirection | null {
  if (!Number.isFinite(radius) || radius <= 0) return null;
  if (Math.hypot(deltaX, deltaY) < radius * deadZoneRatio) return null;

  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return { dx: deltaX < 0 ? -1 : 1, dy: 0 };
  }

  return { dx: 0, dy: deltaY < 0 ? -1 : 1 };
}

export function clampJoystickOffset(deltaX: number, deltaY: number, radius: number): JoystickOffset {
  if (!Number.isFinite(radius) || radius <= 0) return { x: 0, y: 0 };
  const distance = Math.hypot(deltaX, deltaY);
  if (distance <= radius) return { x: deltaX, y: deltaY };

  const scale = radius / distance;
  return { x: deltaX * scale, y: deltaY * scale };
}

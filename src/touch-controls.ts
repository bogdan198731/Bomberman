export interface JoystickDirection {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
}

export interface JoystickOffset {
  x: number;
  y: number;
}

export interface JoystickVector {
  x: number;
  y: number;
}

export type JoystickInputDirection = 'up' | 'down' | 'left' | 'right';
export type JoystickInputMode = 'free' | 'cardinal' | 'horizontal' | 'vertical';
export type JoystickDigitalState = Record<JoystickInputDirection, boolean>;

export type BombermanTouchLayout = 'joystick-left' | 'joystick-right';

export const BOMBERMAN_TOUCH_LAYOUT_STORAGE_KEY = 'blast-arcade-bomberman-touch-layout-v1';
export const DEFAULT_BOMBERMAN_TOUCH_LAYOUT: BombermanTouchLayout = 'joystick-right';

export function normalizeBombermanTouchLayout(value: unknown): BombermanTouchLayout {
  return value === 'joystick-left' || value === 'joystick-right'
    ? value
    : DEFAULT_BOMBERMAN_TOUCH_LAYOUT;
}

export function swapBombermanTouchLayout(layout: BombermanTouchLayout): BombermanTouchLayout {
  return layout === 'joystick-right' ? 'joystick-left' : 'joystick-right';
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

export function joystickVector(
  deltaX: number,
  deltaY: number,
  radius: number,
  deadZoneRatio = 0.24,
): JoystickVector {
  if (!Number.isFinite(radius) || radius <= 0) return { x: 0, y: 0 };
  if (Math.hypot(deltaX, deltaY) < radius * deadZoneRatio) return { x: 0, y: 0 };
  const offset = clampJoystickOffset(deltaX, deltaY, radius);
  return { x: offset.x / radius, y: offset.y / radius };
}

export function digitalJoystickState(
  vector: JoystickVector,
  mode: JoystickInputMode = 'free',
  threshold = 0.32,
): JoystickDigitalState {
  const state: JoystickDigitalState = { up: false, down: false, left: false, right: false };
  if (mode === 'horizontal') {
    state.left = vector.x < -threshold;
    state.right = vector.x > threshold;
    return state;
  }
  if (mode === 'vertical') {
    state.up = vector.y < -threshold;
    state.down = vector.y > threshold;
    return state;
  }
  if (mode === 'cardinal') {
    if (Math.max(Math.abs(vector.x), Math.abs(vector.y)) <= threshold) return state;
    if (Math.abs(vector.x) > Math.abs(vector.y)) state[vector.x < 0 ? 'left' : 'right'] = true;
    else state[vector.y < 0 ? 'up' : 'down'] = true;
    return state;
  }
  state.up = vector.y < -threshold;
  state.down = vector.y > threshold;
  state.left = vector.x < -threshold;
  state.right = vector.x > threshold;
  return state;
}

export function bindVirtualJoystick(
  track: HTMLElement,
  onChange: (vector: JoystickVector) => void,
): () => void {
  const knob = track.querySelector<HTMLElement>('[data-joystick-knob]');
  if (!knob) return () => undefined;
  let activePointerId: number | undefined;
  const keyboardDirections = new Set<JoystickInputDirection>();

  const emitVector = (deltaX: number, deltaY: number): void => {
    const bounds = track.getBoundingClientRect();
    const knobSize = Math.max(knob.offsetWidth, knob.offsetHeight);
    const radius = Math.max(1, (Math.min(bounds.width, bounds.height) - knobSize) / 2);
    const offset = clampJoystickOffset(deltaX, deltaY, radius);
    track.style.setProperty('--joystick-x', `${offset.x}px`);
    track.style.setProperty('--joystick-y', `${offset.y}px`);
    onChange(joystickVector(deltaX, deltaY, radius));
  };
  const updatePointer = (clientX: number, clientY: number): void => {
    const bounds = track.getBoundingClientRect();
    emitVector(clientX - (bounds.left + bounds.width / 2), clientY - (bounds.top + bounds.height / 2));
  };
  const reset = (pointerId?: number): void => {
    if (pointerId !== undefined && pointerId !== activePointerId) return;
    activePointerId = undefined;
    keyboardDirections.clear();
    track.classList.remove('is-active');
    track.style.setProperty('--joystick-x', '0px');
    track.style.setProperty('--joystick-y', '0px');
    onChange({ x: 0, y: 0 });
  };
  const emitKeyboard = (): void => {
    const x = Number(keyboardDirections.has('right')) - Number(keyboardDirections.has('left'));
    const y = Number(keyboardDirections.has('down')) - Number(keyboardDirections.has('up'));
    const scale = x !== 0 && y !== 0 ? Math.SQRT1_2 : 1;
    onChange({ x: x * scale, y: y * scale });
  };
  const pointerDown = (event: PointerEvent): void => {
    if (activePointerId !== undefined) return;
    event.preventDefault();
    activePointerId = event.pointerId;
    track.classList.add('is-active');
    track.setPointerCapture?.(event.pointerId);
    updatePointer(event.clientX, event.clientY);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10);
  };
  const pointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== activePointerId) return;
    event.preventDefault();
    updatePointer(event.clientX, event.clientY);
  };
  const pointerRelease = (event: PointerEvent): void => reset(event.pointerId);
  const contextMenu = (event: MouseEvent): void => event.preventDefault();
  const keyDirection = (event: KeyboardEvent): JoystickInputDirection | undefined => ({
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  } as const)[event.key];
  const keyDown = (event: KeyboardEvent): void => {
    const direction = keyDirection(event);
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    keyboardDirections.add(direction);
    emitKeyboard();
  };
  const keyUp = (event: KeyboardEvent): void => {
    const direction = keyDirection(event);
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    keyboardDirections.delete(direction);
    emitKeyboard();
  };
  const blur = (): void => reset();
  const visibilityChange = (): void => { if (document.hidden) reset(); };

  track.addEventListener('pointerdown', pointerDown);
  track.addEventListener('pointermove', pointerMove);
  track.addEventListener('pointerup', pointerRelease);
  track.addEventListener('pointercancel', pointerRelease);
  track.addEventListener('lostpointercapture', pointerRelease);
  track.addEventListener('contextmenu', contextMenu);
  track.addEventListener('keydown', keyDown);
  track.addEventListener('keyup', keyUp);
  window.addEventListener('blur', blur);
  document.addEventListener('visibilitychange', visibilityChange);

  return () => {
    reset();
    track.removeEventListener('pointerdown', pointerDown);
    track.removeEventListener('pointermove', pointerMove);
    track.removeEventListener('pointerup', pointerRelease);
    track.removeEventListener('pointercancel', pointerRelease);
    track.removeEventListener('lostpointercapture', pointerRelease);
    track.removeEventListener('contextmenu', contextMenu);
    track.removeEventListener('keydown', keyDown);
    track.removeEventListener('keyup', keyUp);
    window.removeEventListener('blur', blur);
    document.removeEventListener('visibilitychange', visibilityChange);
  };
}

export function bindDirectionalJoystick(
  track: HTMLElement,
  setInput: (direction: JoystickInputDirection, pressed: boolean) => void,
  mode: JoystickInputMode = 'free',
): () => void {
  let previous = digitalJoystickState({ x: 0, y: 0 }, mode);
  return bindVirtualJoystick(track, vector => {
    const next = digitalJoystickState(vector, mode);
    (Object.keys(next) as JoystickInputDirection[]).forEach(direction => {
      if (next[direction] !== previous[direction]) setInput(direction, next[direction]);
    });
    previous = next;
  });
}

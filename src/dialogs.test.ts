import test from 'node:test';
import assert from 'node:assert/strict';
import { registerArcadeDialog, openArcadeDialog, closeArcadeDialog } from './dialogs.js';
import { DialogOrder, nextDialogFocus } from './dialogs.js';

test('help keeps the pending pause hidden; closing help reveals one pause', () => {
  const order = new DialogOrder();
  order.open('help', 70); order.open('pause', 10);
  assert.equal(order.active, 'help');
  order.open('settings', 80);
  assert.equal(order.active, 'settings');
  order.close('settings'); order.close('help');
  assert.equal(order.active, 'pause');
  order.close('pause'); assert.equal(order.active, null);
});
test('modal Tab and Shift+Tab cycle, including a focus outside the dialog', () => {
  const items = ['close', 'language', 'volume'];
  assert.equal(nextDialogFocus(items, 'volume', false), 'close');
  assert.equal(nextDialogFocus(items, 'close', true), 'volume');
  assert.equal(nextDialogFocus(items, 'background', false), 'close');
  assert.equal(nextDialogFocus(['only'], 'only', false), 'only');
  assert.equal(nextDialogFocus([], null, false), null);
});

test('dialog lifecycle contains focus, makes the background inert, handles Escape and restores focus', () => {
  class ElementStub {
    hidden = false; inert = false; isConnected = true; tabIndex = 0; disabled = false;
    children: ElementStub[] = []; parent: ElementStub | null = null;
    classList = { toggle() {} };
    constructor(readonly kind: 'body' | 'main' | 'overlay' | 'panel' | 'button') {}
    append(child: ElementStub): ElementStub { this.children.push(child); child.parent = this; return child; }
    contains(child: ElementStub): boolean { return child === this || this.children.some(item => item.contains(child)); }
    closest(): ElementStub | null { return this.hidden || this.inert ? this : this.parent?.closest() ?? null; }
    matches(): boolean { return this.disabled || this.tabIndex === -1; }
    getClientRects(): number[] { return this.closest() ? [] : [1]; }
    querySelector(): ElementStub | null { return this.children.find(child => child.kind === 'panel') ?? null; }
    querySelectorAll(): ElementStub[] { return this.children.filter(child => child.kind === 'button'); }
    focus(): void { doc.activeElement = this; }
  }
  const body = new ElementStub('body');
  const background = body.append(new ElementStub('main'));
  const previouslyInert = body.append(new ElementStub('main')); previouslyInert.inert = true;
  const trigger = background.append(new ElementStub('button'));
  const overlay = body.append(new ElementStub('overlay'));
  const panel = overlay.append(new ElementStub('panel'));
  const first = panel.append(new ElementStub('button'));
  const last = panel.append(new ElementStub('button'));
  const resultOverlay = body.append(new ElementStub('overlay'));
  const resultFocus = resultOverlay.append(new ElementStub('panel')).append(new ElementStub('button'));
  const doc = Object.assign(new EventTarget(), { body, activeElement: trigger });
  const win = new EventTarget();
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ document: doc, window: win, HTMLElement: ElementStub })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  const key = (name: string, shiftKey = false): void => {
    doc.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: name, shiftKey }));
  };
  try {
    registerArcadeDialog({ id: 'test-help', overlay: overlay as unknown as HTMLElement, priority: 70, dismiss: () => closeArcadeDialog('test-help') });
    registerArcadeDialog({ id: 'test-result', overlay: resultOverlay as unknown as HTMLElement, priority: 100, dismiss: () => closeArcadeDialog('test-result') });
    openArcadeDialog('test-help');
    assert.equal(doc.activeElement, first); assert.equal(background.inert, true);
    key('Tab', true); assert.equal(doc.activeElement, last);
    key('Tab'); assert.equal(doc.activeElement, first);
    openArcadeDialog('test-result');
    assert.equal(overlay.hidden, true); assert.equal(resultOverlay.hidden, false); assert.equal(doc.activeElement, resultFocus);
    key('Escape'); assert.equal(resultOverlay.hidden, true); assert.equal(doc.activeElement, first);
    key('Escape'); assert.equal(overlay.hidden, true); assert.equal(doc.activeElement, trigger);
    assert.equal(background.inert, false); assert.equal(previouslyInert.inert, true);
  } finally {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
    }
  }
});

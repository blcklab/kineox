import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKineox } from '../dist/core/index.js';
import { createKineoxBehaviorHost } from '../dist/extensions/index.js';
import { createKineoxTheme } from '../dist/theme/index.js';
import { createKineoxUIExtensionHost } from '../dist/ui/index.js';
import { FakeVideo } from './fake-video.mjs';

// DOM-free minimal element contract: verifies SSR safety and borrowed-style restoration.
function fakeElement() {
  const attrs = new Map();
  const props = new Map();
  const prios = new Map();
  const element = {
    nodeType: 1, dataset: {},
    style: {
      setProperty(name, value, priority = '') { props.set(name, value); prios.set(name, priority); },
      getPropertyValue(name) { return props.get(name) ?? ''; },
      getPropertyPriority(name) { return prios.get(name) ?? ''; },
      removeProperty(name) { props.delete(name); prios.delete(name); }
    },
    getAttribute(name) { return attrs.get(name) ?? null; },
    setAttribute(name, val) { attrs.set(name, val); if (name === 'data-kx-theme') element.dataset.kxTheme = val; },
    removeAttribute(name) { attrs.delete(name); if (name === 'data-kx-theme') delete element.dataset.kxTheme; }
  };
  return element;
}

test('M4: theme manager updates semantic tokens and restores borrowed inline CSS', () => {
  const el = fakeElement();
  el.setAttribute('data-kx-theme', 'light');
  el.style.setProperty('--kx-accent', 'salmon', 'important');
  const theme = createKineoxTheme(el, { theme: 'minimal', tokens: { accent: '#66ccff', focusRing: '#ffee00' } });
  assert.equal(el.dataset.kxTheme, 'minimal');
  assert.equal(el.style.getPropertyValue('--kx-accent'), '#66ccff');
  assert.equal(el.style.getPropertyValue('--kx-focus'), '#ffee00');
  theme.setTheme('system');
  theme.setTokens({ radius: '12px', accent: '' });
  assert.equal(el.style.getPropertyValue('--kx-accent'), '');
  assert.throws(() => theme.setTokens({ madeUp: 'x' }), /Invalid Kineox theme token/);
  assert.throws(() => theme.setTheme('unknown'), /Unsupported Kineox theme/);
  theme.destroy(); theme.destroy();
  assert.equal(el.getAttribute('data-kx-theme'), 'light');
  assert.equal(el.style.getPropertyValue('--kx-accent'), 'salmon');
  assert.equal(el.style.getPropertyPriority('--kx-accent'), 'important');
  assert.equal(el.style.getPropertyValue('--kx-radius'), '');
  assert.equal(el.style.getPropertyValue('--kx-focus'), '');
  assert.throws(() => theme.setTheme('dark'), /destroyed/);
});

test('M4: UI extensions use slots, reject duplicate IDs, teardown deterministically', () => {
  const order = [];
  const root = fakeElement();
  const nodes = [];
  const target = { append(node) { nodes.push(node); node.remove = () => { nodes.splice(nodes.indexOf(node), 1); }; } };
  const host = createKineoxUIExtensionHost('player', root, {}, {}, { 'toolbar-end': target });
  const a = host.use({ id: 'button-a', mount(ctx) {
    assert.equal(ctx.surface, 'player');
    ctx.append('toolbar-end', {nodeType:1});
    return () => order.push('a');
  }});
  assert.equal(nodes.length, 1);
  assert.throws(() => host.use({id:'button-a', mount(){}}), /Duplicate/);
  assert.throws(() => host.use({id:'bad',mount(ctx){ctx.append('actions', {nodeType:1});}}), /unavailable/);
  assert.equal(nodes.length, 1);
  host.use({ id:'button-b',mount(ctx){ctx.append('toolbar-end',{nodeType:1}); return () => order.push('b');}});
  host.destroy(); host.destroy(); a();
  assert.deepEqual(order, ['b','a']);
  assert.equal(nodes.length, 0);
  assert.throws(() => host.use({id:'late', mount(){}}), /after view destruction/);
});

test('M4: headless behaviors compose and detach when controller is destroyed', () => {
  const controller = createKineox(new FakeVideo());
  const host = createKineoxBehaviorHost(controller);
  const events = [];
  const off = host.use({ id:'analytics', setup(c) {const unsubscribe = c.subscribe(() => events.push('state')); return () => {unsubscribe(); events.push('dispose');};}});
  assert.throws(() => host.use({id:'analytics',setup(){}}), /Duplicate/);
  controller.destroy();
  assert.deepEqual(events, ['dispose']);
  off(); host.destroy();
  assert.throws(() => host.use({id:'other',setup(){}}), /destroyed/);
});

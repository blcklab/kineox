import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKineox, KineoxError } from '../dist/core/index.js';
import { FakeVideo, deferred, ranges } from './fake-video.mjs';

function hasCode(code) { return error => error instanceof KineoxError && error.code === code; }
async function setup(source = { src: '/a.mp4' }, opts = {}) {
  const element = new FakeVideo();
  const controller = createKineox(element, { ...opts });
  if (source) await controller.setSource(source);
  return { element, controller };
}

test('M1: creates a headless controller without CSS or UI DOM', async () => {
  const { element, controller } = await setup();
  assert.equal(controller.element, element);
  assert.equal(element.src, '/a.mp4');
  assert.equal(controller.getSnapshot().status, 'loading');
  assert.equal(element.nativeListenerCount > 0, true);
  controller.destroy();
});

test('M1: one controller per video, ownership is released on destroy', async () => {
  const { element, controller } = await setup();
  assert.throws(() => createKineox(element), hasCode('ELEMENT_IN_USE'));
  controller.destroy();
  const next = createKineox(element);
  next.destroy();
});

test('M1: snapshots are deeply frozen, referentially stable, and copied', async () => {
  const { element, controller } = await setup();
  const first = controller.getSnapshot();
  assert.equal(first, controller.getSnapshot());
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.source));
  assert.ok(Object.isFrozen(first.capabilities));
  element.ready();
  const second = controller.getSnapshot();
  assert.notEqual(first, second);
  assert.equal(second.status, 'ready');
  assert.equal(second.duration, 30);
  assert.ok(Object.isFrozen(second.seekable));
  assert.ok(Object.isFrozen(second.seekable[0]));
  element.seekable = ranges([0, 10]);
  assert.equal(controller.getSnapshot().seekable[0].end, 30);
  controller.destroy();
});

test('M1: subscriptions do not fire immediately; unsubscribe and errors isolate listeners', async () => {
  const { element, controller } = await setup();
  let count = 0;
  const offBad = controller.subscribe(() => { throw Error('outside app'); });
  const off = controller.subscribe(() => count++);
  assert.equal(count, 0);
  element.ready();
  assert.equal(count, 1);
  off(); offBad();
  element.currentTime = 4;
  element.dispatchEvent(new Event('timeupdate'));
  assert.equal(count, 1);
  controller.destroy();
});

test('M1: commands validate volume, speed, seek and mute', async () => {
  const { element, controller } = await setup();
  assert.throws(() => controller.seek(1), hasCode('SEEK_UNAVAILABLE'));
  element.ready();
  controller.seek(99);
  assert.equal(element.currentTime, 30);
  element.seekable = ranges([0, 5], [10, 15]);
  element.dispatchEvent(new Event('progress'));
  controller.seek(8.5);
  assert.equal(element.currentTime, 10);
  controller.setVolume(0.4); controller.setMuted(true); controller.setPlaybackRate(1.5);
  assert.equal(controller.getSnapshot().volume, 0.4);
  assert.equal(controller.getSnapshot().muted, true);
  assert.equal(controller.getSnapshot().playbackRate, 1.5);
  for (const input of [-0.1, 1.1, NaN, Infinity]) assert.throws(() => controller.setVolume(input), hasCode('INVALID_ARGUMENT'));
  for (const input of [0, -1, Infinity]) assert.throws(() => controller.setPlaybackRate(input), hasCode('INVALID_ARGUMENT'));
  controller.destroy();
});

test('M1: rapid A -> B -> C rejects stale attachments and disposes late resources', async () => {
  const delayed = [deferred(), deferred(), deferred()];
  let i = 0, disposed = 0;
  const fake = {
    id: 'delayed',
    canHandle: () => true,
    attach: () => delayed[i++].promise
  };
  const element = new FakeVideo();
  const controller = createKineox(element, { sourceAdapters: [fake] });
  const a = controller.setSource({ src: '/a.mp4', adapter: 'delayed' });
  const b = controller.setSource({ src: '/b.mp4', adapter: 'delayed' });
  const c = controller.setSource({ src: '/c.mp4', adapter: 'delayed' });
  await assert.rejects(a, hasCode('SOURCE_SUPERSEDED'));
  await assert.rejects(b, hasCode('SOURCE_SUPERSEDED'));
  delayed[0].resolve({ dispose: () => disposed++ });
  delayed[1].resolve({ dispose: () => disposed++ });
  delayed[2].resolve({ dispose: () => disposed++ });
  await c;
  await Promise.resolve();
  assert.equal(disposed, 2);
  assert.equal(controller.getSnapshot().source.src, '/c.mp4');
  assert.equal(controller.getSnapshot().sourceRevision, 3);
  controller.destroy();
  assert.equal(disposed, 3);
});

test('M1: source adapter explicitly absent or unsupported type rejects with stable code', async () => {
  const { element, controller } = await setup();
  await assert.rejects(controller.setSource({ src: 'x', adapter: 'missing' }), hasCode('SOURCE_UNSUPPORTED'));
  assert.equal(element.src, '/a.mp4');
  await assert.rejects(controller.setSource({ src: 'x', type: 'video/unsupported' }), hasCode('SOURCE_UNSUPPORTED'));
  assert.equal(controller.getSnapshot().source.src, '/a.mp4');
  controller.destroy();
});

test('M1: recoverable playback policy rejection fires typed event and remains usable', async () => {
  const { element, controller } = await setup();
  element.ready();
  let emitted = null;
  controller.on('autoplayblocked', e => emitted = e.code);
  element.onPlay = () => Promise.reject(Object.assign(new Error('gesture needed'), { name: 'NotAllowedError' }));
  await assert.rejects(controller.play(), hasCode('PLAYBACK_BLOCKED'));
  assert.equal(controller.getSnapshot().autoplayBlocked, true);
  assert.equal(controller.getSnapshot().status, 'ready');
  assert.equal(emitted, 'PLAYBACK_BLOCKED');
  element.onPlay = null;
  await controller.play();
  assert.equal(controller.getSnapshot().status, 'playing');
  assert.equal(controller.getSnapshot().autoplayBlocked, false);
  controller.destroy();
});

test('M1: play interrupted by source switch produces SOURCE_SUPERSEDED', async () => {
  const { element, controller } = await setup();
  const pending = deferred();
  element.onPlay = () => pending.promise;
  const play = controller.play();
  await controller.setSource({ src: '/next.mp4' });
  pending.reject(Object.assign(new Error('load aborted'), { name: 'AbortError' }));
  await assert.rejects(play, hasCode('SOURCE_SUPERSEDED'));
  assert.equal(controller.getSnapshot().error, null);
  controller.destroy();
});

test('M1: unrecoverable decoder error sets error state and emits normalized event', async () => {
  const { element, controller } = await setup();
  const errors = [];
  controller.on('error', e => errors.push(e.code));
  element.fail();
  assert.deepEqual(errors, ['MEDIA_ERROR']);
  assert.equal(controller.getSnapshot().status, 'error');
  controller.destroy();
});

test('M1: two independent elements have no cross-talk', async () => {
  const a = await setup({ src: '/a.mp4' });
  const b = await setup({ src: '/b.mp4' });
  a.element.ready(); b.element.ready();
  await a.controller.play();
  assert.equal(a.controller.getSnapshot().status, 'playing');
  assert.equal(b.controller.getSnapshot().status, 'ready');
  a.controller.destroy(); b.controller.destroy();
});

test('M1: destroy is idempotent and does not clear or remove borrowed media', async () => {
  const { element, controller } = await setup();
  const original = element.src;
  const listenersBefore = element.nativeListenerCount;
  let destroyed = 0;
  controller.on('destroy', () => destroyed++);
  controller.destroy(); controller.destroy();
  assert.equal(destroyed, 1);
  assert.ok(listenersBefore > 0);
  assert.equal(element.nativeListenerCount, 0);
  assert.equal(element.src, original);
  assert.throws(() => controller.pause(), hasCode('KINEOX_DESTROYED'));
  await assert.rejects(controller.play(), hasCode('KINEOX_DESTROYED'));
});

test('M1: destroy aborts unresolved source selection; late attachment gets disposed', async () => {
  const wait = deferred();
  let disposed = false;
  const { controller } = await setup(null, { sourceAdapters: [
    { id: 'custom', canHandle: () => true, attach: () => wait.promise }
  ] });
  const selection = controller.setSource({ src: '/still.mp4', adapter: 'custom' });
  controller.destroy();
  await assert.rejects(selection, hasCode('KINEOX_DESTROYED'));
  wait.resolve({ dispose: () => { disposed = true; } });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(disposed, true);
});

test('M1: native source selection null unloads; initial borrowed video source is respected', async () => {
  const element = new FakeVideo();
  element.src = '/preexisting.mp4';
  const controller = createKineox(element);
  assert.equal(controller.getSnapshot().source.src, '/preexisting.mp4');
  await controller.setSource(null);
  assert.equal(controller.getSnapshot().status, 'idle');
  assert.equal(element.getAttribute('src'), null);
  controller.destroy();
});

test('M1: fullscreen/PiP capability detection and methods', async () => {
  const { element, controller } = await setup();
  await controller.requestFullscreen();
  assert.equal(controller.getSnapshot().fullscreen, true);
  await controller.exitFullscreen();
  assert.equal(controller.getSnapshot().fullscreen, false);
  await controller.requestPictureInPicture();
  assert.equal(controller.getSnapshot().pictureInPicture, true);
  await controller.exitPictureInPicture();
  assert.equal(controller.getSnapshot().pictureInPicture, false);
  element.ownerDocument.pictureInPictureEnabled = false;
  await assert.rejects(controller.requestPictureInPicture(), hasCode('CAPABILITY_UNAVAILABLE'));
  controller.destroy();
});

test('M1: normalized snapshot preserves non-enumerable Error.message', async () => {
  const { element, controller } = await setup();
  element.fail();
  assert.equal(controller.getSnapshot().error.code, 'MEDIA_ERROR');
  assert.match(controller.getSnapshot().error.message, /Decoder error/);
  assert.ok(Object.isFrozen(controller.getSnapshot().error));
  controller.destroy();
});

test('M1: pending play rejects promptly when controller is destroyed', async () => {
  const { element, controller } = await setup();
  const pending = deferred();
  element.onPlay = () => pending.promise;
  const play = controller.play();
  controller.destroy();
  await assert.rejects(play, hasCode('KINEOX_DESTROYED'));
  pending.reject(Object.assign(new Error('Abort'), { name: 'AbortError' }));
});

test('M1: fullscreen wrapper contributes to media fullscreen snapshot', async () => {
  const { element, controller } = await setup();
  const wrapper = {
    contains: child => child === element,
    async requestFullscreen() {
      element.ownerDocument.fullscreenElement = wrapper;
      element.ownerDocument.dispatchEvent(new Event('fullscreenchange'));
    }
  };
  await controller.requestFullscreen(wrapper);
  assert.equal(controller.getSnapshot().fullscreen, true);
  await controller.exitFullscreen();
  assert.equal(controller.getSnapshot().fullscreen, false);
  controller.destroy();
});

test('M1: pending play rejects promptly on explicit pause', async () => {
  const { element, controller } = await setup();
  const pending = deferred();
  element.onPlay = () => pending.promise;
  const play = controller.play();
  controller.pause();
  await assert.rejects(play, hasCode('OPERATION_ABORTED'));
  pending.reject(Object.assign(new Error('paused'), { name: 'AbortError' }));
  controller.destroy();
});

test('M1: indefinite live duration is represented as null', async () => {
  const { element, controller } = await setup();
  element.ready(Infinity);
  assert.equal(controller.getSnapshot().duration, null);
  controller.destroy();
});

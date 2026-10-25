import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKineox } from '../dist/core/index.js';
import { FakeVideo, deferred } from './fake-video.mjs';

function code(expected) { return err => err?.code === expected; }

test('M5: repeatedly borrow/release same element without leaking native listeners', async () => {
  const video = new FakeVideo();
  video.src = '/existing.mp4';
  for (let i = 0; i < 300; i++) {
    const controller = createKineox(video);
    const off = controller.subscribe(() => {});
    controller.setMuted(i % 2 === 0);
    assert.throws(() => createKineox(video), code('ELEMENT_IN_USE'));
    off();controller.destroy();controller.destroy();
    assert.equal(video.nativeListenerCount, 0, `listener leak on cycle ${i}`);
    assert.equal(video.src, '/existing.mp4', 'destroy must not clear externally owned media');
  }
});

test('M5: media error recovery is possible through a subsequent source selection', async () => {
  const video = new FakeVideo();
  const controller = createKineox(video);
  await controller.setSource({src:'/broken.mp4'});
  video.fail();
  assert.equal(controller.getSnapshot().status, 'error');
  await controller.setSource({src:'/healthy.mp4'});
  video.ready();
  assert.equal(controller.getSnapshot().source.src, '/healthy.mp4');
  assert.equal(controller.getSnapshot().status, 'ready');
  assert.equal(controller.getSnapshot().error, null);
  controller.destroy();
});

test('M5: failed async adapter recovers without retaining a stale error', async () => {
  const video = new FakeVideo();
  const controller = createKineox(video, {sourceAdapters:[{
    id:'broken',canHandle:()=>true,
    attach:async()=>{throw new Error('Source attach failed');}
  }]});
  await assert.rejects(controller.setSource({src:'/broken',adapter:'broken'}),code('SOURCE_UNSUPPORTED'));
  assert.equal(controller.getSnapshot().status,'error');
  await controller.setSource({src:'/good.mp4',adapter:'native'});
  video.ready();
  assert.equal(controller.getSnapshot().status,'ready');
  controller.destroy();
});

test('M5: a cancelled play attempt can be followed by another valid play', async () => {
  const video = new FakeVideo();
  const controller = createKineox(video);
  await controller.setSource({src:'/clip.mp4'});
  video.ready();
  const blocked = deferred();
  video.onPlay=()=>blocked.promise;
  const attempt=controller.play();
  controller.pause();
  await assert.rejects(attempt,code('OPERATION_ABORTED'));
  video.onPlay=null;
  await controller.play();
  assert.equal(controller.getSnapshot().status,'playing');
  blocked.reject(Object.assign(new Error('Interrupted'), {name:'AbortError'}));
  controller.destroy();
});


test('M5: custom adapters can report errors from an internal media URL', async () => {
  const video = new FakeVideo();
  const controller = createKineox(video, {sourceAdapters:[{
    id:'mse',canHandle:()=>true,
    attach:async ({element})=>{element.src='blob:https://example.test/media-id';return {dispose(){}};}
  }]});
  await controller.setSource({src:'https://example.test/manifest.m3u8',adapter:'mse'});
  video.fail();
  assert.equal(controller.getSnapshot().status,'error');
  assert.equal(controller.getSnapshot().error.code,'MEDIA_ERROR');
  controller.destroy();
});

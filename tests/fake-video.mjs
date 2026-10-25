export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export function ranges(...spans) {
  return {
    length: spans.length,
    start: i => spans[i][0],
    end: i => spans[i][1]
  };
}

export class FakeDocument extends EventTarget {
  fullscreenEnabled = true;
  fullscreenElement = null;
  pictureInPictureEnabled = true;
  pictureInPictureElement = null;
  baseURI = 'https://example.test/';
  async exitFullscreen() { this.fullscreenElement = null; this.dispatchEvent(new Event('fullscreenchange')); }
  async exitPictureInPicture() { this.pictureInPictureElement = null; this.dispatchEvent(new Event('pictureinpicturechange')); }
}

export class FakeVideo extends EventTarget {
  nodeName = 'VIDEO';
  ownerDocument = new FakeDocument();
  attributes = new Map();
  currentSrc = '';
  readyState = 0;
  duration = Number.NaN;
  currentTime = 0;
  buffered = ranges();
  seekable = ranges();
  paused = true;
  muted = false;
  volume = 1;
  playbackRate = 1;
  ended = false;
  seeking = false;
  preload = 'metadata';
  error = null;
  disablePictureInPicture = false;
  textTracks = { length: 0 };
  onPlay = null;
  loads = 0;
  pauses = 0;
  nativeListenerCount = 0;

  set src(url) { this.attributes.set('src', url); this.currentSrc = new URL(url, this.ownerDocument.baseURI).href; }
  get src() { return this.attributes.get('src') ?? ''; }
  getAttribute(attr) { return this.attributes.get(attr) ?? null; }
  removeAttribute(attr) { this.attributes.delete(attr); if (attr === 'src') this.currentSrc = ''; }
  addEventListener(type, callback, options) { this.nativeListenerCount++; super.addEventListener(type, callback, options); }
  removeEventListener(type, callback, options) { this.nativeListenerCount--; super.removeEventListener(type, callback, options); }
  load() { this.loads++; this.readyState = 0; this.paused = true; this.ended = false; this.error = null; this.dispatchEvent(new Event('loadstart')); }
  canPlayType(type) { return type === 'video/unsupported' ? '' : 'maybe'; }
  async play() {
    if (this.onPlay) return this.onPlay();
    this.paused = false;
    this.readyState = 3;
    this.dispatchEvent(new Event('playing'));
  }
  pause() { this.pauses++; this.paused = true; this.dispatchEvent(new Event('pause')); }
  async requestFullscreen() { this.ownerDocument.fullscreenElement = this; this.ownerDocument.dispatchEvent(new Event('fullscreenchange')); }
  async requestPictureInPicture() { this.ownerDocument.pictureInPictureElement = this; this.dispatchEvent(new Event('enterpictureinpicture')); }
  contains(node) { return node === this; }
  ready(duration = 30) { this.readyState = 4; this.duration = duration; this.seekable = ranges([0, duration]); this.dispatchEvent(new Event('loadeddata')); }
  fail(code = 4) { this.error = { code, message: 'Decoder error' }; this.dispatchEvent(new Event('error')); }
}

globalThis.HTMLVideoElement = FakeVideo;

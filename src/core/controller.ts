import { asErrorMessage, errorName, kineoxError, KineoxError } from './errors.js';
import { collectSnapshot, snapshotChanged } from './snapshot.js';
import { nativeSourceAdapter } from '../sources/native.js';
import type {
  KineoxController, KineoxErrorInfo, KineoxEventMap, KineoxOptions,
  KineoxSnapshot, KineoxSource, KineoxSourceAdapter,
  KineoxSourceAttachment, KineoxStatus
} from './types.js';

const ownedElements = new WeakMap<HTMLVideoElement, NativeVideoController>();
const nativeEvents = [
  'loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough',
  'playing', 'play', 'pause', 'waiting', 'stalled', 'suspend', 'progress',
  'timeupdate', 'durationchange', 'ratechange', 'volumechange', 'seeking',
  'seeked', 'ended', 'emptied', 'error', 'enterpictureinpicture',
  'leavepictureinpicture'
] as const;

type Listener = (event: never) => void;

interface PendingSelection {
  readonly revision: number;
  readonly abort: AbortController;
  readonly reject: (reason: KineoxError) => void;
}

function ensureVideo(value: HTMLVideoElement): void {
  // Use the element's owning realm (iframe / same-origin embedded document).
  const ctor = value?.ownerDocument?.defaultView?.HTMLVideoElement ??
    (typeof HTMLVideoElement !== 'undefined' ? HTMLVideoElement : undefined);
  if (!ctor || !(value instanceof ctor)) {
    throw kineoxError('INVALID_ARGUMENT', 'createKineox requires a browser HTMLVideoElement.');
  }
}

function positiveFinite(value: number, name: string, allowZero: boolean): void {
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
    throw kineoxError('INVALID_ARGUMENT', `${name} must be ${allowZero ? 'a non-negative' : 'a positive'} finite number.`);
  }
}

function assertSource(value: KineoxSource): KineoxSource {
  if (!value || typeof value.src !== 'string' || !value.src.trim() ||
      (value.type !== undefined && (typeof value.type !== 'string' || !value.type.trim())) ||
      (value.adapter !== undefined && (typeof value.adapter !== 'string' || !value.adapter.trim()))) {
    throw kineoxError('INVALID_ARGUMENT', 'A video source needs a nonempty src, with optional nonempty type and adapter.');
  }
  // Avoid inherited values and caller mutation during source selection.
  return Object.freeze({ src: value.src, ...(value.type ? { type: value.type } : {}),
    ...(value.adapter ? { adapter: value.adapter } : {}) });
}

function chooseAdapter(
  source: KineoxSource, element: HTMLVideoElement,
  adapters: readonly KineoxSourceAdapter[]
): KineoxSourceAdapter {
  const all = [...adapters, nativeSourceAdapter];
  const named = source.adapter ? all.find(adapter => adapter.id === source.adapter) : undefined;
  if (source.adapter && !named) {
    throw kineoxError('SOURCE_UNSUPPORTED', `Source adapter "${source.adapter}" is not registered.`);
  }
  const adapter = named ?? all.find(candidate => candidate.canHandle(source, element));
  if (!adapter || !adapter.canHandle(source, element)) {
    throw kineoxError('SOURCE_UNSUPPORTED', `No source adapter accepts ${source.type ?? 'this media URL'}.`);
  }
  return adapter;
}

class NativeVideoController implements KineoxController {
  readonly element: HTMLVideoElement;
  private readonly doc: Document;
  private readonly adapters: readonly KineoxSourceAdapter[];
  private readonly subscriptions = new Set<() => void>();
  private readonly eventListeners = new Map<keyof KineoxEventMap, Set<Listener>>();
  private disposed = false;
  private source: KineoxSource | null;
  private activeAdapterId: string | null = null;
  private revision = 0;
  private wantsPlay = false;
  private hasPlayed = false;
  private isWaiting = false;
  private loadingSelection = false;
  private playbackAbort = new AbortController();
  private autoplayBlocked = false;
  private lastError: KineoxErrorInfo | null = null;
  private attachment: KineoxSourceAttachment | null = null;
  private pending: PendingSelection | null = null;
  private snapshot: Readonly<KineoxSnapshot>;

  constructor(element: HTMLVideoElement, options: KineoxOptions = {}) {
    this.element = element;
    this.doc = element.ownerDocument;
    this.adapters = options.sourceAdapters ? [...options.sourceAdapters] : [];
    const ids = new Set<string>(['native']);
    for (const adapter of this.adapters) {
      if (!adapter || typeof adapter.id !== 'string' || !adapter.id.trim() ||
          typeof adapter.canHandle !== 'function' || typeof adapter.attach !== 'function' || ids.has(adapter.id)) {
        throw kineoxError('INVALID_ARGUMENT', 'Source adapters must have unique IDs and the public adapter methods.');
      }
      ids.add(adapter.id);
    }
    if (options.preload !== undefined) {
      if (!['none', 'metadata', 'auto'].includes(options.preload)) {
        throw kineoxError('INVALID_ARGUMENT', 'preload must be none, metadata, or auto.');
      }
      element.preload = options.preload;
    }
    const existing = element.getAttribute('src') || element.currentSrc;
    this.source = existing ? Object.freeze({ src: existing }) : null;
    this.activeAdapterId = existing ? 'native' : null;
    this.snapshot = collectSnapshot(element, { status: this.currentStatus(), source: this.source,
      revision: this.revision, autoplayBlocked: false, error: null });
    for (const type of nativeEvents) element.addEventListener(type, this.handleNativeEvent);
    this.doc.addEventListener('fullscreenchange', this.publish);
    this.doc.addEventListener('pictureinpicturechange', this.publish);
    // M0 constructor is synchronous: selection runs immediately but does not wait for the network.
    if (options.source) void this.setSource(options.source).catch(() => {
      /* setSource publishes typed errors. A constructor cannot await it. */
    });
  }

  private readonly handleNativeEvent = (event: Event): void => {
    if (this.disposed) return;
    switch (event.type) {
      case 'playing': this.wantsPlay = true; this.hasPlayed = true;
        this.isWaiting = false; this.autoplayBlocked = false; break;
      case 'play': this.wantsPlay = true; break;
      case 'pause': this.wantsPlay = false; this.isWaiting = false; break;
      case 'waiting': case 'stalled': if (!this.element.paused || this.wantsPlay) this.isWaiting = true; break;
      case 'canplay': case 'canplaythrough': case 'loadeddata':
        this.isWaiting = false; break;
      case 'ended': this.wantsPlay = false; this.isWaiting = false; break;
      case 'error': {
        // An obsolete native error can arrive after src replacement. When known,
        // reject events from currentSrc that no longer match the active URL.
        if (!this.mediaURLMatchesSource()) return;
        const media = this.element.error;
        const normalized = kineoxError('MEDIA_ERROR',
          media?.message || `The browser could not load or decode the video (media code ${media?.code ?? 'unknown'}).`);
        this.lastError = normalized;
        this.emit('error', normalized);
        break;
      }
    }
    this.publish();
  };

  private mediaURLMatchesSource(): boolean {
    // External adapters may attach a blob/MSE URL different from the logical
    // source URL. URL comparison is only meaningful for our native adapter.
    if (this.activeAdapterId !== 'native') return true;
    const current = this.element.currentSrc;
    if (!current || !this.source) return true;
    try {
      return new URL(current, this.doc.baseURI).href === new URL(this.source.src, this.doc.baseURI).href;
    } catch { return true; }
  }

  private currentStatus(): KineoxStatus {
    if (!this.source) return 'idle';
    if (this.lastError) return 'error';
    if (this.loadingSelection) return 'loading';
    const el = this.element;
    if (el.ended) return 'ended';
    if (this.wantsPlay && (this.isWaiting || el.paused || el.readyState < 2)) return 'buffering';
    if (!el.paused && el.readyState >= 2) return 'playing';
    if (el.readyState < 2) return 'loading';
    return this.hasPlayed ? 'paused' : 'ready';
  }

  private readonly publish = (): void => {
    if (this.disposed) return;
    const next = collectSnapshot(this.element, {
      status: this.currentStatus(), source: this.source, revision: this.revision,
      autoplayBlocked: this.autoplayBlocked, error: this.lastError
    });
    if (!snapshotChanged(this.snapshot, next)) return;
    this.snapshot = next;
    for (const listener of [...this.subscriptions]) {
      try { listener(); } catch { /* Never let consumer callbacks break media state. */ }
    }
    this.emit('statechange', { snapshot: next });
  };

  private emit<T extends keyof KineoxEventMap>(type: T, payload: KineoxEventMap[T]): void {
    for (const listener of [...(this.eventListeners.get(type) ?? [])]) {
      try { listener(payload as never); } catch { /* Listener isolation. */ }
    }
  }

  private checkAlive(): void {
    if (this.disposed) throw kineoxError('KINEOX_DESTROYED', 'This Kineox controller was destroyed.');
  }

  getSnapshot(): Readonly<KineoxSnapshot> { return this.snapshot; }

  subscribe(listener: () => void): () => void {
    this.checkAlive();
    if (typeof listener !== 'function') throw kineoxError('INVALID_ARGUMENT', 'Expected a subscription callback.');
    this.subscriptions.add(listener);
    return () => { this.subscriptions.delete(listener); };
  }

  on<T extends keyof KineoxEventMap>(type: T, listener: (event: KineoxEventMap[T]) => void): () => void {
    this.checkAlive();
    if (!['statechange', 'sourcechange', 'error', 'autoplayblocked', 'destroy'].includes(type) ||
      typeof listener !== 'function') throw kineoxError('INVALID_ARGUMENT', 'Invalid Kineox event registration.');
    let listeners = this.eventListeners.get(type);
    if (!listeners) { listeners = new Set(); this.eventListeners.set(type, listeners); }
    const callback = listener as Listener;
    listeners.add(callback);
    return () => { listeners?.delete(callback); };
  }

  private cleanupAttachment(): void {
    const old = this.attachment;
    this.attachment = null;
    if (!old) return;
    try {
      Promise.resolve(old.dispose()).catch(() => { /* Cleanup errors cannot reanimate a controller. */ });
    } catch { /* Best-effort cleanup. */ }
  }

  async setSource(value: KineoxSource | null): Promise<void> {
    this.checkAlive();
    const source = value === null ? null : assertSource(value);
    // Validate selected source BEFORE invalidating a still-working attachment.
    let adapter: KineoxSourceAdapter | undefined;
    try {
      if (source) adapter = chooseAdapter(source, this.element, this.adapters);
    } catch (error) {
      const normalized = error instanceof KineoxError ? error :
        kineoxError('SOURCE_UNSUPPORTED', asErrorMessage(error), false, error);
      this.emit('error', normalized);
      throw normalized;
    }
    this.revision++;
    const revision = this.revision;
    const prior = this.pending;
    if (prior) {
      prior.abort.abort();
      prior.reject(kineoxError('SOURCE_SUPERSEDED', 'Source selection superseded by a newer source.', true));
      this.pending = null;
    }
    this.cleanupAttachment();
    this.playbackAbort.abort();
    this.playbackAbort = new AbortController();
    this.loadingSelection = source !== null;
    this.source = source;
    this.activeAdapterId = adapter?.id ?? null;
    this.lastError = null;
    this.autoplayBlocked = false;
    this.wantsPlay = false;
    this.hasPlayed = false;
    this.isWaiting = false;
    this.publish();
    this.emit('sourcechange', { source, sourceRevision: revision });

    if (!source) {
      this.element.removeAttribute('src');
      this.element.load();
      this.publish();
      return;
    }
    const abort = new AbortController();
    return new Promise<void>((resolve, reject) => {
      this.pending = { revision, abort, reject };
      // Async adapters must honor AbortSignal. Late completion is still disposed.
      let work: Promise<KineoxSourceAttachment>;
      try { work = Promise.resolve(adapter!.attach({ element: this.element, source, signal: abort.signal })); }
      catch (cause) { work = Promise.reject(cause); }
      work.then(attachment => {
        if (this.disposed || revision !== this.revision || abort.signal.aborted) {
          try { void Promise.resolve(attachment.dispose()).catch(() => {}); } catch { /* stale */ }
          return;
        }
        this.attachment = attachment;
        this.pending = null;
        this.loadingSelection = false;
        this.publish();
        resolve();
      }, cause => {
        if (revision !== this.revision || this.disposed) return;
        this.pending = null;
        this.loadingSelection = false;
        const normalized = cause instanceof KineoxError ? cause :
          kineoxError('SOURCE_UNSUPPORTED', `Could not attach video source: ${asErrorMessage(cause)}`, false, cause);
        this.lastError = normalized;
        this.emit('error', normalized);
        this.publish();
        reject(normalized);
      });
    });
  }

  async play(): Promise<void> {
    this.checkAlive();
    const revision = this.revision;
    if (!this.source) throw kineoxError('SOURCE_UNSUPPORTED', 'No video source is selected.');
    this.wantsPlay = true;
    this.autoplayBlocked = false;
    this.publish();
    const signal = this.playbackAbort.signal;
    let cancel!: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      cancel = () => reject(kineoxError('OPERATION_ABORTED', 'Playback attempt was cancelled.', true));
      if (signal.aborted) cancel();
      else signal.addEventListener('abort', cancel, { once: true });
    });
    try {
      // Call play synchronously so a trusted click's user activation is preserved.
      let nativePlay: Promise<void>;
      try { nativePlay = Promise.resolve(this.element.play()); }
      catch (cause) { nativePlay = Promise.reject(cause); }
      await Promise.race([nativePlay, cancelled]);
      if (this.disposed) throw kineoxError('KINEOX_DESTROYED', 'Controller destroyed while starting playback.');
      if (revision !== this.revision) throw kineoxError('SOURCE_SUPERSEDED', 'Playback source changed.', true);
      this.publish();
    } catch (cause) {
      if (this.disposed) throw kineoxError('KINEOX_DESTROYED', 'Controller destroyed while starting playback.', false, cause);
      if (revision !== this.revision) throw kineoxError('SOURCE_SUPERSEDED', 'Playback was cancelled by source replacement.', true, cause);
      if (cause instanceof KineoxError) throw cause;
      const name = errorName(cause);
      if (name === 'NotAllowedError') {
        this.wantsPlay = false;
        this.autoplayBlocked = true;
        const error = kineoxError('PLAYBACK_BLOCKED', 'Playback requires user activation or permission.', true, cause);
        this.emit('autoplayblocked', error);
        this.emit('error', error);
        this.publish();
        throw error;
      }
      if (name === 'AbortError') {
        this.wantsPlay = false;
        this.publish();
        throw kineoxError('OPERATION_ABORTED', 'Playback attempt was interrupted.', true, cause);
      }
      const unsupported = name === 'NotSupportedError';
      const error = kineoxError(unsupported ? 'SOURCE_UNSUPPORTED' : 'MEDIA_ERROR',
        `Playback failed: ${asErrorMessage(cause)}`, false, cause);
      this.wantsPlay = false;
      this.lastError = error;
      this.emit('error', error);
      this.publish();
      throw error;
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  }

  pause(): void {
    this.checkAlive();
    this.wantsPlay = false;
    this.isWaiting = false;
    // Cancel a pending playback attempt even if the browser never settles play().
    this.playbackAbort.abort();
    this.playbackAbort = new AbortController();
    this.element.pause();
    this.publish();
  }

  seek(seconds: number): void {
    this.checkAlive();
    positiveFinite(seconds, 'Seek time', true);
    const ranges = this.snapshot.seekable;
    if (!ranges.length) throw kineoxError('SEEK_UNAVAILABLE', 'No seekable range is available yet.', true);
    let nearest = ranges[0]!.start;
    let distance = Infinity;
    for (const range of ranges) {
      const candidate = Math.max(range.start, Math.min(range.end, seconds));
      const delta = Math.abs(candidate - seconds);
      if (delta < distance) { distance = delta; nearest = candidate; }
    }
    this.element.currentTime = nearest;
    this.publish();
  }

  setVolume(volume: number): void {
    this.checkAlive();
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
      throw kineoxError('INVALID_ARGUMENT', 'Volume must be a finite number from 0 to 1.');
    }
    this.element.volume = volume;
    this.publish();
  }

  setMuted(muted: boolean): void {
    this.checkAlive();
    if (typeof muted !== 'boolean') throw kineoxError('INVALID_ARGUMENT', 'Muted must be a boolean.');
    this.element.muted = muted;
    this.publish();
  }

  setPlaybackRate(rate: number): void {
    this.checkAlive();
    positiveFinite(rate, 'Playback rate', false);
    try { this.element.playbackRate = rate; }
    catch (cause) { throw kineoxError('INVALID_ARGUMENT', 'This playback rate is not supported.', true, cause); }
    this.publish();
  }

  async requestFullscreen(target: HTMLElement = this.element): Promise<void> {
    this.checkAlive();
    if (target !== this.element && !target.contains(this.element)) {
      throw kineoxError('TARGET_MISMATCH', 'Fullscreen target must contain the controlled video.');
    }
    if (!this.doc.fullscreenEnabled || typeof target.requestFullscreen !== 'function') {
      throw kineoxError('CAPABILITY_UNAVAILABLE', 'Fullscreen is not supported in this context.', true);
    }
    try { await target.requestFullscreen(); this.publish(); }
    catch (cause) { throw kineoxError('CAPABILITY_UNAVAILABLE', 'Fullscreen request was denied.', true, cause); }
  }

  async exitFullscreen(): Promise<void> {
    this.checkAlive();
    const current = this.doc.fullscreenElement;
    if (!current || (current !== this.element && !current.contains(this.element))) return;
    if (typeof this.doc.exitFullscreen !== 'function') {
      throw kineoxError('CAPABILITY_UNAVAILABLE', 'Cannot exit fullscreen.', true);
    }
    try { await this.doc.exitFullscreen(); this.publish(); }
    catch (cause) { throw kineoxError('CAPABILITY_UNAVAILABLE', 'Exiting fullscreen failed.', true, cause); }
  }

  async requestPictureInPicture(): Promise<void> {
    this.checkAlive();
    if (!this.doc.pictureInPictureEnabled || this.element.disablePictureInPicture ||
        typeof this.element.requestPictureInPicture !== 'function') {
      throw kineoxError('CAPABILITY_UNAVAILABLE', 'Picture-in-picture is unavailable.', true);
    }
    try { await this.element.requestPictureInPicture(); this.publish(); }
    catch (cause) { throw kineoxError('CAPABILITY_UNAVAILABLE', 'Picture-in-picture request was denied.', true, cause); }
  }

  async exitPictureInPicture(): Promise<void> {
    this.checkAlive();
    if (this.doc.pictureInPictureElement !== this.element) return;
    if (typeof this.doc.exitPictureInPicture !== 'function') {
      throw kineoxError('CAPABILITY_UNAVAILABLE', 'Cannot exit picture-in-picture.', true);
    }
    try { await this.doc.exitPictureInPicture(); this.publish(); }
    catch (cause) { throw kineoxError('CAPABILITY_UNAVAILABLE', 'Exiting picture-in-picture failed.', true, cause); }
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.playbackAbort.abort();
    if (this.pending) {
      this.pending.abort.abort();
      this.pending.reject(kineoxError('KINEOX_DESTROYED', 'Destroyed while selecting a source.'));
      this.pending = null;
    }
    this.cleanupAttachment();
    for (const type of nativeEvents) this.element.removeEventListener(type, this.handleNativeEvent);
    this.doc.removeEventListener('fullscreenchange', this.publish);
    this.doc.removeEventListener('pictureinpicturechange', this.publish);
    ownedElements.delete(this.element);
    this.emit('destroy', { element: this.element });
    this.subscriptions.clear();
    this.eventListeners.clear();
  }
}

/** Create a headless Kineox controller. No UI is created or DOM element removed. */
export function createKineox(element: HTMLVideoElement, options: KineoxOptions = {}): KineoxController {
  ensureVideo(element);
  if (ownedElements.has(element)) throw kineoxError('ELEMENT_IN_USE', 'This video already has a live Kineox controller.');
  const controller = new NativeVideoController(element, options);
  ownedElements.set(element, controller);
  return controller;
}

import { createKineox, KineoxError } from '../core/index.js';
import type { KineoxController, KineoxSnapshot } from '../core/index.js';
import type { KineoxShowcase, KineoxShowcaseOptions, KineoxShowcaseFrame } from './types.js';
import { createKineoxTheme } from '../theme/index.js';
import { createKineoxUIExtensionHost } from '../ui/index.js';

const ratios = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/;
const frames: readonly KineoxShowcaseFrame[] = ['none', 'borderless', 'minimal', 'glass', 'browser', 'device', 'floating', 'cinematic'];
const focusQuery = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
const expandedByDocument = new WeakMap<Document, KineoxShowcase>();

function make<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className: string): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  el.className = className;
  return el;
}
function targetElement(target: HTMLElement | string): HTMLElement {
  if (typeof target === 'string' && typeof document === 'undefined') throw new TypeError('Kineox Showcase requires a document to mount.');
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  const ctor = el?.ownerDocument?.defaultView?.HTMLElement ??
    (typeof HTMLElement !== 'undefined' ? HTMLElement : undefined);
  if (!ctor || !(el instanceof ctor)) throw new TypeError('Showcase target must be an HTML element.');
  return el;
}
function assertOptions(options: KineoxShowcaseOptions): void {
  if (options.mode && !['showcase', 'ambient'].includes(options.mode)) throw new TypeError('Unknown showcase mode.');
  const p = options.presentation;
  if (p?.frame && !frames.includes(p.frame)) throw new TypeError('Unknown showcase frame.');
  if (p?.radius && !['none', 'sm', 'md', 'lg', 'xl'].includes(p.radius)) throw new TypeError('Unknown showcase radius.');
  if (p?.fit && !['contain', 'cover'].includes(p.fit)) throw new TypeError('Unknown showcase object fit.');
  if (p?.aspectRatio) {
    const m = ratios.exec(p.aspectRatio);
    if (!m || Number(m[1]) <= 0 || Number(m[2]) <= 0) throw new TypeError('aspectRatio needs positive width/height.');
  }
  if (options.interaction?.posterClick && !['expand', 'play'].includes(options.interaction.posterClick)) {
    throw new TypeError('Unknown showcase poster click action.');
  }
  if (options.interaction?.controls && !['auto', 'always'].includes(options.interaction.controls)) {
    throw new TypeError('Unknown showcase controls visibility.');
  }
  if (options.interaction?.idleDelayMs !== undefined &&
    (!Number.isFinite(options.interaction.idleDelayMs) || options.interaction.idleDelayMs < 0 || options.interaction.idleDelayMs > 30000)) {
    throw new TypeError('idleDelayMs must be between 0 and 30000.');
  }
  if (options.interaction?.posterClick === 'expand' && (options.expand?.enabled === false || options.mode === 'ambient')) {
    throw new TypeError('Showcase posterClick expand requires expansion to be enabled.');
  }
  if (options.preview?.mode && !['manual', 'viewport', 'hover'].includes(options.preview.mode)) {
    throw new TypeError('Unknown preview mode.');
  }
  if (options.preview?.threshold !== undefined && (!Number.isFinite(options.preview.threshold) || options.preview.threshold < 0 || options.preview.threshold > 1)) {
    throw new TypeError('Intersection threshold must be between 0 and 1.');
  }
  if (options.controller && (options.source || options.poster !== undefined || options.preload !== undefined)) {
    throw new TypeError('Injected controllers own source, preload and poster; configure the video directly.');
  }
  if (!options.controller && !options.source) throw new TypeError('Showcase needs a source or an injected controller.');
  if (options.source && (!options.source.src || !options.source.src.trim())) throw new TypeError('Showcase source must have a nonempty URL.');
}
function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const rounded = Math.floor(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = `${rounded % 60}`.padStart(2, '0');
  return `${minutes}:${remainder}`;
}
function icon(name: 'play' | 'pause' | 'expand' | 'close' | 'sound' | 'mute'): string {
  const paths: Record<typeof name, string> = {
    play: '<path d="m9 6 10 6-10 6V6Z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M8 5h3v14H8zM14 5h3v14h-3z" fill="currentColor" stroke="none"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    close: '<path d="M5 5l14 14M19 5 5 19"/>',
    sound: '<path d="M4 9h4l5-4v14l-5-4H4zM17 9a4 4 0 0 1 0 6"/>',
    mute: '<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6m0-6-5 6"/>'
  };
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}
function button(doc: Document, klass: string, title: string, glyph: Parameters<typeof icon>[0]): HTMLButtonElement {
  const el = make(doc, 'button', `kx-showcase__button ${klass}`);
  el.type = 'button'; el.setAttribute('aria-label', title); el.title = title;
  el.innerHTML = icon(glyph);
  return el;
}

/**
 * Poster-first cinematic preview that owns no UI dependencies other than its opt-in CSS.
 * Expanding uses the *same* video/controller; no video reparenting or secondary player.
 */
export function mountShowcase(target: HTMLElement | string, options: KineoxShowcaseOptions): KineoxShowcase {
  assertOptions(options);
  const host = targetElement(target);
  const doc = host.ownerDocument;
  const borrowed = options.controller !== undefined;
  const ambient = options.mode === 'ambient';
  const previewMode = options.preview?.mode ?? (ambient ? 'viewport' : 'manual');
  const expansionEnabled = options.expand?.enabled ?? !ambient;
  const posterClick = options.interaction?.posterClick ?? (expansionEnabled ? 'expand' : 'play');
  const autoControls = options.interaction?.controls !== 'always';
  const idleDelayMs = options.interaction?.idleDelayMs ?? 2400;
  const frame = options.presentation?.frame ?? (ambient ? 'none' : 'browser');
  const savedHost = borrowed ? {
    role: host.getAttribute('role'), label: host.getAttribute('aria-label'), tab: host.getAttribute('tabindex'),
    theme: host.getAttribute('data-kx-theme'), frame: host.getAttribute('data-kx-frame'),
    radius: host.getAttribute('data-kx-radius'), fit: host.getAttribute('data-kx-fit'), mode: host.getAttribute('data-kx-mode'), aspect: host.style.getPropertyValue('--kx-showcase-aspect')
  } : null;
  let root: HTMLElement;
  let video: HTMLVideoElement;
  let controller: KineoxController;
  if (borrowed) {
    controller = options.controller!;
    video = controller.element;
    if (!host.contains(video)) throw new KineoxError('TARGET_MISMATCH', 'Injected controller video must already be within the showcase target.', false);
    if (host.classList.contains('kx-showcase') || host.classList.contains('kx-player')) {
      throw new TypeError('A Kineox view is already mounted on this borrowed element.');
    }
    root = host;
  } else {
    root = make(doc, 'section', 'kx-showcase');
    video = make(doc, 'video', 'kx-showcase__video');
    video.playsInline = true;
    video.preload = options.preload ?? 'none';
    video.autoplay = false;
    video.controls = false;
    if (options.poster) video.poster = options.poster;
    controller = createKineox(video, { preload: options.preload ?? 'none' });
  }
  const formerVideoClass = video.classList.contains('kx-showcase__video');
  const previousVideo = { muted: video.muted, loop: video.loop, controls: video.controls, playsInline: video.playsInline };
  root.classList.add('kx-showcase');
  root.dataset.kxFrame = frame;
  root.dataset.kxMode = ambient ? 'ambient' : 'showcase';
  root.dataset.kxTheme = options.theme ?? 'dark';
  const themeManager = createKineoxTheme(root, {
    ...(options.theme !== undefined ? { theme: options.theme } : {}),
    ...(options.themeTokens !== undefined ? { tokens: options.themeTokens } : {})
  });
  // Use restrained defaults for minimal treatments without changing legacy frame defaults.
  root.dataset.kxRadius = options.presentation?.radius ?? (frame === 'minimal' ? 'sm' : frame === 'cinematic' ? 'md' : 'lg');
  root.dataset.kxFit = options.presentation?.fit ?? (ambient ? 'cover' : 'contain');
  root.style.setProperty('--kx-showcase-aspect', options.presentation?.aspectRatio ?? '16/9');
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', options.title ? `Video showcase: ${options.title}` : 'Video showcase');
  root.tabIndex = root.hasAttribute('tabindex') ? root.tabIndex : -1;
  video.classList.add('kx-showcase__video');
  video.playsInline = true;
  video.controls = false;
  const motionQuery = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)');
  let prefersReducedMotion = motionQuery?.matches ?? false;
  const preMuted = true;
  const preLoop = options.preview?.loop !== false;
  video.muted = preMuted;
  video.loop = preLoop;

  const frameEl = make(doc, 'div', 'kx-showcase__frame');
  const chrome = make(doc, 'div', 'kx-showcase__chrome');
  chrome.setAttribute('aria-hidden', 'true');
  chrome.innerHTML = '<span></span><span></span><span></span><i></i>';
  const stage = make(doc, 'div', 'kx-showcase__stage');
  const launch = make(doc, 'button', 'kx-showcase__poster');
  launch.type = 'button'; launch.setAttribute('aria-label', posterClick === 'expand' ? 'Open and play video' : 'Play video inline');
  if (options.poster || video.poster) {
    const image = make(doc, 'img', 'kx-showcase__poster-image');
    image.src = options.poster ?? video.poster;
    image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
    launch.append(image);
  }
  const playBadge = make(doc, 'span', 'kx-showcase__poster-play');
  playBadge.innerHTML = icon('play'); playBadge.setAttribute('aria-hidden', 'true');
  launch.append(playBadge);
  // Ambient media is decorative: the poster is a noninteractive fallback, not a hidden button.
  if (ambient) {
    launch.tabIndex = -1;
    launch.setAttribute('aria-hidden', 'true');
  }
  const actions = make(doc, 'div', 'kx-showcase__actions');
  const expandButton = button(doc, 'kx-showcase__open', 'Expand video', 'expand');
  const pausePreview = button(doc, 'kx-showcase__pause-preview', posterClick === 'play' ? 'Pause video' : 'Pause preview', 'pause');
  const inlineSound = button(doc, 'kx-showcase__inline-sound', 'Unmute video', 'mute');
  actions.append(pausePreview);
  if (posterClick === 'play' && !ambient) actions.append(inlineSound);
  if (expansionEnabled) actions.append(expandButton);
  const controls = make(doc, 'div', 'kx-showcase__expanded-controls');
  const toggle = button(doc, 'kx-showcase__toggle', 'Play video', 'play');
  const sound = button(doc, 'kx-showcase__sound', 'Unmute video', 'mute');
  const seek = make(doc, 'input', 'kx-showcase__seek');
  seek.type = 'range'; seek.min = '0'; seek.max = '1000'; seek.step = 'any'; seek.value = '0';
  seek.setAttribute('aria-label', 'Seek video');
  const duration = make(doc, 'span', 'kx-showcase__time'); duration.textContent = '0:00 / 0:00';
  const close = button(doc, 'kx-showcase__close', 'Close expanded video', 'close');
  controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Expanded video controls');
  controls.append(toggle, sound, seek, duration, close);
  const status = make(doc, 'div', 'kx-showcase__status');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.hidden = true;

  // Keep borrowed video at its original DOM position; inserted siblings are removable.
  if (borrowed) {
    video.after(launch, actions, controls, status);
    root.append(chrome);
    root.classList.add('kx-showcase--borrowed');
  } else {
    stage.append(video, launch, actions, controls, status);
    frameEl.append(chrome, stage);
    root.append(frameEl);
    host.append(root);
  }

  const extensionHost = createKineoxUIExtensionHost('showcase', root, video, controller, {
    overlay: borrowed ? root : stage, actions, 'expanded-controls': controls
  });
  let destroyed = false;
  let controllerAlive = true;
  let expanded = false;
  let activePreview = false;
  let visible = false;
  let hover = false;
  let userPausedPreview = false;
  let sourcePromise: Promise<void> | null = null;
  let operationId = 0;
  let observer: IntersectionObserver | null = null;
  let focusBefore: Element | null = null;
  let scrollBefore = '';
  let inertRecords: Array<{ element: HTMLElement; old: boolean }> = [];
  let popoverUsed = false;
  const view = doc.defaultView;
  let controlsTimer: ReturnType<typeof setTimeout> | null = null;
  let keyboardNavigation = false;
  let controlsVisible = true;
  root.dataset.kxControls = 'visible';
  function clearControlsTimer() {
    if (controlsTimer !== null) { (view?.clearTimeout ?? clearTimeout)(controlsTimer); controlsTimer = null; }
  }
  function keyboardHasControlFocus() {
    return keyboardNavigation && (controls.contains(doc.activeElement) || actions.contains(doc.activeElement) || doc.activeElement === root);
  }
  function setControlsVisible(visible: boolean) {
    if (controlsVisible === visible) return;
    controlsVisible = visible;
    root.dataset.kxControls = visible ? 'visible' : 'hidden';
  }
  function scheduleControlsHide(delay = idleDelayMs) {
    clearControlsTimer();
    if (destroyed || !autoControls || video.paused || keyboardHasControlFocus()) return;
    controlsTimer = (view?.setTimeout ?? setTimeout)(() => {
      controlsTimer = null;
      if (!destroyed && !video.paused && !keyboardHasControlFocus()) setControlsVisible(false);
    }, delay);
  }
  function wakeControls() { setControlsVisible(true); scheduleControlsHide(); }
  const cleanups: Array<() => void> = [];
  const listen = (el: EventTarget, event: string, handler: EventListener, capture = false) => {
    el.addEventListener(event, handler, capture);
    cleanups.push(() => el.removeEventListener(event, handler, capture));
  };
  function assertAlive() {
    if (destroyed) throw new KineoxError('KINEOX_DESTROYED', 'Kineox Showcase was destroyed.', false);
  }
  function errorMessage(error: unknown) {
    if (destroyed) return;
    if (error instanceof KineoxError && ['PLAYBACK_BLOCKED', 'OPERATION_ABORTED', 'SOURCE_SUPERSEDED'].includes(error.code)) return;
    status.hidden = false;
    status.textContent = error instanceof Error ? error.message : 'Video could not be played.';
  }
  async function ensureSource() {
    if (borrowed || !options.source) return;
    if (!sourcePromise) {
      sourcePromise = controller.setSource(options.source).catch((e: unknown) => {
        sourcePromise = null;
        throw e;
      });
    }
    await sourcePromise;
  }
  let previousPlaying: boolean | null = null;
  function refresh(snapshot: Readonly<KineoxSnapshot>) {
    if (destroyed) return;
    const playing = !snapshot.paused && snapshot.status !== 'ended';
    root.dataset.kxPlaying = String(playing);
    if (previousPlaying !== playing) {
      previousPlaying = playing;
      setControlsVisible(true);
      if (playing) scheduleControlsHide(); else clearControlsTimer();
    }
    launch.hidden = playing || expanded;
    pausePreview.hidden = !playing || expanded;
    inlineSound.hidden = !playing || expanded;
    inlineSound.innerHTML = icon(snapshot.muted ? 'mute' : 'sound');
    inlineSound.setAttribute('aria-label', snapshot.muted ? 'Unmute video' : 'Mute video');
    toggle.innerHTML = icon(playing ? 'pause' : 'play');
    toggle.setAttribute('aria-label', playing ? 'Pause video' : 'Play video');
    sound.innerHTML = icon(snapshot.muted ? 'mute' : 'sound');
    sound.setAttribute('aria-label', snapshot.muted ? 'Unmute video' : 'Mute video');
    const usable = snapshot.duration !== null && snapshot.duration > 0 && snapshot.capabilities.seeking;
    seek.disabled = !usable;
    if (!seek.matches(':active')) seek.value = usable ? String(1000 * snapshot.currentTime / snapshot.duration!) : '0';
    duration.textContent = `${clock(snapshot.currentTime)} / ${snapshot.duration === null ? 'LIVE' : clock(snapshot.duration)}`;
    if (snapshot.status === 'error' && snapshot.error) errorMessage(snapshot.error);
  }
  const off = controller.subscribe(() => refresh(controller.getSnapshot()));
  const offControllerDestroy = controller.on('destroy', () => {
    controllerAlive = false;
    destroy();
  });
  refresh(controller.getSnapshot());

  async function startPreview() {
    if (destroyed || expanded || userPausedPreview || prefersReducedMotion || doc.hidden || (previewMode === 'viewport' && !visible) || (previewMode === 'hover' && !hover)) return;
    const ticket = ++operationId;
    try {
      await ensureSource();
      if (destroyed || expanded || operationId !== ticket) return;
      activePreview = true;
      video.loop = preLoop; controller.setMuted(true);
      await controller.play();
    } catch (error) {
      if (ticket === operationId) activePreview = false;
      errorMessage(error);
    }
  }
  function stopPreview() {
    ++operationId;
    if (activePreview && !expanded) controller.pause();
    activePreview = false;
  }
  async function play() {
    assertAlive();
    userPausedPreview = false;
    const ticket = ++operationId;
    await ensureSource();
    if (destroyed || operationId !== ticket) return;
    await controller.play();
  }
  function pause() {
    assertAlive();
    ++operationId;
    userPausedPreview = true;
    activePreview = false;
    controller.pause();
  }
  function inertOutside() {
    let node: HTMLElement = root;
    while (node.parentElement) {
      const parent = node.parentElement;
      for (const sibling of parent.children) {
        const ctor = doc.defaultView?.HTMLElement ?? HTMLElement;
        if (sibling === node || !(sibling instanceof ctor)) continue;
        inertRecords.push({ element: sibling, old: sibling.inert });
        sibling.inert = true;
      }
      node = parent;
    }
  }
  function releaseInert() {
    for (const rec of inertRecords) rec.element.inert = rec.old;
    inertRecords = [];
  }
  async function expand() {
    assertAlive();
    if (!expansionEnabled) return;
    if (expanded) return;
    expandedByDocument.get(doc)?.collapse();
    const ticket = ++operationId;
    focusBefore = doc.activeElement;
    expanded = true; activePreview = false;
    expandedByDocument.set(doc, api);
    root.classList.add('kx-showcase--expanded');
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', options.title ? `Expanded video: ${options.title}` : 'Expanded video');
    launch.hidden = true; pausePreview.hidden = true;
    setControlsVisible(true);
    scheduleControlsHide();
    scrollBefore = doc.body.style.overflow;
    doc.body.style.overflow = 'hidden';
    // Manual popover promotes this *existing* node to the top layer; nothing gets reparented.
    try {
      if (typeof root.showPopover === 'function') {
        root.setAttribute('popover', 'manual');
        root.showPopover();
        popoverUsed = true;
      }
    } catch { root.removeAttribute('popover'); popoverUsed = false; }
    inertOutside();
    // Focus the dialog container so its controls may auto-hide without hiding a focused button.
    // Tab from the container reveals controls before moving focus into them.
    root.focus({ preventScroll: true });
    video.loop = false;
    try {
      await ensureSource();
      if (!destroyed && expanded && ticket === operationId && options.expand?.autoplay !== false) {
        await controller.play();
      }
    } catch (error) { errorMessage(error); }
  }
  function collapse() {
    if (!expanded) return;
    ++operationId;
    expanded = false;
    clearControlsTimer();
    setControlsVisible(true);
    if (expandedByDocument.get(doc) === api) expandedByDocument.delete(doc);
    // An externally destroyed borrowed controller must not prevent overlay teardown.
    if (controllerAlive) {
      try { controller.pause(); } catch { /* Already disposed externally. */ }
    }
    if (popoverUsed) {
      try { root.hidePopover(); } catch { /* Element might have been hidden by host. */ }
      popoverUsed = false;
      root.removeAttribute('popover');
    }
    root.classList.remove('kx-showcase--expanded');
    root.removeAttribute('aria-modal');
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', options.title ? `Video showcase: ${options.title}` : 'Video showcase');
    doc.body.style.overflow = scrollBefore;
    releaseInert();
    video.loop = preLoop;
    if (controllerAlive) {
      try { controller.setMuted(true); } catch { /* Already disposed externally. */ }
    }
    if (focusBefore && focusBefore instanceof (doc.defaultView?.HTMLElement ?? HTMLElement) && focusBefore.isConnected) focusBefore.focus();
    focusBefore = null;
    if (!destroyed && previewMode === 'viewport' && visible && !userPausedPreview) void startPreview();
    else if (!destroyed && previewMode === 'hover' && hover && !userPausedPreview) void startPreview();
    else refresh(controller.getSnapshot());
  }
  const api: KineoxShowcase = {
    element: root, video, controller,
    get expanded() { return expanded; },
    expand, collapse, play, pause,
    setTheme: themeManager.setTheme, setThemeTokens: themeManager.setTokens,
    use: extensionHost.use, destroy
  };

  // All listener registrations come after the synchronous API and DOM setup.
  listen(launch, 'click', () => {
    if (posterClick === 'expand') void expand();
    else void play().catch(errorMessage);
  });
  listen(root, 'pointermove', () => { keyboardNavigation = false; wakeControls(); });
  listen(root, 'pointerenter', () => { keyboardNavigation = false; wakeControls(); });
  listen(root, 'pointerleave', () => { if (!keyboardHasControlFocus()) scheduleControlsHide(120); });
  listen(root, 'pointerdown', () => { keyboardNavigation = false; wakeControls(); });
  listen(root, 'keydown', e => {
    const k = e as KeyboardEvent;
    if (k.key === 'Tab' || k.key.startsWith('Arrow')) {
      keyboardNavigation = true; setControlsVisible(true); clearControlsTimer();
    }
  });
  listen(root, 'focusin', () => {
    if (keyboardNavigation) { setControlsVisible(true); clearControlsTimer(); }
  });
  listen(root, 'focusout', () => {
    (view?.setTimeout ?? setTimeout)(() => { if (!destroyed && !keyboardHasControlFocus()) scheduleControlsHide(); }, 0);
  });
  listen(seek, 'pointerdown', () => { clearControlsTimer(); setControlsVisible(true); });
  listen(seek, 'pointerup', wakeControls);
  listen(expandButton, 'click', () => { void expand(); });
  listen(pausePreview, 'click', pause);
  listen(inlineSound, 'click', () => controller.setMuted(!controller.getSnapshot().muted));
  listen(toggle, 'click', () => {
    if (controller.getSnapshot().paused) void play().catch(errorMessage);
    else pause();
  });
  listen(sound, 'click', () => controller.setMuted(!controller.getSnapshot().muted));
  listen(close, 'click', collapse);
  listen(seek, 'input', () => {
    const state = controller.getSnapshot();
    if (state.duration !== null && state.duration > 0 && state.capabilities.seeking) {
      controller.seek(Number(seek.value) * state.duration / 1000);
    }
  });
  listen(root, 'click', e => {
    if (expanded && e.target === root && options.expand?.closeOnBackdrop !== false) collapse();
  });
  listen(doc, 'keydown', e => {
    const key = e as KeyboardEvent;
    if (!expanded) return;
    if (key.key === 'Escape') { key.preventDefault(); collapse(); return; }
    if (key.key !== 'Tab') return;
    const elements = Array.from(root.querySelectorAll<HTMLElement>(focusQuery)).filter(el => !el.hidden && el.getClientRects().length > 0 && !el.closest('[hidden]'));
    if (!elements.length) { key.preventDefault(); root.focus(); return; }
    const first = elements[0]!;
    const last = elements[elements.length - 1]!;
    if (key.shiftKey && (doc.activeElement === first || doc.activeElement === root)) { key.preventDefault(); last.focus(); }
    else if (!key.shiftKey && doc.activeElement === last) { key.preventDefault(); first.focus(); }
  }, true);
  listen(doc, 'focusin', e => {
    if (expanded && !root.contains(e.target as Node)) close.focus();
  }, true);
  if (motionQuery && typeof motionQuery.addEventListener === 'function') {
    listen(motionQuery, 'change', () => {
      prefersReducedMotion = motionQuery.matches;
      if (prefersReducedMotion) stopPreview();
      else if (!expanded && !userPausedPreview && ((previewMode === 'viewport' && visible) || (previewMode === 'hover' && hover))) {
        void startPreview();
      }
    });
  }
  if (previewMode === 'viewport' && typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      if (visible && !userPausedPreview && !expanded) void startPreview();
      else if (!expanded && !visible && options.preview?.pauseOnExit !== false) stopPreview();
    }, { threshold: options.preview?.threshold ?? 0.35, rootMargin: options.preview?.rootMargin ?? '0px' });
    observer.observe(root);
  }
  listen(doc, 'visibilitychange', () => {
    if (previewMode === 'viewport' && !expanded) {
      if (doc.hidden) stopPreview();
      else if (visible && !userPausedPreview) void startPreview();
    }
  });
  if (previewMode === 'hover') {
    listen(root, 'pointerenter', e => {
      if ((e as PointerEvent).pointerType === 'touch') return;
      hover = true; if (!expanded && !userPausedPreview) void startPreview();
    });
    listen(root, 'pointerleave', () => {
      hover = false; if (options.preview?.pauseOnExit !== false) stopPreview();
    });
  }
  function destroy() {
    if (destroyed) return;
    // Prevent resuming a preview when closing the overlay during teardown.
    userPausedPreview = true;
    collapse();
    destroyed = true;
    clearControlsTimer();
    ++operationId;
    observer?.disconnect();
    // Every owned video must stop, including videos started manually rather than
    // as a preview. Never interrupt a caller-owned borrowed video on unmount.
    if (controllerAlive && (!borrowed || options.destroyControllerOnUnmount || activePreview)) {
      try { controller.pause(); } catch { /* External destruction. */ }
    }
    extensionHost.destroy();
    themeManager.destroy();
    for (const fn of cleanups.splice(0)) fn();
    off();
    offControllerDestroy();
    if (controllerAlive && (!borrowed || options.destroyControllerOnUnmount)) {
      controllerAlive = false;
      controller.destroy();
    }
    if (borrowed) {
      launch.remove(); actions.remove(); controls.remove(); status.remove(); chrome.remove();
      root.classList.remove('kx-showcase', 'kx-showcase--borrowed');
      if (!formerVideoClass) video.classList.remove('kx-showcase__video');
      video.muted = previousVideo.muted; video.loop = previousVideo.loop; video.controls = previousVideo.controls; video.playsInline = previousVideo.playsInline;
      if (savedHost) {
        for (const [name, value] of [
          ['role', savedHost.role], ['aria-label', savedHost.label], ['tabindex', savedHost.tab],
          ['data-kx-theme', savedHost.theme], ['data-kx-frame', savedHost.frame], ['data-kx-radius', savedHost.radius], ['data-kx-fit', savedHost.fit], ['data-kx-mode', savedHost.mode]
        ] as const) {
          if (value === null) root.removeAttribute(name); else root.setAttribute(name, value);
        }
        if (savedHost.aspect) root.style.setProperty('--kx-showcase-aspect', savedHost.aspect);
        else root.style.removeProperty('--kx-showcase-aspect');
      }
    } else {
      root.remove();
    }
  }
  try { for (const extension of options.extensions ?? []) extensionHost.use(extension); }
  catch (error) { destroy(); throw error; }
  return api;
}

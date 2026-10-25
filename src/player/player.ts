import { createKineox, KineoxError } from '../core/index.js';
import type { KineoxController, KineoxSnapshot } from '../core/index.js';
import { iconSvg } from './icons.js';
import { createKineoxTheme } from '../theme/index.js';
import { createKineoxUIExtensionHost } from '../ui/index.js';
import type { KineoxCaptionTrack, KineoxPlayer, KineoxPlayerOptions } from './types.js';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SKIP_SECONDS = 5;
const validAspectRatio = /^\s*\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\s*$/;
const focusableControl = 'button, input, select, textarea, [contenteditable], a[href], [role="slider"]';

function resolveTarget(target: string | HTMLElement): HTMLElement {
  if (typeof target !== 'string') {
    const ctor = target?.ownerDocument?.defaultView?.HTMLElement ??
      (typeof HTMLElement !== 'undefined' ? HTMLElement : undefined);
    if (ctor && target instanceof ctor) return target;
    throw new TypeError('Kineox Player needs an HTMLElement or CSS selector.');
  }
  if (typeof document === 'undefined') throw new TypeError('Kineox Player requires a browser document.');
  const found = document.querySelector(target);
  if (!found || !(found instanceof (found.ownerDocument?.defaultView?.HTMLElement ?? HTMLElement))) {
    throw new TypeError(`Kineox Player target not found: ${target}`);
  }
  return found;
}

function clock(time: number): string {
  if (!Number.isFinite(time) || time < 0) return '0:00';
  const seconds = Math.floor(time);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function make<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className?: string): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  return el;
}

function makeButton(doc: Document, action: string, label: string, icon: Parameters<typeof iconSvg>[0]): HTMLButtonElement {
  const button = make(doc, 'button', `kx-player__button kx-player__${action}`);
  button.type = 'button';
  button.dataset.action = action;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = iconSvg(icon);
  return button;
}

function makeRange(doc: Document, cls: string, label: string): HTMLInputElement {
  const input = make(doc, 'input', cls);
  input.type = 'range';
  input.min = '0';
  input.max = '100';
  input.step = '1';
  input.value = '0';
  input.setAttribute('aria-label', label);
  return input;
}

function timeSeekable(state: Readonly<KineoxSnapshot>): boolean {
  return state.duration !== null && state.duration > 0 && state.capabilities.seeking;
}

function captionTracks(video: HTMLVideoElement): TextTrack[] {
  const result: TextTrack[] = [];
  for (let index = 0; index < video.textTracks.length; index++) {
    const track = video.textTracks[index];
    if (track && (track.kind === 'captions' || track.kind === 'subtitles')) result.push(track);
  }
  return result;
}

function appendTracks(video: HTMLVideoElement, tracks: readonly KineoxCaptionTrack[]): void {
  for (const track of tracks) {
    if (!track.src || !track.srclang || !track.label) {
      throw new TypeError('Caption tracks require src, srclang and label.');
    }
    const el = video.ownerDocument.createElement('track');
    el.kind = track.kind ?? 'subtitles';
    el.src = track.src;
    el.srclang = track.srclang;
    el.label = track.label;
    el.default = Boolean(track.default);
    video.append(el);
  }
}

/**
 * Mount Kineox Player. It never injects CSS; import @blcklab/kineox/styles/player.css.
 * In injected-controller mode the DOM video and controller are borrowed, never moved.
 */
export function mountPlayer(target: string | HTMLElement, options: KineoxPlayerOptions = {}): KineoxPlayer {
  const host = resolveTarget(target);
  const doc = host.ownerDocument;
  const borrowed = options.controller !== undefined;
  if (options.appearance && !['default', 'minimal', 'borderless'].includes(options.appearance)) {
    throw new TypeError('Unknown Kineox Player appearance.');
  }
  if (options.interaction?.controls && !['auto', 'always'].includes(options.interaction.controls)) {
    throw new TypeError('Unknown Kineox Player controls visibility.');
  }
  if (options.interaction?.idleDelayMs !== undefined &&
    (!Number.isFinite(options.interaction.idleDelayMs) || options.interaction.idleDelayMs < 0 || options.interaction.idleDelayMs > 30000)) {
    throw new TypeError('idleDelayMs must be between 0 and 30000.');
  }
  if (options.aspectRatio !== undefined) {
    if (!validAspectRatio.test(options.aspectRatio) || options.aspectRatio.split('/').some(x => Number(x) <= 0)) {
      throw new TypeError('aspectRatio must be a positive ratio such as "16/9".');
    }
  }
  if (borrowed && (options.source !== undefined || options.poster !== undefined || options.captions !== undefined ||
    options.preload !== undefined || options.muted !== undefined || options.loop !== undefined)) {
    throw new TypeError('Injected Kineox controllers own video media configuration; configure the element/controller directly.');
  }

  let root: HTMLElement;
  let video: HTMLVideoElement;
  let controller: KineoxController;
  let restore: (() => void) | undefined;
  if (borrowed) {
    controller = options.controller!;
    video = controller.element;
    if (!host.contains(video)) {
      throw new KineoxError('TARGET_MISMATCH', 'Injected controller video must already be inside the player target.', false);
    }
    if (host.classList.contains('kx-player') || host.classList.contains('kx-showcase')) {
      throw new TypeError('A Kineox view is already mounted on this borrowed element.');
    }
    root = host;
    const priorControls = video.controls;
    const priorVideoClass = video.classList.contains('kx-player__video');
    const priorTab = root.getAttribute('tabindex');
    const priorRole = root.getAttribute('role');
    const priorAriaLabel = root.getAttribute('aria-label');
    const priorTheme = root.getAttribute('data-kx-theme');
    const priorAppearance = root.getAttribute('data-kx-appearance');
    const priorAspect = root.style.getPropertyValue('--kx-aspect');
    root.classList.add('kx-player');
    video.classList.add('kx-player__video');
    video.controls = false;
    restore = () => {
      root.classList.remove('kx-player');
      if (!priorVideoClass) video.classList.remove('kx-player__video');
      video.controls = priorControls;
      if (priorRole === null) root.removeAttribute('role'); else root.setAttribute('role', priorRole);
      if (priorAriaLabel === null) root.removeAttribute('aria-label'); else root.setAttribute('aria-label', priorAriaLabel);
      if (priorTab === null) root.removeAttribute('tabindex'); else root.setAttribute('tabindex', priorTab);
      if (priorTheme === null) root.removeAttribute('data-kx-theme'); else root.setAttribute('data-kx-theme', priorTheme);
      if (priorAppearance === null) root.removeAttribute('data-kx-appearance'); else root.setAttribute('data-kx-appearance', priorAppearance);
      if (priorAspect) root.style.setProperty('--kx-aspect', priorAspect); else root.style.removeProperty('--kx-aspect');
    };
  } else {
    root = make(doc, 'section', 'kx-player');
    video = make(doc, 'video', 'kx-player__video');
    video.playsInline = true;
    video.controls = false;
    video.preload = options.preload ?? 'metadata';
    video.muted = options.muted ?? false;
    video.loop = options.loop ?? false;
    if (options.poster !== undefined) video.poster = options.poster;
    if (options.captions) appendTracks(video, options.captions);
    root.append(video);
    controller = createKineox(video, {
      ...(options.source ? { source: options.source } : {}),
      preload: options.preload ?? 'metadata'
    });
    host.append(root);
  }

  root.dataset.kxAppearance = options.appearance ?? 'default';
  if (options.aspectRatio) root.style.setProperty('--kx-aspect', options.aspectRatio);
  const themeManager = createKineoxTheme(root, {
    ...(options.theme !== undefined ? { theme: options.theme } : {}),
    ...(options.themeTokens !== undefined ? { tokens: options.themeTokens } : {})
  });
  if (!root.hasAttribute('tabindex')) root.tabIndex = 0;
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', options.title ? `Video player: ${options.title}` : 'Video player');
  if (!borrowed && options.title) video.setAttribute('aria-label', options.title);

  const cleanups: Array<() => void> = [];
  let disposed = false;
  let scrubbing = false;
  const autoControls = options.interaction?.controls !== 'always';
  const idleDelayMs = options.interaction?.idleDelayMs ?? 2400;
  const view = doc.defaultView;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let keyboardNavigation = false;
  let controlsVisible = true;
  root.dataset.kxControls = 'visible';
  function clearIdleTimer(): void {
    if (idleTimer !== null) { (view?.clearTimeout ?? clearTimeout)(idleTimer); idleTimer = null; }
  }
  function keyboardHasControlFocus(): boolean {
    return keyboardNavigation && (controls.contains(doc.activeElement) || doc.activeElement === root);
  }
  function setControlsVisible(visible: boolean): void {
    if (controlsVisible === visible) return;
    controlsVisible = visible;
    root.dataset.kxControls = visible ? 'visible' : 'hidden';
  }
  function scheduleIdleHide(delay = idleDelayMs): void {
    clearIdleTimer();
    if (!autoControls || disposed || scrubbing || video.paused || keyboardHasControlFocus()) return;
    idleTimer = (view?.setTimeout ?? setTimeout)(() => {
      idleTimer = null;
      if (!disposed && !video.paused && !scrubbing && !keyboardHasControlFocus()) setControlsVisible(false);
    }, delay);
  }
  function wakeControls(): void {
    setControlsVisible(true);
    scheduleIdleHide();
  }
  let lastPlaying: boolean | null = null;
  let lastMuted: boolean | null = null;
  let lastFullscreen: boolean | null = null;
  let captionsSignature = '';
  const flags = options.controls ?? {};
  const listen = (on: EventTarget, name: string, cb: EventListener) => {
    on.addEventListener(name, cb);
    cleanups.push(() => on.removeEventListener(name, cb));
  };
  const controls = make(doc, 'div', 'kx-player__controls');
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Video controls');
  const progressRow = make(doc, 'div', 'kx-player__progress-row');
  const seek = makeRange(doc, 'kx-player__seek', 'Seek video');
  seek.max = '1000';
  seek.step = 'any';
  seek.disabled = true;
  const lower = make(doc, 'div', 'kx-player__toolbar');
  const left = make(doc, 'div', 'kx-player__cluster');
  const right = make(doc, 'div', 'kx-player__cluster kx-player__cluster--end');
  const play = makeButton(doc, 'play', 'Play video', 'play');
  const centerPlay = makeButton(doc, 'center-play', 'Play video', 'play');
  centerPlay.classList.add('kx-player__center-button');
  centerPlay.disabled = true;
  const back = makeButton(doc, 'back', 'Back 5 seconds', 'back');
  const next = makeButton(doc, 'forward', 'Forward 5 seconds', 'forward');
  const mute = makeButton(doc, 'mute', 'Mute', 'volume');
  const volume = makeRange(doc, 'kx-player__volume', 'Volume');
  volume.value = '100';
  const time = make(doc, 'span', 'kx-player__time');
  const current = make(doc, 'span', 'kx-player__current');
  const divider = make(doc, 'span', 'kx-player__time-divider');
  divider.textContent = '/';
  divider.setAttribute('aria-hidden', 'true');
  const total = make(doc, 'span', 'kx-player__duration');
  current.textContent = '0:00';
  total.textContent = '0:00';
  time.append(current, divider, total);
  const speed = make(doc, 'select', 'kx-player__select kx-player__speed');
  speed.setAttribute('aria-label', 'Playback speed');
  for (const rate of SPEEDS) {
    const option = make(doc, 'option'); option.value = String(rate); option.textContent = `${rate}×`;
    speed.append(option);
  }
  speed.value = '1';
  const captions = make(doc, 'select', 'kx-player__select kx-player__captions');
  captions.setAttribute('aria-label', 'Captions');
  const pip = makeButton(doc, 'pip', 'Enter picture-in-picture', 'pip');
  const fullscreen = makeButton(doc, 'fullscreen', 'Enter fullscreen', 'fullscreen');
  const visual = make(doc, 'div', 'kx-player__visual');
  const status = make(doc, 'div', 'kx-player__status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  visual.append(centerPlay, status);
  video.after(visual);
  if (flags.seek !== false) progressRow.append(seek);
  lower.append(left, right);
  left.append(play);
  if (flags.skip !== false) left.append(back, next);
  if (flags.volume !== false) left.append(mute, volume);
  left.append(time);
  if (flags.speed !== false) right.append(speed);
  if (flags.captions !== false) right.append(captions);
  if (flags.pictureInPicture !== false) right.append(pip);
  if (flags.fullscreen !== false) right.append(fullscreen);
  controls.append(progressRow, lower);
  root.append(controls);
  const extensionHost = createKineoxUIExtensionHost('player', root, video, controller, {
    overlay: visual, 'toolbar-start': left, 'toolbar-end': right
  });

  const safe = (fn: () => void | Promise<void>): void => {
    try { void Promise.resolve(fn()).catch(reportCommandError); }
    catch (error) { reportCommandError(error); }
  };
  function reportCommandError(error: unknown): void {
    if (disposed) return;
    const message = error instanceof Error ? error.message : 'Playback operation failed.';
    status.hidden = false;
    status.textContent = message;
    root.dataset.kxNotice = 'true';
  }
  function togglePlay(): void {
    const state = controller.getSnapshot();
    if (state.paused || state.status === 'ended') safe(() => controller.play());
    else safe(() => controller.pause());
  }
  function moveBy(delta: number): void {
    const s = controller.getSnapshot();
    if (!timeSeekable(s)) return;
    safe(() => controller.seek(Math.max(0, Math.min(s.duration!, s.currentTime + delta))));
  }
  function toggleFullscreen(): void {
    const fullscreenRoot = doc.fullscreenElement;
    const active = fullscreenRoot === root || Boolean(fullscreenRoot?.contains(video));
    safe(() => active ? controller.exitFullscreen() : controller.requestFullscreen(root));
  }
  function toggleMute(): void {
    const s = controller.getSnapshot();
    if (s.muted || s.volume === 0) {
      safe(() => {
        if (s.volume === 0) controller.setVolume(0.5);
        controller.setMuted(false);
      });
    } else {
      safe(() => controller.setMuted(true));
    }
  }
  function toggleCaptions(): void {
    const tracks = captionTracks(video);
    if (!tracks.length) return;
    const selected = tracks.findIndex(t => t.mode === 'showing');
    const nextTrack = selected < 0 ? 0 : -1;
    tracks.forEach((t, i) => { t.mode = i === nextTrack ? 'showing' : 'disabled'; });
    updateCaptions();
  }
  function updateCaptions(): void {
    if (flags.captions === false) return;
    const tracks = captionTracks(video);
    const signature = tracks.map((t, i) => `${i}:${t.kind}:${t.label}:${t.language}`).join('|');
    if (signature !== captionsSignature) {
      captionsSignature = signature;
      captions.replaceChildren();
      const off = make(doc, 'option'); off.value = '-1'; off.textContent = 'CC Off'; captions.append(off);
      tracks.forEach((t, i) => {
        const option = make(doc, 'option'); option.value = String(i);
        option.textContent = t.label || t.language || `Captions ${i + 1}`;
        captions.append(option);
      });
    }
    const showing = tracks.findIndex(t => t.mode === 'showing');
    if (captions.value !== String(showing)) captions.value = String(showing);
    captions.hidden = !tracks.length;
    captions.disabled = !tracks.length;
  }
  function render(): void {
    if (disposed) return;
    const s = controller.getSnapshot();
    const playing = !s.paused && s.status !== 'ended';
    if (lastPlaying !== playing) {
      setControlsVisible(true);
      if (playing) scheduleIdleHide(); else clearIdleTimer();
      const label = playing ? 'Pause video' : (s.status === 'ended' ? 'Replay video' : 'Play video');
      const glyph = playing ? 'pause' : (s.status === 'ended' ? 'replay' : 'play');
      play.innerHTML = iconSvg(glyph); play.setAttribute('aria-label', label); play.title = label;
      centerPlay.innerHTML = iconSvg(glyph);
      centerPlay.setAttribute('aria-label', label);
      centerPlay.title = label;
      lastPlaying = playing;
    }
    play.disabled = s.source === null;
    centerPlay.disabled = s.source === null;
    root.dataset.kxPlaying = String(playing);
    root.dataset.kxStatus = s.status;
    current.textContent = clock(s.currentTime);
    total.textContent = s.duration === null ? 'LIVE' : clock(s.duration);
    if (!scrubbing) {
      seek.value = timeSeekable(s) ? String(Math.min(s.currentTime, s.duration!)) : '0';
    }
    seek.max = timeSeekable(s) ? String(s.duration) : '1';
    seek.disabled = !timeSeekable(s);
    back.disabled = next.disabled = !timeSeekable(s);
    seek.setAttribute('aria-valuetext', `${clock(s.currentTime)} of ${s.duration === null ? 'live video' : clock(s.duration)}`);
    const fraction = timeSeekable(s) ? 100 * s.currentTime / s.duration! : 0;
    seek.style.setProperty('--kx-played', `${Math.min(100, Math.max(0, fraction))}%`);
    const buffered = s.duration !== null && s.duration > 0 ? s.buffered.reduce((furthest, range) => Math.max(furthest, range.end), 0) / s.duration * 100 : 0;
    seek.style.setProperty('--kx-buffered', `${Math.min(100, Math.max(0, buffered))}%`);
    const isMuted = s.muted || s.volume <= 0;
    if (lastMuted !== isMuted) {
      mute.innerHTML = iconSvg(isMuted ? 'mute' : 'volume');
      mute.setAttribute('aria-label', isMuted ? 'Unmute' : 'Mute');
      mute.title = isMuted ? 'Unmute' : 'Mute';
      lastMuted = isMuted;
    }
    volume.value = String(Math.round(s.volume * 100));
    volume.setAttribute('aria-valuetext', `${Math.round(s.volume * 100)} percent`);
    if (SPEEDS.includes(s.playbackRate)) speed.value = String(s.playbackRate);
    else {
      if (!Array.from(speed.options).some(o => Number(o.value) === s.playbackRate)) {
        const other = make(doc, 'option'); other.value = String(s.playbackRate);
        other.textContent = `${s.playbackRate}×`; speed.append(other);
      }
      speed.value = String(s.playbackRate);
    }
    speed.disabled = !s.capabilities.playbackRate;
    const canFullscreen = Boolean(doc.fullscreenEnabled && typeof root.requestFullscreen === 'function');
    fullscreen.hidden = !canFullscreen;
    pip.hidden = !s.capabilities.pictureInPicture;
    const full = s.fullscreen || Boolean(doc.fullscreenElement && (doc.fullscreenElement === root || doc.fullscreenElement.contains(video)));
    if (lastFullscreen !== full) {
      fullscreen.innerHTML = iconSvg(full ? 'shrink' : 'fullscreen');
      fullscreen.setAttribute('aria-label', full ? 'Exit fullscreen' : 'Enter fullscreen');
      fullscreen.title = full ? 'Exit fullscreen' : 'Enter fullscreen';
      lastFullscreen = full;
    }
    pip.setAttribute('aria-label', s.pictureInPicture ? 'Exit picture-in-picture' : 'Enter picture-in-picture');
    pip.title = s.pictureInPicture ? 'Exit picture-in-picture' : 'Enter picture-in-picture';
    const isLoading = s.status === 'loading' || s.status === 'buffering';
    root.dataset.kxLoading = String(isLoading);
    if (s.status === 'error' || s.autoplayBlocked) {
      root.dataset.kxNotice = 'true';
      status.hidden = false;
      status.textContent = s.error?.message ?? 'Playback requires permission. Select Play to retry.';
    } else if (root.dataset.kxNotice === 'true') {
      root.dataset.kxNotice = 'false';
      status.hidden = true;
      status.textContent = '';
    }
    updateCaptions();
  }

  // Pointer movement wakes controls even in a static-hover state; the timer can
  // still hide controls if the pointer remains still on the video.
  listen(root, 'pointermove', () => { keyboardNavigation = false; wakeControls(); });
  listen(root, 'pointerenter', () => { keyboardNavigation = false; wakeControls(); });
  listen(root, 'pointerleave', () => { if (!keyboardHasControlFocus()) scheduleIdleHide(120); });
  listen(root, 'pointerdown', () => { keyboardNavigation = false; wakeControls(); });
  listen(root, 'keydown', (event: Event) => {
    if ((event as KeyboardEvent).key === 'Tab' || (event as KeyboardEvent).key.startsWith('Arrow')) {
      keyboardNavigation = true;
      setControlsVisible(true);
      clearIdleTimer();
    }
  });
  listen(root, 'focusin', () => { if (keyboardNavigation) { setControlsVisible(true); clearIdleTimer(); } });
  listen(root, 'focusout', () => {
    (view?.setTimeout ?? setTimeout)(() => { if (!disposed && !keyboardHasControlFocus()) scheduleIdleHide(); }, 0);
  });
  listen(seek, 'pointerdown', () => { clearIdleTimer(); setControlsVisible(true); });
  listen(play, 'click', () => togglePlay());
  listen(centerPlay, 'click', () => togglePlay());
  listen(back, 'click', () => moveBy(-SKIP_SECONDS));
  listen(next, 'click', () => moveBy(SKIP_SECONDS));
  listen(mute, 'click', toggleMute);
  listen(volume, 'input', () => safe(() => { controller.setVolume(Number(volume.value) / 100); if (Number(volume.value) > 0) controller.setMuted(false); }));
  listen(seek, 'input', () => { scrubbing = true; current.textContent = clock(Number(seek.value)); });
  listen(seek, 'change', () => { scrubbing = false; safe(() => controller.seek(Number(seek.value))); render(); });
  listen(seek, 'blur', () => { scrubbing = false; render(); });
  listen(speed, 'change', () => safe(() => controller.setPlaybackRate(Number(speed.value))));
  listen(captions, 'change', () => {
    const selected = Number(captions.value);
    captionTracks(video).forEach((t, i) => { t.mode = i === selected ? 'showing' : 'disabled'; });
    updateCaptions();
  });
  listen(fullscreen, 'click', () => toggleFullscreen());
  listen(pip, 'click', () => safe(() => controller.getSnapshot().pictureInPicture ? controller.exitPictureInPicture() : controller.requestPictureInPicture()));
  listen(root, 'keydown', (ev: Event) => {
    const event = ev as KeyboardEvent;
    if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
    const eventTarget = event.target;
    const targetElement = eventTarget && (eventTarget as Element).closest ? eventTarget as Element : null;
    if (targetElement?.closest(focusableControl)) return;
    if (!root.contains(doc.activeElement)) return;
    switch (event.key.toLowerCase()) {
      case ' ': case 'k': event.preventDefault(); togglePlay(); break;
      case 'arrowleft': case 'j': event.preventDefault(); moveBy(-SKIP_SECONDS); break;
      case 'arrowright': case 'l': event.preventDefault(); moveBy(SKIP_SECONDS); break;
      case 'm': event.preventDefault(); toggleMute(); break;
      case 'f': event.preventDefault(); toggleFullscreen(); break;
      case 'c': event.preventDefault(); toggleCaptions(); break;
    }
  });
  const trackList: TextTrackList = video.textTracks;
  for (const event of ['addtrack', 'removetrack', 'change']) listen(trackList, event, () => updateCaptions());
  const unsub = controller.subscribe(render);
  cleanups.push(unsub);
  const destroyFromCore = controller.on('destroy', () => destroy());
  cleanups.push(destroyFromCore);
  render();

  function destroy(): void {
    if (disposed) return;
    disposed = true;
    clearIdleTimer();
    extensionHost.destroy();
    themeManager.destroy();
    for (const cleanup of cleanups.reverse()) cleanup();
    controls.remove();
    visual.remove();
    if (borrowed) {
      restore?.();
      // Borrowed controller belongs to its caller unless explicitly transferred.
      if (options.destroyControllerOnUnmount) {
        try { controller.pause(); } catch { /* Controller may already be destroyed. */ }
        controller.destroy();
      }
    } else {
      // Core owns no media element and deliberately does not pause borrowed videos.
      // A Player-created element *is* ours: stop playback before it is detached.
      try { controller.pause(); } catch { /* Core may have been destroyed externally. */ }
      controller.destroy();
      root.remove();
    }
  }
  try { for (const extension of options.extensions ?? []) extensionHost.use(extension); }
  catch (error) { destroy(); throw error; }
  return { element: root, video, controller,
    setTheme: themeManager.setTheme, setThemeTokens: themeManager.setTokens,
    use: extensionHost.use, destroy };
}

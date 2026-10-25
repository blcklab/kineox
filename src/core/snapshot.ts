import type {
  KineoxCapabilities, KineoxErrorInfo, KineoxSnapshot, KineoxSource,
  KineoxStatus, KineoxTimeRange
} from './types.js';

export interface SnapshotInputs {
  readonly status: KineoxStatus;
  readonly source: KineoxSource | null;
  readonly revision: number;
  readonly autoplayBlocked: boolean;
  readonly error: KineoxErrorInfo | null;
}

function immutableRanges(ranges: TimeRanges | undefined): readonly KineoxTimeRange[] {
  const result: KineoxTimeRange[] = [];
  if (!ranges) return Object.freeze(result);
  try {
    for (let i = 0; i < ranges.length; i++) {
      const start = ranges.start(i);
      const end = ranges.end(i);
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        result.push(Object.freeze({ start, end }));
      }
    }
  } catch { /* Media ranges can invalidate during source replacement. */ }
  return Object.freeze(result);
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function collectSnapshot(
  element: HTMLVideoElement,
  input: SnapshotInputs
): Readonly<KineoxSnapshot> {
  const doc = element.ownerDocument;
  const fullscreen = Boolean(doc && 'fullscreenElement' in doc && Boolean(doc.fullscreenElement && (doc.fullscreenElement === element || doc.fullscreenElement.contains(element))));
  const pip = Boolean(doc?.pictureInPictureElement === element);
  const seekable = immutableRanges(element.seekable);
  const caps: KineoxCapabilities = Object.freeze({
    fullscreen: Boolean(doc?.fullscreenEnabled && typeof element.requestFullscreen === 'function'),
    pictureInPicture: Boolean(doc?.pictureInPictureEnabled && !element.disablePictureInPicture && typeof element.requestPictureInPicture === 'function'),
    seeking: seekable.length > 0,
    captions: (element.textTracks?.length ?? 0) > 0,
    playbackRate: typeof element.playbackRate === 'number'
  });
  const source = input.source && Object.freeze({ ...input.source });
  // Error.message is non-enumerable on Error instances: never spread it.
  const error = input.error && Object.freeze({
    code: input.error.code, message: input.error.message,
    recoverable: input.error.recoverable,
    ...(input.error.cause !== undefined ? { cause: input.error.cause } : {})
  });
  return Object.freeze({
    status: input.status,
    source,
    sourceRevision: input.revision,
    currentTime: Number.isFinite(element.currentTime) ? element.currentTime : 0,
    duration: finiteOrNull(element.duration),
    buffered: immutableRanges(element.buffered),
    seekable,
    paused: element.paused,
    muted: element.muted,
    volume: element.volume,
    playbackRate: element.playbackRate,
    seeking: element.seeking,
    fullscreen,
    pictureInPicture: pip,
    autoplayBlocked: input.autoplayBlocked,
    capabilities: caps,
    error
  });
}

export function snapshotChanged(a: Readonly<KineoxSnapshot>, b: Readonly<KineoxSnapshot>): boolean {
  if (a.status !== b.status || a.sourceRevision !== b.sourceRevision ||
      a.currentTime !== b.currentTime || a.duration !== b.duration ||
      a.paused !== b.paused || a.muted !== b.muted || a.volume !== b.volume ||
      a.playbackRate !== b.playbackRate || a.seeking !== b.seeking ||
      a.fullscreen !== b.fullscreen || a.pictureInPicture !== b.pictureInPicture ||
      a.autoplayBlocked !== b.autoplayBlocked || a.error?.code !== b.error?.code ||
      a.error?.message !== b.error?.message) return true;
  for (const field of ['buffered', 'seekable'] as const) {
    const x = a[field], y = b[field];
    if (x.length !== y.length || x.some((r, i) => r.start !== y[i]?.start || r.end !== y[i]?.end)) return true;
  }
  for (const key of Object.keys(a.capabilities) as (keyof KineoxCapabilities)[]) {
    if (a.capabilities[key] !== b.capabilities[key]) return true;
  }
  return false;
}

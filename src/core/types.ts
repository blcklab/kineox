/** Public contracts for the framework-agnostic Kineox headless core. */
export type KineoxStatus =
  | 'idle' | 'loading' | 'ready' | 'playing' | 'paused'
  | 'buffering' | 'ended' | 'error';

export type KineoxErrorCode =
  | 'ELEMENT_IN_USE' | 'KINEOX_DESTROYED' | 'INVALID_ARGUMENT'
  | 'SOURCE_UNSUPPORTED' | 'SOURCE_SUPERSEDED' | 'PLAYBACK_BLOCKED'
  | 'MEDIA_ERROR' | 'OPERATION_ABORTED' | 'CAPABILITY_UNAVAILABLE'
  | 'SEEK_UNAVAILABLE' | 'TARGET_MISMATCH';

export interface KineoxErrorInfo {
  readonly code: KineoxErrorCode;
  readonly message: string;
  readonly recoverable: boolean;
  readonly cause?: unknown;
}

export interface KineoxSource {
  readonly src: string;
  readonly type?: string;
  readonly adapter?: string;
}

export interface KineoxTimeRange {
  readonly start: number;
  readonly end: number;
}

export interface KineoxCapabilities {
  readonly fullscreen: boolean;
  readonly pictureInPicture: boolean;
  readonly seeking: boolean;
  readonly captions: boolean;
  readonly playbackRate: boolean;
}

export interface KineoxSnapshot {
  readonly status: KineoxStatus;
  readonly source: KineoxSource | null;
  readonly sourceRevision: number;
  readonly currentTime: number;
  readonly duration: number | null;
  readonly buffered: readonly KineoxTimeRange[];
  readonly seekable: readonly KineoxTimeRange[];
  readonly paused: boolean;
  readonly muted: boolean;
  readonly volume: number;
  readonly playbackRate: number;
  readonly seeking: boolean;
  readonly fullscreen: boolean;
  readonly pictureInPicture: boolean;
  readonly autoplayBlocked: boolean;
  readonly capabilities: Readonly<KineoxCapabilities>;
  readonly error: KineoxErrorInfo | null;
}

export interface KineoxEventMap {
  statechange: { readonly snapshot: Readonly<KineoxSnapshot> };
  sourcechange: { readonly source: KineoxSource | null; readonly sourceRevision: number };
  error: KineoxErrorInfo;
  autoplayblocked: KineoxErrorInfo;
  destroy: { readonly element: HTMLVideoElement };
}

export interface KineoxSourceAttachment {
  dispose(): void | Promise<void>;
}

export interface KineoxSourceAdapterContext {
  readonly element: HTMLVideoElement;
  readonly source: KineoxSource;
  readonly signal: AbortSignal;
}

export interface KineoxSourceAdapter {
  readonly id: string;
  canHandle(source: KineoxSource, element: HTMLVideoElement): boolean;
  attach(context: KineoxSourceAdapterContext): Promise<KineoxSourceAttachment>;
}

export interface KineoxOptions {
  readonly source?: KineoxSource;
  readonly preload?: 'none' | 'metadata' | 'auto';
  readonly sourceAdapters?: readonly KineoxSourceAdapter[];
}

export interface KineoxController {
  /** Borrowed DOM element; destroy() never removes it or its current media URL. */
  readonly element: HTMLVideoElement;
  getSnapshot(): Readonly<KineoxSnapshot>;
  subscribe(listener: () => void): () => void;
  on<T extends keyof KineoxEventMap>(type: T, listener: (event: KineoxEventMap[T]) => void): () => void;
  /** Resolves after source selection/attachment, not after network buffering. */
  setSource(source: KineoxSource | null): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  setPlaybackRate(rate: number): void;
  requestFullscreen(target?: HTMLElement): Promise<void>;
  exitFullscreen(): Promise<void>;
  requestPictureInPicture(): Promise<void>;
  exitPictureInPicture(): Promise<void>;
  destroy(): void;
}

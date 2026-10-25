import type { KineoxController, KineoxSource } from '../core/index.js';
import type { KineoxThemeName, KineoxThemeTokens } from '../theme/index.js';
import type { KineoxUIExtension } from '../ui/index.js';

export interface KineoxCaptionTrack {
  readonly src: string;
  readonly srclang: string;
  readonly label: string;
  readonly kind?: 'captions' | 'subtitles';
  readonly default?: boolean;
}

export interface KineoxPlayerControls {
  readonly seek?: boolean;
  readonly volume?: boolean;
  readonly speed?: boolean;
  readonly captions?: boolean;
  readonly fullscreen?: boolean;
  readonly pictureInPicture?: boolean;
  readonly skip?: boolean;
}

/** A UI view of a Kineox controller. It does not require or import a framework. */
/** UI-only options: never change the headless controller or media state. */
export type KineoxPlayerAppearance = 'default' | 'minimal' | 'borderless';

/** Toolbar auto-hides during playback while remaining available to pointer and keyboard users. */
export interface KineoxPlayerInteraction {
  /** 'auto' (default) fades idle controls; 'always' keeps controls visible. */
  readonly controls?: 'auto' | 'always';
  /** Milliseconds of inactivity before hiding (default 2400; 0–30000). */
  readonly idleDelayMs?: number;
}

export interface KineoxPlayerOptions {
  /** Borrow an existing controller. Its video must already be inside the target. */
  readonly controller?: KineoxController;
  /** Source for an owned video. Not accepted with controller. */
  readonly source?: KineoxSource;
  readonly poster?: string;
  readonly title?: string;
  readonly captions?: readonly KineoxCaptionTrack[];
  readonly preload?: 'none' | 'metadata' | 'auto';
  readonly muted?: boolean;
  readonly loop?: boolean;
  /** CSS skin (no styles are inserted by JavaScript). */
  readonly theme?: KineoxThemeName;
  readonly themeTokens?: KineoxThemeTokens;
  readonly extensions?: readonly KineoxUIExtension[];
  readonly aspectRatio?: string;
  /** Borderless retains accessible controls but removes media framing. */
  readonly appearance?: KineoxPlayerAppearance;
  /** UI visibility behavior, independent of video playback and appearance. */
  readonly interaction?: KineoxPlayerInteraction;
  readonly controls?: KineoxPlayerControls;
  /** Only relevant to an injected controller; defaults to false. */
  readonly destroyControllerOnUnmount?: boolean;
}

export interface KineoxPlayer {
  readonly element: HTMLElement;
  readonly video: HTMLVideoElement;
  readonly controller: KineoxController;
  setTheme(theme: KineoxThemeName): void;
  setThemeTokens(tokens: KineoxThemeTokens): void;
  /** Add or remove controls at runtime, without replacing the player or controller. */
  use(extension: KineoxUIExtension): () => void;
  destroy(): void;
}

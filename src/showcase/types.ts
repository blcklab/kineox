import type { KineoxController, KineoxSource } from '../core/index.js';
import type { KineoxThemeName, KineoxThemeTokens } from '../theme/index.js';
import type { KineoxUIExtension } from '../ui/index.js';

/** 'none' is the original borderless preset; 'borderless' is an expressive alias. */
export type KineoxShowcaseFrame = 'none' | 'borderless' | 'minimal' | 'glass' | 'browser' | 'device' | 'floating' | 'cinematic';
export type KineoxShowcaseMode = 'showcase' | 'ambient';
export type KineoxPreviewMode = 'manual' | 'viewport' | 'hover';

export interface KineoxShowcasePresentation {
  /** The decorative frame is CSS-only and does not affect video playback. */
  readonly frame?: KineoxShowcaseFrame;
  /** A positive width/height pair such as `16/9`. */
  readonly aspectRatio?: string;
  /** Borderless always has zero radius, including expanded playback. */
  readonly radius?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  /** Scale the video to fit its stage. 'cover' crops instead of letterboxing. */
  readonly fit?: 'contain' | 'cover';
}

export interface KineoxShowcasePreview {
  /** Manual is safest and does not autoplay or load media until a user requests it. */
  readonly mode?: KineoxPreviewMode;
  /** Previews are always muted; an expanded user-initiated session may unmute. */
  readonly loop?: boolean;
  readonly threshold?: number;
  readonly rootMargin?: string;
  readonly pauseOnExit?: boolean;
}

export interface KineoxShowcaseExpansion {
  readonly enabled?: boolean;
  /** A user-initiated expansion may try to play. Failure is nonfatal. */
  readonly autoplay?: boolean;
  readonly closeOnBackdrop?: boolean;
}

export interface KineoxShowcaseInteraction {
  /** Defaults to 'expand' when expansion is enabled; can play inline instead. */
  readonly posterClick?: 'expand' | 'play';
  /** 'auto' (default) hides idle controls during playback; 'always' keeps them visible. */
  readonly controls?: 'auto' | 'always';
  /** Delay until idle controls fade, in milliseconds (0–30000). Default 2400. */
  readonly idleDelayMs?: number;
}

export interface KineoxShowcaseOptions {
  /** 'ambient' is a muted, looping, viewport-aware background without default controls. */
  readonly mode?: KineoxShowcaseMode;
  readonly controller?: KineoxController;
  /** An owned video source. Source loading is delayed until preview or explicit playback. */
  readonly source?: KineoxSource;
  readonly poster?: string;
  readonly title?: string;
  readonly theme?: KineoxThemeName;
  readonly themeTokens?: KineoxThemeTokens;
  readonly extensions?: readonly KineoxUIExtension[];
  readonly preload?: 'none' | 'metadata' | 'auto';
  readonly presentation?: KineoxShowcasePresentation;
  /** Click behavior and overlay control visibility, independent of the visual frame. */
  readonly interaction?: KineoxShowcaseInteraction;
  readonly preview?: KineoxShowcasePreview;
  readonly expand?: KineoxShowcaseExpansion;
  /** Only applies to injected controllers; default false. */
  readonly destroyControllerOnUnmount?: boolean;
}

export interface KineoxShowcase {
  readonly element: HTMLElement;
  readonly video: HTMLVideoElement;
  readonly controller: KineoxController;
  readonly expanded: boolean;
  expand(): Promise<void>;
  collapse(): void;
  play(): Promise<void>;
  pause(): void;
  setTheme(theme: KineoxThemeName): void;
  setThemeTokens(tokens: KineoxThemeTokens): void;
  use(extension: KineoxUIExtension): () => void;
  destroy(): void;
}

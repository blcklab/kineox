import type { KineoxController } from '../core/index.js';

export type KineoxUISurface = 'player' | 'showcase';
export type KineoxUISlot = 'overlay' | 'toolbar-start' | 'toolbar-end' | 'actions' | 'expanded-controls';

export interface KineoxUIExtensionContext {
  readonly surface: KineoxUISurface;
  readonly element: HTMLElement;
  readonly video: HTMLVideoElement;
  readonly controller: KineoxController;
  readonly slots: Readonly<Partial<Record<KineoxUISlot, HTMLElement>>>;
  /** Append an owned DOM node. Kineox removes it automatically on unmount. */
  append(slot: KineoxUISlot, node: HTMLElement): void;
}

export interface KineoxUIExtension {
  readonly id: string;
  mount(context: KineoxUIExtensionContext): void | (() => void);
}

export interface KineoxUIExtensionHost {
  /** Returns an idempotent removal function; duplicate extension IDs are rejected. */
  use(extension: KineoxUIExtension): () => void;
  destroy(): void;
}

export function defineKineoxUIExtension<T extends KineoxUIExtension>(extension: T): T {
  if (!extension || !extension.id?.trim() || typeof extension.mount !== 'function') {
    throw new TypeError('UI extension requires a nonempty id and mount function.');
  }
  return extension;
}

/** Used by the built-in views, or by a completely custom view. No CSS is imported. */
export function createKineoxUIExtensionHost(
  surface: KineoxUISurface,
  element: HTMLElement,
  video: HTMLVideoElement,
  controller: KineoxController,
  slots: Readonly<Partial<Record<KineoxUISlot, HTMLElement>>>
): KineoxUIExtensionHost {
  if (!['player', 'showcase'].includes(surface)) throw new TypeError('Unknown Kineox surface.');
  const active = new Map<string, () => void>();
  let destroyed = false;
  function use(extension: KineoxUIExtension): () => void {
    if (destroyed) throw new Error('Cannot install a UI extension after view destruction.');
    defineKineoxUIExtension(extension);
    if (active.has(extension.id)) throw new TypeError(`Duplicate Kineox UI extension: ${extension.id}`);
    const attached: HTMLElement[] = [];
    let removed = false;
    const context: KineoxUIExtensionContext = Object.freeze({
      surface, element, video, controller, slots: Object.freeze({ ...slots }),
      append(slot: KineoxUISlot, node: HTMLElement) {
        if (removed || destroyed) throw new Error('Cannot append controls after extension teardown.');
        if (!Object.hasOwn(slots, slot) || !slots[slot]) throw new TypeError(`Slot "${slot}" unavailable in ${surface}.`);
        if (!node || node.nodeType !== 1) throw new TypeError('Extension control must be an HTMLElement.');
        if (attached.includes(node)) throw new TypeError('Extension node already attached.');
        slots[slot]!.append(node);
        attached.push(node);
      }
    });
    let cleanup: void | (() => void);
    try {
      cleanup = extension.mount(context);
      if (cleanup !== undefined && typeof cleanup !== 'function') {
        throw new TypeError('Extension mount must return a cleanup callback or void.');
      }
    } catch (error) {
      for (const node of attached) node.remove();
      throw error;
    }
    function unmount() {
      if (removed) return;
      removed = true;
      active.delete(extension.id);
      try { cleanup?.(); } finally { for (const node of attached) node.remove(); }
    }
    active.set(extension.id, unmount);
    return unmount;
  }
  return {
    use,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      // Cleanups run in reverse mounting order. One bad plugin doesn't block the rest.
      for (const teardown of [...active.values()].reverse()) {
        try { teardown(); } catch { /* Do not prevent other extension cleanup. */ }
      }
      active.clear();
    }
  };
}

import type { KineoxController } from '../core/index.js';

/** Headless, framework-independent behavior extension. */
export interface KineoxBehavior {
  readonly id: string;
  setup(controller: KineoxController): void | (() => void);
}

export interface KineoxBehaviorHost {
  use(extension: KineoxBehavior): () => void;
  destroy(): void;
}

export function createKineoxBehaviorHost(controller: KineoxController): KineoxBehaviorHost {
  const extensions = new Map<string, () => void>();
  let destroyed = false;
  const unsubscribe = controller.on('destroy', () => destroy());
  function use(extension: KineoxBehavior): () => void {
    if (destroyed) throw new Error('Kineox behavior host was destroyed.');
    if (!extension || !extension.id?.trim() || typeof extension.setup !== 'function') {
      throw new TypeError('Behavior requires an id and setup function.');
    }
    if (extensions.has(extension.id)) throw new TypeError(`Duplicate Kineox behavior: ${extension.id}`);
    const cleanup = extension.setup(controller);
    if (cleanup !== undefined && typeof cleanup !== 'function') {
      throw new TypeError('Behavior setup must return a cleanup callback or void.');
    }
    let removed = false;
    function unmount(): void {
      if (removed) return;
      removed = true;
      extensions.delete(extension.id);
      cleanup?.();
    }
    extensions.set(extension.id, unmount);
    return unmount;
  }
  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    unsubscribe();
    for (const remove of [...extensions.values()].reverse()) {
      try { remove(); } catch { /* A broken extension must not block teardown. */ }
    }
    extensions.clear();
  }
  return { use, destroy };
}

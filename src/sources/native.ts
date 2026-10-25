import { kineoxError } from '../core/errors.js';
import type { KineoxSourceAdapter } from '../core/types.js';

/** Native URL media playback. Never removes/clears the borrowed element on dispose. */
export const nativeSourceAdapter: KineoxSourceAdapter = {
  id: 'native',
  canHandle(source, element) {
    if (source.adapter && source.adapter !== 'native') return false;
    if (source.type && typeof element.canPlayType === 'function' && element.canPlayType(source.type) === '') {
      return false;
    }
    return true;
  },
  async attach({ element, source, signal }) {
    if (signal.aborted) throw kineoxError('SOURCE_SUPERSEDED', 'Source selection was superseded.', true);
    element.src = source.src;
    element.load();
    return { dispose() { /* Native URL has no adapter-owned resources. */ } };
  }
};

# Using Kineox with a UI framework

Kineox isn't tied to React, Vue, Svelte, Angular or any other framework. The simplest approach is to mount Player or Showcase when the DOM element exists and call `destroy()` when your component unmounts.

## Mount a ready-made interface

```ts
import { mountShowcase } from '@blcklab/kineox/showcase';
import '@blcklab/kineox/styles/showcase.css';

// Run this after your framework has rendered #demo.
const showcase = mountShowcase('#demo', {
  source: { src: '/demo.mp4' },
  presentation: { frame: 'borderless' }
});

// Call in the framework's unmount/dispose hook.
showcase.destroy();
```

In React, a ref and an effect cleanup are suitable. In Vue, use a template ref and `onMounted`/`onUnmounted`. The library itself doesn't need to import either framework.

## Build a native framework component

Use `createKineox(videoElement)` from `@blcklab/kineox/core` and subscribe to its snapshot:

```ts
const controller = createKineox(videoElement);
const unsubscribe = controller.subscribe(() => {
  const state = controller.getSnapshot();
  // Send state to your framework's reactive system here.
});

// On unmount:
unsubscribe();
controller.destroy();
```

For React, `subscribe`/`getSnapshot` can be adapted to `useSyncExternalStore`. For Vue, update a `shallowRef` from the subscription. Keep framework-specific code in your app or a separate adapter package rather than adding it to Core.

## Ownership matters

If you pass your own controller into `mountPlayer` or `mountShowcase`, its video element must already be inside the container. The mounted UI can then be destroyed without destroying your controller. Only use `destroyControllerOnUnmount: true` if you want that ownership transferred.

For a clean separation between headless playback and presentation, see [Recipes](recipes.md).

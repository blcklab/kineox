# Recipes

A few common ways to use Kineox. Each example uses public APIs, and none requires a UI framework.

## A quiet landing-page background

```ts
import { mountShowcase } from '@blcklab/kineox/showcase';
import '@blcklab/kineox/styles/showcase.css';

const hero = mountShowcase('#hero', {
  mode: 'ambient',
  source: { src: '/videos/hero-loop.mp4' },
  poster: '/images/hero.webp'
});
```

This starts as a poster. If browser settings allow, the muted video loops while it is in view. Reduced-motion preferences keep the poster.

## A borderless inline demo

```ts
const demo = mountShowcase('#demo', {
  source: { src: '/videos/product.mp4' },
  poster: '/images/product.webp',
  presentation: { frame: 'borderless', fit: 'cover' },
  interaction: { posterClick: 'play', controls: 'auto' },
  expand: { enabled: true }
});
```

Click plays inline, while the dedicated Expand control gives the viewer a larger view.

## A tutorial player with captions

```ts
const tutorial = mountPlayer('#tutorial', {
  source: { src: '/videos/tutorial.mp4' },
  captions: [{ src: '/captions/en.vtt', label: 'English', srclang: 'en' }],
  appearance: 'minimal',
  interaction: { controls: 'always' }
});
```

Import the matching Player CSS when using this recipe.

## Changing the video

```ts
await demo.controller.setSource({ src: '/videos/second-demo.mp4' });
```

Use `setSource()` for runtime source changes. Not every presentation option is currently mutable at runtime; if you need a new Showcase layout, destroy and remount it with new options.

## Headless playback

```ts
import { createKineox } from '@blcklab/kineox/core';

const video = document.querySelector<HTMLVideoElement>('video')!;
const controller = createKineox(video);
await controller.setSource({ src: '/videos/clip.mp4' });

await controller.play(); // Usually requires a user gesture.
controller.pause();
controller.seek(5);
controller.destroy();
```

The Core has no UI and doesn't delete externally supplied video elements. For an overview of methods and state, see [Getting started](getting-started.md).

# Getting started

Kineox gives you a video player, a cinematic showcase and a headless controller. You can use any one of them without adopting a framework.

## Install

Once the current prerelease is available on npm:

```bash
npm install @blcklab/kineox@0.1.0-rc.2
```

Before publication, install the locally supplied `.tgz`. Kineox is an ESM package with TypeScript definitions and no runtime dependencies. Playback requires a browser that supports HTML video and your media codec.

## Your first player

Add a container:

```html
<div id="video"></div>
```

Then mount the player:

```ts
import { mountPlayer } from '@blcklab/kineox/player';
import '@blcklab/kineox/styles/player.css';

const player = mountPlayer('#video', {
  source: { src: '/videos/intro.mp4', type: 'video/mp4' },
  poster: '/images/intro.webp',
  title: 'Introduction'
});

// For single-page apps, clean up when you leave the view.
player.destroy();
```

Kineox creates the player inside your container. Swap in a video your browser can play and provide a poster so the page looks good before loading.

## Prefer a product showcase?

```ts
import { mountShowcase } from '@blcklab/kineox/showcase';
import '@blcklab/kineox/styles/showcase.css';

const showcase = mountShowcase('#showcase', {
  source: { src: '/videos/product.mp4' },
  poster: '/images/product.webp',
  presentation: { frame: 'minimal', aspectRatio: '16/9' },
  interaction: { posterClick: 'play' },
  expand: { enabled: true }
});
```

This displays a poster first. The user can play inline, and an Expand button is available if you enable expansion. See [Showcase](showcase.md) for previews and ambient backgrounds.

## Build your own controls

```ts
import { createKineox } from '@blcklab/kineox/core';

const video = document.querySelector<HTMLVideoElement>('video')!;
const controller = createKineox(video);
await controller.setSource({ src: '/videos/intro.mp4' });

const unsubscribe = controller.subscribe(() => {
  console.log(controller.getSnapshot());
});

// When done:
unsubscribe();
controller.destroy();
```

Core controls an existing video element; it doesn't remove that element when destroyed. Browser media policies and errors still apply.

## See it running

From the source repository:

```bash
npm ci
npm run build
npm run demo
```

Open http://localhost:8000/examples/. You can upload a video into the local playground *in your browser*—it is not sent to a server.

Next: [Player](player.md), [Showcase](showcase.md), or [FAQ](faq.md).

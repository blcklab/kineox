# Kineox

**Video that feels at home in your product.**

Kineox is a lightweight TypeScript library for video playback and cinematic product demos. Use the ready-made **Player**, show a video beautifully with **Showcase**, or build your own interface on the headless **Core**. No React, Vue, or other framework is required.

- **Player:** play/pause, timeline, sound, playback speed, captions, fullscreen and picture-in-picture where supported.
- **Showcase:** poster-first video cards, ambient backgrounds, borderless presentations and optional expansion.
- **Customization:** light/dark themes, CSS tokens, custom controls and framework-independent extensions.
- **Core:** state subscriptions, native video playback, source switching and predictable cleanup.

Kineox has **zero runtime dependencies**. Video format support still depends on the browser.

> Current version: **`0.1.0-rc.2`** (release candidate). Cross-browser, mobile and screen-reader support has not yet been fully validated. This source archive does not publish the package to npm.

## Install

Once the version is published:

```bash
npm install @blcklab/kineox@0.1.0-rc.2
```

Until then, install the supplied `.tgz` from your local filesystem. For a quick tour, see [Getting started](docs/getting-started.md).

## Add a video player

```ts
import { mountPlayer } from '@blcklab/kineox/player';
import '@blcklab/kineox/styles/player.css';

const player = mountPlayer('#video', {
  source: { src: '/videos/demo.mp4', type: 'video/mp4' },
  poster: '/images/demo.webp',
  appearance: 'borderless',
  interaction: { controls: 'auto', idleDelayMs: 2400 }
});

// When this part of the page is removed:
player.destroy();
```

Add `<div id="video"></div>` to your HTML. The controls fade during playback and appear again on interaction. You can also keep them visible with `interaction: { controls: 'always' }`.

[Player guide →](docs/player.md)

## Show a cinematic product demo

```ts
import { mountShowcase } from '@blcklab/kineox/showcase';
import '@blcklab/kineox/styles/showcase.css';

const showcase = mountShowcase('#showcase', {
  source: { src: '/videos/product.mp4', type: 'video/mp4' },
  poster: '/images/product.webp',
  presentation: { frame: 'borderless', fit: 'cover', aspectRatio: '16/9' },
  interaction: { posterClick: 'play', controls: 'auto' },
  expand: { enabled: true, autoplay: true }
});

showcase.destroy();
```

Add `<div id="showcase"></div>` to your HTML. Clicking the poster can play inline or open an expanded view; the choice is yours. Use `mode: 'ambient'` for muted looping backgrounds.

[Showcase guide →](docs/showcase.md)

## Bring your own interface

```ts
import { createKineox } from '@blcklab/kineox/core';

const video = document.querySelector<HTMLVideoElement>('video')!;
const controller = createKineox(video);
const unsubscribe = controller.subscribe(() => {
  console.log(controller.getSnapshot().status);
});

unsubscribe();
controller.destroy();
```

The Core doesn't import Player, Showcase or CSS. Framework adapters can use the public controller instead of depending on Kineox internals.

## Try the examples

```bash
npm ci
npm run check
npm run demo
```

Open **http://localhost:8000/examples/**. The local playground lets you compare the Player and Showcase, try borderless styles and test a video from your computer. Your selected file stays in your browser.

`npm run check` runs the normal local/CI verification. Optional browser tests require Python Playwright and are separate from this command.

## Documentation

[All guides](docs/README.md) · [Player](docs/player.md) · [Showcase](docs/showcase.md) · [Customization](docs/customization.md) · [Framework adapters](docs/framework-adapters.md) · [Compatibility](docs/compatibility.md)

Kineox's npm package contains compiled code, TypeScript declarations, optional CSS, the README and license—not the examples, repository docs or internal development notes.

**MIT © BLCKLAB.**

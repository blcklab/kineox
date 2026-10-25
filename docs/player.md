# Video Player

Use Player when people will actively watch a video: demos, tutorials, clips or walkthroughs. It has its own interface but uses the same headless Kineox Core as Showcase.

## Basic player

```ts
import { mountPlayer } from '@blcklab/kineox/player';
import '@blcklab/kineox/styles/player.css';

const player = mountPlayer('#video', {
  source: { src: '/videos/tutorial.mp4', type: 'video/mp4' },
  poster: '/images/tutorial.webp',
  title: 'Tutorial',
  captions: [
    { src: '/captions/en.vtt', srclang: 'en', label: 'English' }
  ],
  controls: { speed: true, captions: true, fullscreen: true }
});

player.destroy();
```

Use an ordinary container such as `<div id="video"></div>`. Captions use WebVTT files; Kineox doesn't generate captions for you.

## Borderless and minimal styles

```ts
const player = mountPlayer('#video', {
  source: { src: '/videos/demo.mp4' },
  appearance: 'borderless', // 'default' | 'minimal' | 'borderless'
  theme: 'dark'
});
```

`borderless` removes the decorative border, radius and shadow. It does **not** disable playback controls or automatically make the video fullscreen.

## Show controls when needed

```ts
interaction: {
  controls: 'auto',  // 'auto' or 'always'
  idleDelayMs: 2400
}
```

With `auto`, controls fade during playback when you're idle, and reappear with pointer movement or keyboard navigation. They stay visible while paused. Use `always` if persistent controls suit your application better.

You can also choose which buttons to include:

```ts
controls: {
  seek: true,
  volume: true,
  speed: true,
  captions: true,
  fullscreen: true,
  pictureInPicture: true,
  skip: true
}
```

Fullscreen and picture-in-picture buttons only appear when the browser reports the necessary capabilities.

## Keyboard controls

When focus is on the player container: Space or K plays/pauses; Left/J and Right/L seek five seconds; M mutes; C changes captions; F requests fullscreen. Native sliders and menus keep their own keyboard behavior. Shortcuts don't steal keystrokes from form fields.

## Using the headless controller

`player.controller` gives you access to playback and state: `play()`, `pause()`, `seek()`, `setSource()`, `getSnapshot()` and `subscribe()`.

If you inject your own controller, the video element must already be inside the target container. In that case, you own its media source and lifecycle. Calling `player.destroy()` removes the Kineox UI but leaves your borrowed controller intact unless you've explicitly transferred ownership.

## Good to know

Browsers decide which codecs they support and whether playback, PiP and fullscreen requests are allowed. A video can be blocked from autoplay even when muted. Provide an appropriate video, poster and captions, and test on your supported devices.

See also [Customization](customization.md), [Recipes](recipes.md), and [Compatibility](compatibility.md).

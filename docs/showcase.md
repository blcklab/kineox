# Cinematic Showcase

Showcase is built for landing pages, portfolios and product demos. It can show a poster, preview a video quietly, play inline or open an expanded presentation. It doesn't import the full Player UI.

## Start with a poster

```ts
import { mountShowcase } from '@blcklab/kineox/showcase';
import '@blcklab/kineox/styles/showcase.css';

const showcase = mountShowcase('#demo', {
  source: { src: '/videos/product.mp4', type: 'video/mp4' },
  poster: '/images/product.webp',
  title: 'Product walkthrough',
  presentation: { frame: 'minimal', aspectRatio: '16/9' },
  preview: { mode: 'manual' },
  expand: { enabled: true }
});

// When you're done:
showcase.destroy();
```

With a manual preview, the poster stays in place until the user interacts. Kineox avoids immediately loading the full video.

## Pick your presentation

Set `presentation.frame` to one of these styles:

| Frame | Look |
| --- | --- |
| `borderless` or `none` | Video only: no decorative border, radius or shadow |
| `minimal` | A restrained outline and subtle framing |
| `glass` | Light translucent/elevated presentation |
| `browser` | Browser-window style |
| `device` | Device-inspired frame |
| `floating` | Softly elevated media card |
| `cinematic` | A focused cinematic surface |

Use `presentation.fit: 'cover'` for edge-to-edge media that can crop, or `contain` to preserve the whole picture. Frames affect appearance only, not the media engine.

## Play inline instead of opening a popup

```ts
const showcase = mountShowcase('#demo', {
  source: { src: '/videos/demo.mp4' },
  poster: '/images/demo.webp',
  presentation: { frame: 'borderless', fit: 'cover' },
  interaction: {
    posterClick: 'play',   // 'expand' opens the expanded view
    controls: 'auto',     // or 'always'
    idleDelayMs: 2400
  },
  expand: { enabled: true, autoplay: true }
});
```

`posterClick: 'play'` starts in the page; a separate Expand button is still available. Inline previews begin muted with a sound toggle. Use `expand: { enabled: false }` if you don't want expansion at all.

`borderless` stays borderless while playing **and** when expanded. The dark expansion backdrop and accessible controls are separate from the media frame.

## Hover or viewport previews

The `preview.mode` can be `manual`, `hover` or `viewport`. Hover and viewport previews are muted, can loop, and may pause when the video leaves the viewport. Reduced-motion preferences stop implicit previews and keep the poster visible.

```ts
preview: {
  mode: 'viewport',
  loop: true,
  pauseOnExit: true
}
```

A browser may still reject `play()`. Kineox handles this as a normal playback policy outcome rather than crashing the page.

## Ambient backgrounds

For decorative backgrounds, use:

```ts
const ambient = mountShowcase('#hero', {
  mode: 'ambient',
  source: { src: '/videos/loop.mp4' },
  poster: '/images/hero.webp'
});
```

Ambient mode is muted, looping and viewport-aware without default playback controls. A good poster matters: visitors with reduced motion enabled—or browsers blocking autoplay—should still see a meaningful image.

## Expansion and cleanup

Call `await showcase.expand()` or `showcase.collapse()` if you need to control the expanded view yourself. The same video element and controller are kept when expanding, so playback position isn't reset. Escape closes the expanded view, and focus returns to the correct place.

Call `destroy()` when removing the view. If you pass a controller you created yourself, Kineox treats it as borrowed unless you explicitly transfer ownership.

See [Player](player.md) for full playback controls, and [Compatibility](compatibility.md) for browser limitations.

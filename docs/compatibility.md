# Browser compatibility and accessibility

Kineox uses the browser's native `<video>` element. A compatible video file, user activation and the browser's permissions still matter. Kineox doesn't transcode media or bypass autoplay restrictions.

## Current verification status

This repository is at `0.1.0-rc.2`. The following describes actual test coverage, not promised support:

| Environment | Status |
| --- | --- |
| Chromium desktop | Local playback, Showcase, customization, cleanup, borderless, playground and interaction regressions passed in prior RC2 testing |
| Node 20/22/24 | GitHub CI workflow configured; fresh remote CI results not verified in this handoff |
| Firefox desktop | Needs verification |
| Safari on macOS / iOS | Needs verification |
| Android Chrome on a physical device | Needs verification |
| Screen readers | Formal audit not yet completed |

These are release-candidate limitations. Don't interpret passing Chromium tests as proof of full WCAG compliance or mobile device support.

## What happens when a feature isn't available?

- **Autoplay:** Browsers may block it, even when muted. Provide a poster and let the user start playback.
- **Fullscreen and picture-in-picture:** Browser support and user-gesture rules vary. Kineox checks capabilities but can't make an unsupported API work.
- **Video formats:** Codec support varies. MP4 is often the safest starting point, but you should test your actual codec and target browsers.
- **Captions:** Use WebVTT files with proper URL and cross-origin settings.
- **Ambient previews:** Reduced-motion settings keep the poster instead of automatically starting motion.

## Accessibility checklist

Provide a useful title, captions when appropriate, keyboard-accessible controls and a meaningful poster. If you customize the UI, preserve readable contrast, focus indicators, button labels, and a touch-friendly target size. Test with keyboard navigation, mobile touch, browser zoom and a screen reader before launch.

If you find an issue, include the browser, OS, video format, Kineox version, console output and a small reproduction when you [report it](https://github.com/blcklab/kineox/issues).

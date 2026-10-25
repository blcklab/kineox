# Changelog

### Repository cleanup for the RC2 source (no library version change)

- Reorganized public guides under `docs/` with simpler, user-focused examples.
- Moved maintainer testing, publishing and future plans into Git-ignored `.internal/`.
- Simplified CI to Node 20/22/24 checks and tag publishing to one npm job.
- Kept the browser test scripts for manual release validation; they are no longer invoked by GitHub Actions.
- No changes to runtime library APIs, behavior or npm package content.

## 0.1.0-rc.2 — interaction refinement (unpublished)

- Auto-hide idle Player controls during playback; show on pointer movement and keyboard focus, and keep paused controls visible.
- Allow `interaction.controls: "always"` to opt out, with configurable `idleDelayMs`.
- Decouple Showcase poster click from frame style: `posterClick: "play"` plays inline even when expansion remains enabled; `"expand"` preserves existing behavior.
- Auto-hide idle Showcase playback controls without losing modal keyboard accessibility; inline playback includes mute/unmute.
- Add interactive toggles to the local playground and a dedicated Chromium regression suite.
- No change to headless Core or existing frame/appearance behavior.

## 0.1.0-rc.1 — release candidate hardening (unpublished)

- Stop owned Player media before removing its video DOM node.
- Stop owned Showcase video when destroyed after manual or ambient playback; leave injected caller-owned controllers alone unless ownership was explicitly transferred or Kineox started an active preview.
- Add real Chromium regressions for ownership, active playback teardown and source-cleanup behavior.
- Run Playground, Presentation, and RC lifecycle suites in CI **and** before tag publishing.
- Freeze the public Core, Player, Showcase, Theme, UI and Extensions APIs for candidate validation.
- Document release gates and remaining Firefox, Safari/iOS, Android and screen-reader work.

Kineox follows prerelease versioning while the public API is being validated. Versions below are development targets unless explicitly published on npm.

## 0.1.0-alpha.7 — Minimal and borderless presentation

- Preserve truly borderless video surfaces during playback and Showcase expansion.
- Add `minimal`, `glass`, and `borderless` Showcase frame presets; keep `none` as a compatible alias.
- Add optional `presentation.fit` for contain/cover video presentation.
- Add framework-independent Player appearance presets: `default`, `minimal`, and `borderless`.
- Add visual preset switching and playback regression tests. No changes to headless Core.

## 0.1.0-alpha.6 — M6 Release preparation

- Reworked public README and user guides for both Player and Showcase.
- Added framework-adapter, API recipe, testing, compatibility and release guides.
- Moved milestone handoffs from `docs/` into `.internal/`.
- Added Node 20/22/24 CI, Chromium regression coverage, and tag-based npm publishing with trusted OIDC.
- Added documentation, lockfile and release-workflow checks.
- No breaking changes to the headless Core, Player, Showcase or extension APIs.

## 0.1.0-alpha.5 — M5 Reliability

- Improved controller teardown, ambient poster fallback and reduced-motion handling.
- Hardened focus/modal cleanup, same-origin iframe behavior, error recovery and repeated mounts.

## 0.1.0-alpha.4 — M4 Customization

- Added semantic theme tokens, independent UI extension slots and headless behavior hosts.

## 0.1.0-alpha.3 — M3 Showcase

- Added cinematic presentation frames, poster-first previews, ambient mode and same-element expansion.

## 0.1.0-alpha.2 — M2 Player

- Added playback controls, speed, captions, seeking, fullscreen, PiP and keyboard shortcuts.

## 0.1.0-alpha.1 — M1 Core

- Added the native-video headless controller, typed state, source lifecycle and core tests.

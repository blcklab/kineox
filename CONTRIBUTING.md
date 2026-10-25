# Contributing to Kineox

Thanks for helping improve Kineox. It's a small, framework-agnostic video library, and keeping it easy to integrate matters as much as adding features.

## Before opening a pull request

Run:

```bash
npm ci
npm run check
```

If you change Player, Showcase or browser interactions, run the relevant optional Chromium test commands from `package.json` too. They require Python Playwright and Chromium (not installed by npm). Tell us which browsers and devices you actually tested.

Please keep Core independent of Player, Showcase, CSS and frameworks. Build features on public APIs where possible, include focused tests for changes, and keep user documentation in `docs/`.

## Docs and repository layout

- `docs/` is for clear, public user guides.
- `examples/` contains runnable sample pages.
- `src/` contains the library itself.
- Maintainers keep drafts, milestone history and future plans in their locally ignored `.internal/` folder.

Please don't commit secrets, generated output or unlicensed media.

## Versions and tags

Only maintainers publish releases. Pushing a matching `v*` tag starts the publishing workflow, so avoid pushing tags as part of an ordinary pull request. You can check current compatibility notes in [the browser guide](docs/compatibility.md).

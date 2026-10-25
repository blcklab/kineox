# Player demo

From the repository root, run:

```bash
npm run build
npm run demo
```

Open http://localhost:8000/examples/player/ . The sample plays a lightweight cinematic loop from `examples/media/showcase-loop.mp4`. The black technical test clip remains under `tests/assets/short.mp4` for regressions. Replace the source and poster with your own video assets to evaluate the player UI.

The stylesheet is imported separately from `dist/styles/player.css` and the player through `dist/player/index.js`; no framework bundler is required for this example.

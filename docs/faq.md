# Frequently asked questions

## Do I need React or Vue?

No. Kineox works with regular browser JavaScript and TypeScript. Frameworks can wrap the public APIs, but aren't required.

## Can I use it without any UI?

Yes. Import `createKineox` from `@blcklab/kineox/core` and control an existing video element.

## Can the video be completely borderless?

Yes. Use `appearance: 'borderless'` for Player, or `presentation: { frame: 'borderless' }` (also `none`) for Showcase. This remains borderless during inline and expanded playback.

## Why did clicking a video expand it?

Showcase's poster click defaults to expansion when expansion is enabled. Use `interaction: { posterClick: 'play' }` to play inline instead. Borderless styling doesn't control this behavior.

## Can the controls disappear when I'm not using them?

Yes. Set `interaction: { controls: 'auto', idleDelayMs: 2400 }`. Controls return when you interact, and remain visible while paused. Use `controls: 'always'` to keep them visible.

## Does Kineox support HLS, YouTube or DRM?

Not as built-in adapters in this release candidate. Kineox uses native media APIs and relies on your browser for format support. Future adapters may be offered separately.

## Can I load video information from a database or JSON?

Yes. Supply the resulting JavaScript configuration object when creating a Player or Showcase. Runtime source switching is available through the controller. Kineox isn't a playlist database or video CMS.

## Is the project ready for production everywhere?

Not yet. Chromium checks have passed locally, while Firefox, Safari/iOS, physical Android and screen-reader testing still need independent validation. See [Compatibility](compatibility.md).

## Are internal docs or demos included in the npm package?

No. npm ships only the compiled library, types, opt-in styles, README and MIT license. Guides and examples live in the GitHub repository, and maintainer-only notes live in ignored `.internal/`.

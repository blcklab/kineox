/** Trusted static SVG icon templates; never interpolate user content into markup. */
const icons = {
  play: '<polygon points="8 5 19 12 8 19 8 5"/>',
  pause: '<rect x="7" y="5" width="4" height="14" rx="1"/><rect x="15" y="5" width="4" height="14" rx="1"/>',
  replay: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 9a5 5 0 0 1 0 6M18 6a9 9 0 0 1 0 12"/>',
  mute: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/>',
  fullscreen: '<path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m13-5v4a1 1 0 0 1-1 1h-4"/>',
  shrink: '<path d="M8 8H3m5 0V3M16 8h5m-5 0V3M8 16H3m5 0v5m8-5h5m-5 0v5"/>',
  pip: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 12h7v6h-7z"/>',
  captions: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M10 10a3 3 0 1 0 0 4m9-4a3 3 0 1 0 0 4"/>',
  back: '<path d="M10 5 3 12l7 7"/><path d="M20 5 13 12l7 7"/>',
  forward: '<path d="m4 5 7 7-7 7m10-14 7 7-7 7"/>'
} as const;
export type PlayerIcon = keyof typeof icons;
export function iconSvg(name: PlayerIcon): string {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icons[name]}</svg>`;
}

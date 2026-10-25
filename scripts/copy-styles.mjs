import { mkdir, copyFile } from 'node:fs/promises';
await mkdir(new URL('../dist/styles/', import.meta.url), { recursive: true });
await copyFile(new URL('../src/styles/player.css', import.meta.url), new URL('../dist/styles/player.css', import.meta.url));
await copyFile(new URL('../src/styles/showcase.css', import.meta.url), new URL('../dist/styles/showcase.css', import.meta.url));

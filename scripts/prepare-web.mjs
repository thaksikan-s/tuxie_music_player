import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = resolve(projectRoot, 'www');
const webFiles = [
  'index.html',
  'library-state.js',
  'app.js',
  'offline-ui.js',
  'styles.css',
  'icon.svg',
  'manifest.webmanifest',
  'assets/branding/tuxie-avatar-512.jpg',
  'assets/branding/tuxie-portrait-720x960.jpg',
  'assets/branding/tuxie-app-icon-512.png'
];

await mkdir(webRoot, { recursive: true });

for (const file of webFiles) {
  const destination = resolve(webRoot, file);
  await mkdir(dirname(destination), { recursive: true });
  await cp(resolve(projectRoot, file), destination);
}

console.log(`Prepared ${webFiles.length} offline web assets in www/.`);

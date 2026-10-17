import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidRes = resolve(projectRoot, 'android', 'app', 'src', 'main', 'res');
const sourceRes = resolve(projectRoot, 'assets', 'branding', 'android-res');

try {
  await access(androidRes);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  throw new Error('Generate the Capacitor Android project with npm run android:add before applying launcher assets.');
}

await mkdir(androidRes, { recursive: true });
const installResources = async (source, destination) => {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = resolve(source, entry.name);
    const destinationPath = resolve(destination, entry.name);
    if (entry.isDirectory()) await installResources(sourcePath, destinationPath);
    else await cp(sourcePath, destinationPath, { force: true });
  }
};
await installResources(sourceRes, androidRes);

const valuesDir = resolve(androidRes, 'values');
const stringsPath = resolve(valuesDir, 'strings.xml');
await mkdir(valuesDir, { recursive: true });

let strings;
try {
  strings = await readFile(stringsPath, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  strings = '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n';
}

for (const [name, value] of [['app_name', 'Tuxie Music Player'], ['title_activity_main', 'Tuxie Music Player'], ['widget_description', 'Playback controls for Tuxie Music Player']]) {
  const appName = `<string name="${name}">${value}</string>`;
  const existing = new RegExp(`<string\\s+name="${name}">[\\s\\S]*?<\\/string>`);
  if (existing.test(strings)) {
    strings = strings.replace(existing, appName);
  } else {
    strings = strings.replace('</resources>', `    ${appName}\n</resources>`);
  }
}
await writeFile(stringsPath, strings, 'utf8');

console.log(`Installed Tuxie launcher and splash resources in ${androidRes}`);

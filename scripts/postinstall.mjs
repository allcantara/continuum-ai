import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

var postinstallPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../dist/infrastructure/cursor/postinstall.js',
);

if (!existsSync(postinstallPath)) {
  process.exit(0);
}

await import(postinstallPath);

import { cp } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

var root = join(dirname(fileURLToPath(import.meta.url)), '..');
await cp(join(root, 'src/presentation/ui/public'), join(root, 'dist/presentation/ui/public'), {
  recursive: true,
});

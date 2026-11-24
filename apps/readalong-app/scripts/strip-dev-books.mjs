// Readalong: public/dev-books holds test books for `dev-web` (copyrighted,
// git-ignored). Next copies public/ into the static export, so remove them
// from every build output before Tauri packages it into an app.
import { rmSync, existsSync } from 'node:fs';

for (const dir of ['out/dev-books', '.next/standalone/public/dev-books']) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    console.log(`[readalong] removed ${dir} from the build output`);
  }
}

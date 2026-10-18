import { defineConfig } from 'vite';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Lance le serveur de la base locale (explorer-db/serve.py) avec `npm run dev` et `npm run preview`,
// et l'arrête avec eux. Sans environnement Python installé, l'appli interroge simplement Lichess.
function explorerDb() {
  let proc = null;
  const start = () => {
    if (proc) return;
    const dir = fileURLToPath(new URL('./explorer-db/', import.meta.url));
    const py = join(dir, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
    if (!existsSync(py)) {
      console.log('[base locale] explorer-db/.venv absent : données Lichess en direct (voir le README).');
      return;
    }
    // --watch-stdin : le serveur s'arrête tout seul si Vite disparaît sans prévenir (tuyau stdin fermé).
    proc = spawn(py, ['serve.py', '--watch-stdin'], {
      cwd: dir,
      stdio: ['pipe', 'inherit', 'inherit'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    proc.on('exit', () => { proc = null; });
    process.once('exit', () => proc && proc.kill());
  };
  return { name: 'explorer-db', configureServer: start, configurePreviewServer: start };
}

// base relative : le dossier dist/ fonctionne servi depuis n'importe quel chemin.
export default defineConfig({ base: './', plugins: [explorerDb()] });

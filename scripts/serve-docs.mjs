import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(rootDir, 'docs', '.static');
const port = Number(process.env.PORT || 5174);

function contentType(filePath) {
  const ext = path.extname(filePath);
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  }[ext] || 'application/octet-stream';
}

async function ensureBuilt() {
  if (existsSync(path.join(outDir, 'index.html'))) return;
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(rootDir, 'scripts', 'build-docs.mjs')], {
      cwd: rootDir,
      stdio: 'inherit',
    });
    child.on('exit', (code) => (code === 0 ? resolve(undefined) : reject(new Error(`docs build exited with ${code}`))));
  });
}

await ensureBuilt();

createServer(async (req, res) => {
  try {
    const rawPath = decodeURIComponent(new URL(req.url || '/', `http://localhost:${port}`).pathname);
    const normalized = rawPath === '/' ? '/index.html' : rawPath;
    const candidate = path.normalize(path.join(outDir, normalized));
    if (!candidate.startsWith(outDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const stats = await stat(candidate).catch(() => null);
    const filePath = stats?.isDirectory() ? path.join(candidate, 'index.html') : candidate;
    const body = await readFile(filePath);
    res.writeHead(200, { 'content-type': contentType(filePath) });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Docs preview: http://127.0.0.1:${port}`);
});

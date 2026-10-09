const bufferutil = require('bufferutil');
const lightningcss = require('lightningcss');
const sharp = require('sharp');
const sqlite3 = require('sqlite3');
const ts = require('typescript');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

async function run() {
  const input = Buffer.from('openharmony');
  const masked = Buffer.alloc(input.length);
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  bufferutil.mask(input, mask, masked, 0, input.length);
  bufferutil.unmask(masked, mask);
  if (!masked.equals(input)) throw new Error('bufferutil mask/unmask round trip failed');

  const css = lightningcss.transform({
    filename: 'input.css',
    code: Buffer.from('.fixture { color: red }'),
  });
  if (!css.code.toString().includes('color: red')) throw new Error('lightningcss transform failed');

  const png = await sharp({
    create: { width: 1, height: 1, channels: 4, background: '#c00' },
  }).png().toBuffer();
  if (png[1] !== 0x50 || png[2] !== 0x4e || png[3] !== 0x47) {
    throw new Error('sharp did not produce a PNG');
  }

  await new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:');
    db.get('SELECT 40 + 2 AS answer', (error, row) => {
      db.close((closeError) => {
        if (error) return reject(error);
        if (closeError) return reject(closeError);
        if (row.answer !== 42) return reject(new Error('sqlite3 query returned an unexpected result'));
        resolve();
      });
    });
  });

  const tempDir = fs.mkdtempSync(path.join(__dirname, '.test-output-'));
  try {
    const source = path.join(tempDir, 'fixture.ts');
    const outputDir = path.join(tempDir, 'out');
    fs.mkdirSync(outputDir);
    fs.writeFileSync(source, 'const answer: number = 42;');
    const tsc = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin', 'tsc');
    execFileSync(process.execPath, [tsc, '--target', 'ES2020', '--outDir', outputDir, source]);
    if (!fs.readFileSync(path.join(outputDir, 'fixture.js'), 'utf8').includes('42')) {
      throw new Error('typescript CLI compile failed');
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const vitePackage = path.dirname(require.resolve('vite/package.json'));
  const viteCli = path.join(vitePackage, 'bin', 'vite.js');
  execFileSync(process.execPath, [viteCli, 'build'], { cwd: __dirname, stdio: 'inherit' });
  const builtHtml = fs.readFileSync(path.join(__dirname, 'dist', 'index.html'), 'utf8');
  const builtAssets = fs.readdirSync(path.join(__dirname, 'dist', 'assets'));
  if (!builtHtml.includes('/assets/') || !builtAssets.some((file) => file.endsWith('.css'))) {
    throw new Error('Vue/Vite front-end build output is incomplete');
  }

  const port = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
  const preview = spawn(process.execPath, [viteCli, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: __dirname,
    stdio: 'ignore',
  });
  try {
    let response;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (preview.exitCode !== null) throw new Error(`Vite preview exited early (${preview.exitCode})`);
      try {
        response = await fetch(`http://127.0.0.1:${port}/`);
        break;
      } catch {
        await delay(100);
      }
    }
    if (!response || response.status !== 200) throw new Error('Vite preview did not serve the built app');
    const previewHtml = await response.text();
    if (!previewHtml.includes('ports consumer compatibility')) throw new Error('Vite preview served unexpected HTML');
    const scriptPath = /src="([^"]+\.js)"/.exec(previewHtml)?.[1];
    if (!scriptPath) throw new Error('Vite preview HTML is missing its JavaScript bundle');
    const scriptResponse = await fetch(new URL(scriptPath, `http://127.0.0.1:${port}`));
    if (scriptResponse.status !== 200 || !(await scriptResponse.text()).includes('OpenHarmony npm ports')) {
      throw new Error('Vite preview did not serve the Vue application bundle');
    }
  } finally {
    if (preview.exitCode === null) {
      const exited = new Promise((resolve) => preview.once('exit', resolve));
      preview.kill();
      await Promise.race([exited, delay(2000)]);
    }
  }

  return ['bufferutil', 'lightningcss', 'sharp', 'sqlite3', 'typescript', 'Vue/Vite build + preview'];
}

module.exports = { run };

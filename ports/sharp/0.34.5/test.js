// @test-package: sharp
// @test-setup: true
// @test-timeout: 1800
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);

(async () => {
  const tools = await import(process.env.PORT_TEST_HELPER);
  if (process.env.PORT_TEST_PHASE === 'setup') {
    if (process.platform === 'openharmony') {
      for (const dependency of 'openssl@4 jpeg-turbo libpng webp libtiff giflib glib little-cms2 highway cgif exiv2 libarchive libheif libde265 libspng librsvg cairo pango freetype fontconfig libimagequant openjpeg aom dav1d orc gettext'.split(' ')) {
        const installed = tools.command('brew', ['list', '--versions', dependency], { codes: [0, 1] });
        if (installed.status !== 0 || !installed.stdout.trim()) tools.command('brew', ['install', '-y', dependency], { timeout: 600000 });
      }
    }
    return;
  }
  const sharp = (await import('sharp')).default;
  const image = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#ff0000' } }).png().toBuffer();
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const { data, info } = await sharp(image).resize(4, 3).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 4);
  assert.equal(info.height, 3);
  assert.deepEqual([...data.subarray(0, 3)], [255, 0, 0]);
  tools.report({ png: true, resize: true, pixel: [255, 0, 0] });
})().catch((error) => { console.error(error); process.exitCode = 1; });

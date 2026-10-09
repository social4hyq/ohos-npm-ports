// @test-package: lightningcss
const assert = require('node:assert/strict');
const { transform } = require('lightningcss');

const result = transform({
  filename: 'probe.css',
  code: Buffer.from('.probe { user-select: none; color: #ffffff; }'),
  minify: true,
  targets: { chrome: 100 << 16 },
});
const css = result.code.toString();
assert.match(css, /\.probe/);
assert.match(css, /user-select/);
assert.match(css, /#fff|white/);

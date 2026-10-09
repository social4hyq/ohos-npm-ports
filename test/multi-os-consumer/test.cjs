const { run } = require('compat-consumer');
const fixture = require('./package.json');
const lock = require('./package-lock.json');

for (const [dependency, override] of Object.entries(fixture.overrides)) {
  const match = /^npm:(@[^/]+\/[^@]+)@(.+)$/.exec(override);
  if (!match) throw new Error(`Unexpected override format for ${dependency}: ${override}`);
  const installed = lock.packages[`node_modules/${dependency}`];
  if (!installed || installed.name !== match[1] || installed.version !== match[2]) {
    throw new Error(`Lockfile does not resolve ${dependency} to ${override}`);
  }
}
if (fixture.overrides.lightningcss !== 'npm:@ohos-npm-ports/lightningcss@1.33.0-1') {
  throw new Error('The frontend fixture must retain its lightningcss port override');
}

run().then((packages) => {
  console.log(`Consumer API probes passed: ${packages.join(', ')}`);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

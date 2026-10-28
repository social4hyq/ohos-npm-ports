// autobump：检测白名单 port 的上游新版本，并生成新版本目录。
//   node autobump.mjs plan [--ports a,b]          检测，输出 matrix / step summary
//   node autobump.mjs bump <port:from:to>...      改写（复制目录 + 替换版本串 + 校验）
import { execFileSync } from 'node:child_process';
import { appendFileSync, copyFileSync, mkdtempSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parse = (v) => {
  const m = SEMVER.exec(v);
  if (!m) throw new Error(`not a semver: ${v}`);
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split('.') : [] };
};

export function compareVersions(a, b) {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) { if (Number(p) !== Number(q)) return Number(p) - Number(q); } else if (pn !== qn) return pn ? -1 : 1;
    else if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}

// ^base：不低于 base，且不跨过最左边第一个非零位
export function satisfiesCaret(version, base) {
  if (compareVersions(version, base) < 0) return false;
  const [maj, min, pat] = parse(base).core;
  const v = parse(version).core;
  if (maj > 0) return v[0] === maj;
  if (min > 0) return v[0] === 0 && v[1] === min;
  return v[0] === 0 && v[1] === 0 && v[2] === pat;
}

export function highestVersion(versions) {
  return versions.filter((v) => SEMVER.test(v)).sort(compareVersions).at(-1) ?? null;
}

// <old>-<N> → <new>-1（修订号归一），再 <old> → <new>；两侧带数字边界，0.6.6 不会误伤 0.6.60 / 10.6.6 / 0.6.6.1
export function rewriteText(text, from, to) {
  const f = escapeRe(from);
  return text
    .replace(new RegExp(`(?<![\\d.])${f}-\\d+(?!\\d|\\.\\d)`, 'g'), `${to}-1`)
    .replace(new RegExp(`(?<![\\d.])${f}(?!\\d|\\.\\d)`, 'g'), to);
}

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const isText = (buf) => !buf.includes(0);

export function bumpPort(root, port, from, to) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(port) || !/^\d+\.\d+\.\d+$/.test(from) || !/^\d+\.\d+\.\d+$/.test(to) || compareVersions(to, from) <= 0) throw new Error('invalid bump');
  const src = join(root, 'ports', port, from);
  const dst = join(root, 'ports', port, to);
  if (!existsSync(src)) throw new Error(`source dir missing: ${src}`);
  if (existsSync(dst)) throw new Error(`target dir already exists: ${dst}`);
  if (/sha256sum\s+-c|shasum\s+-a\s+256/.test(readFileSync(join(src,'build.sh'),'utf8'))) throw new Error('pinned checksum needs manual updater');
  const tracked = execFileSync('git', ['ls-files', '-z', '--', `ports/${port}/${from}/`], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
  if (!tracked.length) throw new Error('no tracked recipe files');
  for (const file of tracked) {
    const target = join(dst, relative(`ports/${port}/${from}`, file));
    mkdirSync(dirname(target), {recursive:true});
    copyFileSync(join(root,file), target);
  }
  try {
    const changed = [];
    for (const file of walk(dst)) {
      const buf = readFileSync(file);
      if (!isText(buf) || file.endsWith('.patch')) continue;
      const text = buf.toString('utf8');
      const next = rewriteText(text, from, to);
      if (new RegExp(`(?<![\\d.])${escapeRe(from)}(?![\\d.])`).test(next)) throw new Error(`residue of ${from} in ${file}`);
      if (next === text) continue;
      writeFileSync(file, next);
      changed.push(file);
    }
    for (const script of ['build.sh', 'publish.sh']) {
      const file = join(dst, script);
      if (!existsSync(file)) throw new Error(`missing ${script}`);
      try { execFileSync('sh', ['-n', file], { stdio: 'pipe' }); } catch { throw new Error(`${script} syntax check failed`); }
    }
    return changed;
  } catch (e) {
    rmSync(dst, { recursive: true, force: true });
    throw e;
  }
}

const STABLE = /^\d+\.\d+\.\d+$/;

// 选目标版本：
//   默认      — registry 全部稳定版本里满足 ^from 的最高者；latest 已跨出范围也不影响旧系列的更新
//   range '*' — 取 dist-tag（tag，默认 latest）指向的稳定版本，不限范围
// 范围内没有更新而 latest 更高 → manual-major（仅提示，不生成）
export function selectTarget(info, from, spec = {}) {
  if (spec.range === '*') {
    const tag = spec.tag ?? 'latest';
    const target = info.tags?.[tag];
    if (!target) return { to: null, status: 'error', note: `no dist-tag ${tag}` };
    if (!STABLE.test(target)) return { to: null, status: 'error', note: `dist-tag ${tag} is not a stable version` };
    return compareVersions(target, from) <= 0 ? { to: target, status: 'current', note: '' } : { to: target, status: 'bump', note: '' };
  }
  const latest = info.tags?.latest;
  const inRange = info.versions.filter((v) => STABLE.test(v) && compareVersions(v, from) > 0 && satisfiesCaret(v, from));
  const best = highestVersion(inRange);
  if (best) return { to: best, status: 'bump', note: latest && latest !== best && STABLE.test(latest) && compareVersions(latest, best) > 0 ? `latest ${latest} 超出 ^${from}，需人工` : '' };
  if (!latest || !STABLE.test(latest)) return { to: null, status: 'error', note: 'latest is not a stable version' };
  if (compareVersions(latest, from) <= 0) return { to: latest, status: 'current', note: '' };
  return { to: latest, status: 'manual-major', note: '' };
}

export async function planPorts(root, config, fetchInfo, only = null) {
  for (const [name, spec] of Object.entries(config.ports)) {
    if (spec.tag !== undefined && spec.range !== '*') throw new Error(`${name}: tag requires range "*"`);
    if (spec.range !== undefined && spec.range !== '*') throw new Error(`${name}: unsupported range ${spec.range}`);
  }
  if (only) {
    for (const name of only) if (!Object.hasOwn(config.ports, name)) throw new Error(`unknown port: ${name}`);
    const groups = new Set(only.map(name => config.ports[name].group).filter(Boolean));
    only = Object.keys(config.ports).filter(name => only.includes(name) || groups.has(config.ports[name].group));
  }
  const rows = [];
  for (const [port, spec] of Object.entries(config.ports)) {
    if (only && !only.includes(port)) continue;
    const dir = join(root, 'ports', port);
    const from = existsSync(dir) ? highestVersion(readdirSync(dir).filter(v => STABLE.test(v) && statSync(join(dir,v)).isDirectory())) : null;
    const row = { port, npm: spec.npm, group: spec.group, from, to: null, status: 'error', note: '' };
    rows.push(row);
    if (!from) { row.note = 'no version dir'; continue; }
    if (spec.hold) { row.status = 'hold'; row.note = String(spec.hold); continue; }
    let info;
    try { info = await fetchInfo(spec.npm); } catch (e) { row.note = `registry: ${e.message}`; continue; }
    Object.assign(row, selectTarget(info, from, spec));
  }
  return rows;
}

// 同组必须整体可升且目标版本一致，否则整组退回；每组（或单 port）一个分支/PR
export function groupPlan(rows) {
  const buckets = new Map();
  for (const r of rows) {
    if (r.status !== 'bump' && !(r.group && rows.some((o) => o.group === r.group && o.status === 'bump'))) continue;
    const key = r.group ?? r.port;
    buckets.set(key, [...(buckets.get(key) ?? []), r]);
  }
  const groups = [];
  for (const [key, members] of buckets) {
    const bumpable = members.filter((m) => m.status === 'bump');
    const sameTarget = new Set(bumpable.map((m) => m.to)).size === 1;
    if (bumpable.length !== members.length || !sameTarget) {
      for (const m of bumpable) { m.status = 'group-incomplete'; m.note = 'group members not all bumpable to the same version'; }
      continue;
    }
    groups.push({ key, branch: `autobump/${key}-${members[0].to}`, to: members[0].to, members });
  }
  return groups;
}

async function fetchInfo(name) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name).replace('%40', '@')}`, { signal: AbortSignal.timeout(30000), headers: { accept: 'application/vnd.npm.install-v1+json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const doc = await res.json();
      return { tags: doc['dist-tags'] ?? {}, versions: Object.entries(doc.versions ?? {}).filter(([, meta]) => !meta?.deprecated).map(([v]) => v) };
    } catch (e) { last = e; await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
  }
  throw last;
}

const ICON = { bump: '⬆️ bump', current: '✅ current', 'manual-major': '⚠️ 需人工（跨大版本）', hold: '⏸ hold', error: '❌ error', 'group-incomplete': '⚠️ 联动组不完整' };
const summary = (rows) => ['| port | 当前 | 上游 | 状态 | 备注 |', '|---|---|---|---|---|', ...rows.map((r) => `| ${r.port} | ${r.from ?? '-'} | ${r.to ?? '-'} | ${ICON[r.status]} | ${r.note} |`)].join('\n');


export function applyDelta(before, after, upstream, from, to) {
  const out = structuredClone(upstream);
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    if (!(key in after)) { delete out[key]; continue; }
    if (before[key] && after[key] && typeof before[key] === 'object' && typeof after[key] === 'object' && !Array.isArray(after[key])) {
      out[key] = applyDelta(before[key], after[key], out[key] ?? {}, from, to);
    } else out[key] = JSON.parse(rewriteText(JSON.stringify(after[key]), from, to));
  }
  return out;
}

async function regenerateMetadata(root, port, from, to) {
  const dir = join(root,'ports',port,to);
  const patches = walk(dir).filter(f=>f.endsWith('.patch') && /^(?:---|\+\+\+) [ab]\/package\.json$/m.test(readFileSync(f,'utf8')));
  if (!patches.length) return;
  if (patches.length !== 1) throw new Error('multiple metadata patches need manual review');
  const patch = patches[0];
  const patchText = readFileSync(patch,'utf8');
  if ([...patchText.matchAll(/^--- (.+)$/gm)].some(m=>m[1] !== 'a/package.json')) throw new Error('mixed metadata patch needs manual review');
  const config = JSON.parse(readFileSync(join(root,'.github/autobump.json'),'utf8'));
  const npm = config.ports[port].npm;
  const temp = mkdtempSync(join(tmpdir(),'autobump-metadata-'));
  try {
    const packages = [];
    for (const version of [from,to]) {
      const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(npm)}/${version}`, {signal:AbortSignal.timeout(30000)});
      if (!response.ok) throw new Error(`registry HTTP ${response.status}`);
      const meta = await response.json();
      if (!meta.dist?.tarball?.startsWith('https://registry.npmjs.org/')) throw new Error('unexpected tarball URL');
      const tarball = join(temp,`${version}.tgz`);
      execFileSync('curl',['-fsSL','--retry','3','--max-time','120',meta.dist.tarball,'-o',tarball]);
      const text = execFileSync('tar',['-xOf',tarball,'package/package.json'],{encoding:'utf8'});
      packages.push(text);
    }
    writeFileSync(join(temp,'package.json'),packages[0]);
    execFileSync('patch',['-p1','-i',join(process.cwd(),patch)],{cwd:temp,stdio:'pipe'});
    const patched = JSON.parse(readFileSync(join(temp,'package.json'),'utf8'));
    const before = JSON.parse(packages[0]);
    if (JSON.stringify(before) === JSON.stringify(patched)) throw new Error('metadata patch was not applied');
    const result = applyDelta(before,patched,JSON.parse(packages[1]),from,to);
    writeFileSync(join(temp,'before.json'),packages[1]);
    writeFileSync(join(temp,'after.json'),JSON.stringify(result,null,2)+'\n');
    let diff;
    try { diff = execFileSync('diff',['-u','--label','a/package.json','--label','b/package.json',join(temp,'before.json'),join(temp,'after.json')],{encoding:'utf8'}); }
    catch (error) { if (error.status !== 1) throw error; diff=error.stdout; }
    if (!diff) throw new Error('empty metadata delta');
    writeFileSync(patch,diff);
  } finally { rmSync(temp,{recursive:true,force:true}); }
}

// 新版本没有 test.js 时从模板补一份；模板须带 @test-package 头且语法可解析（按 ESM 检查）
export function installTestTemplate(root, port, to) {
  const target = join(root, 'ports', port, to, 'test.js');
  const template = join(root, '.github/autobump-tests', `${port}.js`);
  if (existsSync(target) || !existsSync(template)) return false;
  const source = readFileSync(template, 'utf8');
  if (!/^\/\/ @test-package: \S+$/m.test(source)) throw new Error(`test template ${port}.js missing @test-package`);
  const temp = mkdtempSync(join(tmpdir(), 'autobump-template-'));
  try {
    const check = join(temp, 'test.mjs');
    writeFileSync(check, source);
    try { execFileSync(process.execPath, ['--check', check], { stdio: 'pipe' }); } catch { throw new Error(`test template ${port}.js syntax check failed`); }
  } finally { rmSync(temp, { recursive: true, force: true }); }
  copyFileSync(template, target);
  return true;
}

async function main(argv) {
  const [cmd, ...args] = argv;
  if (cmd === 'plan') {
    const i = args.indexOf('--ports');
    const only = i >= 0 && args[i + 1] ? args[i + 1].split(',').map((s) => s.trim()).filter(Boolean) : null;
    const config = JSON.parse(readFileSync('.github/autobump.json', 'utf8'));
    const rows = await planPorts('.', config, fetchInfo, only);
    const groups = groupPlan(rows).slice(0, Number(process.env.AUTOBUMP_MAX ?? 3));
    const md = summary(rows);
    console.log(md);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## autobump plan\n\n${md}\n`);
    const matrix = { include: groups.map((g) => ({ key: g.key, branch: g.branch, to: g.to, bumps: g.members.map((m) => `${m.port}:${m.from}:${m.to}`).join(' '), npm: g.members[0].npm })) };
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(matrix)}\n`);
    else console.log(JSON.stringify(matrix));
    if (rows.some(r => r.status === 'error')) process.exitCode = 1;
  } else if (cmd === 'bump') {
    if (!args.length) throw new Error('usage: bump <port:from:to>...');
    const created = [];
    try {
      for (const spec of args) {
        const [port, from, to] = spec.split(':');
        const files = bumpPort('.', port, from, to);
        created.push(join('ports',port,to));
        await regenerateMetadata('.', port, from, to);
        installTestTemplate('.', port, to);
        console.log(`${port}: ${from} -> ${to} (${files.length} files)`);
      }
    } catch(error) {
      for (const path of created) rmSync(path,{recursive:true,force:true});
      throw error;
    }
  } else throw new Error('usage: autobump.mjs plan|bump');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });

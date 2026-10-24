// autobump：检测白名单 port 的上游新版本，并生成新版本目录。
//   node autobump.mjs plan [--ports a,b]          检测，输出 plan.json / matrix / step summary
//   node autobump.mjs bump <port:from:to>...      改写（复制目录 + 替换版本串 + 校验）
import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

// <old>-<N> → <new>-1（修订号归一），再 <old> → <new>；两侧带数字边界，0.6.6 不会误伤 0.6.60 / 10.6.6
export function rewriteText(text, from, to) {
  const f = escapeRe(from);
  return text
    .replace(new RegExp(`(?<![\\d.])${f}-\\d+(?!\\d)`, 'g'), `${to}-1`)
    .replace(new RegExp(`(?<![\\d.])${f}(?!\\d)`, 'g'), to);
}

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const isText = (buf) => !buf.includes(0);

export function bumpPort(root, port, from, to) {
  const src = join(root, 'ports', port, from);
  const dst = join(root, 'ports', port, to);
  if (!existsSync(src)) throw new Error(`source dir missing: ${src}`);
  if (existsSync(dst)) throw new Error(`target dir already exists: ${dst}`);
  cpSync(src, dst, { recursive: true });
  try {
    const changed = [];
    for (const file of walk(dst)) {
      const buf = readFileSync(file);
      if (!isText(buf)) continue;
      const text = buf.toString('utf8');
      const next = rewriteText(text, from, to);
      if (next !== text) writeFileSync(file, next);
      if (next.includes(from)) throw new Error(`residue of ${from} in ${file}`);
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

export async function planPorts(root, config, fetchLatest, only = null) {
  const rows = [];
  for (const [port, spec] of Object.entries(config.ports)) {
    if (only && !only.includes(port)) continue;
    const dir = join(root, 'ports', port);
    const from = existsSync(dir) ? highestVersion(readdirSync(dir)) : null;
    const row = { port, npm: spec.npm, group: spec.group, from, to: null, status: 'error', note: '' };
    rows.push(row);
    if (!from) { row.note = 'no version dir'; continue; }
    if (spec.hold) { row.status = 'hold'; row.note = String(spec.hold); continue; }
    let latest;
    try { latest = await fetchLatest(spec.npm, spec.tag ?? 'latest'); } catch (e) { row.note = `registry: ${e.message}`; continue; }
    row.to = latest;
    if (compareVersions(latest, from) <= 0) { row.status = 'current'; continue; }
    const ok = spec.range ? spec.range === '*' : satisfiesCaret(latest, from);
    row.status = ok ? 'bump' : 'manual-major';
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

async function fetchLatest(name, tag) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name).replace('%40', '@')}`, { headers: { accept: 'application/vnd.npm.install-v1+json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const v = (await res.json())['dist-tags']?.[tag];
      if (!v) throw new Error(`no dist-tag ${tag}`);
      return v;
    } catch (e) { last = e; await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
  }
  throw last;
}

const ICON = { bump: '⬆️ bump', current: '✅ current', 'manual-major': '⚠️ 需人工（跨大版本）', hold: '⏸ hold', error: '❌ error', 'group-incomplete': '⚠️ 联动组不完整' };
const summary = (rows) => ['| port | 当前 | 上游 | 状态 | 备注 |', '|---|---|---|---|---|', ...rows.map((r) => `| ${r.port} | ${r.from ?? '-'} | ${r.to ?? '-'} | ${ICON[r.status]} | ${r.note} |`)].join('\n');

async function main(argv) {
  const [cmd, ...args] = argv;
  if (cmd === 'plan') {
    const i = args.indexOf('--ports');
    const only = i >= 0 && args[i + 1] ? args[i + 1].split(',').map((s) => s.trim()).filter(Boolean) : null;
    const config = JSON.parse(readFileSync('.github/autobump.json', 'utf8'));
    const rows = await planPorts('.', config, fetchLatest, only);
    const groups = groupPlan(rows).slice(0, Number(process.env.AUTOBUMP_MAX ?? 3));
    const md = summary(rows);
    console.log(md);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## autobump plan\n\n${md}\n`);
    const matrix = { include: groups.map((g) => ({ key: g.key, branch: g.branch, to: g.to, bumps: g.members.map((m) => `${m.port}:${m.from}:${m.to}`).join(' '), npm: g.members[0].npm })) };
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(matrix)}\n`);
    else console.log(JSON.stringify(matrix));
  } else if (cmd === 'bump') {
    if (!args.length) throw new Error('usage: bump <port:from:to>...');
    for (const spec of args) {
      const [port, from, to] = spec.split(':');
      const files = bumpPort('.', port, from, to);
      console.log(`${port}: ${from} -> ${to} (${files.length} files)`);
    }
  } else throw new Error('usage: autobump.mjs plan|bump');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });

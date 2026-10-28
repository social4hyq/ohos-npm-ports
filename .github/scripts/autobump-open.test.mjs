import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,writeFileSync,mkdirSync,copyFileSync,chmodSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
const script=resolve('.github/scripts/autobump-open.mjs');
const group={key:'foo',branch:'autobump/foo-1.1.0',to:'1.1.0',bumps:'foo:1.0.0:1.1.0',npm:'foo'};
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'autobump-open-'));
 mkdirSync(join(dir,'bin'));mkdirSync(join(dir,'.github/scripts'),{recursive:true});mkdirSync(join(dir,'ports/foo/1.0.0'),{recursive:true});
 for(const file of ['build.sh','publish.sh'])writeFileSync(join(dir,'ports/foo/1.0.0',file),'echo 1.0.0\n');
 copyFileSync('.github/scripts/autobump.mjs',join(dir,'.github/scripts/autobump.mjs'));
 writeFileSync(join(dir,'.github/scripts/port-lint.sh'),'exit 0\n');
 const gh=join(dir,'bin/gh');writeFileSync(gh,`#!/bin/sh\nprintf '%s\\n' "$*" >> "$CAPTURE"\ncase "$*" in\n 'pr list '*) printf '%s' "$MOCK_PR";;\n 'api '*'/actions/workflows/'*) printf '%s' "$MOCK_RUNS_API";;\n 'api '*'/comments'*) printf '%s' "$MOCK_COMMENTS";;\nesac\n`);chmodSync(gh,0o755);
 execFileSync('git',['init','-q'],{cwd:dir});execFileSync('git',['add','ports'],{cwd:dir});return dir;
}
function invoke(dir,extra={}) {return spawnSync(process.execPath,[script],{cwd:dir,encoding:'utf8',env:{...process.env,PATH:join(dir,'bin')+':'+process.env.PATH,CAPTURE:join(dir,'calls'),GITHUB_REPOSITORY:'social4hyq/ohos-npm-ports',BUMP_GROUP:JSON.stringify(group),MOCK_PR:JSON.stringify([{number:1,state:'OPEN',createdAt:'2026-10-01T00:00:00Z',headRefOid:'a'.repeat(40)}]),MOCK_COMMENTS:'[]',...extra,MOCK_RUNS_API:apiPages(extra.MOCK_RUNS)}});}
// 每个 run 单独一页，模拟分页；字段同 REST workflow runs
function apiPages(runs='[]') {return JSON.stringify(JSON.parse(runs).map(r=>({workflow_runs:[{display_title:r.displayTitle,status:r.status,conclusion:r.conclusion||null,html_url:r.url}]})));}
test('dry run never calls GitHub or pushes',()=>{const dir=fixture();const result=invoke(dir,{DRY_RUN:'true'});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Dry run/);assert.throws(()=>readFileSync(join(dir,'calls')));});
test('existing successful or running SHA is not dispatched again',()=>{for(const status of ['in_progress','completed']){const dir=fixture();const result=invoke(dir,{MOCK_RUNS:JSON.stringify([{displayTitle:'autobump #1 '+ 'a'.repeat(40),status,conclusion:'success',url:'https://example.test/run'}])});assert.equal(result.status,0,result.stderr);assert.doesNotMatch(readFileSync(join(dir,'calls'),'utf8'),/workflow run/);}});
test('existing PR without successful CI is explicitly dispatched',()=>{const dir=fixture();const result=invoke(dir);assert.equal(result.status,0,result.stderr);assert.match(readFileSync(join(dir,'calls'),'utf8'),/workflow run ci.yml.*--ref main.*autobump-pr=1.*autobump-sha=a{40}/);});

// ---- 重试上限、孤儿分支恢复 ----
import {rmSync,existsSync} from 'node:fs';
const sh=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
const ID=['social4hyq','social4hyq@163.com'];
function origin() {
 const root=mkdtempSync(join(tmpdir(),'autobump-origin-'));
 const bare=join(root,'origin.git');execFileSync('git',['init','-q','--bare','-b','main',bare]);
 const seed=join(root,'seed');execFileSync('git',['init','-q','-b','main',seed]);
 sh(seed,'config','user.name',ID[0]);sh(seed,'config','user.email',ID[1]);
 mkdirSync(join(seed,'ports/foo/1.0.0'),{recursive:true});mkdirSync(join(seed,'.github/scripts'),{recursive:true});
 for(const file of ['build.sh','publish.sh'])writeFileSync(join(seed,'ports/foo/1.0.0',file),'echo 1.0.0\n');
 copyFileSync('.github/scripts/autobump.mjs',join(seed,'.github/scripts/autobump.mjs'));
 writeFileSync(join(seed,'.github/scripts/port-lint.sh'),'exit 0\n');
 writeFileSync(join(seed,'.github/PULL_REQUEST_TEMPLATE.md'),'- [ ] 已有 port 升级上游版本\n');
 sh(seed,'add','-A');sh(seed,'commit','-qm','seed');sh(seed,'remote','add','origin',bare);sh(seed,'push','-q','origin','main');
 return {root,bare};
}
// 全新 runner：克隆 origin、放 gh 垫片，模拟一次 Actions 运行
function runner(o,name) {
 const dir=join(o.root,name);execFileSync('git',['clone','-q','--no-hardlinks',o.bare,dir]);mkdirSync(join(dir,'bin'));
 const gh=join(dir,'bin/gh');writeFileSync(gh,`#!/bin/sh\nprintf '%s\\n' "$*" >> "$CAPTURE"\ncase "$*" in\n 'pr list '*) printf '%s' "$MOCK_PR";;\n 'api '*'/actions/workflows/'*) printf '%s' "$MOCK_RUNS_API";;\n 'api '*'/comments'*) printf '%s' "$MOCK_COMMENTS";;\n 'pr create '*) if [ -n "$FAIL_PR_CREATE" ]; then exit 1; fi;;\n 'pr view '*) printf '{"number":7,"createdAt":"2026-10-01T00:00:00Z","headRefOid":"%s"}' "$(git rev-parse HEAD)";;\nesac\n`);chmodSync(gh,0o755);
 return dir;
}
const calls=(dir)=>existsSync(join(dir,'calls'))?readFileSync(join(dir,'calls'),'utf8'):'';
const run=(dir,extra={})=>invoke(dir,{MOCK_PR:'[]',...extra});
// 篡改远程分支：克隆、改动、普通提交并强推（模拟人工/恶意修改）
function tamper(o,branch,edit,{amend=false,identity=ID}={}) {
 const dir=mkdtempSync(join(o.root,'tamper-'));execFileSync('git',['clone','-q','--no-hardlinks','-b',branch,o.bare,dir]);
 sh(dir,'config','user.name',identity[0]);sh(dir,'config','user.email',identity[1]);
 edit(dir);sh(dir,'add','-A');
 if(amend)sh(dir,'commit','-q','--amend','--no-edit','--reset-author');else sh(dir,'commit','-qm','extra');
 sh(dir,'push','-q','-f','origin',`HEAD:refs/heads/${branch}`);
}
const remoteSha=(o,branch)=>sh(o.bare,'rev-parse',branch);

test('interrupted run (push ok, PR create failed) is recovered without a second push',()=>{
 const o=origin();
 const first=runner(o,'r1');const r1=run(first,{FAIL_PR_CREATE:'1'});
 assert.notEqual(r1.status,0);
 const pushed=remoteSha(o,group.branch);
 const second=runner(o,'r2');const r2=run(second);
 assert.equal(r2.status,0,r2.stderr+r2.stdout);
 assert.equal(remoteSha(o,group.branch),pushed,'branch must not be rewritten');
 assert.match(calls(second),/pr create .*--head autobump\/foo-1\.1\.0/);
 assert.match(calls(second),/workflow run ci\.yml.*autobump-sha=/);
});

for (const [label,edit,opts,reason] of [
 ['extra commit on top',d=>writeFileSync(join(d,'ports/foo/1.1.0/extra.txt'),'x\n'),undefined,'parent is not in main history'],
 ['modified generated file in place (amend)',d=>writeFileSync(join(d,'ports/foo/1.1.0/build.sh'),'echo evil\n'),{amend:true},'content differs'],
 ['file outside the expected version dir (amend)',d=>writeFileSync(join(d,'README.md'),'x\n'),{amend:true},'unexpected change'],
 ['workflow file added (amend)',d=>{mkdirSync(join(d,'.github/workflows'),{recursive:true});writeFileSync(join(d,'.github/workflows/x.yml'),'on: push\n');},{amend:true},'unexpected change'],
 ['existing old version dir modified (amend)',d=>writeFileSync(join(d,'ports/foo/1.0.0/build.sh'),'echo changed\n'),{amend:true},'unexpected change'],
 ['other identity (amend)',d=>writeFileSync(join(d,'ports/foo/1.1.0/build.sh'),'echo 1.1.0\n'),{amend:true,identity:['agent','agent@example.test']},'unexpected author'],
 ['executable bit flipped (amend)',d=>execFileSync('chmod',['+x',join(d,'ports/foo/1.1.0/build.sh')]),{amend:true},'content differs'],
]) test(`tampered orphan branch is refused and left untouched: ${label}`,()=>{
 const o=origin();
 assert.notEqual(run(runner(o,'r1'),{FAIL_PR_CREATE:'1'}).status,0);
 tamper(o,group.branch,edit,opts);
 const before=remoteSha(o,group.branch);
 const second=runner(o,'r2');const result=run(second);
 assert.notEqual(result.status,0,'must refuse');
 assert.match(result.stderr,new RegExp(reason));
 assert.equal(remoteSha(o,group.branch),before);
 assert.doesNotMatch(calls(second),/pr create|workflow run/);
});

test('orphan branch that is not the current generation result is refused',()=>{
 const o=origin();
 assert.notEqual(run(runner(o,'r1'),{FAIL_PR_CREATE:'1'}).status,0);
 const second=runner(o,'r2');
 // 本轮预期生成别的内容（本轮 main 上 1.0.0 配方已变）→ 与分支真实 diff 不一致
 writeFileSync(join(second,'ports/foo/1.0.0/build.sh'),'echo 1.0.0 changed\n');sh(second,'config','user.name',ID[0]);sh(second,'config','user.email',ID[1]);sh(second,'commit','-qam','main moved');sh(second,'push','-q','origin','main');
 const result=run(second);
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/content differs/);
 assert.doesNotMatch(calls(second),/pr create/);
});

test('orphan branch from an unrelated parent or merge commit is refused',()=>{
 const o=origin();
 const other=mkdtempSync(join(o.root,'other-'));execFileSync('git',['clone','-q','--no-hardlinks',o.bare,other]);sh(other,'config','user.name',ID[0]);sh(other,'config','user.email',ID[1]);
 sh(other,'checkout','-q','--orphan','side');sh(other,'commit','-qm','foo: bump to 1.1.0','--allow-empty');sh(other,'push','-q','origin',`side:${group.branch}`);
 const second=runner(o,'r2');const result=run(second);
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/single-parent/);
 assert.doesNotMatch(calls(second),/pr create/);
});

test('closed or merged PR for the branch is never reopened or recreated',()=>{
 const o=origin();const dir=runner(o,'r1');
 const result=run(dir,{MOCK_PR:JSON.stringify([{number:3,state:'CLOSED',headRefOid:'a'.repeat(40)}])});
 assert.equal(result.status,0);assert.doesNotMatch(calls(dir),/pr create|workflow run/);
});

const T='autobump #1 '+'a'.repeat(40);
const runsOf=(...items)=>JSON.stringify(items.map(([status,conclusion])=>({displayTitle:T,status,conclusion,url:'https://example.test/r'})));
test('CI retry: failed SHA is retried once, then capped at two failures; cancelled is always retryable',()=>{
 const dispatches=(runs)=>{const dir=fixture();const result=invoke(dir,{MOCK_RUNS:runs});assert.equal(result.status,0,result.stderr);return /workflow run/.test(readFileSync(join(dir,'calls'),'utf8'));};
 assert.equal(dispatches(runsOf(['completed','failure'])),true);
 assert.equal(dispatches(runsOf(['completed','failure'],['completed','timed_out'])),false);
 assert.equal(dispatches(runsOf(['completed','failure'],['completed','failure'],['completed','cancelled'])),false);
 assert.equal(dispatches(runsOf(['completed','cancelled'],['completed','cancelled'],['completed','cancelled'])),true);
 assert.equal(dispatches(runsOf(['completed','failure'],['in_progress',''])),false);
 assert.equal(dispatches(runsOf(['completed','failure'],['completed','failure'],['completed','success'])),false);
 // 其他 SHA 的失败不计入
 const other=JSON.stringify([{displayTitle:'autobump #1 '+'b'.repeat(40),status:'completed',conclusion:'failure',url:'u'},{displayTitle:'autobump #1 '+'b'.repeat(40),status:'completed',conclusion:'failure',url:'u'}]);
 assert.equal(dispatches(other),true);
});

test('CI history is queried by pagination since PR creation, not a fixed recent window',()=>{
 const dir=fixture();
 const runs=[];for(let i=0;i<150;i++)runs.push({displayTitle:'autobump #9 '+String(i).padStart(40,'0'),status:'completed',conclusion:'success',url:'u'});
 runs.push({displayTitle:T,status:'completed',conclusion:'failure',url:'u'},{displayTitle:T,status:'completed',conclusion:'failure',url:'u'});
 const result=invoke(dir,{MOCK_RUNS:JSON.stringify(runs)});
 assert.equal(result.status,0,result.stderr);
 const log=readFileSync(join(dir,'calls'),'utf8');
 assert.match(log,/api --paginate --slurp .*actions\/workflows\/ci\.yml\/runs\?.*event=workflow_dispatch.*created=>=2026-10-01T00:00:00Z/);
 assert.doesNotMatch(log,/--limit/);
 assert.doesNotMatch(log,/workflow run/,'old failures beyond the first 100 runs must still count');
});
test('persistent PR comments also count failures when run history is gone (deleted/expired runs)',()=>{
 const dir=fixture();
 const comment=(c)=>({body:`Autobump CI: ${c}\n\nSHA: \`${'a'.repeat(40)}\``});
 const result=invoke(dir,{MOCK_RUNS:'[]',MOCK_COMMENTS:JSON.stringify([[comment('FAIL'),comment('PASS（仅构建验证）')],[comment('FAIL'),{body:'Autobump CI: FAIL\n\nSHA: `'+'b'.repeat(40)+'`'}]])});
 assert.equal(result.status,0,result.stderr);
 assert.doesNotMatch(readFileSync(join(dir,'calls'),'utf8'),/workflow run/);
 assert.match(result.stdout,/retry cap/);
});

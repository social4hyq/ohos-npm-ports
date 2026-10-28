import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const run=(cmd,...args)=>execFileSync(cmd,args,{encoding:'utf8'}).trim();
const gh=(...args)=>run('gh',...args);
const git=(...args)=>run('git',...args);

const IDENTITY={name:'social4hyq',email:'social4hyq@163.com'};
// 同一 SHA 的 CI 失败次数达到此值后不再自动调度；人工 gh workflow run 不受限
export const MAX_CI_FAILURES=2;
const RETRYABLE=new Set(['success','cancelled','skipped','stale']);

// 同标题（PR + SHA）的历史 run → 是否调度。进行中/成功去重；cancelled 不计失败；失败有上限
export function classifyRuns(runs,title,cap=MAX_CI_FAILURES,reported=0) {
 const same=runs.filter(r=>r.displayTitle===title);
 const active=same.find(r=>r.status!=='completed');
 if(active)return {action:'skip',reason:'active',url:active.url};
 const ok=same.find(r=>r.conclusion==='success');
 if(ok)return {action:'skip',reason:'success',url:ok.url};
 const failed=same.filter(r=>!RETRYABLE.has(r.conclusion));
 const failures=Math.max(failed.length,reported);
 if(failures>=cap)return {action:'skip',reason:'capped',failures,url:failed[0]?.url??'(PR comments)'};
 return {action:'dispatch',failures};
}

// 完整 CI 历史：分页拉取该 PR 创建以来的全部 workflow_dispatch 运行（不是“最近 N 条”窗口）。
// 另把 PR 评论里回写的 FAIL 结论按 SHA 计入：run 被删除或过期后失败计数仍然持久。
export function ciHistory({repo,pr,sha}) {
 const pages=JSON.parse(gh('api','--paginate','--slurp',`repos/${repo}/actions/workflows/ci.yml/runs?event=workflow_dispatch&per_page=100&created=>=${pr.createdAt}`));
 const runs=pages.flatMap(page=>page.workflow_runs??[]).map(r=>({displayTitle:r.display_title,status:r.status,conclusion:r.conclusion,url:r.html_url}));
 const comments=JSON.parse(gh('api','--paginate','--slurp',`repos/${repo}/issues/${pr.number}/comments?per_page=100`)).flat();
 const reported=comments.filter(c=>typeof c.body==='string'&&c.body.startsWith('Autobump CI: FAIL')&&c.body.includes(`SHA: \`${sha}\``)).length;
 return {runs,reported};
}

// 孤儿分支（已 push 但未建出 PR）只在满足全部条件时接管：
//   单个提交、父提交在当前 main 历史内、本机器人身份与固定提交信息、
//   只新增预期版本目录，且这些目录与本轮重新生成并 git add 的结果逐文件（模式+内容）一致。
// 任一不符即抛错，不覆盖、不强推。
export function verifyOrphan({branch,key,to,dirs}) {
 const fail=(why)=>{throw new Error(`Existing branch ${branch} rejected: ${why}`);};
 git('fetch','--no-tags','origin',`refs/heads/${branch}`);
 const sha=git('rev-parse','FETCH_HEAD^{commit}');
 const parents=git('rev-list','--parents','-n','1',sha).split(' ').slice(1);
 if(parents.length!==1)fail('not a single-parent commit');
 try{git('merge-base','--is-ancestor',parents[0],'HEAD');}catch{fail('parent is not in main history');}
 if(git('rev-list','--count',`HEAD..${sha}`)!=='1')fail('branch is not exactly one commit ahead of main');
 const who=git('log','-1','--format=%an <%ae>|%cn <%ce>',sha);
 const expected=`${IDENTITY.name} <${IDENTITY.email}>`;
 if(who!==`${expected}|${expected}`)fail(`unexpected author/committer ${who}`);
 if(git('log','-1','--format=%B',sha)!==`${key}: bump to ${to}`)fail('unexpected commit message');
 const changes=git('diff-tree','-r','--no-renames','--name-status',parents[0],sha).split('\n').filter(Boolean);
 if(!changes.length)fail('empty commit');
 for(const line of changes){
  const [status,path]=line.split('\t');
  if(status!=='A'||!dirs.some(d=>path.startsWith(`${d}/`)))fail(`unexpected change: ${line}`);
 }
 const staged=git('ls-files','-s','--',...dirs).split('\n').filter(Boolean).map(l=>{const [meta,path]=l.split('\t');const [mode,id]=meta.split(' ');return `${mode} ${id} ${path}`;}).sort();
 const actual=git('ls-tree','-r',sha,'--',...dirs).split('\n').filter(Boolean).map(l=>{const [meta,path]=l.split('\t');const [mode,,id]=meta.split(' ');return `${mode} ${id} ${path}`;}).sort();
 if(!staged.length||JSON.stringify(staged)!==JSON.stringify(actual))fail('content differs from this run\'s generated result');
 return sha;
}

function main() {
 const group=JSON.parse(process.env.BUMP_GROUP);
 const dry=process.env.DRY_RUN==='true';
 const repo=process.env.GITHUB_REPOSITORY;
 assert.match(group.branch,/^autobump\/[a-z0-9-]+-\d+\.\d+\.\d+$/);
 const [,,to]=group.bumps.split(' ')[0].split(':');
 const summary=msg=>{console.log(msg);if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,msg+'\n');};
 let pr;
 let orphan=false;
 if(!dry) {
  const matches=JSON.parse(gh('pr','list','--repo',repo,'--state','all','--head',group.branch,'--json','number,state,createdAt,headRefOid'));
  if(matches.length){
   pr=matches.find(p=>p.state==='OPEN');
   if(!pr){summary('Existing closed/merged PR: no changes');process.exit(0);}
  } else orphan=Boolean(git('ls-remote','--heads','origin',group.branch));
 }
 if(!pr) {
  run('node','.github/scripts/autobump.mjs','bump',...group.bumps.split(' '));
  const dirs=group.bumps.split(' ').map(b=>{const [p,,v]=b.split(':');return `ports/${p}/${v}`;});
  run('bash','.github/scripts/port-lint.sh',...dirs);
  git('add','--',...dirs);
  summary(git('diff','--cached','--stat'));
  if(dry){summary('Dry run: no push, PR or CI dispatch');process.exit(0);}
  if(orphan){
   verifyOrphan({branch:group.branch,key:group.key,to,dirs});
   summary(`Recovered verified branch ${group.branch} without PR`);
  } else {
   git('config','user.name',IDENTITY.name);git('config','user.email',IDENTITY.email);
   git('checkout','-b',group.branch);
   git('commit','-m',`${group.key}: bump to ${to}`);
   git('push','origin',`HEAD:refs/heads/${group.branch}`);
  }
  const template=readFileSync('.github/PULL_REQUEST_TEMPLATE.md','utf8');
  const body=template.replace('- [ ] 已有 port 升级上游版本','- [x] 已有 port 升级上游版本')+`\n\n${group.bumps.split(' ').map(b=>{const [p,f,t]=b.split(':');return `- ${p}: ${f} → ${t} (revision -1)`;}).join('\n')}\n\nUpstream: https://www.npmjs.com/package/${group.npm}/v/${to}\n\nGenerated recipe update; code patches unchanged, metadata patches regenerated. CI pending; human review required. No automatic merge or npm publication.\n`;
  gh('pr','create','--repo',repo,'--base','main','--head',group.branch,'--title',`${group.key}: bump to ${to}`,'--body',body);
  pr=JSON.parse(gh('pr','view',group.branch,'--repo',repo,'--json','number,createdAt,headRefOid'));
 }
 const sha=pr.headRefOid;
 const history=ciHistory({repo,pr,sha});
 const decision=classifyRuns(history.runs,`autobump #${pr.number} ${sha}`,MAX_CI_FAILURES,history.reported);
 if(decision.action==='skip'){
  summary(decision.reason==='capped'
   ?`CI retry cap reached (${decision.failures} failures for ${sha}): ${decision.url}\nFix the PR or dispatch manually: gh workflow run ci.yml --ref main -f autobump-pr=${pr.number} -f autobump-sha=${sha}`
   :`CI already ${decision.reason==='active'?'scheduled':'passed'}: ${decision.url}`);
  process.exit(0);
 }
 gh('workflow','run','ci.yml','--repo',repo,'--ref','main','-f',`autobump-pr=${pr.number}`,'-f',`autobump-sha=${sha}`);
 summary(`Scheduled CI for PR #${pr.number}, SHA ${sha}${decision.failures?` (retry after ${decision.failures} failure)`:''}`);
}

if(process.argv[1]===fileURLToPath(import.meta.url))main();

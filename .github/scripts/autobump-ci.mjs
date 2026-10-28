import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {evaluate,render} from './autobump-report.mjs';
const gh=(...args)=>execFileSync('gh',args,{encoding:'utf8'}).trim();
const api=path=>JSON.parse(gh('api',`repos/${process.env.GITHUB_REPOSITORY}/${path}`));
const pr=process.env.AUTOBUMP_PR;
assert.match(pr??'',/^\d+$/);
assert.match(process.env.AUTOBUMP_SHA??'',/^[a-f0-9]{40}$/);
const data=api(`pulls/${pr}`);
assert.equal(data.head.repo.full_name,process.env.GITHUB_REPOSITORY);
assert.equal(data.base.ref,'main');
assert.match(data.head.ref,/^autobump\/[a-z0-9-]+-\d+\.\d+\.\d+$/);
if(process.argv[2]==='validate') {
 assert.equal(data.state,'open');
 assert.equal(data.head.sha,process.env.AUTOBUMP_SHA,'PR head changed');
 assert.ok(!process.env.ARTIFACT_RUN_ID && !process.env.CONSUMER_SELECTION,'autobump cannot replay or override selection');
 const files=JSON.parse(gh('api','--paginate','--slurp',`repos/${process.env.GITHUB_REPOSITORY}/pulls/${pr}/files?per_page=100`)).flat();
 assert.ok(files.length>0);
 for(const f of files) {assert.equal(f.status,'added');assert.match(f.filename,/^ports\/[a-z0-9-]+\/\d+\.\d+\.\d+\//);}
 appendFileSync(process.env.GITHUB_OUTPUT,`base=${data.base.sha}\n`);
} else if(process.argv[2]==='report') {
 const needs=JSON.parse(process.env.JOB_RESULTS);
 const current=data.head.sha===process.env.AUTOBUMP_SHA;
 const url=`${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
 const body=render(evaluate(needs),{sha:process.env.AUTOBUMP_SHA,stale:!current,url});
 gh('api','--method','POST',`repos/${process.env.GITHUB_REPOSITORY}/issues/${pr}/comments`,'-f',`body=${body}`);
} else throw new Error('expected validate or report');

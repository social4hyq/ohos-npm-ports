import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,writeFileSync,chmodSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const dir=mkdtempSync(join(tmpdir(),'autobump-ci-test-'));
const shim=join(dir,'gh');
writeFileSync(shim,`#!/bin/sh\ncase "$*" in\n  *'/files?'*) printf '%s' "$MOCK_FILES";;\n  *'/comments'*) printf '%s' "$*" > "$CAPTURE";;\n  *) printf '%s' "$MOCK_PR";;\nesac\n`);chmodSync(shim,0o755);
const data={state:'open',head:{sha:'a'.repeat(40),ref:'autobump/foo-1.1.0',repo:{full_name:'social4hyq/ohos-npm-ports'}},base:{ref:'main',sha:'b'.repeat(40)}};
function invoke(command,overrides={},pr=data,files=[[{status:'added',filename:'ports/foo/1.1.0/build.sh'}]]) {
 return spawnSync(process.execPath,[resolve('.github/scripts/autobump-ci.mjs'),command],{encoding:'utf8',env:{...process.env,PATH:dir+':'+process.env.PATH,GITHUB_REPOSITORY:'social4hyq/ohos-npm-ports',AUTOBUMP_PR:'12',AUTOBUMP_SHA:'a'.repeat(40),CAPTURE:join(dir,'capture'),GITHUB_OUTPUT:join(dir,'output'),MOCK_PR:JSON.stringify(pr),MOCK_FILES:JSON.stringify(files),...overrides}});
}
test('CI request accepts matching immutable same-repo PR',()=>assert.equal(invoke('validate').status,0));
test('CI rejects mismatched SHA, cross-repo PR, replay and infrastructure edits',()=>{
 assert.notEqual(invoke('validate',{AUTOBUMP_SHA:'c'.repeat(40)}).status,0);
 assert.notEqual(invoke('validate',{}, {...data,head:{...data.head,repo:{full_name:'attacker/repo'}}}).status,0);
 assert.notEqual(invoke('validate',{ARTIFACT_RUN_ID:'123'}).status,0);
 assert.notEqual(invoke('validate',{},data,[[{status:'added',filename:'.github/workflows/evil.yml'}]]).status,0);
});
test('report never labels an old SHA as current',()=>{
 const result=invoke('report',{JOB_RESULTS:JSON.stringify({'detect-changes':{result:'success'},'build-and-publish':{result:'success'}})}, {...data,head:{...data.head,sha:'c'.repeat(40)}});
 assert.equal(result.status,0,result.stderr);
 assert.match(readFileSync(join(dir,'capture'),'utf8'),/STALE/);
});
test('report on the current SHA fails when selected consumer jobs did not run',()=>{
 const needs={'detect-changes':{result:'success',outputs:{matrix:'["ports/foo/1.1.0"]','consumer-enabled':'true','consumer-ports':'["ports/foo/1.1.0"]'}},'build-and-publish':{result:'success'}};
 const result=invoke('report',{JOB_RESULTS:JSON.stringify(needs)});
 assert.equal(result.status,0,result.stderr);
 const body=readFileSync(join(dir,'capture'),'utf8');
 assert.match(body,/Autobump CI: FAIL/);assert.doesNotMatch(body,/STALE/);
});

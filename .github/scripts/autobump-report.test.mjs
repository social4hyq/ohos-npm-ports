import assert from 'node:assert/strict';
import {test} from 'node:test';
import {evaluate,render} from './autobump-report.mjs';
const CONSUMERS=['consumer-tests-windows-x64','consumer-tests-linux-arm64','consumer-tests-linux-x64','consumer-tests-darwin-arm64','consumer-tests-openharmony'];
const needs=({consumers='success',build='success',detect='success',enabled=true,matrix=['ports/foo/1.1.0'],ports=['ports/foo/1.1.0'],drop=[]}={})=>{
 const r={'detect-changes':{result:detect,outputs:{matrix:JSON.stringify(matrix),'consumer-enabled':String(enabled),'consumer-ports':JSON.stringify(enabled?ports:[])}},'build-and-publish':{result:build,outputs:{}}};
 for(const job of CONSUMERS)r[job]={result:enabled?consumers:'skipped',outputs:{}};
 for(const job of drop)delete r[job];
 return r;
};
test('full pass lists built directories and every consumer platform that ran',()=>{
 const e=evaluate(needs());
 assert.equal(e.verdict,'PASS');assert.equal(e.coverage,'build+consumers');
 const text=render(e,{sha:'a'.repeat(40),stale:false,url:'u'});
 assert.match(text,/PASS/);assert.match(text,/ports\/foo\/1\.1\.0/);assert.match(text,/windows-x64.*success/);
});
test('no consumer tests is a build-only pass and says so',()=>{
 const e=evaluate(needs({enabled:false}));
 assert.equal(e.verdict,'PASS');assert.equal(e.coverage,'build-only');
 assert.match(render(e,{sha:'a'.repeat(40),stale:false,url:'u'}),/没有消费者测试.*仅构建/s);
});
test('consumers skipped although selected is incomplete, not a pass',()=>{
 for(const consumers of ['skipped','cancelled','failure']){const e=evaluate(needs({consumers}));assert.equal(e.verdict,'FAIL',consumers);}
 const e=evaluate(needs({drop:['consumer-tests-openharmony']}));
 assert.equal(e.verdict,'FAIL');assert.match(e.problems.join('\n'),/openharmony/);
});
test('missing required jobs or empty build selection never pass',()=>{
 assert.equal(evaluate({}).verdict,'FAIL');
 assert.equal(evaluate(needs({drop:['build-and-publish']})).verdict,'FAIL');
 assert.equal(evaluate(needs({matrix:[],enabled:false})).verdict,'FAIL');
 assert.equal(evaluate(needs({build:'skipped'})).verdict,'FAIL');
 assert.equal(evaluate(needs({detect:'failure'})).verdict,'FAIL');
});
test('a stale SHA is never rendered as a current pass or fail',()=>{
 const text=render(evaluate(needs()),{sha:'a'.repeat(40),stale:true,url:'u'});
 assert.match(text,/STALE/);assert.doesNotMatch(text,/Autobump CI: PASS/);assert.match(text,/不代表当前/);
});
test('consumer-enabled with empty, missing or malformed consumer-ports is never a build-only pass',()=>{
 for(const ports of ['[]','','not json',undefined]){
  const n=needs();n['detect-changes'].outputs['consumer-ports']=ports;if(ports===undefined)delete n['detect-changes'].outputs['consumer-ports'];
  const e=evaluate(n);assert.equal(e.verdict,'FAIL',String(ports));assert.match(e.problems.join('\n'),/consumer-ports/);
 }
 const n=needs();delete n['detect-changes'].outputs['consumer-enabled'];
 assert.equal(evaluate(n).verdict,'FAIL');
});

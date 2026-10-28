import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const ci=readFileSync('.github/workflows/ci.yml','utf8');
test('autobump dispatch validates PR and pins all checkouts',()=>{
 assert.match(ci,/autobump-pr:/);
 assert.match(ci,/autobump-sha:/);
 assert.match(ci,/autobump-ci.mjs validate/);
 const checkouts=ci.match(/uses: actions\/checkout@v7/g)||[];
 const refs=ci.match(/ref: \$\{\{.*autobump-sha/g)||[];
 assert.equal(refs.length,checkouts.length-2);
 assert.match(ci,/autobump-ci.mjs report/);
});
test('autobump uses builtin token, opt in, and dry run',()=>{
 const y=readFileSync('.github/workflows/autobump.yml','utf8');
 assert.match(y,/AUTOBUMP_ENABLED/);
 assert.match(y,/github.token/);
 assert.doesNotMatch(y,/AUTOBUMP_TOKEN/);
 assert.match(y,/dry_run/);
});

test('artifact identity uses checked-out commit rather than dispatch default branch SHA',()=>{
 assert.match(readFileSync('.github/scripts/validate-local-publish.sh','utf8'),/rev-parse/);
 assert.match(readFileSync('.github/scripts/run-port-consumer.mjs','utf8'),/Artifact from a different commit/);
 assert.doesNotMatch(readFileSync('.github/scripts/run-port-consumer.mjs','utf8'),/manifest.sourceSha, process.env.GITHUB_SHA/);
});

test('open-pr job has full history so orphan branches can be verified against main',()=>{
 const y=readFileSync('.github/workflows/autobump.yml','utf8');
 assert.match(y.slice(y.indexOf('open-pr:')),/fetch-depth: 0/);
});

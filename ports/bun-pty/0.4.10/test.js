// @test-runtime: bun
// @test-package: bun-pty
// @test-dependency-platforms: openharmony
// @test-dependency: bun@1.4.2=npm:@ohos-npm-ports/bun@1.4.2-1
(async()=>{const assert=require('node:assert/strict'); const {spawn}=await import('bun-pty');
const win=process.platform==='win32', term=spawn(win?'cmd.exe':'sh',win?['/d','/s','/c','echo OHOS_PORT_PTY_SMOKE']:['-c','printf OHOS_PORT_PTY_SMOKE'],{name:'xterm-256color',cols:80,rows:24}); let output='';
const exit=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{term.kill();reject(new Error('PTY timeout'));},10000);term.onData(x=>output+=x);term.onExit(e=>{clearTimeout(timer);resolve(e.exitCode);});});
assert.equal(exit,0); assert.match(output,/OHOS_PORT_PTY_SMOKE/);})().catch(e=>{console.error(e);process.exitCode=1;});

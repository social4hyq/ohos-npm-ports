// 把 CI 的 needs 上下文（结果 + detect-changes 的输出）整理成回写 PR 的结论。
// 原则：被选中的作业没有成功运行（skipped/cancelled/缺失）一律不算通过；
// 没有消费者测试时明确标注“仅构建验证”，不暗示做过消费测试。
const CONSUMERS=['consumer-tests-windows-x64','consumer-tests-linux-arm64','consumer-tests-linux-x64','consumer-tests-darwin-arm64','consumer-tests-openharmony'];
const list=(value)=>{try{const parsed=JSON.parse(value??'[]');return Array.isArray(parsed)?parsed:[];}catch{return [];}};

export function evaluate(needs) {
 const problems=[];
 const detect=needs['detect-changes'];
 const build=needs['build-and-publish'];
 const outputs=detect?.outputs??{};
 const dirs=list(outputs.matrix);
 const consumerPorts=list(outputs['consumer-ports']);
 const enabledFlag=outputs['consumer-enabled'];
 const consumerEnabled=enabledFlag==='true';
 if(enabledFlag!=='true'&&enabledFlag!=='false')problems.push(`detect-changes 输出 consumer-enabled 异常: ${enabledFlag??'missing'}`);
 if(consumerEnabled&&!consumerPorts.length)problems.push('consumer-enabled=true 但 consumer-ports 为空或缺失');
 if(detect?.result!=='success')problems.push(`detect-changes: ${detect?.result??'missing'}`);
 if(!dirs.length)problems.push('没有选中任何构建目录');
 if(build?.result!=='success')problems.push(`build-and-publish: ${build?.result??'missing'}`);
 const consumers=CONSUMERS.map(job=>({job,result:needs[job]?.result??'missing'}));
 if(consumerEnabled)for(const c of consumers)if(c.result!=='success')problems.push(`${c.job}: ${c.result}（已选中消费者测试但未成功运行）`);
 return {verdict:problems.length?'FAIL':'PASS',problems,dirs,consumerEnabled,consumerPorts,consumers,coverage:consumerEnabled?'build+consumers':'build-only'};
}

export function render(e,{sha,stale,url}) {
 const head=stale?'Autobump CI: STALE — PR head 已变化，以下结果不代表当前提交':`Autobump CI: ${e.verdict}${e.verdict==='PASS'&&e.coverage==='build-only'?'（仅构建验证）':''}`;
 const lines=[head,'',`SHA: \`${sha}\``,'',`构建验证（容器构建 + 临时 registry 发布校验）：${e.dirs.length?e.dirs.map(d=>`\`${d}\``).join('、'):'无'}`];
 if(e.consumerEnabled){
  lines.push('',`消费者测试端口：${e.consumerPorts.map(d=>`\`${d}\``).join('、')}`,'','| 平台作业 | 结果 |','|---|---|',...e.consumers.map(c=>`| ${c.job.replace('consumer-tests-','')} | ${c.result} |`));
 } else lines.push('','没有消费者测试：本次选中的目录没有 test.js，仅构建与临时 registry 发布校验，未做消费测试。');
 if(e.problems.length)lines.push('',...e.problems.map(p=>`- ❌ ${p}`));
 lines.push('',`[Run and job results](${url})`,'','No npm publication was performed.');
 return lines.join('\n');
}

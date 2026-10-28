# Autobump

仅在个人 fork 验证：每日北京时间 09:00 查询 npm 官方 registry，生成升级 PR，显式调度 CI。不开自动合并，不发 npm。

## 配置

`.github/autobump.json` 是小白名单，`npm` 指定上游包，`group` 指定必须整体升级到同一版本的主包/平台包，`hold` 填暂停原因。版本选择：默认在 npm 全部稳定版本（排除预发布和已标记 deprecated 的版本）里取满足当前版本 `^` 范围的最高者，所以上游 `latest` 已跨大版本（0.x 为跨 minor）时，旧系列的补丁/小版本更新仍会被发现；范围内没有更新而 `latest` 更高时只在汇总里标 `需人工`，不生成。`range: "*"` 是唯一的放宽开关：改为跟随 dist-tag（`tag`，默认 `latest`）指向的稳定版本，不限范围；`tag` 只能和 `range: "*"` 一起用，单独写会报配置错误，不支持其他 range 表达式。联动组仍要求所有成员选出同一个目标版本，否则整组退回。每轮最多三个 PR。

先合入 fork 的 main，再将仓库变量 `AUTOBUMP_ENABLED` 设为 `true`。无需 PAT，内置 token 需要 Contents / Pull requests / Actions 写权限，以及仓库允许 Actions 创建 PR。

```sh
gh workflow run autobump.yml -R social4hyq/ohos-npm-ports -f ports=bufferutil -f dry_run=true
gh workflow run autobump.yml -R social4hyq/ohos-npm-ports -f ports=bufferutil -f dry_run=false
```

手动默认 dry-run；定时执行会开真实 PR。将变量设为 `false` 可停止后续运行，已排队任务另行取消。

## 更新边界

只复制 Git 管理的配方，保留旧版本目录。更新脚本的版本串；发布修订号重置为 -1。代码 patch 原样复制，不改 hunk。package.json patch 从旧 npm 包解析字段差异，叠加到新 npm 包再用 diff 重新生成 hunk，保留新上游其他字段和依赖。混合文件 patch、多份元数据 patch、固定校验值配方需人工处理，失败不留部分新目录。带本地缓存或产物的目录不会复制进新版本。

单包或联动组一个 PR、一个 commit。未知选择报错，选择一个组员自动展开全组。同版本已有 PR 则复用；已关闭/合并的 PR 不重开。不会关闭其他版本 PR。

孤儿分支（已 push 但建 PR 失败）：下次运行会重新生成本轮预期结果，并核实远程分支后才补建 PR——必须是只比 main 多一个提交的单父提交、父提交在 main 历史内、作者与提交者均为 `social4hyq <social4hyq@163.com>`、提交信息为 `<组名>: bump to <版本>`、只新增预期版本目录，且这些目录与本轮生成并暂存的结果逐文件（文件模式+内容）一致。任何不符直接报错拒绝，不覆盖、不强推，也不补建 PR，留给人工处理（核对后删分支即可重新生成）。需要修订时在已有 PR 人工提交即可，不会被机器人覆盖。

## CI 与重试

GITHUB_TOKEN 创建 PR 不会自然触发 PR CI。autobump 显式调度 main 上的 CI，携带 PR 编号和固定 SHA。CI 验证同仓、main 基底、autobump 分支及只新增版本目录，所有构建/消费作业检出同一 SHA。按 diff 选择目录并执行 port-lint、commit lint、容器构建、临时 registry 发布校验和适用消费测试。新增版本没有 test.js 时可从 `.github/autobump-tests/<port>.js` 加入消费测试。

CI 结果以 PR 评论回写 SHA 和 run 链接，并区分：构建验证（选中的目录）、消费者测试（逐平台作业结果）、无消费者测试时明确写“仅构建验证”。被选中的消费者作业只要 skipped/cancelled/缺失就判 FAIL，不会当作通过；没有选中任何构建目录或构建作业缺失同样 FAIL。PR head 变化后旧结果标为 STALE，并注明不代表当前提交。评论不是受保护分支必需检查的替代，人工合并前须核实当前 SHA 和全部 job。

重试与配额：重新执行相同 autobump 会补调度同 SHA 上被取消的 CI；进行中或已成功的不重复调度；同一 PR+SHA 的失败（failure/timed_out 等，cancelled 不算）累计达 2 次后不再自动调度，只在汇总里提示，避免每天重复占用 Windows/macOS/arm 等 runner。修复 PR（新 SHA）后计数自然重新开始。人工 `gh workflow run` 不受此上限限制。也可手动执行：

```sh
gh workflow run ci.yml -R social4hyq/ohos-npm-ports --ref main -f autobump-pr=NUMBER -f autobump-sha=FULL_SHA
```

手动调度不发布；真正发布仍只允许社区上游 main 的 push。fork 即使已有 `PORTS_RELEASE` 变量也不能发布。容器通过不代表 HarmonyOS 真机可部署；真机功能与签名需单独验证。

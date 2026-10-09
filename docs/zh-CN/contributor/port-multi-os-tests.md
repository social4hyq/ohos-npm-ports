# Port 多 OS 功能测试

每个 `ports/<port>/<upstream-version>/` 目录应提供 `test.js`。这是该 port 版本的功能测试，不是通用的“猜测入口”探针。测试以 CommonJS 脚本编写，直接 `require('@ohos-npm-ports/<package>')`，对公开 API/CLI 做确定性断言；不得只断言文件存在或模块非空。一个 port 产出多个 npm 包时，测试需覆盖所有发布产物，或在测试文件头部清楚说明哪些产物是平台槽位、由哪个父包的测试覆盖。

统一 runner 在干净的临时消费工程中安装精确包版本，将 `test.js` 复制到消费工程根目录后执行，因此测试可以按普通消费者方式解析 `node_modules`。OpenHarmony 上 runner 先安装并运行 `ohos-signpost`，再加载含 `.node` 的包。各 OS 使用同一测试脚本；平台专用包需通过显式平台矩阵声明 N/A 与理由，不能静默 skip。

版本选择按 npm 包名及上游版本线分组，忽略 port revision 的历史重复，仅选择每条线上最大的数值 revision：`0.1.2-1`/`0.1.2-2` 选 `0.1.2-2`；`0.1.3-1`/`0.1.3-2` 另选 `0.1.3-2`。不要把不同上游版本线合并成只测 semver 最大的一个。

PR 的多 OS 门禁应对本次变更构建出的 tarball 执行测试；发布前必须是同一个 tarball 在 OpenHarmony、Linux、Windows 全部成功后才发布。周期回归可对 registry 中每条上游版本线的最新 revision 重测。当前迁移先选 `bufferutil`（native addon）、`sqlite3`（数据库 addon）、`lightningcss`（native API）和 `typescript`（纯 JS/CLI API）验证脚本契约；所有现存 port 目录迁移完成前，不得宣称全量覆盖。

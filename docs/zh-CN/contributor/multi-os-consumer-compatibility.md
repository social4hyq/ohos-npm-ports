# 多 OS 消费侧兼容性回归

## 目的

验证前端工程将上游依赖通过 npm `overrides` 替换为 `@ohos-npm-ports/*` 后，依赖安装与代表性运行路径在 OpenHarmony、Windows、Linux 上仍可用。它补充而不替代各 port 在 OpenHarmony 上的构建/加载验证，也不等同于具体消费项目的完整 E2E。

## 验证契约

每个测试 fixture 都应模拟真实消费项目：fixture 子包声明上游依赖，外层消费项目用 `overrides` 指向固定的 `@ohos-npm-ports` 版本。测试必须确认安装成功，并实际调用包的最小公共 API；前端 fixture 还需执行生产构建并启动预览服务检查 HTTP 响应。仅检查目录存在、`require()` 成功或 port 构建成功不算运行验证。

CI 平台为：

- OpenHarmony：复用仓库 `ci-runner` 容器，在 GitHub-hosted ARM runner 上执行；
- Windows 与 Linux：使用 GitHub-hosted runner 原生执行，不经 OpenHarmony 容器。

第一阶段使用少量代表性包覆盖原生 addon、平台二进制和纯 JS/工具包路径，先验证 workflow 的真实性与稳定性。后续按包增加 fixture/API probe，并逐步扩成全量清单；不能把“代表性矩阵全绿”表述为所有 ports 均已验证。

## 触发与门禁

- 变更测试 fixture、CI 脚本或 port 时运行；
- 支持手动 dispatch 和定期全量回归；
- 首轮在 fork 上观察 OpenHarmony/Windows/Linux 三侧真实运行结果，再决定是否作为上游阻塞门禁；
- 测试摘要要标明 OS、Node/npm 版本、具体包版本及失败阶段。构建/安装、API 探针分别记录，不能把不适用项伪报为通过。

## 当前覆盖

当前 fixture 覆盖 `bufferutil`、`lightningcss`、`sharp`、`sqlite3`、`typescript` 五个 port，并使用 `lightningcss` override 执行 Vue/Vite 生产构建与预览服务探测。安装显式包含 devDependencies；OpenHarmony 安装后运行 `ohos-signpost` 为 `.node` 依赖签名，Windows/Linux 则验证原平台二进制选择及功能。它们只是验证框架的首批代表包，不代表已覆盖仓库中所有 `@ohos-npm-ports` 产物。扩面时应增补具有明确最小 API probe 的包，并对确实不支持跨 OS 的运行路径标注范围，而不是静默跳过。

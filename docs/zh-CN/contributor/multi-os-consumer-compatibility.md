# 多 OS 消费侧兼容性回归

## 目的

验证前端工程将上游依赖通过 npm `overrides` 替换为 `@ohos-npm-ports/*` 后，依赖安装与代表性运行路径在 OpenHarmony、Windows、Linux 上仍可用。它补充而不替代各 port 在 OpenHarmony 上的构建/加载验证，也不等同于具体消费项目的完整 E2E。

## 验证契约

每个测试 fixture 都应模拟真实消费项目：fixture 子包声明上游依赖，外层消费项目用 `overrides` 指向固定的 `@ohos-npm-ports` 版本。测试必须确认安装成功，并实际调用包的最小公共 API；前端 fixture 还需执行生产构建并启动预览服务检查 HTTP 响应。仅检查目录存在、`require()` 成功或 port 构建成功不算运行验证。

CI 平台为：

- OpenHarmony：复用仓库 `ci-runner` 容器，在 GitHub-hosted ARM runner 上执行；
- Windows 与 Linux：使用 GitHub-hosted runner 原生执行，不经 OpenHarmony 容器。

代表性消费 fixture 与逐包逐版本的发布包探针是两层覆盖：前者验证典型依赖组合、override 和真实前端构建；后者负责遍历 registry 中 scope 的全量版本。

## 触发与门禁

- 代表性消费 fixture 随 port / fixture / workflow 变更运行；
- 全版本审计支持手动 dispatch 和每周全量回归；
- 首轮在 fork 上观察 OpenHarmony/Windows/Linux 三侧真实运行结果，再决定是否作为上游阻塞门禁；
- 测试摘要要标明 OS、Node/npm 版本、具体包版本及失败阶段。构建/安装、API 探针分别记录，不能把不适用项伪报为通过。

## 当前覆盖

# 多 OS / 全版本验证

`Published versions multi-OS audit` 每周从 npm 官方 registry 动态读取 `@ohos-npm-ports` scope 的完整包清单和每个包的全部已发布版本；OHOS、Linux、Windows 分别对精确版本执行全新安装，再运行包声明的 CLI（`--version`/`--help`）或加载主入口。新增发布版本会自动进入矩阵，无需维护手工版本列表。可通过 Actions 的 `workflow_dispatch` 手动启动。

每个 OS 独立展开版本矩阵，当前 87 个 package-version case / OS，未超过 GitHub 单矩阵 256 项限制。声明了不兼容 `os`/`cpu` 的普通包会失败；仅明确平台二进制槽（如 `*-openharmony-arm64`、`pnpm-exe.openharmony-arm64`）在 Windows/Linux 标记为 N/A，因为它们只供 OHOS 父包解析，父包在三 OS 的精确版本测试负责验证降级/平台选择。此类 N/A 不等于声称该二进制可跨 OS 运行。

此审计针对 registry 中**已发布**的历史版本，是回归与漂移检测，不应单独视为新版本发布前门禁。严格保证后续发布版本都已通过三 OS，需要把 `ci.yml` 的当前 build+publish 同 job 改成：构建并 pack → 三 OS 对同一个待发布 tarball 安装/探测 → 全部成功后 publish。不能先发布到 npm 再验证；否则失败版本已对用户可见。当前消费者 fixture（Vite/Vue 真实集成）继续作为代表性集成测试，与逐包逐版本探针互补。

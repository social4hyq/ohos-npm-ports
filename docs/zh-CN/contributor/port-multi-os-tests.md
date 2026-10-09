# Port 多 OS 功能测试

每个 `ports/<port>/<upstream-version>/` 目录都必须提供 `test.js`。这是该 port 版本的功能测试，不是通用的“猜测入口”探针。测试应按真实消费者使用的包名安装（通过 `// @test-package: <upstream-name>` 声明），对公开 API/CLI 做确定性断言；不得只断言文件存在或模块非空。一个 port 产出多个 npm 包时，测试需覆盖所有发布产物，或清楚说明平台槽位由哪个父包的测试覆盖。

统一 runner 在干净的临时消费工程中安装精确包版本及测试所需的辅助依赖，将 `test.js` 复制到消费工程根目录后执行。默认用 Node.js；Bun 专用包可通过 `// @test-runtime: bun` 选择 Bun，并用重复的 `// @test-dependency: <upstream-name>@<upstream-version>=npm:<port-name>@<port-version>` 声明需通过 overrides 安装的测试辅助依赖（如 Prisma engine、Bun runtime）；`@test-dependency-platforms` 可限制辅助依赖适用的平台。OpenHarmony 上 runner 会先签名已安装依赖中的原生文件，再加载测试。平台专用包可用 `// @test-platforms: openharmony` 限定适用平台，并必须用 `// @test-platform-reason: ...` 说明其他平台为何 N/A；不能静默跳过。

版本选择按 npm 包名及上游版本线分组，忽略 port revision 的历史重复，仅选择每条线上最大的数值 revision：`0.1.2-1`/`0.1.2-2` 选 `0.1.2-2`；`0.1.3-1`/`0.1.3-2` 另选 `0.1.3-2`。尚未发布到 registry 的版本线会暂不进入消费矩阵，但仍由 port 构建 CI 验证。当前多 OS 工作流测试 registry 上已发布的最新 revision；将本次 PR 的确切 tarball 纳入 OpenHarmony、Linux、Windows 测试并作为发布门禁，仍是后续工作。

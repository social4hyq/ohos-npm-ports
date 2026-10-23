# 包目录网站

参考 [ohos-ports 包查询](https://ohos-ports.github.io/ohos-ports/) 的查询场景，为 `@ohos-npm-ports` 提供独立的响应式包目录。原生 HTML/CSS/ES modules，无运行时框架、外部字体或 CDN 依赖。

## 本地运行

需要 Node.js 24 或更新版本。网站本身不依赖原生 binding。

```sh
cd website
npm ci
npm test
npm run build
node scripts/serve.mjs
```

访问 `http://localhost:4173/ohos-npm-ports/`。静态资源和数据均使用相对路径，兼容 GitHub Pages 仓库子路径。

浏览器验证（支持 Playwright 浏览器的平台）：

```sh
npx playwright install --with-deps chromium
npm run test:e2e
```

两种视口覆盖真实快照加载、主题切换、搜索、筛选、分页、排序、详情与历史版本、alias/overrides 配置、剪贴板成功/失败、恶意描述转义、网络错误与重试；截图保存在 `test-results/`，CI 上传为 artifact。

## 数据与边界

- 从仓库 `ports/` 的脚本、补丁和元数据中发现当前维护的 scope 包（包括平台槽位），在构建时请求官方 npm registry 的完整元数据。仅收录 registry 确认存在的候选包；不是整个 npm scope 的历史归档。
- 版本使用真实 `dist-tags.latest`，不以 semver 大小或 `-1` 后缀猜测稳定性。详情展示全部已发布版本、标签和各版本的 deprecated 信息。
- 上游名称从 patch 中的原始 name 或 test.js 协议读取；不能确认时不猜测 alias/overrides 映射，只提供 scoped 安装命令。
- “可用 latest”只表示 latest 未被标记 deprecated，不表示构建 CI、跨 OS 或目标设备验收通过；没有推断发布来源或兼容性徽章。
- Registry 404 的候选不展示；网络/HTTP 错误重试三次后让构建失败，不部署不完整数据。页面展示快照生成时间；访问者的浏览器无需直接请求 registry。
- 不修改现有 port、发布脚本或原生包流水线，不执行 npm publish。

## GitHub Pages

维护者在仓库 Settings → Pages → Build and deployment 中选择 **GitHub Actions**。合入 main 后，`Website` 工作流构建、测试并部署 `website/dist/`；每天定时更新 npm 元数据，也支持手动触发。PR 仅构建测试和上传页面/截图 artifact，不部署、不需要发布权限；fork 验证方式相同。

正式地址为 `https://ohos-npm-ports.github.io/ohos-npm-ports/`；个人 fork 地址为 `https://social4hyq.github.io/ohos-npm-ports/`，仅在对应仓库启用 Pages 且成功部署后可访问。源码及文档链接固定指向社区仓，不因 fork 预览而改写贡献入口。

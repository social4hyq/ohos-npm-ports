# autobump：自动跟进上游版本

给维护者看。思路参照 Homebrew/homebrew-core 的 `autobump.yml`：定时检测、自动改写版本、开 PR，PR 与人工 PR 走同一条 CI，**不自动合并**。

## 1. 流程

`autobump.yml` 每天一次（也可手动触发），分两个 job：

1. `plan`：读取 `.github/autobump.json`，对每个 port 取 `ports/<port>/` 下最高的版本目录，与 npm `dist-tags.latest` 比较，结果写入 step summary。
2. `open-pr`：每个项目（单个 port，或 `group` 相同的一组联动 port）一个 job：改写版本目录 → 每个 port 一个 commit → 推分支 `autobump/<项目>-<新版本>` → 开 PR。

改写由 `.github/scripts/autobump.mjs bump` 完成：复制最高版本目录为新版本目录（旧目录保留），把目录内文本里的 `旧版本-N` 换成 `新版本-1`、`旧版本` 换成 `新版本`（两侧带数字边界，`0.6.6` 不会误伤 `0.6.60`），然后要求新目录内不再残留旧版本串、`build.sh`/`publish.sh` 通过 `sh -n`。任一条不满足就删掉新目录并报错，不开 PR。

脚本不构建、不改 patch 内容。patch 在新版本上打不上、校验值对不上这类问题，由 PR 上的 `ci.yml` 拦下，人工处理。

## 2. 配置 `.github/autobump.json`

| 字段 | 含义 |
|---|---|
| `npm` | 上游 npm 包名（scoped 原样写） |
| `group` | 可选。同组的 port 必须同时可升到同一版本，一起放进一个 PR（如 opentui-core 与它的 openharmony-arm64 槽位包） |
| `tag` | 可选，默认 `latest` |
| `range` | 可选。默认只接受 caret 范围内的新版本（`^当前版本`，0.x 时同 minor）；写 `*` 放开跨大版本 |
| `hold` | 可选，写原因字符串即暂停该 port |

跨大版本、联动组不完整、registry 查询失败都会在 summary 里标出，但不开 PR。

## 3. 一次性配置

- fork 的 repo variable `AUTOBUMP_ENABLED=true`（没设时整个 workflow 不运行，将来合入别的仓库也不会误跑）。
- secret `AUTOBUMP_TOKEN`：fine-grained PAT，权限 Contents / Pull requests / Workflows 读写。必须用 PAT：`GITHUB_TOKEN` 开出的 PR 不会触发 `ci.yml`。

## 4. 手动触发

`workflow_dispatch` 支持 `ports`（逗号分隔，限定范围）和 `dry_run`（只改写并输出 diff，不推送、不开 PR）。每轮最多开 3 个 PR（`AUTOBUMP_MAX` 可改），超出的下一轮再处理。

## 5. 不做的事

- 不自动合并。合并到上游仓会触发真实的 npm 发布，这一步留给人。
- 不自动迭代 port 修订号 `-N`。
- 有跨 port 版本钉死的包（`playwright-mcp` 依赖 `playwright-core`、prisma 系列）和 build.sh 里带 `sha256sum -c` 校验的 port 暂不进白名单。

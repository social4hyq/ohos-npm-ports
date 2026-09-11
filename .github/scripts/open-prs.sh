#!/bin/bash
# autobump 阶段 3/3（宿主机 runner 上跑）：读取 validate 阶段上传的通过凭证 artifacts，
# 逐个向上游仓开 PR（curl 直调 API，容器里没有 gh 也不引入该依赖）。
# 用法：open-prs.sh <artifacts-dir>   （每个 *.json = {"port","from","to","branch"}）
#
# 环境变量：UPSTREAM_PR_TOKEN（fine-grained PAT，仅上游仓 pull_requests:write）、
#           GH_REPO_FORK / GH_REPO_UPSTREAM、GITHUB_SERVER_URL / GITHUB_REPOSITORY / GITHUB_RUN_ID
# dedup：POST 前再查一次同 head 的 open PR（防 validate 重跑产生重复 PR）。
set -euo pipefail

ARTDIR="${1:?usage: open-prs.sh <artifacts-dir>}"
: "${UPSTREAM_PR_TOKEN:?UPSTREAM_PR_TOKEN required}"
GH_REPO_FORK="${GH_REPO_FORK:?}"
GH_REPO_UPSTREAM="${GH_REPO_UPSTREAM:?}"
API="https://api.github.com"
RUN_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID:-0}"
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
INDEX="$SCRIPTS_DIR/ports-index.json"

shopt -s nullglob
FILES=("$ARTDIR"/*.json)
shopt -u nullglob

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "no validated candidates → no PRs to open" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  exit 0
fi

{
  echo "### PRs opened"
  echo
  echo "| port | from → to | build+smoke | PR |"
  echo "|---|---|---|---|"
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"

gh_api() { # $1=method $2=path [$3=json-file]；输出 body；失败不中断（调用方判空）
  local method="$1" path="$2" rc=0
  if [ -n "${3:-}" ]; then
    curl -fsS -X "$method" -H "Authorization: Bearer $UPSTREAM_PR_TOKEN" \
      -H "Accept: application/vnd.github+json" --data @"$3" \
      "$API$path" 2>/dev/null || rc=$?
  else
    curl -fsS -X "$method" -H "Authorization: Bearer $UPSTREAM_PR_TOKEN" \
      -H "Accept: application/vnd.github+json" \
      "$API$path" 2>/dev/null || rc=$?
  fi
  return $rc
}

pr_open_for_head() { # $1 = owner:branch
  gh_api GET "/repos/$GH_REPO_UPSTREAM/pulls?head=$1&state=open" |
    jq -r '.[0].html_url // empty' || true
}

for f in "${FILES[@]}"; do
  PORT=$(jq -r .port "$f")
  FROM=$(jq -r .from "$f")
  TO=$(jq -r .to "$f")
  BRANCH=$(jq -r .branch "$f")
  PKG=$(jq -r --arg p "$PORT" '.ports[] | select(.port == $p) | .upstream' "$INDEX")

  if [ -n "$(pr_open_for_head "${GH_REPO_FORK%%/*}:$BRANCH")" ]; then
    echo "| $PORT | $FROM → $TO | ✅ | ⏭️ already open |" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
    continue
  fi

  BODY=$(cat <<EOF
## 自动化版本跟进（autobump）

| | |
|---|---|
| 上游包 | \`${PKG}\` |
| 版本 | \`${FROM}\` → \`${TO}\` |
| port 修订 | 重置为 \`-1\`（发布版本 \`${TO}-1\`） |
| 变更 | 新增 \`ports/$PORT/$TO/\`（复制自 \`$FROM\`，版本串改写；旧版本目录保留） |
| 验证 | 本 run 在 DockerHarmony 容器内完成 build + 安装加载冒烟（[run](${RUN_URL})） |

\`${PKG}\`@${TO} 的变更见 [npm](https://www.npmjs.com/package/${PKG}/v/${TO})。

> 由 fork 侧 [autobump 工作流](https://github.com/${GH_REPO_FORK}/blob/main/.github/workflows/autobump.yml)自动生成；
> 需要暂停某个包的自动 bump 时改 fork 的 \`ports-index.json\`（\`hold: true\`）即可。
EOF
)
  BODYFILE=$(mktemp)
  jq -n --arg t "$PORT: update to $TO" --arg b "$BODY" \
    --arg h "${GH_REPO_FORK%%/*}:$BRANCH" \
    '{title: $t, head: $h, base: "main", body: $b}' > "$BODYFILE"
  RESP=$(gh_api POST "/repos/$GH_REPO_UPSTREAM/pulls" "$BODYFILE" || true)
  rm -f "$BODYFILE"
  PR_URL=$(jq -r '.html_url // empty' <<< "${RESP:-}")
  if [ -z "$PR_URL" ]; then
    ERRMSG=$(jq -r '.message // "unknown"' <<< "${RESP:-{\}}" 2>/dev/null || echo unknown)
    echo "::error::$PORT: PR create failed: $ERRMSG"
    echo "| $PORT | $FROM → $TO | ✅ | ❌ $ERRMSG |" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
    continue
  fi
  echo "| $PORT | $FROM → $TO | ✅ | ✅ $PR_URL |" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
done

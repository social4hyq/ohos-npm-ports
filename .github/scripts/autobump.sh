#!/bin/bash
# autobump 编排器：候选筛选 → 逐个（改写 → 容器构建+冒烟验证 → push 分支 → 向上游开 PR）。
# 在 DockerHarmony 容器里、fork main 的 checkout 根运行；.github/workflows/autobump.yml 调用。
#
# 环境变量：
#   GITHUB_TOKEN        push 分支到 fork 用（同仓 Actions token 足够）
#   UPSTREAM_PR_TOKEN   向上游开 PR 用（fine-grained PAT，仅上游仓 pull_requests:write；
#                       fork 的 GITHUB_TOKEN 对上游无写权限）
#   ONLY_PORT           限单个 port 重跑（对应 workflow_dispatch input）
#   MAX_PRS_PER_RUN     单次最多开几个 PR（默认取 ports-index.json 的 max_prs_per_run=3，
#                       防高频发版包刷屏上游维护者）
#   GH_REPO_FORK / GH_REPO_UPSTREAM   归属仓标识
#
# 设计对齐（docs/ohos-npm-ports-autobump.md §八）：
# - bump 分支基于上游 main（独立 worktree，automation 文件不进分支 → PR diff 只含 ports/**）；
# - PR 创建/dedup 走 curl + GitHub API（容器里没有 gh，也不引入该依赖）；
# - 逐项失败隔离 + timeout 防单点烧穿；GITHUB_STEP_SUMMARY 出 ✅/⚠️/❌/⏭️ 表；
# - $() 内 curl 一律 `|| true`（pipefail 下网络抖动不能杀死主流程，tap autobump.sh 教训）。
set -euo pipefail

# UPSTREAM_PR_TOKEN 未配置时降级为纯检测模式：报告照出、PR 不开（建 PAT 前调度不跑红）
if [ -z "${UPSTREAM_PR_TOKEN:-}" ]; then
  echo "::warning::UPSTREAM_PR_TOKEN not configured — detection-only mode (no branches, no PRs)"
  export DETECTION_ONLY=1
fi

: "${GITHUB_TOKEN:?GITHUB_TOKEN required}"
: "${UPSTREAM_PR_TOKEN:?UPSTREAM_PR_TOKEN required (fine-grained PAT with pull_requests:write on the upstream repo)}"
GH_REPO_FORK="${GH_REPO_FORK:?GH_REPO_FORK required}"
GH_REPO_UPSTREAM="${GH_REPO_UPSTREAM:?GH_REPO_UPSTREAM required}"
ONLY_PORT="${ONLY_PORT:-}"
API="https://api.github.com"
UPSTREAM_GIT="https://github.com/${GH_REPO_UPSTREAM}.git"
FORK_GIT="https://x-access-token:${GITHUB_TOKEN}@github.com/${GH_REPO_FORK}.git"
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"   # fork main 侧脚本目录（port worktree 里没有）

echo "== fetching upstream main =="
git fetch --quiet "$UPSTREAM_GIT" main
UPSHA=$(git rev-parse FETCH_HEAD)
echo "upstream main = $UPSHA"

echo "== checking upstream versions =="
UPSTREAM_REF=FETCH_HEAD "$SCRIPTS_DIR/check-upstream-versions.sh" "${ONLY_PORT:-}" > /tmp/versions.tsv || true
echo "--- versions report ---"
cat /tmp/versions.tsv

# ---------- step summary 表头 ----------
{
  echo "### autobump @ $(date -u +%FT%TZ) (upstream main ${UPSHA::7})"
  echo
  echo "| port | from → to | build | smoke | PR |"
  echo "|---|---|---|---|---|"
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"

# ---------- 候选筛选：behind + allowlisted，大版本跨越优先，其余按名字序 ----------
MAX_PRS=$(jq -r '.max_prs_per_run // 3' "$SCRIPTS_DIR/ports-index.json")
mapfile -t CANDIDATES < <(
  awk -F'\t' '$4 == "behind" && $5 == "true" {print $1 "\t" $2 "\t" $3}' /tmp/versions.tsv |
  awk -F'\t' -v OFS='\t' '{split($3, a, "."); split($2, b, "."); print (a[1] != b[1] ? 0 : 1), $0}' |
  sort -k1,1 -k2,2 | cut -f2-
)

if [ "${#CANDIDATES[@]}" -eq 0 ]; then
  echo "no allowlisted port is behind upstream" | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
  exit 0
fi

if [ "${DETECTION_ONLY:-}" = "1" ]; then
  {
    echo "**检测模式**：UPSTREAM_PR_TOKEN 未配置，候选已列出但不建分支/不开 PR。"
    echo
    echo '```'
    printf '%s\n' "${CANDIDATES[@]}"
    echo '```'
  } >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  exit 0
fi

echo "== candidates: ${CANDIDATES[*]} =="
OPENED=0

# ---------- 上游 PR 查重/创建（curl 直调 API）----------
gh_api() { # $1=method $2=path [$3=data-file] ；输出 body，非 2xx 时置 GH_API_STATUS
  GH_API_STATUS=0
  local method="$1" path="$2"
  if [ -n "${3:-}" ]; then
    curl -fsS -X "$method" -H "Authorization: Bearer $UPSTREAM_PR_TOKEN" \
      -H "Accept: application/vnd.github+json" --data @"$3" \
      "$API$path" 2>/dev/null || GH_API_STATUS=$?
  else
    curl -fsS -X "$method" -H "Authorization: Bearer $UPSTREAM_PR_TOKEN" \
      -H "Accept: application/vnd.github+json" \
      "$API$path" 2>/dev/null || GH_API_STATUS=$?
  fi
}

pr_open_for_head() { # $1 = head (owner:branch)；输出 PR url 或空
  gh_api GET "/repos/$GH_REPO_UPSTREAM/pulls?head=$1&state=open" \
    | jq -r '.[0].html_url // empty' || true
}

for line in "${CANDIDATES[@]}"; do
  IFS=$'\t' read -r PORT FROM TO <<< "$line"
  BRANCH="port/$PORT-$TO-1"
  echo "== $PORT: $FROM → $TO (branch $BRANCH) =="

  if [ "$OPENED" -ge "$MAX_PRS" ]; then
    echo "- ⏳ $PORT $TO: skipped, MAX_PRS_PER_RUN=$MAX_PRS reached (next run)" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
    continue
  fi

  # port worktree：bump 分支基于上游 main，automation 文件不进分支
  WT=/tmp/port-worktree
  git worktree remove --force "$WT" 2>/dev/null || true
  git worktree prune
  rm -rf "$WT"
  git worktree add --detach "$WT" "$UPSHA" >/dev/null 2>&1

  FAIL=0
  # 1) 改写
  if ! ( cd "$WT" && "$SCRIPTS_DIR/bump-port.sh" "$PORT" "$FROM" "$TO" ); then
    echo "| $PORT | $FROM → $TO | — | — | ❌ rewrite |" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
    continue
  fi

  # 2) 验证（构建 + 冒烟）：与上游 ci.yml 同序，setup-env 在 port worktree 根 source
  BUILD_MARK="—"; SMOKE_MARK="—"
  if ( cd "$WT" && . ./setup-env.sh && "$SCRIPTS_DIR/validate-port.sh" "$PORT" "$TO" ); then
    BUILD_MARK="✅"; SMOKE_MARK="✅"
  else
    # 冒烟失败与构建失败都拦在 PR 之前；herdr 式信号：❌ = 人工重做补丁/排查
    echo "| $PORT | $FROM → $TO | ❌ | ❌ | blocked (validate failed, no PR opened) |" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
    ( cd "$WT" && git worktree remove --force /tmp/port-worktree ) 2>/dev/null || rm -rf "$WT"
    continue
  fi

  # 3) dedup：上游 main 已出现该目录（本轮运行期间的竞态）→ 跳过；上游已有同 head 的 open PR → 跳过
  if git cat-file -e "$UPSHA:ports/$PORT/$TO" 2>/dev/null; then
    echo "| $PORT | $FROM → $TO | ✅ | ✅ | ⏭️ upstream already has $TO |" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
    ( cd "$WT" && git worktree remove --force "$WT" ) 2>/dev/null || rm -rf "$WT"
    continue
  fi
  if [ -n "$(pr_open_for_head "${GH_REPO_FORK%%/*}:$BRANCH")" ]; then
    echo "| $PORT | $FROM → $TO | ✅ | ✅ | ⏭️ PR already open |" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
    continue
  fi

  # 4) commit + push
  ( cd "$WT"
    git config user.name "autobump[bot]"
    git config user.email "autobump@users.noreply.github.com"
    git add "ports/$PORT/$TO"
    git commit -q -m "$PORT: add port $TO"
    git push -q origin "+HEAD:refs/heads/$BRANCH"
  ) || { echo "| $PORT | $FROM → $TO | ✅ | ✅ | ❌ push failed |" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"; continue; }
  # push 后 ls-remote 复核（push 静默失败兜底，tap 教训）
  if ! git ls-remote --exit-code --heads "$FORK_GIT" "refs/heads/$BRANCH" >/dev/null 2>&1; then
    echo "| $PORT | $FROM → $TO | ✅ | ✅ | ❌ branch not on fork after push |" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
    continue
  fi

  # 5) 开 PR（中文模板；带 fork CI 验证 run 链接作为信誉担保）
  RUN_URL="${GITHUB_SERVER_URL:-https://github.com}/$GH_REPO_FORK/actions/runs/${GITHUB_RUN_ID:-0}"
  PKG=$(jq -r --arg p "$PORT" '.ports[] | select(.port == $p) | .upstream' "$SCRIPTS_DIR/ports-index.json")
  BODY=$(cat <<EOF
## 自动化版本跟进（autobump）

| | |
|---|---|
| 上游包 | \`${PKG}\` |
| 版本 | \`${FROM}\` → \`${TO}\` |
| port 修订 | 重置为 \`-1\`（发布版本 \`${TO}-1\`） |
| 变更 | 新增 \`ports/$PORT/$TO/\`（复制自 \`$FROM\`，版本串改写；旧版本目录保留） |
| 验证 | fork CI 容器内 build + 安装加载冒烟通过：[run](${RUN_URL}) |

\`${PKG}\`@${TO} 的变更见 [npm](https://www.npmjs.com/package/${PKG}/v/${TO})。

> 由 fork 侧 [autobump 工作流](https://github.com/${GH_REPO_FORK}/blob/main/.github/workflows/autobump.yml)自动生成；
> 需要暂停某个包的自动 bump 时改 fork 的 \`ports-index.json\`（\`hold: true\`）即可。
EOF
)
  BODYFILE=$(mktemp)
  jq -n --arg t "$PORT: update to $TO" --arg b "$BODY" --arg h "${GH_REPO_FORK%%/*}:$BRANCH" \
    '{title: $t, head: $h, base: "main", body: $b}' > "$BODYFILE"
  RESP=$(gh_api POST "/repos/$GH_REPO_UPSTREAM/pulls" "$BODYFILE")
  rm -f "$BODYFILE"
  PR_URL=$(jq -r '.html_url // empty' <<< "${RESP:-}")
  if [ -z "$PR_URL" ]; then
    ERRMSG=$(jq -r '.message // "unknown"' <<< "${RESP:-{\}}" 2>/dev/null || echo unknown)
    echo "::error::$PORT: PR create failed: $ERRMSG"
    echo "| $PORT | $FROM → $TO | ✅ | ✅ | ❌ PR create failed |" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
    continue
  fi

  echo "| $PORT | $FROM → $TO | ✅ | ✅ | ✅ $PR_URL |" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  OPENED=$((OPENED + 1))

  # 6) 收尾：清 worktree（下一次循环重建）
  ( cd "$WT" && git worktree remove --force /tmp/port-worktree ) 2>/dev/null || rm -rf "$WT"
done

echo "== done: $OPENED PR(s) opened =="

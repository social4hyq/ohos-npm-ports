#!/bin/bash
# autobump 阶段 1/3（宿主机 runner 上跑，bash 可用；容器内没有 bash，见 workflow 拆分注释）：
# 检测候选 → 改写新版本目录 → 在独立 worktree 提交并 push 分支到 fork → 输出 validate matrix。
#
# 环境变量：
#   GITHUB_TOKEN      push 分支 + 查上游 open PR（同仓 Actions token 足够）
#   ONLY_PORT         限单个 port 重跑
#   GH_REPO_FORK / GH_REPO_UPSTREAM
#   GITHUB_OUTPUT / GITHUB_STEP_SUMMARY
#
# 不做的事（分给后两个 job）：容器内构建冒烟（job 2）、开 PR（job 3）——
# 这样 UPSTREAM_PR_TOKEN 全程不进容器。
#
# 铁律：bump 分支基于上游 main（worktree，automation 文件不进分支 → PR diff 只含 ports/**）。
set -euo pipefail

: "${GITHUB_TOKEN:?GITHUB_TOKEN required}"
GH_REPO_FORK="${GH_REPO_FORK:?}"
GH_REPO_UPSTREAM="${GH_REPO_UPSTREAM:?}"
ONLY_PORT="${ONLY_PORT:-}"
API="https://api.github.com"
UPSTREAM_GIT="https://github.com/${GH_REPO_UPSTREAM}.git"
FORK_GIT="https://x-access-token:${GITHUB_TOKEN}@github.com/${GH_REPO_FORK}.git"
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"

# PR 目标仓：验证期指向 fork 本仓（PR 开在 fork、基线为镜像分支，GITHUB_TOKEN 全够用，
# 不需要 PAT）；验证完成后由 workflow 传 ohos-npm-ports/ohos-npm-ports 切回真实目标。
PR_TARGET_REPO="${PR_TARGET_REPO:-$GH_REPO_UPSTREAM}"
PR_BASE_BRANCH="${PR_BASE_BRANCH:-main}"
TARGET_IS_UPSTREAM=0
[ "$PR_TARGET_REPO" = "$GH_REPO_UPSTREAM" ] && TARGET_IS_UPSTREAM=1

# UPSTREAM_PR_TOKEN 未配置时降级为纯检测模式：报告照出、不建分支不开 PR（建 PAT 前调度不跑红）。
# 仅上游目标需要 PAT；fork 验证目标用 GITHUB_TOKEN 即可，不存在此降级。
if [ "$TARGET_IS_UPSTREAM" = 1 ] && [ -z "${UPSTREAM_PR_TOKEN:-}" ]; then
  echo "::warning::UPSTREAM_PR_TOKEN not configured — detection-only mode (no branches, no PRs)"
  export DETECTION_ONLY=1
fi
if [ "$TARGET_IS_UPSTREAM" = 0 ] && [ -z "${PR_BASE_BRANCH:-}" ]; then
  echo "::error::fork-local target requires PR_BASE_BRANCH (mirror branch of upstream main)" >&2
  exit 1
fi

echo "== fetching upstream main =="
git fetch --quiet "$UPSTREAM_GIT" main
UPSHA=$(git rev-parse FETCH_HEAD)
echo "upstream main = $UPSHA"

echo "== checking upstream versions =="
UPSTREAM_REF=FETCH_HEAD "$SCRIPTS_DIR/check-upstream-versions.sh" "$ONLY_PORT" > /tmp/versions.tsv || true
echo "--- versions report ---"
cat /tmp/versions.tsv

{
  echo "### versions @ $(date -u +%FT%TZ) (upstream main ${UPSHA:0:7})"
  echo
  echo '```'
  cat /tmp/versions.tsv
  echo '```'
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"

# 候选：behind + allowlisted；major 跨越优先，其余按名字序
mapfile -t CANDIDATES < <(
  awk -F'\t' '$4 == "behind" && $5 == "true" {print $1 "\t" $2 "\t" $3}' /tmp/versions.tsv |
  awk -F'\t' -v OFS='\t' '{split($3, a, "."); split($2, b, "."); print (a[1] != b[1] ? 0 : 1), $0}' |
  sort -k1,1 -k2,2 | cut -f2-
)

if [ "${#CANDIDATES[@]}" -eq 0 ]; then
  echo "no allowlisted port is behind upstream" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  echo 'matrix={"include":[]}' >> "${GITHUB_OUTPUT:-/dev/null}"
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
  echo 'matrix={"include":[]}' >> "${GITHUB_OUTPUT:-/dev/null}"
  exit 0
fi

# PR 查重（读公开仓，GITHUB_TOKEN 足够；PAT 只在 job 3 开 PR 时用）
pr_open_for_head() { # $1 = head (owner:branch)；输出 PR url 或空
  curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "$API/repos/$PR_TARGET_REPO/pulls?head=$1&state=open" 2>/dev/null |
    jq -r '.[0].html_url // empty' || true
}

MAX_PRS=$(jq -r '.max_prs_per_run // 3' "$SCRIPTS_DIR/ports-index.json")
WT=/tmp/port-worktree
OPENED=0
declare -a LEGS=()

# fork 验证模式：确保 PR 基线分支存在（fork 内镜像上游 main 的分支）。
# bump 分支与它同基，PR diff 才只含 port 目录（fork main 多出 automation 文件，
# 不能做基线）。镜像分支内容 = 上游 main，force push 语义正确。
if [ "$TARGET_IS_UPSTREAM" = 0 ]; then
  git push -q --force "$FORK_GIT" "FETCH_HEAD:refs/heads/$PR_BASE_BRANCH" ||
    { echo "::error::failed to maintain mirror branch $PR_BASE_BRANCH on fork" >&2; exit 1; }
  echo "mirror branch $PR_BASE_BRANCH = upstream main ($UPSHA)"
fi

for line in "${CANDIDATES[@]}"; do
  IFS=$'\t' read -r PORT FROM TO <<< "$line"
  BRANCH="port/$PORT-$TO-1"
  echo "== $PORT: $FROM → $TO (branch $BRANCH) =="

  if [ "$OPENED" -ge "$MAX_PRS" ]; then
    echo "- ⏳ $PORT $TO: skipped, MAX_PRS_PER_RUN=$MAX_PRS reached (next run)" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
    continue
  fi

  # 上游 main 已出现该目录（竞态）→ 跳过；上游已有同 head 的 open PR → 跳过
  if git cat-file -e "$UPSHA:ports/$PORT/$TO" 2>/dev/null; then
    echo "- ⏭️ $PORT $TO: upstream main already has it" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
    continue
  fi
  if [ -n "$(pr_open_for_head "${GH_REPO_FORK%%/*}:$BRANCH")" ]; then
    echo "- ⏭️ $PORT $TO: PR already open" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
    continue
  fi

  # 改写 + 独立 worktree 提交 + push（分支基于上游 main）
  git worktree remove --force "$WT" 2>/dev/null || true
  git worktree prune
  rm -rf "$WT"
  git worktree add --detach "$WT" "$UPSHA" >/dev/null 2>&1
  if ! ( cd "$WT" && "$SCRIPTS_DIR/bump-port.sh" "$PORT" "$FROM" "$TO" ); then
    echo "- ❌ $PORT $FROM → $TO: rewrite failed (residue?), see log" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
    continue
  fi
  if ! ( cd "$WT"
    git config user.name "autobump[bot]"
    git config user.email "autobump@users.noreply.github.com"
    git add "ports/$PORT/$TO"
    git commit -q -m "$PORT: add port $TO"
    git push -q origin "+HEAD:refs/heads/$BRANCH"
  ); then
    echo "- ❌ $PORT $TO: commit/push failed" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
    continue
  fi
  # push 后 ls-remote 复核（push 静默失败兜底，tap 教训）
  if ! git ls-remote --exit-code --heads "$FORK_GIT" "refs/heads/$BRANCH" >/dev/null 2>&1; then
    echo "- ❌ $PORT $TO: branch not on fork after push" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
    continue
  fi

  echo "- ✅ $PORT $TO: branch pushed, queued for container validation" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  # port 目录 tar 给 job 2（容器）展开验证；-C WT 保证 tar 内路径即仓库相对路径
  tar -cf "${GITHUB_WORKSPACE:-/tmp}/port-dir-$PORT.tar" -C "$WT" "ports/$PORT/$TO"
  LEGS+=("{\"port\":\"$PORT\",\"from\":\"$FROM\",\"to\":\"$TO\",\"branch\":\"$BRANCH\"}")
  OPENED=$((OPENED + 1))
  git worktree remove --force "$WT" 2>/dev/null || true
done

MATRIX=$(printf '{"include":[%s]}' "$(IFS=,; echo "${LEGS[*]:-}")")
# 多行输出用 heredoc 定界符语法，防止 matrix 内容被截断
{
  echo 'matrix<<MATRIX_JSON_EOF'
  echo "$MATRIX"
  echo 'MATRIX_JSON_EOF'
} >> "${GITHUB_OUTPUT:-/dev/null}"
echo "matrix = $MATRIX"

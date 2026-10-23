<script setup vapor>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { filterPackages, installText } from "./catalog.mjs";
const props = defineProps(["packages", "loading", "error"]);
const emit = defineEmits(["retry", "select", "copy"]);
const labels = {
  all: "全部包",
  active: "可用 latest",
  deprecated: "已废弃",
  untagged: "无 latest 标签",
};
const params = new URLSearchParams(location.search);
const query = ref(params.get("q") || "");
const status = ref(Object.hasOwn(labels, params.get("status")) ? params.get("status") : "all");
const sort = ref(params.get("sort") === "updated" ? "updated" : "name");
const page = ref(1);
const search = ref(null);
const size = 10;
const filtered = computed(() =>
  filterPackages(props.packages, { query: query.value, status: status.value, sort: sort.value }),
);
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / size)));
const visible = computed(() => filtered.value.slice((page.value - 1) * size, page.value * size));
watch(pages, (value) => {
  page.value = Math.min(page.value, value);
});
watch(
  [query, status, sort],
  () => {
    page.value = 1;
    const next = new URLSearchParams();
    if (query.value) next.set("q", query.value);
    if (status.value !== "all") next.set("status", status.value);
    if (sort.value !== "name") next.set("sort", sort.value);
    history.replaceState(
      null,
      "",
      `${location.pathname}${next.size ? `?${next}` : ""}${location.hash}`,
    );
  },
  { immediate: true },
);
function clear() {
  query.value = "";
  status.value = "all";
}
function changePage(delta) {
  page.value = Math.max(1, Math.min(pages.value, page.value + delta));
  document.getElementById("catalog").scrollIntoView({ block: "start" });
}
function shortcut(event) {
  if (
    event.key === "/" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !document.querySelector("dialog[open]") &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
  ) {
    event.preventDefault();
    search.value.focus();
  }
}
onMounted(() => document.addEventListener("keydown", shortcut));
onUnmounted(() => document.removeEventListener("keydown", shortcut));
</script>

<template>
  <section class="catalog-section" id="catalog" aria-labelledby="catalog-title">
    <div class="section-heading">
      <div class="eyebrow">THE PACKAGE DIRECTORY</div>
      <div class="heading-line">
        <h2 id="catalog-title">找到你需要的工具。</h2>
        <a href="https://www.npmjs.com/org/ohos-npm-ports">在 npm 上查看 ↗</a>
      </div>
    </div>
    <div class="catalog-layout">
      <aside class="sidebar">
        <h3>发布状态</h3>
        <div id="filters" class="filters" role="group" aria-label="按发布状态筛选">
          <button
            v-for="(label, value) in labels"
            :key="value"
            :data-status="value"
            :aria-pressed="status === value"
            @click="status = value"
          >
            {{ label }}
            <span :id="'filter-' + value">{{
              value === "all" ? packages.length : packages.filter((p) => p.status === value).length
            }}</span>
          </button>
        </div>
        <div class="sidebar-note">
          <span class="note-icon">↗</span>
          <h3>把适配带回上游</h3>
          <p>上游已支持 OpenHarmony？请优先使用官方包，减少额外的维护。</p>
          <a
            href="https://github.com/ohos-npm-ports/ohos-npm-ports/blob/main/docs/zh-CN/contributor/porting-guide.md"
            >了解移植原则 →</a
          >
        </div>
      </aside>
      <div class="catalog-main">
        <div class="toolbar">
          <label class="search"
            ><span aria-hidden="true">⌕</span
            ><input
              ref="search"
              id="search"
              v-model="query"
              type="search"
              placeholder="搜索包名、上游包或描述…"
              aria-label="搜索包"
            /><kbd aria-hidden="true">/</kbd></label
          ><label class="sort"
            ><span class="sr-only">排序方式</span
            ><select id="sort" v-model="sort">
              <option value="name">名称 A–Z</option>
              <option value="updated">最近发布</option>
            </select></label
          >
        </div>
        <div class="results-meta">
          <p id="result-count" role="status">
            {{
              loading
                ? "正在加载包目录…"
                : error
                  ? "目录加载失败"
                  : `找到 ${filtered.length} 个包 / 共 ${packages.length} 个`
            }}
          </p>
          <span>点击包名，查看接入方式</span>
        </div>
        <div class="list-head" aria-hidden="true">
          <span>包 / PACKAGE</span><span>LATEST</span><span>操作</span>
        </div>
        <div id="packages" class="packages" :aria-busy="loading" :hidden="error">
          <div v-if="loading" class="empty">正在读取 npm 数据快照…</div>
          <div v-else-if="!filtered.length" class="empty">
            <h3>没有找到匹配的包</h3>
            <p>试试其他关键词，或清除筛选条件。</p>
            <button class="button" @click="clear">清除搜索与筛选</button>
          </div>
          <template v-else>
            <article v-for="pkg in visible" :key="pkg.name" class="package-row">
              <div class="package-main">
                <div class="package-icon" aria-hidden="true">
                  {{ pkg.shortName.replace(/[^a-z]/gi, "").slice(0, 2) }}
                </div>
                <div class="package-info">
                  <button
                    class="package-name"
                    :aria-label="`查看 ${pkg.shortName} 包详情`"
                    @click="emit('select', pkg)"
                  >
                    {{ pkg.shortName }}
                  </button>
                  <p class="package-description">{{ pkg.description }}</p>
                  <p class="upstream">{{ pkg.upstream ? `↳ ${pkg.upstream}` : pkg.name }}</p>
                </div>
              </div>
              <div class="package-version">
                {{ pkg.version || "—" }}<br /><span :class="['status-badge', pkg.status]"
                  ><span class="dot"></span>{{ labels[pkg.status] }}</span
                >
              </div>
              <button
                class="copy-row"
                :aria-label="`复制 ${pkg.shortName} 安装命令`"
                title="复制安装命令"
                :disabled="!pkg.version"
                @click="emit('copy', installText(pkg))"
              >
                ⧉
              </button>
            </article>
          </template>
        </div>
        <div id="error" class="error" :hidden="!error">
          <h3>暂时无法加载包目录</h3>
          <p>请检查网络后重试，或前往 npm 查看包信息。</p>
          <button class="button" id="retry" @click="emit('retry')">重新加载</button>
        </div>
        <div
          class="pagination"
          id="pagination"
          :hidden="loading || error || filtered.length <= size"
        >
          <span id="page-info">第 {{ page }} / {{ pages }} 页 · 每页 {{ size }} 个包</span>
          <div>
            <button id="previous" aria-label="上一页" :disabled="page <= 1" @click="changePage(-1)">
              ←</button
            ><button id="next" aria-label="下一页" :disabled="page >= pages" @click="changePage(1)">
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup vapor>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import PackageCatalog from "./PackageCatalog.vue";
import PackageDialog from "./PackageDialog.vue";
const favicon = `${import.meta.env.BASE_URL}favicon.svg`;
const packages = ref([]);
const loading = ref(true);
const error = ref(false);
const ready = ref(false);
const generatedAt = ref("");
const selected = ref(null);
const toast = ref("");
let timer;
const activeCount = computed(() => packages.value.filter((p) => p.status === "active").length);
const versionsCount = computed(() => packages.value.reduce((sum, p) => sum + p.versions.length, 0));
const theme = ref(initialTheme());
function initialTheme() {
  try {
    return (
      localStorage.getItem("theme") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    );
  } catch {
    return "light";
  }
}
watch(
  theme,
  (value) => {
    document.body.dataset.theme = value;
    try {
      localStorage.setItem("theme", value);
    } catch {
      /* Theme remains usable without storage. */
    }
  },
  { immediate: true },
);
function toggleTheme() {
  theme.value = theme.value === "dark" ? "light" : "dark";
}
async function load() {
  loading.value = true;
  error.value = false;
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data.json`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.packages)) throw new Error("Invalid catalog");
    packages.value = data.packages;
    generatedAt.value = data.generatedAt;
    ready.value = true;
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
async function copy(text) {
  clearTimeout(timer);
  try {
    if (!text) throw new Error("No command");
    await navigator.clipboard.writeText(text);
    toast.value = "已复制到剪贴板";
  } catch {
    toast.value = "无法写入剪贴板，请在包详情中选中并复制命令。";
  }
  timer = setTimeout(() => {
    toast.value = "";
  }, 3500);
}
onMounted(load);
onUnmounted(() => clearTimeout(timer));
</script>

<template>
  <a class="skip" href="#catalog">跳到包目录</a>
  <header class="header">
    <div class="shell nav">
      <a class="brand" href="./" aria-label="ohos-npm-ports 首页"
        ><img :src="favicon" width="34" height="34" alt="" /><span
          >ohos<span class="brand-light"> / </span>npm-ports</span
        ></a
      >
      <nav aria-label="主导航">
        <a class="nav-current" href="#catalog">包目录</a
        ><a
          href="https://github.com/ohos-npm-ports/ohos-npm-ports/blob/main/docs/zh-CN/user/usage.md"
          >使用指南 ↗</a
        ><a href="https://github.com/ohos-npm-ports/ohos-npm-ports">GitHub ↗</a
        ><button
          id="theme"
          @click="toggleTheme"
          class="icon-button"
          aria-label="切换深浅主题"
          title="切换深浅主题"
        >
          ◐
        </button>
      </nav>
    </div>
  </header>
  <main class="shell">
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <div class="eyebrow"><span class="dot"></span> OPEN SOURCE · OPENHARMONY</div>
        <h1 id="hero-title">
          熟悉的 npm 包，<br />也能在<span class="highlight">鸿蒙上运行。</span>
        </h1>
        <p class="hero-description">
          查找社区移植包，确认版本，复制接入配置。<br />让你的下一个项目，从这里开始。
        </p>
        <div class="hero-actions">
          <a class="button primary" href="#catalog">探索包目录 <span>↓</span></a
          ><a
            class="text-link"
            href="https://github.com/ohos-npm-ports/ohos-npm-ports/blob/main/docs/zh-CN/contributor/contributing.md"
            >参与移植 <span>↗</span></a
          >
        </div>
        <div class="hero-note">优先使用上游原生支持；社区 port 是过渡方案。</div>
      </div>
      <div class="terminal" aria-label="通过 npm alias 保持原有导入名的接入示例">
        <div class="terminal-bar">
          <span class="terminal-dots"><i></i><i></i><i></i></span><span>~/your-next-project</span
          ><span>⌘</span>
        </div>
        <div class="terminal-content">
          <div class="terminal-comment"># 保留原来的 import，换上适配后的包</div>
          <div class="terminal-command">
            <span>❯</span> npm install \<br /><span class="terminal-indent"
              >sqlite3@npm:@ohos-npm-ports/sqlite3</span
            >
          </div>
          <div class="terminal-divider"></div>
          <div class="terminal-comment">// package.json</div>
          <pre v-pre><span class="code-muted">{</span>
  <span class="code-key">"dependencies"</span>: {
    <span class="code-key">"sqlite3"</span>: <span class="code-value">"npm:@ohos-npm-ports/sqlite3"</span>
  }
<span class="code-muted">}</span></pre>
          <div class="terminal-foot"><span class="dot"></span> 一个别名，连接你的开发环境。</div>
        </div>
      </div>
    </section>
    <section class="stats" aria-label="包目录统计">
      <div>
        <strong id="total-count">{{ ready ? packages.length : "—" }}</strong
        ><span>已发布的包</span>
      </div>
      <div>
        <strong id="active-count">{{ ready ? activeCount : "—" }}</strong
        ><span>latest 未标记废弃</span>
      </div>
      <div>
        <strong id="versions-count">{{ ready ? versionsCount : "—" }}</strong
        ><span>已发布的版本</span>
      </div>
      <p>
        <span class="dot"></span> npm registry 数据快照<br /><time
          id="updated"
          :datetime="generatedAt"
          >{{
            generatedAt
              ? new Date(generatedAt).toLocaleString("zh-CN", { hour12: false }) + " 更新"
              : "正在读取更新信息"
          }}</time
        >
      </p>
    </section>
    <PackageCatalog
      :packages="packages"
      :loading="loading"
      :error="error"
      @retry="load"
      @select="selected = $event"
      @copy="copy"
    />
    <section class="getting-started" aria-labelledby="start-title">
      <div>
        <span class="eyebrow">A SMALL CHANGE. A NEW PLATFORM.</span>
        <h2 id="start-title">第一次使用社区移植包？</h2>
        <p>
          直接依赖用 npm alias，间接依赖用 overrides。<br />安装成功之后，还需要在目标设备验证加载与运行。
        </p>
      </div>
      <a
        class="button"
        href="https://github.com/ohos-npm-ports/ohos-npm-ports/blob/main/docs/zh-CN/user/usage.md"
        >阅读接入指南 ↗</a
      >
    </section>
    <div class="compat-note">
      <span>i</span>
      <p>
        这里的“可用 latest”仅表示 npm 的 latest 版本未标记废弃，不代表真机验收通过。使用 npm / pnpm
        安装原生模块时，可能还需要
        <a href="https://www.npmjs.com/package/ohos-signpost">ohos-signpost</a>
        签名；Bun 已内置签名。请以具体包的说明和目标设备实测为准。
      </p>
    </div>
  </main>
  <footer class="shell footer">
    <a class="brand" href="./"
      ><img :src="favicon" width="24" height="24" alt="" /><span
        >ohos<span class="brand-light"> / </span>npm-ports</span
      ></a
    ><span>为 OpenHarmony 生态贡献一块拼图。</span
    ><a href="https://github.com/ohos-npm-ports/ohos-npm-ports">源码与贡献 ↗</a>
  </footer>
  <PackageDialog :pkg="selected" @close="selected = null" @copy="copy" />
  <div id="toast" role="status" class="toast" :hidden="!toast">{{ toast }}</div>
</template>

<script setup vapor>
import { computed, nextTick, ref, watch } from "vue";
import { installText } from "./catalog.mjs";
const props = defineProps(["pkg"]);
const emit = defineEmits(["close", "copy"]);
const dialog = ref(null);
const version = ref("");
const mode = ref("npm");
const code = computed(() => props.pkg && installText(props.pkg, mode.value, version.value));
const deprecated = computed(
  () => props.pkg?.versions.find((v) => v.version === version.value)?.deprecated,
);
watch(
  () => props.pkg,
  async (pkg) => {
    if (!pkg) {
      if (dialog.value.open) dialog.value.close();
      return;
    }
    version.value = pkg.version || pkg.versions[0]?.version || "";
    mode.value = "npm";
    await nextTick();
    if (!dialog.value.open) dialog.value.showModal();
  },
);
function backdrop(event) {
  if (event.target !== dialog.value) return;
  const rect = dialog.value.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    dialog.value.close();
}
</script>

<template>
  <dialog
    ref="dialog"
    id="detail"
    aria-labelledby="detail-title"
    @close="emit('close')"
    @click="backdrop"
  >
    <template v-if="pkg">
      <div class="dialog-head">
        <span class="eyebrow">PACKAGE DETAILS</span
        ><button
          id="close-detail"
          class="icon-button"
          aria-label="关闭包详情"
          @click="dialog.close()"
        >
          ×
        </button>
      </div>
      <h2 id="detail-title">{{ pkg.shortName }}</h2>
      <p id="detail-description">{{ pkg.description }}</p>
      <p id="detail-warning" class="warning" :hidden="!deprecated">
        该版本已废弃：{{ deprecated }}
      </p>
      <div id="detail-links" class="detail-links">
        <a :href="`https://www.npmjs.com/package/${pkg.name}`">npm 包 ↗</a
        ><a v-if="pkg.upstream" :href="`https://www.npmjs.com/package/${pkg.upstream}`">上游包 ↗</a
        ><a
          v-if="pkg.directories[0]"
          :href="`https://github.com/ohos-npm-ports/ohos-npm-ports/tree/main/${pkg.directories[0].split('/').slice(0, 2).join('/')}`"
          >构建与补丁 ↗</a
        ><span v-if="pkg.license">{{ pkg.license }}</span>
      </div>
      <div class="version-control">
        <label for="version">发布版本</label
        ><select id="version" v-model="version">
          <option v-for="v in pkg.versions" :key="v.version" :value="v.version">
            {{ v.version }}{{ v.tags.length ? ` · ${v.tags.join(", ")}` : ""
            }}{{ v.deprecated ? " · 已废弃" : "" }}
          </option>
        </select>
      </div>
      <div id="install-modes" class="install-modes" role="group" aria-label="接入方式">
        <button
          v-for="(label, value) in {
            npm: 'npm alias',
            dependencies: 'dependencies',
            overrides: 'overrides',
          }"
          :key="value"
          :data-mode="value"
          :aria-pressed="mode === value"
          @click="mode = value"
        >
          {{ label }}
        </button>
      </div>
      <pre id="install-code" tabindex="0">{{
        code ||
        (mode === "npm"
          ? "该包没有可选发布版本。"
          : "无法从构建文件确认上游包名。请根据包文档手动配置别名，不要猜测映射。")
      }}</pre>
      <button id="copy-detail" class="button primary" :disabled="!code" @click="emit('copy', code)">
        {{ mode === "npm" ? "复制安装命令" : "复制配置" }}
      </button>
      <p class="dialog-note">
        npm alias 保持原有导入名；overrides 用于间接依赖。pnpm 的 overrides 配置写入
        pnpm-workspace.yaml，不照搬 npm 配置。
      </p>
    </template>
  </dialog>
</template>

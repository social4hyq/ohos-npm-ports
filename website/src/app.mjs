import { filterPackages, installText } from "./catalog.mjs";
const $ = (id) => document.getElementById(id);
const size = 10;
let packages = [],
  page = 1,
  status = "all",
  selected = null,
  mode = "npm",
  timer;
const labels = {
  active: "可用 latest",
  deprecated: "已废弃",
  untagged: "无 latest",
};
const element = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};
const link = (text, href) => {
  const a = element("a", "", text);
  a.href = href;
  return a;
};
function notify(message) {
  clearTimeout(timer);
  $("toast").textContent = message;
  $("toast").hidden = false;
  timer = setTimeout(() => {
    $("toast").hidden = true;
  }, 3500);
}
async function copy(text) {
  try {
    if (!text) throw new Error("No command");
    await navigator.clipboard.writeText(text);
    notify("已复制到剪贴板");
  } catch {
    notify("无法写入剪贴板，请在包详情中选中并复制命令。");
  }
}
function syncURL() {
  const params = new URLSearchParams();
  if ($("search").value) params.set("q", $("search").value);
  if (status !== "all") params.set("status", status);
  if ($("sort").value !== "name") params.set("sort", $("sort").value);
  history.replaceState(
    null,
    "",
    `${location.pathname}${params.size ? `?${params}` : ""}${location.hash}`,
  );
}
function render() {
  const filtered = filterPackages(packages, {
    query: $("search").value,
    status,
    sort: $("sort").value,
  });
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  page = Math.min(page, pages);
  $("packages").replaceChildren();
  $("result-count").textContent =
    `找到 ${filtered.length} 个包 / 共 ${packages.length} 个`;
  if (!filtered.length) {
    const empty = element("div", "empty");
    empty.append(
      element("h3", "", "没有找到匹配的包"),
      element("p", "", "试试其他关键词，或清除筛选条件。"),
    );
    const clear = element("button", "button", "清除搜索与筛选");
    clear.onclick = () => {
      $("search").value = "";
      setStatus("all");
    };
    empty.append(clear);
    $("packages").append(empty);
  }
  for (const pkg of filtered.slice((page - 1) * size, page * size)) {
    const row = element("article", "package-row");
    const main = element("div", "package-main");
    const icon = element(
      "div",
      "package-icon",
      pkg.shortName.replace(/[^a-z]/gi, "").slice(0, 2),
    );
    icon.setAttribute("aria-hidden", "true");
    const info = element("div", "package-info");
    const name = element("button", "package-name", pkg.shortName);
    name.setAttribute("aria-label", `查看 ${pkg.shortName} 包详情`);
    name.onclick = () => openDetail(pkg);
    info.append(
      name,
      element("p", "package-description", pkg.description),
      element("p", "upstream", pkg.upstream ? `↳ ${pkg.upstream}` : pkg.name),
    );
    main.append(icon, info);
    const version = element("div", "package-version", pkg.version || "—");
    const badge = element("span", `status-badge ${pkg.status}`);
    badge.append(
      element("span", "dot"),
      document.createTextNode(labels[pkg.status]),
    );
    version.append(document.createElement("br"), badge);
    const button = element("button", "copy-row", "⧉");
    button.setAttribute("aria-label", `复制 ${pkg.shortName} 安装命令`);
    button.title = "复制安装命令";
    button.disabled = !pkg.version;
    button.onclick = () => copy(installText(pkg));
    row.append(main, version, button);
    $("packages").append(row);
  }
  $("pagination").hidden = filtered.length <= size;
  $("page-info").textContent = `第 ${page} / ${pages} 页 · 每页 ${size} 个包`;
  $("previous").disabled = page <= 1;
  $("next").disabled = page >= pages;
  syncURL();
}
function setStatus(value) {
  status = value;
  page = 1;
  for (const button of $("filters").querySelectorAll("button"))
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.status === value),
    );
  render();
}
function renderCode() {
  const version = selected.versions.find(
    (v) => v.version === $("version").value,
  );
  $("detail-warning").hidden = !version?.deprecated;
  $("detail-warning").textContent = version?.deprecated
    ? `该版本已废弃：${version.deprecated}`
    : "";
  const code = installText(selected, mode, $("version").value);
  $("install-code").textContent =
    code ||
    (mode === "npm"
      ? "该包没有可选发布版本。"
      : "无法从构建文件确认上游包名。请根据包文档手动配置别名，不要猜测映射。");
  $("copy-detail").disabled = !code;
  $("copy-detail").textContent = mode === "npm" ? "复制安装命令" : "复制配置";
}
function openDetail(pkg) {
  selected = pkg;
  mode = "npm";
  $("detail-title").textContent = pkg.shortName;
  $("detail-description").textContent = pkg.description;
  $("detail-links").replaceChildren(
    link("npm 包 ↗", `https://www.npmjs.com/package/${pkg.name}`),
  );
  if (pkg.upstream)
    $("detail-links").append(
      link("上游包 ↗", `https://www.npmjs.com/package/${pkg.upstream}`),
    );
  if (pkg.directories[0])
    $("detail-links").append(
      link(
        "构建与补丁 ↗",
        `https://github.com/ohos-npm-ports/ohos-npm-ports/tree/main/${pkg.directories[0]}`,
      ),
    );
  if (pkg.license) $("detail-links").append(element("span", "", pkg.license));
  $("version").replaceChildren(
    ...pkg.versions.map((v) => {
      const option = element(
        "option",
        "",
        `${v.version}${v.tags.length ? ` · ${v.tags.join(", ")}` : ""}${v.deprecated ? " · 已废弃" : ""}`,
      );
      option.value = v.version;
      return option;
    }),
  );
  if (pkg.version) $("version").value = pkg.version;
  for (const button of $("install-modes").querySelectorAll("button"))
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  renderCode();
  $("detail").showModal();
}
async function load() {
  $("error").hidden = true;
  $("packages").hidden = false;
  $("packages").setAttribute("aria-busy", "true");
  $("result-count").textContent = "正在加载包目录…";
  try {
    const response = await fetch("./data.json", {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.packages)) throw new Error("Invalid catalog");
    packages = data.packages;
    $("total-count").textContent = packages.length;
    $("active-count").textContent = packages.filter(
      (p) => p.status === "active",
    ).length;
    $("versions-count").textContent = packages.reduce(
      (sum, p) => sum + p.versions.length,
      0,
    );
    $("updated").textContent =
      `${new Date(data.generatedAt).toLocaleString("zh-CN", { hour12: false })} 更新`;
    $("updated").dateTime = data.generatedAt;
    for (const value of ["all", "active", "deprecated", "untagged"])
      $("filter-" + value).textContent =
        value === "all"
          ? packages.length
          : packages.filter((p) => p.status === value).length;
    render();
  } catch {
    $("packages").hidden = true;
    $("error").hidden = false;
    $("pagination").hidden = true;
    $("result-count").textContent = "目录加载失败";
  } finally {
    $("packages").setAttribute("aria-busy", "false");
  }
}
const params = new URLSearchParams(location.search);
$("search").value = params.get("q") || "";
status = ["all", "active", "deprecated", "untagged"].includes(
  params.get("status"),
)
  ? params.get("status")
  : "all";
$("sort").value = params.get("sort") === "updated" ? "updated" : "name";
for (const button of $("filters").querySelectorAll("button")) {
  button.setAttribute("aria-pressed", String(button.dataset.status === status));
  button.onclick = () => setStatus(button.dataset.status);
}
$("search").oninput = () => {
  page = 1;
  render();
};
$("sort").onchange = () => {
  page = 1;
  render();
};
for (const [id, delta] of [
  ["previous", -1],
  ["next", 1],
])
  $(id).onclick = () => {
    page += delta;
    render();
    $("catalog").scrollIntoView({ block: "start" });
  };
$("retry").onclick = load;
$("close-detail").onclick = () => $("detail").close();
$("detail").onclick = (event) => {
  if (event.target === $("detail")) {
    const rect = $("detail").getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      $("detail").close();
  }
};
$("version").onchange = renderCode;
for (const button of $("install-modes").querySelectorAll("button"))
  button.onclick = () => {
    mode = button.dataset.mode;
    for (const sibling of $("install-modes").querySelectorAll("button"))
      sibling.setAttribute("aria-pressed", String(sibling === button));
    renderCode();
  };
$("copy-detail").onclick = () =>
  copy(installText(selected, mode, $("version").value));
document.addEventListener("keydown", (event) => {
  if (
    event.key === "/" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !$("detail").open &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
  ) {
    event.preventDefault();
    $("search").focus();
  }
});
try {
  document.body.dataset.theme =
    localStorage.getItem("theme") ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
} catch {
  document.body.dataset.theme = "light";
}
$("theme").onclick = () => {
  document.body.dataset.theme =
    document.body.dataset.theme === "dark" ? "light" : "dark";
  try {
    localStorage.setItem("theme", document.body.dataset.theme);
  } catch {
    /* Theme still works without storage. */
  }
};
await load();

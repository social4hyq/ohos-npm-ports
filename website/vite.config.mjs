import { defineConfig } from "vite-plus";
import vue from "@vitejs/plugin-vue";
import { pagesBase } from "./scripts/pages-base.mjs";

export default defineConfig({
  base: pagesBase(process.env.GITHUB_REPOSITORY, process.env.PAGES_BASE_PATH),
  plugins: [vue()],
  test: { include: ["tests/*.test.mjs"], pool: "threads" },
});

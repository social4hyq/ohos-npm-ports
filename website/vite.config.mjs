import { defineConfig } from "vite-plus";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  base: "/",
  plugins: [vue()],
  test: { include: ["tests/*.test.mjs"], pool: "threads" },
});

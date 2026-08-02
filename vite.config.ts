// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const ROOT_DOMAIN = "mehlalex.com";

export default defineConfig({
  // يسمح باختبار بنية النطاقات الفرعية محلياً (app/client/upload/status/api/docs/www)
  vite: {
    server: { allowedHosts: [`.${ROOT_DOMAIN}`] },
    resolve: {
      alias: [
        // pdf-lib يعتمد على tslib بصيغة CommonJS، وحزمة عامل الحوسبة الطرفية
        // تفشل عند تفكيك صادراته (`__extends`) ما يعطّل كل مسارات الختم والطباعة
        // في بيئة الإنتاج. الربط بنسخة ESM يعيد الصادرات المسماة بشكل صحيح.
        { find: /^tslib$/, replacement: "tslib/tslib.es6.js" },
      ],
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});

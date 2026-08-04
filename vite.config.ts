// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import path from "node:path";

const ROOT_DOMAIN = "mehlalex.com";

// مسارات الخادم (البريد/الويبهوك) تحتاج متغيرات بيئة بدون بادئة VITE_.
// تُحمَّل إلى process.env للخادم فقط ولا تُحقن في حزمة المتصفح.
Object.assign(process.env, loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), ""));

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
        // React Email يعتمد على entities@4.5.0؛ أي نسخة أحدث مدسوسة تُعطّل SSR.
        {
          find: /^entities\/lib\/decode\.js$/,
          replacement: path.resolve(process.cwd(), "node_modules/entities/lib/decode.js"),
        },
        {
          find: /^entities\/lib\/encode\.js$/,
          replacement: path.resolve(process.cwd(), "node_modules/entities/lib/encode.js"),
        },
        { find: /^entities$/, replacement: path.resolve(process.cwd(), "node_modules/entities") },
      ],
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});

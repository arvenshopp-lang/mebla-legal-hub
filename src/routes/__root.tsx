import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "../hooks/use-auth";
import { useSurfaceGuard } from "../hooks/use-surface-guard";
import { initAnalytics, trackPageView } from "../lib/analytics";
import {
  isAnalyticsConsentGranted,
  screenNameForPath,
  startAnalytics,
  subscribeToAnalyticsConsent,
  trackScreen,
} from "../lib/product-analytics";
import { getThemeCacheVersion } from "../lib/design/theme.functions";
import { pageKeyForPath } from "../lib/design/pages";
import { installDesignPreviewBridge, isDesignPreviewRequest } from "../lib/design/preview-bridge";
import { startThemeVersionSync } from "../lib/design/theme-version-sync";
import "../lib/zod-ar";
import { Toaster } from "sonner";
import { installFontBudgetWatcher } from "../lib/perf/font-budget-watcher";

function NotFoundComponent() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-muted px-4 py-12">
      <div className="w-full max-w-md rounded-[var(--radius-l)] border border-border bg-surface p-8 text-center">
        <p className="text-sm font-bold tracking-tight text-foreground">
          مِهلة <span className="text-gold">·</span> MEHLA
        </p>
        <p className="mt-6 text-5xl font-bold tabular-nums text-primary/25">404</p>
        <h1 className="mt-3 text-xl font-bold text-foreground">الصفحة غير موجودة</h1>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          الرابط الذي فتحته غير صحيح أو تم نقل الصفحة. تأكد من الرابط أو عد إلى الصفحة الرئيسية.
        </p>
        <Link
          to="/"
          className="mt-7 inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-m)] bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover"
        >
          العودة للرئيسية
        </Link>
      </div>
    </main>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-muted px-4 py-12">
      <div className="w-full max-w-md rounded-[var(--radius-l)] border border-border bg-surface p-8 text-center">
        <p className="text-sm font-bold tracking-tight text-foreground">
          مِهلة <span className="text-gold">·</span> MEHLA
        </p>
        <h1 className="mt-6 text-xl font-bold tracking-tight text-foreground">
          تعذّر عرض هذه الصفحة
        </h1>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          حدث خطأ غير متوقع من جانبنا. يمكنك إعادة المحاولة، وإذا تكرر الأمر عد إلى الصفحة الرئيسية.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-m)] bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover"
          >
            إعادة المحاولة
          </button>
          <a
            href="/"
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-m)] border border-border bg-surface px-5 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
          >
            العودة للرئيسية
          </a>
        </div>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async () => {
    try {
      return await getThemeCacheVersion();
    } catch {
      return { cacheVersion: 0, hasTheme: false };
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "مِهلة | منصة إدارة القضايا والمكاتب القانونية" },
      {
        name: "description",
        content:
          "منصة مِهلة تساعد المحامين ومكاتب وشركات المحاماة على إدارة القضايا والعملاء والجلسات والمستندات والمهام في مكان واحد.",
      },
      { name: "author", content: "MehlaLex" },
      { name: "publisher", content: "MehlaLex" },
      { name: "application-name", content: "مِهلة | MehlaLex" },
      { name: "apple-mobile-web-app-title", content: "مِهلة" },
      { name: "theme-color", content: "#173F35" },
      { property: "og:site_name", content: "مِهلة | MehlaLex" },
      { property: "og:locale", content: "ar_SA" },
      { property: "og:title", content: "مِهلة | منصة إدارة القضايا والمكاتب القانونية" },
      {
        property: "og:description",
        content: "منصة سعودية لإدارة القضايا والمكاتب القانونية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "google-site-verification",
        content: "yBlUIvK3rqnHFgSJabn7pIV0a4p8REKVw5F2ZCVRmcU",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      // حزمة تصميم المنصة المنشورة — مفتاح Cache يتغير مع كل نشر
      ...(loaderData?.hasTheme
        ? [{ rel: "stylesheet", href: `/api/public/theme.css?v=${loaderData.cacheVersion}` }]
        : []),
      { rel: "icon", href: "/favicon-mehla-v2.ico", type: "image/x-icon" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-mehla-32-v2.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon-v2.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      // الخطوط مستضافة محلياً — نُحمّل مسبقاً خط الواجهة وخط العناوين للعرض الأول فقط
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/tajawal-arabic-400.woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/cairo-arabic-600.woff2",
        crossOrigin: "anonymous",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pageKey = pageKeyForPath(pathname);
  return (
    <html lang="ar" dir="rtl" data-page={pageKey}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const themeState = Route.useLoaderData();
  useSurfaceGuard();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.searchStr });

  // وضع معاينة التصميم: الصفحة الحقيقية داخل إطار لوحة الإدارة، بنفس الجلسة والصلاحيات
  useEffect(() => {
    if (!isDesignPreviewRequest(search)) return;
    return installDesignPreviewBridge();
  }, [search]);

  // إصدار التصميم المنشور: استبدال حزمة CSS عند تغيّرها بدون إعادة تحميل
  useEffect(() => {
    if (!themeState?.hasTheme) return;
    return startThemeVersionSync(themeState.cacheVersion, () => getThemeCacheVersion());
  }, [themeState?.hasTheme, themeState?.cacheVersion]);

  useEffect(() => {
    initAnalytics();
  }, []);

  // ميزانية أداء الخطوط: تحذير في بيئة التطوير فقط عند تجاوز عدد الملفات أو حجم النقل
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    return installFontBudgetWatcher();
  }, []);

  // تحليلات المنتج: تهيئة واحدة، بعد الموافقة الصريحة فقط
  useEffect(() => {
    if (isAnalyticsConsentGranted()) startAnalytics();
    return subscribeToAnalyticsConsent((granted) => {
      if (granted) startAnalytics();
    });
  }, []);

  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);

  // اسم شاشة ثابت فقط — لا رابط ولا Query Params ولا معرّفات
  useEffect(() => {
    const screen = screenNameForPath(pathname);
    if (screen) trackScreen(screen);
  }, [pathname]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster
          position="top-center"
          dir="rtl"
          closeButton
          duration={4000}
          visibleToasts={3}
          gap={8}
          offset="calc(env(safe-area-inset-top, 0px) + 12px)"
          style={{ maxWidth: "calc(100vw - 24px)" }}
          toastOptions={{
            classNames: {
              toast:
                "!w-auto !max-w-[calc(100vw-24px)] !rounded-[var(--radius-m)] !border !border-border !bg-surface !text-foreground !shadow-[var(--elevation-l)] !font-sans !text-[13.5px] [overflow-wrap:anywhere]",
              description: "!text-muted-foreground",
              actionButton: "!bg-primary !text-primary-foreground",
              cancelButton: "!bg-surface-muted !text-foreground",
              success: "!border-success/25 !bg-success-soft !text-success",
              error: "!border-danger/25 !bg-danger-soft !text-danger",
              warning: "!border-warning/25 !bg-warning-soft !text-warning",
              info: "!border-info/25 !bg-info-soft !text-info",
              closeButton: "!bg-surface !border-border !text-muted-foreground",
            },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}

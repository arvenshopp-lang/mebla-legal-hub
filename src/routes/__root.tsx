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
import "../lib/zod-ar";
import { Toaster } from "sonner";

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
  head: () => ({
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
      { rel: "icon", href: "/favicon-mehla-v2.ico", type: "image/x-icon" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-mehla-32-v2.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon-v2.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
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
  useSurfaceGuard();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    trackPageView(pathname);
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
          toastOptions={{
            classNames: {
              toast:
                "!rounded-[var(--radius-m)] !border !border-border !bg-surface !text-foreground !shadow-[var(--elevation-l)] !font-sans !text-[13.5px]",
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

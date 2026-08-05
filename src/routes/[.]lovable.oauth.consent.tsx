/**
 * شاشة موافقة OAuth: يوافق المستخدم هنا على ربط عميل ذكاء اصطناعي بحسابه.
 * تعمل في المتصفح فقط لأن جلسة المستخدم تُقرأ من تخزين المتصفح.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type OAuthClient = { name?: string; client_name?: string; logo_uri?: string };
type AuthorizationDetails = {
  client?: OAuthClient | null;
  scope?: string | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};
type OAuthResponse<T> = Promise<{ data: T | null; error: { message: string } | null }>;
type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => OAuthResponse<AuthorizationDetails>;
  approveAuthorization: (id: string) => OAuthResponse<AuthorizationDetails>;
  denyAuthorization: (id: string) => OAuthResponse<AuthorizationDetails>;
};

function oauth(): OAuthNamespace {
  return (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("طلب الربط غير مكتمل: معرّف التخويل مفقود.");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = `${location.pathname}${location.searchStr}`;
      // يحفظ المقصد لمسار Google أيضاً، فمسار /auth/callback يقرأه بعد العودة.
      try {
        sessionStorage.setItem("mehla_auth_redirect", next);
      } catch {
        // تخزين الجلسة غير متاح: المعامل في الرابط يكفي لمسار كلمة المرور.
      }
      throw redirect({ to: "/login", search: { redirect: next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.searchStr).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: ConsentPage,
  errorComponent: ({ error }) => (
    <ConsentShell>
      <h1 className="text-xl font-semibold text-foreground">تعذر إكمال طلب الربط</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        انتهت صلاحية الطلب أو أنه غير صالح. أعد المحاولة من التطبيق الذي بدأ الربط.
      </p>
      <p className="mt-2 text-xs text-muted-foreground/80">
        {String((error as Error)?.message ?? error)}
      </p>
    </ConsentShell>
  ),
});

function ConsentShell({ children }: { children: React.ReactNode }) {
  return (
    <main dir="rtl" className="min-h-dvh bg-surface-muted px-4 py-16">
      <section className="mx-auto w-full max-w-lg rounded-2xl border border-border bg-surface p-8 shadow-sm">
        {children}
      </section>
    </main>
  );
}

function ConsentPage() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState<null | "approve" | "deny">(null);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.name ?? details?.client?.client_name ?? "تطبيق خارجي";

  const decide = async (approve: boolean) => {
    if (busy) return;
    setBusy(approve ? "approve" : "deny");
    setError(null);
    const api = oauth();
    const { data, error: decisionError } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (decisionError) {
      setBusy(null);
      setError("تعذر إكمال العملية. أعد المحاولة.");
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(null);
      setError("لم يُعد مزوّد الهوية عنوان العودة. أعد المحاولة من التطبيق الطالب.");
      return;
    }
    window.location.href = target;
  };

  return (
    <ConsentShell>
      <h1 className="text-xl font-semibold text-foreground">ربط «{clientName}» بحسابك في مِهلة</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        بالموافقة، سيتمكن هذا التطبيق من قراءة قضاياك وجلساتك ومهلك ومهامك، وإنشاء مهام جديدة،
        بصلاحياتك نفسها وداخل مكتبك فقط. يمكنك إلغاء الربط في أي وقت من إعدادات حسابك.
      </p>
      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row-reverse">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => decide(true)}
          className="inline-flex flex-1 items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
        >
          {busy === "approve" ? "جاري الربط…" : "الموافقة والربط"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => decide(false)}
          className="inline-flex flex-1 items-center justify-center rounded-lg border border-border px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
        >
          رفض
        </button>
      </div>
    </ConsentShell>
  );
}

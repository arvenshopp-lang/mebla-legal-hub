import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  History,
  Loader2,
  RotateCcw,
  Save,
  ShieldCheck,
  Undo2,
  Upload,
} from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import { Badge, Btn, LoadingBlock, SectionCard, inputCls } from "@/lib/list-utils";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { hasPermission } from "@/lib/admin-permissions";
import { cn } from "@/lib/utils";
import { DesignPreview } from "@/components/admin/design-preview";
import { DESIGN_PAGES, designPage, previewPathFor } from "@/lib/design/pages";
import { starterTemplate, type HarvestedSelector } from "@/lib/design/selectors";
import {
  APPROVED_FONTS,
  TOKEN_GROUPS,
  DEFAULT_META,
  sanitizeTokenValue,
  tokensToCss,
  type DesignTokens,
  type ThemeMeta,
  type TokenDef,
} from "@/lib/design/tokens";
import { MAX_CSS_BYTES, validateCustomCss } from "@/lib/design/css-guard";
import { fmtDateTime, fmtTime } from "@/lib/format";
import {
  getDesignStudio,
  publishDesign,
  resetDesignPage,
  restoreDesignVersion,
  rollbackDesign,
  saveDesignDraft,
} from "@/lib/design/theme.functions";
import { NOINDEX_META } from "@/config/indexing";

/** محرر CSS احترافي — يُحمّل عند فتح تبويب CSS فقط لتقليل حجم الحزمة. */
const CodeMirrorEditor = lazy(() => import("@/components/admin/css-code-editor"));

export const Route = createFileRoute("/mehla-admin/design")({
  head: () => ({
    meta: [
      { title: "محرر تصميم المنصة · إدارة مِهلة" },
      NOINDEX_META,
    ],
  }),
  component: DesignStudioPage,
});

type PageState = { tokens: DesignTokens; css: string; meta: ThemeMeta };

const EMPTY_STATE: PageState = { tokens: {}, css: "", meta: DEFAULT_META };

type SaveStatus = "idle" | "saving" | "saved" | "error";

const TABS = [
  ...TOKEN_GROUPS.map((g) => ({ id: g.id, label: g.label })),
  { id: "css", label: "CSS مخصص" },
  { id: "preview", label: "المعاينة" },
  { id: "history", label: "سجل الإصدارات" },
];

function hexOf(value: string | undefined) {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#173F35";
}

function TokenInput({
  def,
  value,
  onChange,
}: {
  def: TokenDef;
  value: string;
  onChange: (next: string) => void;
}) {
  const invalid = value.trim() !== "" && sanitizeTokenValue(def, value) === null;
  const id = `tok-${def.key.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[12.5px] font-medium text-foreground">
        {def.label}
        <code className="ms-1.5 text-[10.5px] font-normal text-text-muted">{def.key}</code>
      </label>

      {def.type === "color" ? (
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={`منتقي لون ${def.label}`}
            value={hexOf(value)}
            onChange={(e) => onChange(e.target.value)}
            className="h-10 w-12 shrink-0 cursor-pointer rounded-[var(--radius-s)] border border-border bg-surface p-1"
          />
          <input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={def.fallback}
            aria-invalid={invalid}
            className={cn(inputCls, invalid && "border-danger focus:border-danger")}
          />
        </div>
      ) : def.type === "font" ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        >
          <option value="">افتراضي ({def.fallback})</option>
          {APPROVED_FONTS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      ) : def.type === "select" ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        >
          <option value="">افتراضي ({def.fallback})</option>
          {def.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.fallback}
          aria-invalid={invalid}
          className={cn(inputCls, invalid && "border-danger focus:border-danger")}
        />
      )}

      {invalid && <p className="text-[11.5px] text-danger">قيمة غير صالحة لهذا الرمز.</p>}
    </div>
  );
}

function CssEditor({
  value,
  onChange,
  pageKey,
}: {
  value: string;
  onChange: (next: string) => void;
  pageKey: string;
}) {
  const history = useRef<string[]>([]);
  const future = useRef<string[]>([]);

  const push = (next: string) => {
    history.current = [...history.current.slice(-40), value];
    future.current = [];
    onChange(next);
  };

  const format = () => {
    const pretty = value
      .replace(/\s*\{\s*/g, " {\n  ")
      .replace(/;\s*/g, ";\n  ")
      .replace(/\s*\}\s*/g, "\n}\n\n")
      .replace(/\n\s*\n\s*\n/g, "\n\n")
      .replace(/\n\s+\}/g, "\n}")
      .trim();
    push(pretty);
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Btn variant="secondary" size="sm" onClick={format}>
          تنسيق الكود
        </Btn>
        <Btn
          variant="secondary"
          size="sm"
          onClick={() => {
            const prev = history.current.pop();
            if (prev === undefined) return;
            future.current.push(value);
            onChange(prev);
          }}
        >
          تراجع
        </Btn>
        <Btn
          variant="secondary"
          size="sm"
          onClick={() => {
            const next = future.current.pop();
            if (next === undefined) return;
            history.current.push(value);
            onChange(next);
          }}
        >
          إعادة
        </Btn>
        <Btn variant="danger" size="sm" onClick={() => push("")}>
          إعادة تعيين
        </Btn>
        <span className="text-[11.5px] text-muted-foreground">
          البحث والاستبدال داخل المحرر عبر Ctrl+F
        </span>
      </div>

      <Suspense
        fallback={
          <div className="min-h-[320px] rounded-[var(--radius-m)] border border-border bg-surface p-3 text-[12.5px] text-muted-foreground">
            جارٍ تحميل المحرر…
          </div>
        }
      >
        <CodeMirrorEditor
          value={value}
          onChange={(next: string) => {
            history.current = [...history.current.slice(-40), value];
            onChange(next);
          }}
          ariaLabel={`CSS المخصص لنطاق ${pageKey}`}
        />
      </Suspense>
    </div>
  );
}

function DesignStudioPage() {
  const { staff } = usePlatformAdmin();
  const isOwner = staff?.role === "super_admin";
  const canRead = hasPermission(staff, "design.read");
  const queryClient = useQueryClient();

  const load = useServerFn(getDesignStudio);
  const save = useServerFn(saveDesignDraft);
  const publish = useServerFn(publishDesign);
  const rollback = useServerFn(rollbackDesign);
  const resetPage = useServerFn(resetDesignPage);
  const restoreVersion = useServerFn(restoreDesignVersion);

  const studio = useQuery({
    queryKey: ["design-studio"],
    queryFn: () => load(),
  });

  const [pageKey, setPageKey] = useState("global");
  const [tab, setTab] = useState("identity");
  const [pages, setPages] = useState<Record<string, PageState>>({});
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [selectors, setSelectors] = useState<HarvestedSelector[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  /** قواعد محظورة كما أعادها الخادم بأرقام أسطرها الحقيقية (فحص AST). */
  const [serverIssues, setServerIssues] = useState<string[]>([]);
  const hydrated = useRef(false);
  const dirty = useRef(false);
  /** رقم مراجعة كل صفحة كما حُمّلت — أساس القفل التفاؤلي حتى لا تُطمس تعديلات جلسة أخرى. */
  const revisions = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!studio.data || hydrated.current) return;
    const next: Record<string, PageState> = {};
    for (const draft of studio.data.drafts) {
      const payload = (draft.design_tokens_json ?? {}) as {
        tokens?: DesignTokens;
        meta?: ThemeMeta;
      };
      next[draft.page_key] = {
        tokens: payload.tokens ?? {},
        css: draft.custom_css ?? "",
        meta: { ...DEFAULT_META, ...(payload.meta ?? {}) },
      };
      revisions.current[draft.page_key] = draft.revision_number ?? 0;
    }
    setPages(next);
    hydrated.current = true;
  }, [studio.data]);

  const current = pages[pageKey] ?? EMPTY_STATE;
  const globalState = pages.global ?? EMPTY_STATE;

  const update = useCallback(
    (patch: Partial<PageState>) => {
      dirty.current = true;
      setPages((prev) => ({ ...prev, [pageKey]: { ...(prev[pageKey] ?? EMPTY_STATE), ...patch } }));
    },
    [pageKey],
  );

  const setToken = (key: string, value: string) => {
    const tokens = { ...current.tokens };
    if (value.trim() === "") delete tokens[key];
    else tokens[key] = value;
    update({ tokens });
  };

  const validation = useMemo(() => validateCustomCss(current.css, pageKey), [current.css, pageKey]);

  const previewCss = useMemo(() => {
    const parts: string[] = [];
    if (pageKey !== "global") {
      const g = tokensToCss(globalState.tokens, ":root");
      if (g) parts.push(g);
      const gv = validateCustomCss(globalState.css, "global");
      if (gv.valid && gv.normalized_css) parts.push(gv.normalized_css);
      const p = tokensToCss(current.tokens, `[data-page="${pageKey}"]`);
      if (p) parts.push(p);
    } else {
      const g = tokensToCss(current.tokens, ":root");
      if (g) parts.push(g);
    }
    if (validation.valid && validation.normalized_css) parts.push(validation.normalized_css);
    return parts.join("\n");
  }, [pageKey, current, globalState, validation]);

  const publishedPageCss = useMemo(() => {
    const active = studio.data?.active;
    if (!active) return "";
    return pageKey === "global"
      ? (active.sanitized_css ?? "")
      : ((active.page_css_json as Record<string, string> | null)?.[pageKey] ?? "");
  }, [studio.data, pageKey]);

  /* ------------------------- الحفظ التلقائي ------------------------- */
  const doSave = useCallback(
    async (silent = true) => {
      setStatus("saving");
      try {
        const result = await save({
          data: {
            pageKey,
            tokens: current.tokens,
            customCss: current.css,
            meta: current.meta,
            expectedRevision: revisions.current[pageKey] ?? 0,
          },
        });
        setStatus("saved");
        setLastSavedAt(result.savedAt);
        revisions.current[pageKey] = result.revision;
        setServerIssues(result.validation?.css?.blocked_rules ?? []);
        dirty.current = false;
        if (!silent) toast.success("تم حفظ المسودة دون نشر.");
        return true;
      } catch (error) {
        setStatus("error");
        const message = error instanceof Error ? error.message : "تعذّر حفظ المسودة.";
        // تعارض المراجعات يُعلَن دائماً — حتى في الحفظ التلقائي — حتى لا يظن المحرر أن عمله محفوظ.
        if (!silent || message.includes("عُدِّلت")) toast.error(message);
        return false;
      }
    },
    [save, pageKey, current],
  );

  useEffect(() => {
    if (!hydrated.current || !dirty.current) return;
    const timer = setTimeout(() => {
      void doSave(true);
    }, 2500);
    return () => clearTimeout(timer);
  }, [current, doSave]);

  const publishMutation = useMutation({
    mutationFn: async () =>
      publish({
        data: {
          summary: `تحديث تصميم: ${designPage(pageKey)?.label ?? pageKey}`,
          draft: { pageKey, tokens: current.tokens, customCss: current.css, meta: current.meta },
        },
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(`${result.reason} (معرّف التتبع: ${result.traceId})`);
        return;
      }
      dirty.current = false;
      setStatus("saved");
      toast.success(`تم النشر بنجاح — الإصدار ${result.versionNumber} أصبح نشطاً على الموقع.`);
      await queryClient.invalidateQueries({ queryKey: ["design-studio"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "فشل النشر."),
  });

  const rollbackMutation = useMutation({
    mutationFn: async () => rollback({} as never),
    onSuccess: async () => {
      toast.success("تم استرجاع التصميم المنشور السابق.");
      await queryClient.invalidateQueries({ queryKey: ["design-studio"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر الاسترجاع."),
  });

  const restoreMutation = useMutation({
    mutationFn: async (versionId: string) => restoreVersion({ data: { versionId } }),
    onSuccess: async (result) => {
      toast.success(
        `تمت استعادة الإصدار #${result.restoredFrom} كإصدار جديد #${result.versionNumber} وأصبح نشطاً.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["design-studio"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "تعذّرت استعادة الإصدار."),
  });

  const resetMutation = useMutation({
    mutationFn: async () => resetPage({ data: { pageKey } }),
    onSuccess: async () => {
      setPages((prev) => ({ ...prev, [pageKey]: { ...EMPTY_STATE } }));
      dirty.current = false;
      toast.success("تمت إعادة الصفحة للوضع الافتراضي.");
      await queryClient.invalidateQueries({ queryKey: ["design-studio"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "تعذّرت إعادة التعيين."),
  });

  // صلاحيات دقيقة من الخادم — لتعطيل الأزرار فقط؛ المنع الحقيقي في دوال الخادم.
  const can = studio.data?.can ?? {
    draft: isOwner,
    history: isOwner,
    publish: isOwner,
    rollback: isOwner,
  };
  const state = studio.data?.state;
  const groups = TOKEN_GROUPS;
  const activeGroup = groups.find((g) => g.id === tab);
  const pageGroups = DESIGN_PAGES.reduce<Record<string, typeof DESIGN_PAGES>>((acc, p) => {
    (acc[p.group] ??= []).push(p);
    return acc;
  }, {});

  if (!canRead) {
    return (
      <AdminShell
        title="محرر تصميم المنصة"
        description="هذه الوحدة متاحة لمن يملك صلاحية الاطلاع على التصميم فقط."
      >
        <SectionCard title="لا تملك صلاحية الوصول">
          <p className="text-[13px] text-muted-foreground">
            الوصول إلى استوديو التصميم يتطلب صلاحية «الاطلاع على التصميم» (design.read). راجع مالك
            المنصة لمنحك الصلاحية المناسبة.
          </p>
        </SectionCard>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title="محرر تصميم المنصة"
      description="تخصيص التصميم العام أو صفحة محددة عبر Design Tokens و CSS مفحوص، مع معاينة آمنة ونشر فعلي."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] text-muted-foreground" role="status" aria-live="polite">
            {status === "saving" && "جارٍ الحفظ…"}
            {status === "saved" && `تم الحفظ${lastSavedAt ? ` · ${fmtTime(lastSavedAt)}` : ""}`}
            {status === "error" && "فشل الحفظ — أعد المحاولة"}
          </span>
          <Btn
            variant="secondary"
            size="sm"
            disabled={!can.draft}
            title={can.draft ? undefined : "لا تملك صلاحية تعديل مسودة التصميم."}
            onClick={() => void doSave(false)}
          >
            <Save className="h-4 w-4" aria-hidden /> حفظ مسودة فقط
          </Btn>
          <Btn
            size="sm"
            loading={publishMutation.isPending}
            disabled={!validation.valid || !can.publish}
            title={
              !can.publish
                ? "النشر يتطلب صلاحية «نشر التصميم»."
                : !validation.valid
                  ? "هناك قواعد CSS محظورة تمنع النشر."
                  : undefined
            }
            onClick={() => publishMutation.mutate()}
          >
            <Upload className="h-4 w-4" aria-hidden /> حفظ ونشر الآن
          </Btn>
        </div>
      }
    >
      {studio.isLoading ? (
        <LoadingBlock rows={6} />
      ) : studio.isError ? (
        <SectionCard title="تعذّر تحميل المحرر">
          <p className="text-body-sm text-danger">
            {studio.error instanceof Error ? studio.error.message : "خطأ غير متوقع."}
          </p>
        </SectionCard>
      ) : (
        <div className="grid gap-6">
          {/* حالة النشر */}
          <SectionCard
            title="حالة التصميم المنشور"
            description="كل نشر يحفظ النسخة السابقة تلقائياً ويمنح حق استرجاع واحد."
            actions={
              <div className="flex flex-wrap gap-2">
                <Btn
                  variant="secondary"
                  size="sm"
                  disabled={
                    !can.rollback || !state?.rollback_available || rollbackMutation.isPending
                  }
                  title={can.rollback ? undefined : "الاسترجاع يتطلب صلاحية «التراجع عن النشر»."}
                  loading={rollbackMutation.isPending}
                  onClick={() => {
                    if (
                      !window.confirm(
                        "سيتم استرجاع آخر تصميم منشور واستبدال التصميم النشط. هذا الحق متاح مرة واحدة بعد كل نشر. متابعة؟",
                      )
                    )
                      return;
                    rollbackMutation.mutate();
                  }}
                >
                  <Undo2 className="h-4 w-4" aria-hidden /> استرجاع آخر تصميم منشور
                </Btn>
                <Btn
                  variant="danger"
                  size="sm"
                  disabled={!can.draft || resetMutation.isPending}
                  title={can.draft ? undefined : "إعادة التعيين تتطلب صلاحية تعديل المسودة."}
                  loading={resetMutation.isPending}
                  onClick={() => {
                    if (!window.confirm("إعادة تعيين هذه الصفحة للوضع الافتراضي وحذف مسودتها؟"))
                      return;
                    resetMutation.mutate();
                  }}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden /> إعادة تعيين الصفحة
                </Btn>
              </div>
            }
          >
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-[11.5px] text-muted-foreground">الإصدار النشط</dt>
                <dd className="text-[15px] font-semibold tabular-nums">
                  {studio.data?.active
                    ? `#${studio.data.active.version_number}`
                    : "التصميم الافتراضي"}
                </dd>
              </div>
              <div>
                <dt className="text-[11.5px] text-muted-foreground">مفتاح Cache</dt>
                <dd className="text-[15px] font-semibold tabular-nums">
                  theme_version={state?.cache_version ?? 1}
                </dd>
              </div>
              <div>
                <dt className="text-[11.5px] text-muted-foreground">آخر نشر</dt>
                <dd className="text-[13px]">
                  {state?.last_published_at ? fmtDateTime(state.last_published_at) : "لا يوجد"}
                </dd>
              </div>
              <div>
                <dt className="text-[11.5px] text-muted-foreground">الاسترجاع</dt>
                <dd className="text-[13px]">
                  {state?.rollback_available ? (
                    <Badge tone="green">متاح مرة واحدة</Badge>
                  ) : (
                    <Badge tone="muted">
                      {state?.rollback_used_at ? "استُخدم — يتطلب نشراً جديداً" : "غير متاح"}
                    </Badge>
                  )}
                </dd>
              </div>
            </dl>
          </SectionCard>

          {/* اختيار النطاق */}
          <SectionCard
            title="نطاق التخصيص"
            description="التصميم العام يطبق على كل المنصة، وأي صفحة أخرى تُعزل بمعرّفها الداخلي."
          >
            <div className="grid gap-3 sm:grid-cols-[minmax(0,320px)_minmax(0,1fr)] sm:items-center">
              <select
                value={pageKey}
                onChange={(e) => setPageKey(e.target.value)}
                aria-label="اختيار نطاق التخصيص"
                className={inputCls}
              >
                {Object.entries(pageGroups).map(([group, items]) => (
                  <optgroup key={group} label={group}>
                    {items.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label} — {p.key}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="text-[12px] text-muted-foreground">
                المعرّف الداخلي: <code className="font-mono">{pageKey}</code>
                {pageKey !== "global" && (
                  <>
                    {" "}
                    · يُحصر CSS تلقائياً داخل{" "}
                    <code className="font-mono">[data-page=&quot;{pageKey}&quot;]</code>
                  </>
                )}
              </p>
            </div>
          </SectionCard>

          {/* التبويبات */}
          <div className="flex flex-wrap gap-1.5 rounded-[var(--radius-m)] border border-border bg-surface p-1.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-pressed={tab === t.id}
                className={cn(
                  "rounded-[var(--radius-s)] px-3 py-2 text-[12.5px] font-medium transition",
                  tab === t.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-surface-muted",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeGroup && (
            <SectionCard title={activeGroup.label} description={activeGroup.description}>
              {activeGroup.id === "identity" && (
                <div className="mb-5 grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <label htmlFor="dir" className="text-[12.5px] font-medium">
                      اتجاه التصميم
                    </label>
                    <select
                      id="dir"
                      value={current.meta.direction}
                      onChange={(e) =>
                        update({
                          meta: { ...current.meta, direction: e.target.value as "rtl" | "ltr" },
                        })
                      }
                      className={inputCls}
                    >
                      <option value="rtl">من اليمين لليسار (RTL)</option>
                      <option value="ltr">من اليسار لليمين (LTR)</option>
                    </select>
                  </div>
                  <div className="grid gap-1.5">
                    <label htmlFor="mode" className="text-[12.5px] font-medium">
                      الوضع
                    </label>
                    <select
                      id="mode"
                      value={current.meta.mode}
                      onChange={(e) =>
                        update({
                          meta: { ...current.meta, mode: e.target.value as ThemeMeta["mode"] },
                        })
                      }
                      className={inputCls}
                    >
                      <option value="light">فاتح</option>
                      <option value="dark">داكن</option>
                      <option value="auto">تلقائي</option>
                    </select>
                  </div>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeGroup.tokens.map((def) => (
                  <TokenInput
                    key={def.key}
                    def={def}
                    value={current.tokens[def.key] ?? ""}
                    onChange={(next) => setToken(def.key, next)}
                  />
                ))}
              </div>
            </SectionCard>
          )}

          {tab === "css" && (
            <SectionCard
              title={
                pageKey === "global"
                  ? "CSS عام (كامل المنصة)"
                  : `CSS الصفحة — ${designPage(pageKey)?.label}`
              }
              description={`الحد الأقصى ${Math.round(MAX_CSS_BYTES / 1024)} كيلوبايت. لا يُنشر CSS يحتوي قواعد محظورة.`}
              actions={
                validation.valid ? (
                  <Badge tone="green">
                    <CheckCircle2 className="me-1 inline h-3.5 w-3.5" aria-hidden /> صالح للنشر
                  </Badge>
                ) : (
                  <Badge tone="red">
                    <AlertTriangle className="me-1 inline h-3.5 w-3.5" aria-hidden /> يحتوي قواعد
                    محظورة
                  </Badge>
                )
              }
            >
              <CssEditor
                value={current.css}
                onChange={(css) => update({ css })}
                pageKey={pageKey}
              />

              <p className="mt-3 text-[11.5px] text-muted-foreground">
                الحجم: {(validation.size_bytes / 1024).toFixed(1)} كيلوبايت
              </p>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-[var(--radius-m)] border border-border bg-surface-muted p-3">
                  <p className="text-[12.5px] font-semibold">
                    1) رموز التصميم الفعلية (للمرجع فقط)
                  </p>
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    مصدرها <code className="font-mono">src/styles.css</code> — تُعدَّل من تبويبات
                    الرموز أعلاه، لا من هنا.
                  </p>
                  <pre
                    dir="ltr"
                    className="mt-2 max-h-40 overflow-auto rounded-[var(--radius-s)] bg-surface p-2 text-[11px] leading-[1.6]"
                  >
                    {tokensToCss(
                      current.tokens,
                      pageKey === "global" ? ":root" : `[data-page="${pageKey}"]`,
                    ) || "/* لا توجد رموز مخصصة لهذا النطاق بعد */"}
                  </pre>
                </div>

                <div className="rounded-[var(--radius-m)] border border-border bg-surface-muted p-3">
                  <p className="text-[12.5px] font-semibold">
                    2) CSS المخصص المنشور حالياً لهذا النطاق
                  </p>
                  <pre
                    dir="ltr"
                    className="mt-2 max-h-40 overflow-auto rounded-[var(--radius-s)] bg-surface p-2 text-[11px] leading-[1.6]"
                  >
                    {publishedPageCss || "/* لا يوجد CSS منشور لهذا النطاق */"}
                  </pre>
                </div>

                <div className="rounded-[var(--radius-m)] border border-border bg-surface-muted p-3 lg:col-span-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[12.5px] font-semibold">
                      3) عناصر الصفحة الحقيقية القابلة للاستهداف
                    </p>
                    <Btn
                      variant="secondary"
                      size="sm"
                      disabled={selectors.length === 0}
                      onClick={() =>
                        update({
                          css: `${current.css ? `${current.css.trimEnd()}\n\n` : ""}${starterTemplate(pageKey, selectors)}`,
                        })
                      }
                    >
                      إدراج قالب بداية لهذه الصفحة
                    </Btn>
                  </div>
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    مقروءة من صفحة المعاينة الحقيقية (
                    <code className="font-mono" dir="ltr">
                      {previewPathFor(pageKey)}
                    </code>
                    ). الأنماط الأساسية مكتوبة بـ Tailwind داخل مكوّنات React، فلا يمكن تحريرها كملف
                    CSS — تُعدَّل بطبقة CSS مخصصة فوقها.
                  </p>
                  {selectors.length === 0 ? (
                    <p className="mt-2 text-[11.5px] text-muted-foreground">
                      افتح تبويب المعاينة مرة واحدة لقراءة عناصر الصفحة.
                    </p>
                  ) : (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {selectors.map((s) => (
                        <li key={s.selector}>
                          <button
                            type="button"
                            onClick={() =>
                              update({
                                css: `${current.css ? `${current.css.trimEnd()}\n\n` : ""}${s.selector} {\n  \n}`,
                              })
                            }
                            className="rounded-[var(--radius-s)] border border-border bg-surface px-2 py-1 font-mono text-[11px] hover:border-primary"
                            dir="ltr"
                            title={`${s.label} · ${s.count}`}
                          >
                            {s.selector}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {validation.blocked_rules.length > 0 && (
                <div className="mt-3 rounded-[var(--radius-m)] border border-danger/25 bg-danger-soft p-3">
                  <p className="text-[12.5px] font-semibold text-danger">
                    قواعد محظورة تمنع النشر:
                  </p>
                  <ul className="mt-1.5 list-disc space-y-1 ps-5 text-[12px] text-danger">
                    {validation.blocked_rules.map((r, i) => (
                      <li key={i} dir="auto">
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {serverIssues.length > 0 && (
                <div className="mt-3 rounded-[var(--radius-m)] border border-danger/25 bg-danger-soft p-3">
                  <p className="text-[12.5px] font-semibold text-danger">
                    نتيجة الفحص الخادمي (بأرقام الأسطر):
                  </p>
                  <ul className="mt-1.5 list-disc space-y-1 ps-5 text-[12px] text-danger">
                    {serverIssues.map((r, i) => (
                      <li key={i} dir="auto">
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {validation.warnings.length > 0 && (
                <div className="mt-3 rounded-[var(--radius-m)] border border-warning/25 bg-warning-soft p-3">
                  <p className="text-[12.5px] font-semibold text-warning">تحذيرات:</p>
                  <ul className="mt-1.5 list-disc space-y-1 ps-5 text-[12px] text-warning">
                    {validation.warnings.slice(0, 12).map((r, i) => (
                      <li key={i} dir="auto">
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-5">
                <p className="mb-2 text-[12.5px] font-semibold">معاينة فورية</p>
                <DesignPreview pageKey={pageKey} themeCss={previewCss} onSelectors={setSelectors} />
              </div>
            </SectionCard>
          )}

          {tab === "preview" && (
            <SectionCard
              title="المعاينة الآمنة"
              description="إطار معزول ببيانات تجريبية — لا يؤثر على الموقع قبل النشر."
            >
              <DesignPreview pageKey={pageKey} themeCss={previewCss} onSelectors={setSelectors} />
            </SectionCard>
          )}

          {tab === "history" && (
            <div className="grid gap-6">
              <SectionCard title="سجل الإصدارات" description="آخر 30 إصداراً من تصميم المنصة.">
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-surface-muted text-muted-foreground">
                      <tr>
                        <th className="p-2.5 text-start">الإصدار</th>
                        <th className="p-2.5 text-start">النطاق</th>
                        <th className="p-2.5 text-start">الملخص</th>
                        <th className="p-2.5 text-start">تاريخ النشر</th>
                        <th className="p-2.5 text-start">إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(studio.data?.versions ?? []).map(
                        (v: Record<string, string | number | null>) => (
                          <tr key={String(v.id)} className="border-t border-border">
                            <td className="p-2.5 font-semibold tabular-nums">
                              #{String(v.version_number)}
                            </td>
                            <td className="p-2.5">{String(v.scope)}</td>
                            <td className="p-2.5">
                              {v.change_summary ? String(v.change_summary) : "—"}
                            </td>
                            <td className="p-2.5">
                              {v.published_at ? fmtDateTime(String(v.published_at)) : "—"}
                            </td>
                            <td className="p-2.5">
                              <Btn
                                variant="secondary"
                                size="sm"
                                disabled={
                                  restoreMutation.isPending ||
                                  !can.rollback ||
                                  String(v.id) === String(studio.data?.active?.id ?? "")
                                }
                                onClick={() => {
                                  if (
                                    !window.confirm(
                                      `استعادة الإصدار #${String(v.version_number)} كإصدار جديد نشط؟ لن يُحذف أي إصدار من السجل.`,
                                    )
                                  )
                                    return;
                                  restoreMutation.mutate(String(v.id));
                                }}
                              >
                                استعادة
                              </Btn>
                            </td>
                          </tr>
                        ),
                      )}
                      {(studio.data?.versions ?? []).length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-muted-foreground">
                            لا توجد إصدارات منشورة بعد.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              <SectionCard
                title="سجل التعديلات والتدقيق"
                description="من عدّل، ماذا نُفّذ، ومتى — بدون أي محتوى حساس."
              >
                <ul className="divide-y divide-border">
                  {(studio.data?.audit ?? []).map((a: Record<string, string | null>) => (
                    <li
                      key={String(a.id)}
                      className="flex flex-wrap items-center gap-2 py-2.5 text-[12.5px]"
                    >
                      <History className="h-3.5 w-3.5 text-text-muted" aria-hidden />
                      <span className="font-semibold">{String(a.action)}</span>
                      {a.page_key && <Badge tone="muted">{String(a.page_key)}</Badge>}
                      <span className="text-muted-foreground">
                        {a.actor_email ? String(a.actor_email) : "—"}
                      </span>
                      <span className="ms-auto text-text-muted">
                        {fmtDateTime(String(a.created_at))}
                      </span>
                    </li>
                  ))}
                  {(studio.data?.audit ?? []).length === 0 && (
                    <li className="py-4 text-center text-muted-foreground">
                      لا توجد عمليات مسجلة بعد.
                    </li>
                  )}
                </ul>
              </SectionCard>
            </div>
          )}

          <p className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-success" aria-hidden />
            كل عملية حفظ أو نشر أو استرجاع تُسجَّل مع منفّذها ووقتها، ولا يُنشر CSS إلا بعد فحص أمني
            كامل.
          </p>
        </div>
      )}
    </AdminShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/shell";
import { Badge, Btn, FormField, LoadingBlock, SectionCard, inputCls } from "@/lib/list-utils";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { getPlatformSettings, savePlatformSettings } from "@/lib/admin-ops.functions";
import { NOINDEX_META } from "@/config/indexing";

export const Route = createFileRoute("/mehla-admin/seo")({
  head: () => ({
    meta: [{ title: "إدارة SEO · إدارة مِهلة" }, NOINDEX_META],
  }),
  component: SeoPage,
});

type SeoSettings = {
  canonical_domain: string;
  default_title: string;
  default_description: string;
  keywords: string;
  og_image: string;
  twitter_handle: string;
  allow_indexing: boolean;
  google_verification: string;
  bing_verification: string;
  extra_disallow: string;
};

const EMPTY: SeoSettings = {
  canonical_domain: "https://mehlalex.com",
  default_title: "",
  default_description: "",
  keywords: "",
  og_image: "",
  twitter_handle: "",
  allow_indexing: true,
  google_verification: "",
  bing_verification: "",
  extra_disallow: "",
};

function SeoPage() {
  const qc = useQueryClient();
  const { can } = usePlatformAdmin();
  const canManage = can("seo.manage");

  const settingsFn = useServerFn(getPlatformSettings);
  const settings = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => settingsFn({ data: undefined }),
  });

  const [form, setForm] = useState<SeoSettings>(EMPTY);
  useEffect(() => {
    const s = settings.data?.settings?.seo as Partial<SeoSettings> | undefined;
    if (s) setForm({ ...EMPTY, ...s, allow_indexing: s.allow_indexing !== false });
  }, [settings.data]);

  const saveFn = useServerFn(savePlatformSettings);
  const save = useMutation({
    mutationFn: () => saveFn({ data: { group: "seo", values: { seo: form } } }),
    onSuccess: () => {
      toast.success("تم حفظ إعدادات SEO.");
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof SeoSettings>(key: K, value: SeoSettings[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const titleLen = form.default_title.trim().length;
  const descLen = form.default_description.trim().length;

  const robotsPreview = [
    "User-agent: *",
    form.allow_indexing ? "Allow: /" : "Disallow: /",
    ...form.extra_disallow
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((p) => `Disallow: ${p.startsWith("/") ? p : `/${p}`}`),
    `Sitemap: ${form.canonical_domain.replace(/\/+$/, "")}/sitemap.xml`,
  ].join("\n");

  if (settings.isLoading) {
    return (
      <AdminShell
        title="إدارة SEO"
        description="الوسوم الافتراضية والفهرسة وملفات robots و sitemap."
      >
        <LoadingBlock rows={6} cols={2} />
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title="إدارة SEO"
      description="الوسوم الافتراضية للموقع التسويقي وقواعد الفهرسة وملفات المحركات."
    >
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <SectionCard
          title="الوسوم الافتراضية"
          description="تُستخدم في الصفحات التي لا تحدد وسوماً خاصة بها."
        >
          <div className="space-y-4">
            <FormField
              label="العنوان الافتراضي"
              hint={`${titleLen} حرفاً — الأفضل أقل من ٦٠ حرفاً.`}
              error={
                titleLen > 60 ? "العنوان أطول من الحد المفضل وقد يُقتطع في نتائج البحث." : undefined
              }
            >
              <input
                className={inputCls}
                value={form.default_title}
                onChange={(e) => set("default_title", e.target.value)}
                placeholder="مِهلة — منصة إدارة الأعمال القانونية"
                disabled={!canManage}
              />
            </FormField>
            <FormField
              label="الوصف الافتراضي"
              hint={`${descLen} حرفاً — الأفضل أقل من ١٦٠ حرفاً.`}
              error={
                descLen > 160 ? "الوصف أطول من الحد المفضل وقد يُقتطع في نتائج البحث." : undefined
              }
            >
              <textarea
                className={`${inputCls} min-h-24`}
                value={form.default_description}
                onChange={(e) => set("default_description", e.target.value)}
                placeholder="منصة سعودية لإدارة القضايا والجلسات والمهل القانونية للمحامين والمكاتب."
                disabled={!canManage}
              />
            </FormField>
            <FormField label="الكلمات المفتاحية" hint="اكتبها مفصولة بفاصلة.">
              <input
                className={inputCls}
                value={form.keywords}
                onChange={(e) => set("keywords", e.target.value)}
                placeholder="إدارة قضايا، مكتب محاماة، المهل القانونية"
                disabled={!canManage}
              />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard
          title="المشاركة الاجتماعية"
          description="بطاقة المعاينة التي تظهر عند مشاركة رابط الموقع."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="النطاق الرسمي (canonical)">
              <input
                className={inputCls}
                value={form.canonical_domain}
                onChange={(e) => set("canonical_domain", e.target.value)}
                placeholder="https://mehlalex.com"
                dir="ltr"
                disabled={!canManage}
              />
            </FormField>
            <FormField label="صورة المعاينة (og:image)">
              <input
                className={inputCls}
                value={form.og_image}
                onChange={(e) => set("og_image", e.target.value)}
                placeholder="https://mehlalex.com/og-mehlalex-v3.jpg"
                dir="ltr"
                disabled={!canManage}
              />
            </FormField>
            <FormField label="حساب X (تويتر)">
              <input
                className={inputCls}
                value={form.twitter_handle}
                onChange={(e) => set("twitter_handle", e.target.value)}
                placeholder="@mehlalex"
                dir="ltr"
                disabled={!canManage}
              />
            </FormField>
          </div>
          {form.og_image && (
            <div className="mt-4 overflow-hidden rounded-[var(--radius-m)] border border-border">
              <img
                src={form.og_image}
                alt="معاينة صورة المشاركة"
                loading="lazy"
                className="aspect-[1200/630] w-full bg-surface-muted object-cover"
              />
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="الفهرسة ومحركات البحث"
          description="تحكم في وصول عناكب البحث وملف robots.txt."
        >
          <label className="flex items-center gap-2 text-body-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border"
              checked={form.allow_indexing}
              onChange={(e) => set("allow_indexing", e.target.checked)}
              disabled={!canManage}
            />
            السماح لمحركات البحث بفهرسة الموقع التسويقي
            <Badge tone={form.allow_indexing ? "green" : "red"}>
              {form.allow_indexing ? "مفهرس" : "محجوب"}
            </Badge>
          </label>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FormField
              label="توثيق Google Search Console"
              hint="قيمة وسم google-site-verification."
            >
              <input
                className={inputCls}
                value={form.google_verification}
                onChange={(e) => set("google_verification", e.target.value)}
                dir="ltr"
                disabled={!canManage}
              />
            </FormField>
            <FormField label="توثيق Bing Webmaster">
              <input
                className={inputCls}
                value={form.bing_verification}
                onChange={(e) => set("bing_verification", e.target.value)}
                dir="ltr"
                disabled={!canManage}
              />
            </FormField>
          </div>

          <div className="mt-4">
            <FormField
              label="مسارات ممنوعة من الفهرسة"
              hint="مسار واحد في كل سطر، مثل /mehla-admin."
            >
              <textarea
                className={`${inputCls} min-h-24 font-mono text-[13px]`}
                value={form.extra_disallow}
                onChange={(e) => set("extra_disallow", e.target.value)}
                dir="ltr"
                disabled={!canManage}
              />
            </FormField>
          </div>

          <div className="mt-4">
            <p className="text-caption mb-2">معاينة robots.txt</p>
            <pre
              dir="ltr"
              className="overflow-x-auto rounded-[var(--radius-m)] bg-surface-muted p-4 font-mono text-[12px] leading-6 text-foreground"
            >
              {robotsPreview}
            </pre>
          </div>
        </SectionCard>

        {canManage ? (
          <div className="flex justify-end">
            <Btn type="submit" loading={save.isPending}>
              حفظ إعدادات SEO
            </Btn>
          </div>
        ) : (
          <p className="text-body-sm text-muted-foreground">
            لديك صلاحية المشاهدة فقط. التعديل يتطلب صلاحية «إدارة SEO».
          </p>
        )}
      </form>
    </AdminShell>
  );
}

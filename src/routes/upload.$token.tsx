import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, FileUp, Loader2, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getUploadRequest,
  createUploadSlots,
  submitUploadRequest,
} from "@/lib/client-portal.functions";
import { ACCEPT_ATTR, MAX_FILES_PER_REQUEST, validateClientFile } from "@/lib/client-portal.shared";
import { fmtDateTime, fmtSize } from "@/lib/enums";

export const Route = createFileRoute("/upload/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "رفع المستندات — مِهلة" },
      { name: "description", content: "صفحة آمنة لرفع المستندات المطلوبة إلى مكتب المحاماة." },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { httpEquiv: "Cache-Control", content: "no-store, max-age=0" },
    ],
  }),
  component: Page,
});

type Picked = { id: string; file: File; label?: string };

function Page() {
  const { token } = Route.useParams();
  const getReq = useServerFn(getUploadRequest);
  const makeSlots = useServerFn(createUploadSlots);
  const submitReq = useServerFn(submitUploadRequest);

  const [picked, setPicked] = useState<Picked[]>([]);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["upload-request", token],
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: () => getReq({ data: { token } }),
  });

  const add = (files: FileList | null, label?: string) => {
    if (!files) return;
    const next: Picked[] = [];
    for (const f of Array.from(files)) {
      const err = validateClientFile(f);
      if (err) {
        toast.error(`${f.name}: ${err}`);
        continue;
      }
      next.push({ id: crypto.randomUUID(), file: f, label });
    }
    setPicked((prev) => {
      const merged = [...prev, ...next];
      if (merged.length > MAX_FILES_PER_REQUEST) {
        toast.error(`الحد الأقصى ${MAX_FILES_PER_REQUEST} ملفاً`);
        return merged.slice(0, MAX_FILES_PER_REQUEST);
      }
      return merged;
    });
  };

  const send = async () => {
    if (!picked.length) return toast.error("أضف الملفات المطلوبة أولاً");
    setSending(true);
    try {
      const metas = picked.map((p) => ({
        name: p.file.name,
        size: p.file.size,
        type: p.file.type || "",
        label: p.label,
      }));
      const { slots } = await makeSlots({ data: { token, files: metas } });
      const uploaded: any[] = [];
      for (let i = 0; i < picked.length; i++) {
        const slot = slots[i];
        const { error: upErr } = await supabase.storage
          .from("documents")
          .uploadToSignedUrl(slot.path, slot.uploadToken, picked[i].file, {
            contentType: picked[i].file.type || undefined,
          });
        if (upErr) throw new Error(`تعذّر رفع ${picked[i].file.name}`);
        uploaded.push({ ...metas[i], path: slot.path });
      }
      await submitReq({ data: { token, files: uploaded } });
      setDone(true);
    } catch (e: any) {
      toast.error("تعذّر الإرسال", { description: e?.message ?? "حاول مرة أخرى" });
    } finally {
      setSending(false);
    }
  };

  return (
    <main dir="rtl" className="min-h-dvh bg-surface-muted px-4 py-8 text-foreground sm:py-14">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 text-center">
          <div className="text-2xl font-extrabold tracking-tight">مِهلة</div>
          <div className="mt-1 text-xs text-text-muted">منصة إدارة القضايا</div>
        </div>

        {isLoading ? (
          <Card>
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> جاري التحقق من الرابط…
            </div>
          </Card>
        ) : error ? (
          <Notice
            title="تعذّر فتح الرابط"
            body="حدث خطأ غير متوقع. يرجى المحاولة لاحقاً أو التواصل مع المحامي."
          />
        ) : done || data?.state === "completed" ? (
          <Notice
            tone="success"
            title="تم استلام المستندات بنجاح"
            body="تم استلام المستندات بنجاح ولا يمكن استخدام هذا الرابط مرة أخرى. إذا احتجت رفع مستندات إضافية يرجى التواصل مع المحامي."
          />
        ) : data?.state === "invalid" ? (
          <Notice
            title="رابط غير صالح"
            body="هذا الرابط غير صحيح أو تم حذفه. يرجى التواصل مع المحامي للحصول على رابط جديد."
          />
        ) : data?.state === "rate_limited" ? (
          <Notice
            title="تم تجاوز عدد المحاولات"
            body="تم إيقاف المحاولات مؤقتاً لحماية بيانات المكتب. يرجى المحاولة بعد 15 دقيقة."
          />
        ) : data?.state === "expired" ? (
          <Notice
            title="انتهت صلاحية الرابط"
            body="انتهت مدة صلاحية هذا الرابط. يرجى التواصل مع المحامي لإصدار رابط جديد."
          />
        ) : data?.state === "revoked" ? (
          <Notice
            title="تم إيقاف الرابط"
            body="تم إيقاف هذا الرابط من قبل المكتب. يرجى التواصل مع المحامي."
          />
        ) : data ? (
          <div className="space-y-4">
            <Card>
              <div className="flex items-center gap-3 border-b border-border pb-4">
                {data.orgLogo ? (
                  <img
                    src={data.orgLogo}
                    alt={data.orgName}
                    className="h-11 w-11 rounded-[var(--radius-m)] object-cover"
                  />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-m)] bg-primary text-sm font-bold text-primary-foreground">
                    {(data.orgName || "م").slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">
                    {data.orgName || "مكتب المحاماة"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">طلب مستندات آمن</div>
                </div>
              </div>

              <h1 className="mt-4 text-lg font-bold">{data.title}</h1>
              {data.message && (
                <p className="mt-2 whitespace-pre-line text-sm leading-7 text-muted-foreground">
                  {data.message}
                </p>
              )}
              {data.expiresAt && (
                <p className="mt-3 text-[11px] text-warning">
                  صالح حتى {fmtDateTime(data.expiresAt)}
                </p>
              )}
            </Card>

            {data.items.length > 0 && (
              <Card>
                <h2 className="mb-3 text-sm font-bold">المستندات المطلوبة</h2>
                <ul className="space-y-3">
                  {data.items.map((item, i) => {
                    const count = picked.filter((p) => p.label === item).length;
                    return (
                      <li
                        key={i}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-m)] bg-surface-muted/70 p-3"
                      >
                        <div className="flex items-center gap-2 text-sm">
                          {count > 0 && <CheckCircle2 className="h-4 w-4 text-foreground" />}
                          <span>{item}</span>
                          {count > 0 && (
                            <span className="text-[11px] text-muted-foreground">({count} ملف)</span>
                          )}
                        </div>
                        <label className="cursor-pointer rounded-[var(--radius-m)] border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface/70">
                          <FileUp className="ms-1 inline h-3.5 w-3.5" /> رفع
                          <input
                            type="file"
                            multiple
                            accept={ACCEPT_ATTR}
                            className="hidden"
                            onChange={(e) => {
                              add(e.target.files, item);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}

            <Card>
              <h2 className="mb-3 text-sm font-bold">ملفات إضافية</h2>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-l)] border-2 border-dashed border-border p-6 text-center hover:border-text-muted">
                <FileUp className="h-6 w-6 text-text-muted" />
                <span className="text-sm font-medium">اختر ملفات للرفع</span>
                <span className="text-[11px] text-muted-foreground">
                  PDF أو صور أو مستندات Office · حتى 20 ميجابايت للملف
                </span>
                <input
                  type="file"
                  multiple
                  accept={ACCEPT_ATTR}
                  className="hidden"
                  onChange={(e) => {
                    add(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>

              {picked.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {picked.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-3 rounded-[var(--radius-m)] bg-surface-muted/70 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate">{p.file.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {fmtSize(p.file.size)}
                          {p.label ? ` · ${p.label}` : ""}
                        </div>
                      </div>
                      {!sending && (
                        <button
                          onClick={() => setPicked((prev) => prev.filter((x) => x.id !== p.id))}
                          className="rounded-lg p-1 text-danger hover:bg-surface"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <button
                onClick={send}
                disabled={sending || picked.length === 0}
                className="mt-5 w-full rounded-[var(--radius-m)] bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-50"
              >
                {sending ? "جاري الإرسال…" : "إرسال المستندات"}
              </button>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> اتصال مشفّر · الرابط يُستخدم مرة واحدة فقط
              </p>
            </Card>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-l)] border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(18,60,50,0.04)] sm:p-7">
      {children}
    </section>
  );
}

function Notice({
  title,
  body,
  tone = "muted",
}: {
  title: string;
  body: string;
  tone?: "muted" | "success";
}) {
  return (
    <Card>
      <div className="py-6 text-center">
        <div
          className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[var(--radius-l)] ${tone === "success" ? "bg-primary-soft" : "bg-surface-muted"}`}
        >
          {tone === "success" ? (
            <CheckCircle2 className="h-6 w-6 text-foreground" />
          ) : (
            <ShieldCheck className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">{body}</p>
      </div>
    </Card>
  );
}

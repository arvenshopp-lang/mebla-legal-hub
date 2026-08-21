import { createFileRoute } from "@tanstack/react-router";
import { NOINDEX_META } from "@/config/indexing";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AlertTriangle, CheckCircle2, FileSignature, Loader2, ShieldCheck } from "lucide-react";
import { verifyContractPublicFn } from "@/lib/contracts/contracts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/enums";

export const Route = createFileRoute("/verify")({
  ssr: false,
  validateSearch: z.object({ id: z.string().optional() }),
  /**
   * صفحة التحقق تعرض نتيجة تخص عقداً بعينه (بمعرّف في الرابط أو بإدخال يدوي
   * دون تغيير الرابط)، ولا يمكن إثبات فصل حالة "بلا نتيجة" عن حالة "نتيجة
   * ظاهرة" على مستوى المستند؛ لذلك المسار كامله ممنوع من الفهرسة، وهو مطابق
   * تماماً لترويسة `X-Robots-Tag` الصادرة من `indexingDecision`.
   */
  head: () => ({
    meta: [{ title: "التحقق من عقد إلكتروني — مِهلة" }, NOINDEX_META],
  }),

  component: VerifyContractPage,
});

type VerifyResult = Awaited<ReturnType<typeof verifyContractPublicFn>>;
type Phase = "idle" | "loading" | "found" | "notFound" | "error";

const MESSAGES = {
  idle: "أدخل رقم التحقق المطبوع في نسخة العقد أو الظاهر في رمز QR.",
  loading: "جارٍ التحقق…",
  short: "رقم التحقق يتكوّن من 10 أحرف وأرقام بصيغة MHL-XXXXX-XXXXX.",
  notFound: "لا يوجد عقد مطابق لرقم التحقق المُدخل. تحقق من الرقم أو تواصل مع المكتب.",
  generic: "تعذّر إتمام التحقق حالياً، حاول مرة أخرى بعد لحظات.",
};

function VerifyContractPage() {
  const { id } = Route.useSearch();
  const verify = useServerFn(verifyContractPublicFn);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(id ?? "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState(MESSAGES.idle);
  const [result, setResult] = useState<Extract<VerifyResult, { found: true }> | null>(null);

  const run = async (raw: string) => {
    const candidate = raw.trim();
    if (candidate.replace(/[^A-Za-z0-9]/g, "").length < 10) {
      setPhase("error");
      setMessage(MESSAGES.short);
      setResult(null);
      inputRef.current?.focus();
      return;
    }
    setPhase("loading");
    setMessage(MESSAGES.loading);
    try {
      const data = await verify({ data: { verificationId: candidate } });
      if (data.found) {
        setResult(data);
        setPhase("found");
        setMessage("");
      } else {
        setResult(null);
        setPhase("notFound");
        setMessage(MESSAGES.notFound);
      }
    } catch {
      setResult(null);
      setPhase("error");
      setMessage(MESSAGES.generic);
    }
  };

  // فتح الرابط من رمز QR يبدأ التحقق تلقائياً.
  useEffect(() => {
    if (id) void run(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <main className="min-h-screen bg-background py-10 px-4 sm:px-6" dir="rtl">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="space-y-2 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="size-6" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">التحقق من عقد إلكتروني</h1>
          <p className="text-sm text-muted-foreground">
            هذه الصفحة تُثبت وجود العقد وحالته ومطابقة نسخته النهائية الموقّعة إلكترونياً عبر منصة مِهلة، ولا
            تعرض محتوى العقد أو بيانات أطرافه.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">رقم التحقق</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void run(value);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="verification-id">أدخل رقم التحقق</Label>
                <Input
                  id="verification-id"
                  ref={inputRef}
                  value={value}
                  onChange={(event) => setValue(event.target.value.toUpperCase())}
                  placeholder="MHL-XXXXX-XXXXX"
                  autoComplete="off"
                  inputMode="text"
                  dir="ltr"
                  className="h-12 text-center font-mono tracking-widest"
                  aria-describedby="verification-help"
                />
              </div>
              <Button type="submit" className="h-12 w-full" disabled={phase === "loading"}>
                {phase === "loading" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" /> جارٍ التحقق…
                  </>
                ) : (
                  "تحقق من العقد"
                )}
              </Button>
              <p
                id="verification-help"
                role="status"
                aria-live="polite"
                className={`text-sm ${phase === "error" || phase === "notFound" ? "text-destructive" : "text-muted-foreground"}`}
              >
                {message}
              </p>
            </form>
          </CardContent>
        </Card>

        {phase === "notFound" && (
          <div
            className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-foreground"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
            <p>{MESSAGES.notFound}</p>
          </div>
        )}

        {result && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSignature className="size-5 text-primary" aria-hidden="true" />
                نتيجة التحقق
              </CardTitle>
              <Badge variant={result.status === "signed" ? "default" : "secondary"}>{result.statusLabel}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="رقم العقد" value={result.contractNumber} mono />
                <Field label="رقم التحقق" value={result.verificationId} mono />
                <Field label="المكتب المُصدر" value={result.officeName} />
                <Field
                  label="النسخة النهائية"
                  value={result.versionNumber ? `النسخة رقم ${result.versionNumber}` : "لم تُعتمد نسخة نهائية"}
                />
                <Field label="بصمة النسخة (SHA-256)" value={result.contentHashPrefix} mono />
                <Field
                  label="تاريخ التوقيع"
                  value={result.signedAt ? fmtDateTime(result.signedAt) : "لم يكتمل التوقيع"}
                />
                <Field
                  label="الموقّعون"
                  value={`${result.signedCount} من ${result.signersCount || result.signedCount}`}
                />
                <Field label="اعتماد مكتب المحاماة" value={result.officeEndorsed ? "معتمد من المكتب" : "غير معتمد"} />
              </dl>

              {result.status === "signed" && (
                <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  <p>
                    تم توقيع هذا العقد إلكترونياً عبر منصة مِهلة. هذه النتيجة إثبات لوجود العقد وحالته ومطابقة
                    نسخته النهائية، ولا تمثل توثيقاً رسمياً لدى أي جهة حكومية.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-sm font-medium text-foreground ${mono ? "font-mono" : ""}`} dir={mono ? "ltr" : undefined}>
        {value}
      </dd>
    </div>
  );
}

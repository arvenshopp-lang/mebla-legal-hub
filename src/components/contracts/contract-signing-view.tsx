import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Building2,
  User,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Download,
  FileText,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Money } from "@/components/ui/money";
import { SignaturePad } from "@/components/contracts/signature-pad";
import {
  getPublicContractForSigningFn,
  signPublicContractFn,
  downloadSignedContractByTicketFn,
} from "@/lib/contracts/contracts.functions";
import { CONTRACT_TYPE_LABELS } from "@/lib/contracts/contracts.shared";
import { toast } from "sonner";

/**
 * عرض وثيقة العقد وتوقيعها إلكترونياً برمز التوقيع — مكوّن مشترك بين:
 * 1) الصفحة العامة `/sign/$token` التي يفتحها الطرف الثاني الخارجي.
 * 2) نافذة التوقيع المضغوطة داخل مساحة عمل المكتب مع بقاء التنقل متاحاً.
 *
 * لا يحتوي أي منطق صلاحيات؛ التحقق من الرمز وصلاحيته يبقى خادمياً بالكامل.
 */
export function ContractSigningView({
  token,
  compact = false,
  onSigned,
}: {
  token: string;
  compact?: boolean;
  onSigned?: () => void;
}) {
  const [signerName, setSignerName] = React.useState("");
  const [signatureBase64, setSignatureBase64] = React.useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = React.useState(false);
  const [isSuccessfullySigned, setIsSuccessfullySigned] = React.useState(false);
  const [downloadTicket, setDownloadTicket] = React.useState<string | null>(null);
  const [downloadState, setDownloadState] = React.useState<
    { phase: "idle" } | { phase: "working"; attempt: number } | { phase: "done" } | { phase: "error"; message: string; traceId: string }
  >({ phase: "idle" });
  const isDownloading = downloadState.phase === "working";

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["public-contract", token],
    queryFn: () => getPublicContractForSigningFn({ data: { signToken: token } }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const contract = data?.contract;

  React.useEffect(() => {
    if (contract?.secondParty?.name && !signerName) {
      setSignerName(contract.secondParty.name);
    }
    if (contract?.status === "signed") {
      setIsSuccessfullySigned(true);
    }
  }, [contract]);

  React.useEffect(() => {
    if (data?.downloadTicket) setDownloadTicket(data.downloadTicket);
  }, [data?.downloadTicket]);

  const signMutation = useMutation({
    mutationFn: signPublicContractFn,
    onSuccess: (res) => {
      if (res.ok) {
        setIsSuccessfullySigned(true);
        if (res.downloadTicket) setDownloadTicket(res.downloadTicket);
        toast.success("تم توقيع واعتماد العقد بنجاح!");
        onSigned?.();
      } else {
        toast.error(res.error || "تعذّر تسجيل التوقيع.");
      }
    },
    onError: () => {
      toast.error("حدث خطأ أثناء إرسال التوقيع.");
    },
  });

  const handleSign = () => {
    if (!signatureBase64) {
      toast.error("يرجى رسم التوقيع في المربع المخصص.");
      return;
    }
    if (!signerName.trim()) {
      toast.error("يرجى كتابة الاسم الكامل للموقع.");
      return;
    }
    if (!agreedToTerms) {
      toast.error("يرجى الموافقة على الإقرار القانوني للمتابعة.");
      return;
    }

    signMutation.mutate({
      data: {
        signToken: token,
        signatureImageBase64: signatureBase64,
        signerName: signerName.trim(),
      },
    });
  };

  /** يجلب الملف بتذكرة صالحة، مع تجديد التذكرة عند انتهائها. */
  const fetchSignedPdf = async () => {
    // التذكرة قصيرة الصلاحية وقد تُفقد بعد إعادة تحميل الصفحة؛ تُطلب من جديد
    // من الخادم بنفس رمز الرابط قبل الاستسلام لرسالة خطأ.
    let ticket = downloadTicket;
    if (!ticket) {
      const fresh = await refetch();
      ticket = fresh.data?.downloadTicket ?? null;
      if (ticket) setDownloadTicket(ticket);
    }
    if (!ticket) throw new Error("no-ticket");
    try {
      return await downloadSignedContractByTicketFn({ data: { downloadTicket: ticket } });
    } catch (first) {
      const fresh = await refetch();
      const renewed = fresh.data?.downloadTicket ?? null;
      if (!renewed) throw first;
      setDownloadTicket(renewed);
      return await downloadSignedContractByTicketFn({ data: { downloadTicket: renewed } });
    }
  };

  const handleDownloadPdf = async () => {
    if (!contract || isDownloading) return;
    const maxAttempts = 3;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      setDownloadState({ phase: "working", attempt });
      try {
        const res = await fetchSignedPdf();
        const byteCharacters = atob(res.base64);
        const byteArray = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteArray[i] = byteCharacters.charCodeAt(i);
        }
        const blob = new Blob([byteArray], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.fileName;
        a.click();
        URL.revokeObjectURL(url);
        setDownloadState({ phase: "done" });
        return;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : "";
        // حالات نهائية لا تُفيد فيها إعادة المحاولة.
        if (message === "no-ticket" || message.includes("يكتمل")) break;
        if (attempt < maxAttempts) {
          // فواصل تصاعدية قصيرة قبل المحاولة التالية.
          await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
        }
      }
    }

    const message = lastError instanceof Error ? lastError.message : "";
    const traceId = `DL-${Date.now().toString(36).toUpperCase()}`;
    setDownloadState({
      phase: "error",
      traceId,
      message:
        message === "no-ticket"
          ? "نسخة العقد غير متاحة للتحميل عبر هذا الرابط، يرجى التواصل مع المكتب."
          : message.includes("يكتمل")
            ? "لم يكتمل توقيع العقد بعد، ولا تتوفر نسخة نهائية للتحميل."
            : "تعذّر تجهيز ملف العقد حالياً بعد عدة محاولات، يرجى المحاولة بعد قليل أو التواصل مع المكتب.",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-10" role="status" aria-live="polite">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">جارٍ تحميل وثيقة العقد...</p>
        </div>
      </div>
    );
  }

  if (!contract) {
    return (
      <Card className="max-w-md w-full mx-auto text-center p-6 space-y-4">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
        <CardTitle className="text-lg">رابط العقد غير متاح أو منتهي الصلاحية</CardTitle>
        <CardDescription>
          تأكد من صحة الرابط أو تواصل مع المكتب القانوني المصدر لإعادة إرسال رابط التوقيع.
        </CardDescription>
      </Card>
    );
  }

  const pad = compact ? "p-4" : "p-6";

  return (
    <div className="space-y-6">
      {/* Office Branding Header */}
      <div
        className={`bg-white dark:bg-slate-900 rounded-2xl ${pad} border shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4`}
      >
        <div className="flex items-center gap-3 text-right">
          <div className="w-12 h-12 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
            ⚖️
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {contract.firstParty.name}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
              <span>عقود إلكترونية عبر منصة مِهلة</span>
              <span>•</span>
              <span>س.ت: {contract.firstParty.identifierNumber}</span>
            </div>
          </div>
        </div>

        <div className="text-left sm:text-right bg-slate-50 dark:bg-slate-800 px-3.5 py-2 rounded-xl border text-xs">
          <div className="text-slate-400 text-[10px]">الرقم المرجعي للعقد</div>
          <div className="font-mono font-bold text-primary text-sm">{contract.contractNumber}</div>
        </div>
      </div>

      {/* Success Banner if Signed */}
      {isSuccessfullySigned ? (
        <Card className="border-emerald-200 bg-emerald-50/30 dark:bg-emerald-950/20 text-center p-8 space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 mx-auto">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-emerald-800 dark:text-emerald-300">
              تم توقيع العقد إلكترونياً بنجاح
            </h3>
            <p className="text-xs text-emerald-600/90 mt-1 max-w-md mx-auto">
              تم تسجيل التوقيع مع تاريخه ووقته وبيانات الجهاز وبصمة المستند داخل سجل العقد. هذا
              المستند موقّع إلكترونياً عبر منصة مِهلة ولا يمثل توثيقاً رسمياً لدى جهة حكومية.
            </p>
          </div>
          <div className="space-y-3">
            <Button
              onClick={handleDownloadPdf}
              disabled={isDownloading}
              aria-busy={isDownloading}
              className="gap-2 min-h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              <Download className="w-4 h-4" />
              {isDownloading
                ? "جارٍ تجهيز الملف..."
                : downloadState.phase === "error"
                  ? "إعادة المحاولة"
                  : "تحميل نسخة العقد الموقعة (PDF)"}
            </Button>

            <div role="status" aria-live="polite" className="text-xs max-w-md mx-auto">
              {downloadState.phase === "working" ? (
                <p className="text-slate-600 dark:text-slate-300">
                  جارٍ تجهيز نسخة العقد النهائية...
                  {downloadState.attempt > 1 ? ` (محاولة ${downloadState.attempt} من 3)` : ""}
                </p>
              ) : downloadState.phase === "done" ? (
                <p className="text-emerald-700 dark:text-emerald-300 font-semibold">
                  تم تنزيل نسخة العقد بنجاح.
                </p>
              ) : downloadState.phase === "error" ? (
                <p className="text-rose-700 dark:text-rose-300">
                  {downloadState.message}
                  <span className="block text-[10px] text-slate-400 mt-1 font-mono">
                    معرّف التتبع: {downloadState.traceId}
                  </span>
                </p>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      {/* Contract Document Card */}
      <Card className="border shadow-sm overflow-hidden">
        <CardHeader className={`bg-slate-50/80 dark:bg-slate-900/50 border-b ${pad}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <Badge variant="outline" className="mb-2 bg-white text-xs font-semibold">
                {CONTRACT_TYPE_LABELS[contract.contractType]}
              </Badge>
              <CardTitle className="text-xl font-bold">{contract.title}</CardTitle>
              <CardDescription className="text-xs mt-1">
                حرر هذا العقد في مدينة {contract.firstParty.city || "الرياض"} بتاريخ{" "}
                {new Date(contract.createdAt).toLocaleDateString("ar-SA")}
              </CardDescription>
            </div>

            {contract.totalAmount && (
              <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border text-right">
                <div className="text-[10px] text-slate-400">قيمة العقد الإجمالية</div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">
                  <Money value={contract.totalAmount} />
                </div>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className={`${pad} space-y-6`}>
          {/* Parties Box */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl border bg-slate-50/50 dark:bg-slate-900/30 space-y-1.5">
              <div className="font-bold text-primary flex items-center gap-1.5">
                <Building2 className="w-4 h-4 shrink-0" />
                الطرف الأول: {contract.firstParty.name}
              </div>
              {contract.firstParty.identifierNumber ? (
                <div className="text-slate-600 dark:text-slate-400">
                  السجل التجاري / الترخيص: {contract.firstParty.identifierNumber}
                </div>
              ) : null}
              {contract.firstParty.phone ? (
                <div className="text-slate-600 dark:text-slate-400">
                  هاتف: {contract.firstParty.phone}
                </div>
              ) : null}
            </div>

            <div className="p-4 rounded-xl border bg-slate-50/50 dark:bg-slate-900/30 space-y-1.5">
              <div className="font-bold text-primary flex items-center gap-1.5">
                <User className="w-4 h-4 shrink-0" />
                الطرف الثاني: {contract.secondParty.name}
              </div>
              {contract.secondParty.identifierNumber ? (
                <div className="text-slate-600 dark:text-slate-400">
                  الهوية / السجل: {contract.secondParty.identifierNumber}
                </div>
              ) : null}
              {contract.secondParty.phone ? (
                <div className="text-slate-600 dark:text-slate-400">
                  هاتف: {contract.secondParty.phone}
                </div>
              ) : null}
            </div>
          </div>

          {/* Clauses */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 border-b pb-2">
              <FileText className="w-4 h-4 shrink-0 text-primary" />
              بنود وشروط الاتفاقية:
            </h4>

            <div className="space-y-4 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              {contract.clauses.map((clause) => (
                <div
                  key={clause.id}
                  className="p-4 rounded-xl border bg-white dark:bg-slate-900 space-y-1.5"
                >
                  <div className="font-bold text-slate-900 dark:text-white text-xs">
                    {clause.title}
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 whitespace-pre-line">
                    {clause.content}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Electronic Signature Box (If Not Signed Yet) */}
          {!isSuccessfullySigned && (
            <div className="pt-6 border-t space-y-5">
              <div className="space-y-1">
                <h4 className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                  <Lock className="w-4 h-4 shrink-0 text-primary" />
                  التوقيع الإلكتروني للطرف الثاني (الموكل):
                </h4>
                <p className="text-xs text-slate-500">
                  توقيعك الإلكتروني يعد إقراراً صريحاً بالموافقة على بنود العقد، ويُسجَّل مع تاريخه
                  ووقته وبيانات جهازك كدليل على التوقيع.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="signer-name" className="text-xs font-semibold">
                  الاسم الكامل للموقع:
                </Label>
                <Input
                  id="signer-name"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="الاسم الثلاثي أو الرباعي"
                />
              </div>

              {/* Touch Canvas Pad */}
              <SignaturePad
                label="ارسم توقيعك في هذا المربع:"
                onSave={(base64) => setSignatureBase64(base64)}
                onClear={() => setSignatureBase64(null)}
              />

              {/* Legal Consent Checkbox */}
              <div className="flex items-start gap-3 p-3.5 rounded-xl border bg-amber-50/30 dark:bg-amber-950/20 border-amber-200/60">
                <Checkbox
                  id="consent"
                  checked={agreedToTerms}
                  onCheckedChange={(checked) => setAgreedToTerms(Boolean(checked))}
                  className="mt-0.5"
                />
                <label
                  htmlFor="consent"
                  className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  أقر أنا الموقع أعلاه بصفتي أصيلاً أو مفوضاً عن الطرف الثاني بقراءتي التامة لجميع
                  بنود وشروط هذا العقد والموافقة الصريحة عليها، وأعتمد توقيعي الإلكتروني عبر منصة
                  مِهلة تعبيراً عن رضائي بالتعاقد.
                </label>
              </div>

              <Button
                size="lg"
                disabled={signMutation.isPending || !agreedToTerms || !signatureBase64}
                onClick={handleSign}
                className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md"
              >
                <CheckCircle2 className="w-5 h-5" />
                {signMutation.isPending
                  ? "جارٍ تسجيل التوقيع..."
                  : "تأكيد التوقيع الإلكتروني على العقد"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

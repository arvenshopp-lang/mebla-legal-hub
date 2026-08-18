import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  FileCheck2,
  Building2,
  User,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Download,
  Calendar,
  DollarSign,
  FileText,
  Lock,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { SignaturePad } from "@/components/contracts/signature-pad";
import {
  getPublicContractForSigningFn,
  signPublicContractFn,
  downloadContractPdfFn,
} from "@/lib/contracts/contracts.functions";
import { CONTRACT_TYPE_LABELS } from "@/lib/contracts/contracts.shared";
import { toast } from "sonner";

export const Route = createFileRoute("/sign/$token")({
  component: PublicSignContractPage,
});

function PublicSignContractPage() {
  const { token } = Route.useParams();
  const [signerName, setSignerName] = React.useState("");
  const [signatureBase64, setSignatureBase64] = React.useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = React.useState(false);
  const [isSuccessfullySigned, setIsSuccessfullySigned] = React.useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["public-contract", token],
    queryFn: () => getPublicContractForSigningFn({ data: { signToken: token } }),
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

  const signMutation = useMutation({
    mutationFn: signPublicContractFn,
    onSuccess: (res) => {
      if (res.ok) {
        setIsSuccessfullySigned(true);
        toast.success("تم توقيع واعتماد العقد بنجاح!");
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

  const handleDownloadPdf = async () => {
    if (!contract) return;
    try {
      toast.loading("جارٍ تجهيز ملف العقد...", { id: "pdf" });
      const res = await downloadContractPdfFn({ data: { contractId: contract.id } });
      const byteCharacters = atob(res.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("تم تنزيل العقد بنجاح!", { id: "pdf" });
    } catch {
      toast.error("تعذّر تنزيل ملف الـ PDF.", { id: "pdf" });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">جارٍ تحميل وثيقة العقد الرسمية...</p>
        </div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
        <Card className="max-w-md w-full text-center p-6 space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <CardTitle className="text-lg">رابط العقد غير متاح أو منتهي الصلاحية</CardTitle>
          <CardDescription>
            تأكد من صحة الرابط أو تواصل مع المكتب القانوني المصدر لإعادة إرسال رابط التوقيع.
          </CardDescription>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 py-8 px-4 sm:px-6" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Office Branding Header */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-right">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
              ⚖️
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{contract.firstParty.name}</h2>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>منصة العقود الرقمية المعتمدة</span>
                <span>•</span>
                <span>س.ت: {contract.firstParty.identifierNumber}</span>
              </div>
            </div>
          </div>

          <div className="text-left sm:text-right bg-slate-50 dark:bg-slate-800 px-3.5 py-2 rounded-xl border text-xs">
            <div className="text-slate-400 text-[10px]">رقم العقد الرسمي</div>
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
                تم توقيع واعتماد العقد رسمياً بنجاح!
              </h3>
              <p className="text-xs text-emerald-600/90 mt-1 max-w-md mx-auto">
                تم توثيق التوقيع الإلكتروني وختم العقد ببيانات الإثبات الرسمية وفق نظام التعاملات الإلكترونية ونظام الإثبات
                السعودي.
              </p>
            </div>
            <Button onClick={handleDownloadPdf} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
              <Download className="w-4 h-4" />
              تحميل وثيقة العقد الموقعة (PDF)
            </Button>
          </Card>
        ) : null}

        {/* Contract Document Card */}
        <Card className="border shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/80 dark:bg-slate-900/50 border-b p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
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
                    {contract.totalAmount.toLocaleString("en-US")} ر.س
                  </div>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            {/* Parties Box */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl border bg-slate-50/50 dark:bg-slate-900/30 space-y-1.5">
                <div className="font-bold text-primary flex items-center gap-1.5">
                  <Building2 className="w-4 h-4" />
                  الطرف الأول: {contract.firstParty.name}
                </div>
                <div className="text-slate-600 dark:text-slate-400">
                  السجل التجاري / الترخيص: {contract.firstParty.identifierNumber}
                </div>
                <div className="text-slate-600 dark:text-slate-400">هاتف: {contract.firstParty.phone}</div>
              </div>

              <div className="p-4 rounded-xl border bg-slate-50/50 dark:bg-slate-900/30 space-y-1.5">
                <div className="font-bold text-primary flex items-center gap-1.5">
                  <User className="w-4 h-4" />
                  الطرف الثاني: {contract.secondParty.name}
                </div>
                <div className="text-slate-600 dark:text-slate-400">
                  الهوية / السجل: {contract.secondParty.identifierNumber}
                </div>
                <div className="text-slate-600 dark:text-slate-400">هاتف: {contract.secondParty.phone}</div>
              </div>
            </div>

            {/* Clauses */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 border-b pb-2">
                <FileText className="w-4 h-4 text-primary" />
                بنود وشروط الاتفاقية:
              </h4>

              <div className="space-y-4 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                {contract.clauses.map((clause, idx) => (
                  <div key={clause.id} className="p-4 rounded-xl border bg-white dark:bg-slate-900 space-y-1.5">
                    <div className="font-bold text-slate-900 dark:text-white text-xs">{clause.title}</div>
                    <p className="text-slate-600 dark:text-slate-400 whitespace-pre-line">{clause.content}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Electronic Signature Box (If Not Signed Yet) */}
            {!isSuccessfullySigned && (
              <div className="pt-6 border-t space-y-5">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                    <Lock className="w-4 h-4 text-primary" />
                    التوقيع الإلكتروني للطرف الثاني (الموكل):
                  </h4>
                  <p className="text-xs text-slate-500">
                    توقيعك الإلكتروني يعد موافقة نظامية ملزمة لا رجعة فيها وفق نظام الإثبات ونظام المعاملات الإلكترونية.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">الاسم الكامل للموقع:</Label>
                  <Input
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
                  <label htmlFor="consent" className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 cursor-pointer">
                    أقر أنا الموقع أعلاه بصفتي أصيلاً أو مفوضاً عن الطرف الثاني بقراءتي التامة لجميع بنود وشروط هذا العقد
                    والموافقة عليها، وأعتمد توقيعي الإلكتروني كحجة قاطعة وملزمة وفق نظام التعاملات الإلكترونية ونظام
                    الإثبات بالمملكة العربية السعودية.
                  </label>
                </div>

                <Button
                  size="lg"
                  disabled={signMutation.isPending || !agreedToTerms || !signatureBase64}
                  onClick={handleSign}
                  className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  {signMutation.isPending ? "جارٍ التوثيق والتوقيع..." : "تأكيد واعتماد توقيع العقد إلكترونياً"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

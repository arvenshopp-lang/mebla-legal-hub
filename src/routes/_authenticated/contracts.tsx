import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Send,
  Download,
  Share2,
  Briefcase,
  Receipt,
  Sparkles,
  ExternalLink,
  Trash2,
  Copy,
  Check,
  FileCheck,
  AlertCircle,
  FileSignature,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SignaturePad } from "@/components/contracts/signature-pad";
import { ContractSignModal } from "@/components/contracts/contract-sign-modal";
import { DashboardShell, StatCard } from "@/components/dashboard/shell";
import {
  getContractsListFn,
  saveContractDraftFn,
  downloadContractPdfFn,
  convertContractToCaseFn,
  issueContractSignLinkFn,
} from "@/lib/contracts/contracts.functions";
import {
  CONTRACT_TYPE_LABELS,
  CONTRACT_STATUS_LABELS,
  SAUDI_CONTRACT_TEMPLATES,
  type ContractModel,
  type ContractType,
  type ContractClause,
} from "@/lib/contracts/contracts.shared";
import { toast } from "sonner";
import { describeMutationError } from "@/lib/subscription.shared";

export const Route = createFileRoute("/_authenticated/contracts")({
  component: ContractsPage,
  head: () => ({
    meta: [
      { title: "العقود والاتفاقيات | مِهلة" },
      {
        name: "description",
        content: "صياغة وتدقيق وتوقيع العقود الرقمية بهوية وشعار المكتب مع الختم الموثق.",
      },
      { property: "og:title", content: "العقود والاتفاقيات | مِهلة" },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function ContractsPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = React.useState<ContractType>("fee_agreement");

  // Form State
  const [contractTitle, setContractTitle] = React.useState(SAUDI_CONTRACT_TEMPLATES.fee_agreement.title);
  const [secondPartyName, setSecondPartyName] = React.useState("");
  const [secondPartyId, setSecondPartyId] = React.useState("");
  const [secondPartyPhone, setSecondPartyPhone] = React.useState("");
  const [totalAmount, setTotalAmount] = React.useState<number | "">("");
  const [advanceAmount, setAdvanceAmount] = React.useState<number | "">("");
  const [clauses, setClauses] = React.useState<ContractClause[]>(SAUDI_CONTRACT_TEMPLATES.fee_agreement.clauses);
  const [lawyerSignatureBase64, setLawyerSignatureBase64] = React.useState<string | null>(null);
  const [copiedTokenId, setCopiedTokenId] = React.useState<string | null>(null);
  const [issuingLinkId, setIssuingLinkId] = React.useState<string | null>(null);
  const [signingSession, setSigningSession] = React.useState<{
    token: string;
    contractNumber: string;
  } | null>(null);

  // Queries
  const { data, isLoading } = useQuery({
    queryKey: ["contracts-list"],
    queryFn: () => getContractsListFn({ data: {} }),
  });

  const contracts = data?.contracts || [];

  // Mutations
  const saveMutation = useMutation({
    mutationFn: saveContractDraftFn,
    onSuccess: (res) => {
      toast.success("تم حفظ وصياغة العقد بنجاح!");
      queryClient.invalidateQueries({ queryKey: ["contracts-list"] });
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (error: unknown) => {
      // بوابات الباقة والاستحقاقات ترجع سبباً عربياً واضحاً — نعرضه للمستخدم
      // بدل رسالة عامة تُخفي أن السبب هو حدود الباقة.
      toast.error("تعذّر حفظ العقد", {
        description: describeMutationError(
          error instanceof Error ? error.message : "",
          "حاول مرة أخرى بعد قليل.",
        ),
      });
    },
  });

  const convertToCaseMutation = useMutation({
    mutationFn: convertContractToCaseFn,
    onSuccess: (res) => {
      toast.success("تم إنشاء القضية وربطها بالعقد بنجاح!");
      queryClient.invalidateQueries({ queryKey: ["contracts-list"] });
    },
    onError: (error: unknown) =>
      toast.error("تعذّر إنشاء القضية", {
        description: describeMutationError(
          error instanceof Error ? error.message : "",
          "حاول مرة أخرى بعد قليل.",
        ),
      }),
  });

  const resetForm = () => {
    setSelectedTemplateKey("fee_agreement");
    setContractTitle(SAUDI_CONTRACT_TEMPLATES.fee_agreement.title);
    setSecondPartyName("");
    setSecondPartyId("");
    setSecondPartyPhone("");
    setTotalAmount("");
    setAdvanceAmount("");
    setClauses(SAUDI_CONTRACT_TEMPLATES.fee_agreement.clauses);
    setLawyerSignatureBase64(null);
  };

  const handleTemplateChange = (type: ContractType) => {
    setSelectedTemplateKey(type);
    const tmpl = SAUDI_CONTRACT_TEMPLATES[type];
    setContractTitle(tmpl.title);
    setClauses(tmpl.clauses);
  };

  const handleAddClause = () => {
    const newId = `c_${Date.now()}`;
    setClauses([
      ...clauses,
      {
        id: newId,
        title: `بند جديد: شرط إضافي`,
        content: "نص البند والالتزام القانوني المتفق عليه بين الطرفين.",
      },
    ]);
  };

  const handleUpdateClause = (id: string, field: "title" | "content", value: string) => {
    setClauses(clauses.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const handleDeleteClause = (id: string) => {
    setClauses(clauses.filter((c) => c.id !== id));
  };

  const handleSaveContract = (isPendingSignature: boolean = false) => {
    if (!contractTitle.trim() || !secondPartyName.trim()) {
      toast.error("يرجى إدخال عنوان العقد واسم الموكل / الطرف الثاني.");
      return;
    }

    saveMutation.mutate({
      data: {
        title: contractTitle,
        contractType: selectedTemplateKey,
        totalAmount: typeof totalAmount === "number" ? totalAmount : null,
        advanceAmount: typeof advanceAmount === "number" ? advanceAmount : null,
        clauses,
        secondParty: {
          role: "second_party",
          name: secondPartyName,
          identifierType: secondPartyId.length === 10 && secondPartyId.startsWith("7") ? "cr" : "national_id",
          identifierNumber: secondPartyId || "—",
          phone: secondPartyPhone || "—",
        },
        lawyerSignature: lawyerSignatureBase64
          ? {
              signedBy: "المحامي المعتمد",
              signedAt: new Date().toISOString(),
              signatureImageBase64: lawyerSignatureBase64,
            }
          : null,
        status: isPendingSignature ? "pending_signature" : "draft",
      },
    });
  };

  const handleDownloadPdf = async (contractId: string) => {
    try {
      toast.loading("جارٍ توليد وثيقة العقد الرسمية...", { id: "pdf-gen" });
      const res = await downloadContractPdfFn({ data: { contractId } });
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
      toast.success("تم تحميل وثيقة العقد بنجاح!", { id: "pdf-gen" });
    } catch {
      toast.error("تعذّر توليد ملف الـ PDF.", { id: "pdf-gen" });
    }
  };

  const handleCopySignLink = async (contract: ContractModel) => {
    if (issuingLinkId) return;
    setIssuingLinkId(contract.id);
    try {
      const { signUrl } = await issueContractSignLinkFn({ data: { contractId: contract.id } });
      const fullUrl = `${window.location.origin}${signUrl}`;
      await navigator.clipboard.writeText(fullUrl);
      setCopiedTokenId(contract.id);
      toast.success("تم إصدار رابط توقيع جديد ونسخه — صالح لمدة 14 يوماً.");
      setTimeout(() => setCopiedTokenId(null), 3000);
      await queryClient.invalidateQueries({ queryKey: ["contracts-list"] });
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "تعذّر إصدار رابط التوقيع. حاول مرة أخرى.",
      );
    } finally {
      setIssuingLinkId(null);
    }
  };

  /**
   * فتح نافذة التوقيع داخل الصفحة: يُصدر رمز توقيع جديد (استخدام واحد) ثم يعرض
   * وثيقة العقد في نافذة مضغوطة مع بقاء القائمة الجانبية متاحة للتنقل.
   */
  const handleOpenSignModal = async (contract: ContractModel) => {
    if (issuingLinkId) return;
    setIssuingLinkId(contract.id);
    try {
      const { signUrl } = await issueContractSignLinkFn({ data: { contractId: contract.id } });
      const token = signUrl.split("/").filter(Boolean).pop();
      if (!token) {
        toast.error("تعذّر تجهيز رمز التوقيع. حاول مرة أخرى.");
        return;
      }
      setSigningSession({ token, contractNumber: contract.contractNumber });
      await queryClient.invalidateQueries({ queryKey: ["contracts-list"] });
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "تعذّر فتح نافذة التوقيع. حاول مرة أخرى.",
      );
    } finally {
      setIssuingLinkId(null);
    }
  };

  // KPIs
  const totalCount = contracts.length;
  const pendingCount = contracts.filter((c) => c.status === "pending_signature").length;
  const signedCount = contracts.filter((c) => c.status === "signed").length;
  const totalValue = contracts.reduce((sum, c) => sum + (c.totalAmount || 0), 0);

  // Filter
  const filteredContracts = contracts.filter((c) => {
    const matchesQuery =
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.contractNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.secondParty.name.toLowerCase().includes(searchQuery.toLowerCase());

    if (statusFilter === "all") return matchesQuery;
    return matchesQuery && c.status === statusFilter;
  });

  return (
    <DashboardShell
      title="العقود والاتفاقيات"
      description="صياغة وتدقيق وتوقيع العقود الرقمية بهوية وشعار المكتب مع الختم الموثق وربط القضايا."
      actions={
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-sm font-semibold">
              <Plus className="w-4 h-4" />
              إنشاء وصياغة عقد جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-6" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                منصة صياغة وتجهيز العقود الذكية
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 mt-4">
              {/* 1. Template Selector */}
              <div>
                <Label className="text-sm font-semibold mb-2 block">اختر قالب العقد المعتمد:</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {(Object.keys(SAUDI_CONTRACT_TEMPLATES) as ContractType[]).map((key) => {
                    const isSelected = selectedTemplateKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleTemplateChange(key)}
                        className={`p-3 rounded-xl text-right border transition-all text-xs flex flex-col justify-between ${
                          isSelected
                            ? "border-primary bg-primary/5 text-primary font-bold shadow-sm ring-1 ring-primary"
                            : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
                        }`}
                      >
                        <span className="font-semibold">{CONTRACT_TYPE_LABELS[key]}</span>
                        <span className="text-[10px] text-slate-500 mt-1 line-clamp-1">
                          {SAUDI_CONTRACT_TEMPLATES[key].description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Basic Info & Parties */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>عنوان العقد:</Label>
                  <Input value={contractTitle} onChange={(e) => setContractTitle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>اسم الموكل / الطرف الثاني:</Label>
                  <Input
                    placeholder="مثال: شركة المسار للتطوير العقاري"
                    value={secondPartyName}
                    onChange={(e) => setSecondPartyName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>رقم الهوية / السجل التجاري:</Label>
                  <Input
                    placeholder="1010XXXXXX"
                    value={secondPartyId}
                    onChange={(e) => setSecondPartyId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>رقم جوال الطرف الثاني:</Label>
                  <Input
                    placeholder="05XXXXXXXX"
                    value={secondPartyPhone}
                    onChange={(e) => setSecondPartyPhone(e.target.value)}
                  />
                </div>
              </div>

              {/* 3. Financial Terms */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 space-y-4">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-primary" />
                  المقابل المالي للأتعاب والشروط المالية:
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>إجمالي قيمة العقد (ر.س):</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(e.target.value ? Number(e.target.value) : "")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>الدفعة المقدمة / دفعة التعاقد (ر.س):</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={advanceAmount}
                      onChange={(e) => setAdvanceAmount(e.target.value ? Number(e.target.value) : "")}
                    />
                  </div>
                </div>
              </div>

              {/* 4. Clauses Editor */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">بنود وشروط العقد ({clauses.length} بنود):</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddClause}
                    className="h-8 gap-1.5 text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    إضافة بند جديد
                  </Button>
                </div>

                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {clauses.map((clause, idx) => (
                    <div
                      key={clause.id}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Input
                          className="h-7 text-xs font-bold w-1/2"
                          value={clause.title}
                          onChange={(e) => handleUpdateClause(clause.id, "title", e.target.value)}
                        />
                        {clauses.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteClause(clause.id)}
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <textarea
                        className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 resize-none h-16 focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
                        value={clause.content}
                        onChange={(e) => handleUpdateClause(clause.id, "content", e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* 5. Signature Pad */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30">
                <SignaturePad
                  label="توقيع المحامي المعتمد"
                  onSave={(base64) => setLawyerSignatureBase64(base64)}
                  onClear={() => setLawyerSignatureBase64(null)}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  إلغاء
                </Button>
                <Button
                  variant="secondary"
                  disabled={saveMutation.isPending}
                  onClick={() => handleSaveContract(false)}
                  className="gap-2"
                >
                  حفظ كمسودة
                </Button>
                <Button
                  disabled={saveMutation.isPending}
                  onClick={() => handleSaveContract(true)}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  <Send className="w-4 h-4" />
                  اعتماد وإصدار رابط التوقيع
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="إجمالي العقود"
            value={totalCount}
            hint="العقود المسجلة بالمكتب"
          />
          <StatCard
            label="بانتظار توقيع الموكل"
            value={pendingCount}
            hint="روابط مرسلة بانتظار الإغلاق"
            tone={pendingCount > 0 ? "warn" : "default"}
          />
          <StatCard
            label="العقود الموقعة والمعتمدة"
            value={signedCount}
            hint="موثقة ببصمة إلكترونية رسمية"
            tone="success"
          />
          <StatCard
            label="إجمالي قيمة العقود"
            value={`${totalValue.toLocaleString("ar-SA")} ر.س`}
            hint="المقابل المالي للعقود"
            tone="gold"
          />
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="ابحث برقم العقد، العنوان، أو اسم الموكل..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9 h-9 text-xs"
            />
          </div>

          <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full sm:w-auto">
            <TabsList className="h-9 p-1 bg-slate-100 dark:bg-slate-800">
              <TabsTrigger value="all" className="text-xs px-3">الكل ({totalCount})</TabsTrigger>
              <TabsTrigger value="draft" className="text-xs px-3">المسودات</TabsTrigger>
              <TabsTrigger value="pending_signature" className="text-xs px-3">بانتظار التوقيع</TabsTrigger>
              <TabsTrigger value="signed" className="text-xs px-3">المكتملة</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Contracts Table */}
        <Card className="border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3.5">رقم العقد</th>
                  <th className="p-3.5">مسمى الاتفاقية / العقد</th>
                  <th className="p-3.5">الطرف الثاني (الموكل)</th>
                  <th className="p-3.5">نوع العقد</th>
                  <th className="p-3.5">المقابل المالي</th>
                  <th className="p-3.5">حالة التوقيع</th>
                  <th className="p-3.5">تاريخ الإنشاء</th>
                  <th className="p-3.5 text-left">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="text-center p-8 text-slate-400">
                      <Clock className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                      جاري تحميل سجل العقود...
                    </td>
                  </tr>
                ) : filteredContracts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center p-12">
                      <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">لا توجد عقود مطابقة</p>
                      <p className="text-xs text-slate-400 mt-1">ابدأ بإنشاء أول عقد أتعاب إلكتروني موثق لمكتبك.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsCreateOpen(true)}
                        className="mt-4 gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        صياغة عقد جديد الآن
                      </Button>
                    </td>
                  </tr>
                ) : (
                  filteredContracts.map((contract) => {
                    const isCopied = copiedTokenId === contract.id;
                    const isIssuing = issuingLinkId === contract.id;

                    return (
                      <tr key={contract.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="p-3.5 font-mono font-bold text-primary">
                          {contract.contractNumber}
                        </td>
                        <td className="p-3.5 font-semibold text-slate-900 dark:text-white">
                          {contract.title}
                        </td>
                        <td className="p-3.5">
                          <div className="font-medium text-slate-800 dark:text-slate-200">
                            {contract.secondParty.name}
                          </div>
                          {contract.secondParty.phone && (
                            <div className="text-[10px] text-slate-400 font-mono">
                              {contract.secondParty.phone}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 text-slate-600 dark:text-slate-400">
                          {CONTRACT_TYPE_LABELS[contract.contractType] || contract.contractType}
                        </td>
                        <td className="p-3.5 font-semibold text-slate-800 dark:text-slate-200">
                          {contract.totalAmount ? `${contract.totalAmount.toLocaleString("ar-SA")} ر.س` : "—"}
                        </td>
                        <td className="p-3.5">
                          <Badge
                            className={`text-[10px] px-2 py-0.5 font-semibold ${
                              contract.status === "signed"
                                ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                                : contract.status === "pending_signature"
                                ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300"
                            }`}
                          >
                            {CONTRACT_STATUS_LABELS[contract.status] || contract.status}
                          </Badge>
                        </td>
                        <td className="p-3.5 text-slate-400 text-[11px]">
                          {new Date(contract.createdAt).toLocaleDateString("ar-SA")}
                        </td>
                        <td className="p-3.5 text-left">
                          <div className="flex items-center justify-end gap-1">
                            {/* Sign inside the workspace — no standalone page */}
                            <Button
                              variant="ghost"
                              size="sm"
                              title={
                                contract.status === "signed"
                                  ? "العقد مكتمل وموقع"
                                  : "توقيع العقد داخل المنصة دون مغادرة الصفحة"
                              }
                              disabled={isIssuing || contract.status === "signed"}
                              onClick={() => handleOpenSignModal(contract)}
                              className="h-8 px-2 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                            >
                              <FileSignature className="w-3.5 h-3.5" />
                              <span className="text-[10px] mr-1 hidden md:inline">توقيع الآن</span>
                            </Button>

                            {/* Copy or Issue Sign Link */}
                            <Button
                              variant="ghost"
                              size="sm"
                              title={
                                contract.status === "signed"
                                  ? "العقد مكتمل وموقع"
                                  : "إصدار ونسخ رابط التوقيع للموكل"
                              }
                              disabled={isIssuing || contract.status === "signed"}
                              onClick={() => handleCopySignLink(contract)}
                              className={`h-8 px-2 ${isCopied ? "text-emerald-600 font-bold" : "text-slate-600 hover:text-primary"}`}
                            >
                              {isIssuing ? (
                                <Clock className="w-3.5 h-3.5 animate-spin" />
                              ) : isCopied ? (
                                <Check className="w-3.5 h-3.5" />
                              ) : (
                                <Share2 className="w-3.5 h-3.5" />
                              )}
                              <span className="text-[10px] mr-1 hidden md:inline">
                                {isCopied ? "تم النسخ" : "رابط التوقيع"}
                              </span>
                            </Button>

                            {/* Download PDF */}
                            <Button
                              variant="ghost"
                              size="sm"
                              title="تحميل وثيقة العقد الرسمية PDF"
                              onClick={() => handleDownloadPdf(contract.id)}
                              className="h-8 px-2 text-slate-600 hover:text-primary"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </Button>

                            {/* Quick Convert to Case */}
                            <Button
                              variant="ghost"
                              size="sm"
                              title="تحويل إلى قضية نشطة"
                              onClick={() => convertToCaseMutation.mutate({ data: { contractId: contract.id } })}
                              disabled={convertToCaseMutation.isPending}
                              className="h-8 px-2 text-indigo-600 hover:bg-indigo-50"
                            >
                              <Briefcase className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </DashboardShell>
  );
}

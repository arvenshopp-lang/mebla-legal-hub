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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SignaturePad } from "@/components/contracts/signature-pad";
import {
  getContractsListFn,
  saveContractDraftFn,
  downloadContractPdfFn,
  convertContractToCaseFn,
  convertContractToInvoiceFn,
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

export const Route = createFileRoute("/_authenticated/contracts")({
  component: ContractsPage,
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
    onError: () => {
      toast.error("حدث خطأ أثناء حفظ العقد.");
    },
  });

  const convertToCaseMutation = useMutation({
    mutationFn: convertContractToCaseFn,
    onSuccess: (res) => {
      toast.success("تم إنشاء القضية وربطها بالعقد بنجاح!");
      queryClient.invalidateQueries({ queryKey: ["contracts-list"] });
    },
    onError: () => toast.error("تعذّر إنشاء القضية."),
  });

  const convertToInvoiceMutation = useMutation({
    mutationFn: convertContractToInvoiceFn,
    onSuccess: (res) => {
      toast.success(`تم إصدار فاتورة الأتعاب بنجاح: ${res.invoiceNumber}`);
      queryClient.invalidateQueries({ queryKey: ["contracts-list"] });
    },
    onError: () => toast.error("تعذّر إصدار الفاتورة."),
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
      await loadContracts();
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
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <FileText className="w-7 h-7 text-primary" />
            موديول إدارة وتوقيع العقود الرقمية (Contracts Lifecycle)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            صياغة وتدقيق وتوقيع العقود الرقمية بهوية وشعار المكتب مع الختم الموثق وربط الفوترة والقضايا.
          </p>
        </div>

        {/* Create Dialog */}
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
                    placeholder="مثال: شركة الأفق للتجارة / محمد العتيبي"
                    value={secondPartyName}
                    onChange={(e) => setSecondPartyName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>رقم الهوية الوطنية / السجل التجاري:</Label>
                  <Input
                    placeholder="10XXXXXXXX / 70XXXXXXXX"
                    value={secondPartyId}
                    onChange={(e) => setSecondPartyId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>رقم جوال الموكل (لإرسال رابط التوقيع):</Label>
                  <Input
                    placeholder="05XXXXXXXX"
                    value={secondPartyPhone}
                    onChange={(e) => setSecondPartyPhone(e.target.value)}
                  />
                </div>
              </div>

              {/* 3. Financials */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">إجمالي قيمة الأتعاب (ر.س):</Label>
                  <Input
                    type="number"
                    placeholder="مثال: 50000"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value ? Number(e.target.value) : "")}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">الدفعة المقدمة غير المستردة (ر.س):</Label>
                  <Input
                    type="number"
                    placeholder="مثال: 20000"
                    value={advanceAmount}
                    onChange={(e) => setAdvanceAmount(e.target.value ? Number(e.target.value) : "")}
                  />
                </div>
              </div>

              {/* 4. Clauses Workbench */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-bold flex items-center gap-1.5">
                    <FileCheck className="w-4 h-4 text-emerald-600" />
                    بنود وشروط العقد ({clauses.length} بنود):
                  </Label>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddClause} className="gap-1.5 text-xs">
                    <Plus className="w-3.5 h-3.5" />
                    إضافة بند جديد
                  </Button>
                </div>

                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {clauses.map((clause, idx) => (
                    <div
                      key={clause.id}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-2 relative group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Input
                          className="font-bold text-xs h-8 bg-transparent"
                          value={clause.title}
                          onChange={(e) => handleUpdateClause(clause.id, "title", e.target.value)}
                        />
                        {clauses.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteClause(clause.id)}
                            className="text-slate-400 hover:text-rose-500 transition-colors p-1"
                          >
                            <Trash2 className="w-4 h-4" />
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

              {/* 5. Lawyer Signature Pad */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30">
                <SignaturePad
                  label="توقيع المحامي المعتمد (الطرف الأول)"
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
                  اعتماد وتجهيز رابط التوقيع للموكل
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500">إجمالي العقود</CardTitle>
            <FileText className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">عقد مسجل بالمكتب</p>
          </CardContent>
        </Card>

        <Card className="border-amber-200/80 bg-amber-50/20 dark:bg-amber-950/10 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              بانتظار توقيع الموكل
            </CardTitle>
            <Clock className="w-4 h-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-800 dark:text-amber-300">{pendingCount}</div>
            <p className="text-[11px] text-amber-600/80 mt-0.5">روابط مرسلة بانتظار الإغلاق</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-200/80 bg-emerald-50/20 dark:bg-emerald-950/10 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              العقود الموقعة والمعتمدة
            </CardTitle>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-800 dark:text-emerald-300">{signedCount}</div>
            <p className="text-[11px] text-emerald-600/80 mt-0.5">موثقة بالختم الرقمي</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500">القيمة الإجمالية للعقود</CardTitle>
            <Receipt className="w-4 h-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalValue.toLocaleString("en-US")} ر.س</div>
            <p className="text-[11px] text-slate-400 mt-0.5">قيمة التعاقدات النشطة</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="بحث برقم العقد، اسم الموكل، العنوان..."
            className="pr-9 text-xs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full sm:w-auto">
          <TabsList className="grid grid-cols-4 w-full sm:w-auto text-xs">
            <TabsTrigger value="all">الكل ({totalCount})</TabsTrigger>
            <TabsTrigger value="pending_signature">بانتظار التوقيع ({pendingCount})</TabsTrigger>
            <TabsTrigger value="signed">الموقعة ({signedCount})</TabsTrigger>
            <TabsTrigger value="draft">المسودات</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Contracts Table */}
      <Card className="shadow-sm border-slate-200/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/50 border-b text-slate-600 dark:text-slate-300 font-semibold">
              <tr>
                <th className="p-3.5">رقم العقد</th>
                <th className="p-3.5">عنوان ونوع العقد</th>
                <th className="p-3.5">الموكل / الطرف الثاني</th>
                <th className="p-3.5">قيمة الأتعاب</th>
                <th className="p-3.5">حالة العقد</th>
                <th className="p-3.5">تاريخ الإنشاء</th>
                <th className="p-3.5 text-center">الإجراءات والتوثيق</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredContracts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-1" />
                    لا توجد عقود مسجلة تطابق البحث حالياً.
                  </td>
                </tr>
              ) : (
                filteredContracts.map((contract) => {
                  const isSigned = contract.status === "signed";
                  const isPending = contract.status === "pending_signature";

                  return (
                    <tr key={contract.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-primary">{contract.contractNumber}</td>
                      <td className="p-3.5">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{contract.title}</div>
                        <div className="text-[10px] text-slate-500">{CONTRACT_TYPE_LABELS[contract.contractType]}</div>
                      </td>
                      <td className="p-3.5 font-medium">{contract.secondParty.name}</td>
                      <td className="p-3.5 font-bold">
                        {contract.totalAmount ? `${contract.totalAmount.toLocaleString("en-US")} ر.س` : "—"}
                      </td>
                      <td className="p-3.5">
                        <Badge
                          variant={isSigned ? "default" : isPending ? "secondary" : "outline"}
                          className={`text-[11px] font-semibold ${
                            isSigned
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-100"
                              : isPending
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 hover:bg-amber-100"
                              : ""
                          }`}
                        >
                          {CONTRACT_STATUS_LABELS[contract.status]}
                        </Badge>
                      </td>
                      <td className="p-3.5 text-slate-500 text-[11px]">
                        {new Date(contract.createdAt).toLocaleDateString("ar-SA")}
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Copy Sign Link */}
                          {contract.status !== "signed" && contract.status !== "cancelled" && (
                            <Button
                              variant="outline"
                              size="sm"
                              title="إصدار ونسخ رابط التوقيع للموكل"
                              disabled={issuingLinkId === contract.id}
                              onClick={() => void handleCopySignLink(contract)}
                              className="h-8 px-2 text-xs gap-1"
                            >
                              {copiedTokenId === contract.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                              رابط التوقيع
                            </Button>
                          )}

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

                          {/* Quick Issue Invoice */}
                          <Button
                            variant="ghost"
                            size="sm"
                            title="إصدار فاتورة أتعاب"
                            onClick={() => convertToInvoiceMutation.mutate({ data: { contractId: contract.id } })}
                            disabled={convertToInvoiceMutation.isPending}
                            className="h-8 px-2 text-emerald-600 hover:bg-emerald-50"
                          >
                            <Receipt className="w-3.5 h-3.5" />
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
  );
}

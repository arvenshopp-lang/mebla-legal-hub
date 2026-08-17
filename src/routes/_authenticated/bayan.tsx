/**
 * ==============================================================================
 * MEHLA LEGAL PLATFORM — BAYAN LEGAL WORKBENCH PAGE
 * صفحة استشارات ومساعد المحامية بيان الشاملة لكل قضايا المكتب
 * ==============================================================================
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import {
  Bot,
  Send,
  Sparkles,
  Scale,
  Copy,
  Check,
  BookOpen,
  FileText,
  Clock,
  Briefcase,
  ShieldCheck,
  Loader2,
  ChevronLeft,
  Gavel,
  CheckCircle2,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { useAuth } from "@/hooks/use-auth";
import { LegalMarkdown } from "@/components/ui/legal-markdown";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/bayan")({
  component: BayanWorkbenchPage,
  head: () => ({
    meta: [
      { title: "المحامية بيان — المستشارة القانونية الذكية | مِهلة" },
      {
        name: "description",
        content: "المستشارة القانونية الذكية والباحثة القضائية لمنصة مِهلة وفق الأنظمة السعودية المحدثة.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

interface BayanCitation {
  sourceType: "statute" | "document" | "hearing" | "precedent";
  title: string;
  reference?: string;
}

interface Message {
  id?: string;
  sender: "user" | "assistant";
  content: string;
  citations?: BayanCitation[];
  created_at?: string;
}

interface CaseOption {
  id: string;
  case_title: string;
  case_number: string | null;
  court_name: string | null;
}

const QUICK_ACTIONS = [
  { text: "ما هي الجلسات القضائية القادمة هذا الأسبوع؟", icon: Clock },
  { text: "استعرض لي حصر القضايا المنظورة وموقفها الإجرائي", icon: Briefcase },
  { text: "ما هي القواعد الجوهرية في نظام الإثبات ونظام المعاملات المدنية؟", icon: BookOpen },
  { text: "كيف يتم احتساب مهل الاعتراض والاستئناف وفق النظام السعودي؟", icon: Scale },
];

function BayanWorkbenchPage() {
  const { activeOrgId, user, activeRole } = useAuth();
  const [availableCases, setAvailableCases] = useState<CaseOption[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("global");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // جلب القضايا المتاحة للمستخدم بحسب الصلاحيات
  useEffect(() => {
    if (!activeOrgId) return;

    async function loadCases() {
      try {
        let query = supabase
          .from("cases")
          .select("id, case_title, case_number, court_name, assigned_lawyer_id")
          .eq("organization_id", activeOrgId!);

        if (activeRole !== "owner" && activeRole !== "admin" && user?.id) {
          query = query.or(`assigned_lawyer_id.eq.${user.id},assigned_lawyer_id.is.null`);
        }

        const { data } = await query.order("created_at", { ascending: false }).limit(50);
        setAvailableCases((data ?? []).map((c) => ({
          id: c.id,
          case_title: c.case_title,
          case_number: c.case_number,
          court_name: c.court_name,
        })));
      } catch (err) {
        console.error("Failed to load cases", err);
      }
    }

    loadCases();
  }, [activeOrgId, activeRole, user?.id]);

  // إعداد الرسالة الترحيبية عند بدء المحادثة
  useEffect(() => {
    const selectedCase = availableCases.find((c) => c.id === selectedCaseId);
    const caseTitle = selectedCase ? selectedCase.case_title : "جميع قضايا المكتب";

    setMessages([
      {
        sender: "assistant",
        content: `السلام عليكم ورحمة الله وبركاته،

أهلاً بك زميلي الكريم، معك **المحامية بيان** — المستشارة القانونية والباحثة الرقمية لمنصة «مِهلة».

أنا متصلة بمركز قيادة المكتب ومعدة لمساندتك في:
* ⚖️ **دراسة وتفنيد وقائع أي قضية** من قضايا المكتب المصرح لك بها.
* 📜 **البحث وتأصيل المسائل** وفق الأنظمة السعودية (المعاملات المدنية، الإثبات، المرافعات، المحاكم التجارية، العمل، الشركات).
* ⏱️ **متابعة الجلسات القادمة والمهل النظامية ومواعيد الاستئناف**.

${selectedCaseId === "global" ? "أنت الآن في وضع **الاستشارة العامة لجميع القضايا**." : `أنت الآن في نطاق دراسة قضية **«${caseTitle}»**.`}

تفضل بطرح استفسارك، وسأجيبك فوراً مع توثيق الأسانيد ومواد الأنظمة المرجعية.`,
      },
    ]);
  }, [selectedCaseId, availableCases]);

  // التمرير التلقائي
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function handleSend(textToSend?: string) {
    const text = (textToSend ?? input).trim();
    if (!text || loading || !activeOrgId) return;

    setInput("");
    const newMsg: Message = { sender: "user", content: text };
    setMessages((prev) => [...prev, newMsg]);
    setLoading(true);

    try {
      const res = await fetch("/api/ai/bayan-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: selectedCaseId === "global" ? null : selectedCaseId,
          orgId: activeOrgId,
          userId: user?.id,
          message: text,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "فشل الاتصال بالمحامية بيان");
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          sender: "assistant",
          content: data.reply,
          citations: data.citations,
        },
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ أثناء معالجة الاستشارة");
      setMessages((prev) => [
        ...prev,
        {
          sender: "assistant",
          content: "عذراً، حدث تعذر مؤقت في معالجة الاستشارة. يرجى المحاولة مجدداً.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(text: string, index: number) {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success("تم نسخ رد المحامية بيان");
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  return (
    <DashboardShell
      title="المحامية بيان ⚖️"
      description="المستشارة القانونية الذكية والباحثة القضائية لمنصة مِهلة وفق الأنظمة السعودية المحدثة."
    >
      <div className="grid gap-5 lg:grid-cols-4 h-[calc(100vh-210px)] min-h-[580px]">
        
        {/* اللوحة الجانبية لاختيار نطاق القضية والمعلومات */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          
          {/* بطاقة هوية المحامية بيان */}
          <div className="surface-card p-4.5 rounded-2xl border border-border">
            <div className="flex items-center gap-3 mb-3">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-[#123C32] to-[#1E5648] text-white shadow-xs">
                <Bot className="h-6 w-6 text-[#C9A961]" />
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#121816]" />
              </div>
              <div>
                <h3 className="font-bold text-base">المحامية بيان</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  <Sparkles className="h-3 w-3 text-gold" />
                  مستشارة مِهلة الذكية 🇸🇦
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              مدرّبة على الأنظمة القضائية واللوائح التنفيذية السعودية، وتراعي مصفوفة صلاحيات المكتب وعزل بيانات القضايا.
            </p>
          </div>

          {/* محدد القضية / النطاق */}
          <div className="surface-card p-4 rounded-2xl border border-border flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-1 mb-2.5 pb-2 border-b border-border">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-primary" />
                نطاق الاستشارة:
              </span>
              <span className="text-[11px] text-muted-foreground">
                ({availableCases.length} قضية متاحة)
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              <button
                onClick={() => setSelectedCaseId("global")}
                className={`w-full text-right p-2.5 rounded-xl text-xs transition-all flex items-center justify-between ${
                  selectedCaseId === "global"
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "bg-surface-muted hover:bg-surface-elevated text-foreground"
                }`}
              >
                <span>🌐 استشارة عامة (كافة القضايا)</span>
                {selectedCaseId === "global" && <CheckCircle2 className="h-3.5 w-3.5" />}
              </button>

              {availableCases.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCaseId(c.id)}
                  className={`w-full text-right p-2.5 rounded-xl text-xs transition-all block ${
                    selectedCaseId === c.id
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "bg-surface-muted hover:bg-surface-elevated text-foreground"
                  }`}
                >
                  <div className="truncate font-medium">{c.case_title}</div>
                  <div className={`text-[10px] mt-0.5 truncate ${selectedCaseId === c.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    {c.court_name || "محكمة مختصة"} {c.case_number ? `· رقم ${c.case_number}` : ""}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* مساحة المحادثة الرئيسية */}
        <div className="lg:col-span-3 surface-card rounded-2xl border border-border flex flex-col overflow-hidden">
          
          {/* شريط الأمان العلوي */}
          <div className="flex items-center justify-between border-b border-border bg-surface-muted px-4 py-2.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>محادثة مشفرة مع درع تعمية البيانات الشخصية (Saudi PII Shield) وحماية السرية المهنية.</span>
            </div>
            <span className="text-[11px] font-semibold text-primary">
              {selectedCaseId === "global" ? "نطاق عام" : "نطاق قضية مخصصة"}
            </span>
          </div>

          {/* تيار الرسائل */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${
                    msg.sender === "user"
                      ? "bg-primary text-primary-foreground rounded-br-xs shadow-xs"
                      : "bg-surface text-foreground border border-border rounded-bl-xs shadow-xs"
                  }`}
                >
                  {msg.sender === "assistant" && (
                    <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-2">
                      <span className="font-bold text-xs text-primary dark:text-gold flex items-center gap-1.5">
                        <Scale className="h-3.5 w-3.5" />
                        المحامية بيان
                      </span>
                      <button
                        onClick={() => handleCopy(msg.content, idx)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="نسخ"
                      >
                        {copiedIndex === idx ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  )}

                  {/* نص الماركداون المنسق */}
                  <LegalMarkdown content={msg.content} />

                  {/* الأسانيد والأنظمة المستشهد بها */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-border">
                      <span className="text-[11px] font-semibold text-muted-foreground block mb-1">
                        الأسانيد والأنظمة المرجعية:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.citations.map((cite, cIdx) => (
                          <span
                            key={cIdx}
                            className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-0.5 text-[10px] text-primary dark:text-gold border border-border"
                          >
                            <BookOpen className="h-2.5 w-2.5" />
                            {cite.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 rounded-2xl bg-surface p-3.5 text-xs text-muted-foreground border border-border shadow-xs">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>المحامية بيان تقوم بالدراسة ومطابقة الأنظمة السعودية...</span>
              </div>
            )}
          </div>

          {/* الاقتراحات السريعة */}
          {messages.length <= 2 && !loading && (
            <div className="px-4 py-2 border-t border-border bg-surface-muted/50">
              <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">
                مسارات مقترحة للبدء:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_ACTIONS.map((item, qIdx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={qIdx}
                      onClick={() => handleSend(item.text)}
                      className="flex items-start gap-1.5 p-2 rounded-xl bg-surface hover:bg-surface-elevated text-right text-[11px] text-foreground border border-border transition-colors"
                    >
                      <Icon className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      <span className="line-clamp-1">{item.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* صندوق إدخال الاستفسار */}
          <div className="p-3.5 border-t border-border bg-surface">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-end gap-2"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="اطلب استشارة قانونية، صياغة دفوع، أو سؤالاً في وقائع أي قضية والأنظمة السعودية..."
                rows={2}
                className="flex-1 resize-none rounded-xl border border-border bg-surface-muted p-3 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50 transition-colors shadow-xs"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>

        </div>

      </div>
    </DashboardShell>
  );
}

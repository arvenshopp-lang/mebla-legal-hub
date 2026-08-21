/**
 * ==============================================================================
 * MEHLA LEGAL PLATFORM — BAYAN LEGAL WORKBENCH PAGE (OPTIMIZED MOBILE & DESKTOP)
 * صفحة استشارات ومساعد المحامية بيان بتصميم متجاوب 100% مع الجوال والتابلت وسطح المكتب
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
  Users,
  CheckCircle2,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { useAuth } from "@/hooks/use-auth";
import { LegalMarkdown } from "@/components/ui/legal-markdown";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { sendBayanMessage } from "@/lib/ai/bayan-chat.functions";
import { bayanErrorMessage } from "@/lib/ai/bayan-error";
import { NOINDEX_META } from "@/config/indexing";

export const Route = createFileRoute("/_authenticated/bayan")({
  component: BayanWorkbenchPage,
  head: () => ({
    meta: [
      { title: "المحامية بيان — المستشارة القانونية الذكية | مِهلة" },
      {
        name: "description",
        content: "المستشارة القانونية الذكية والباحثة القضائية لمنصة مِهلة وفق الأنظمة السعودية المحدثة.",
      },
      NOINDEX_META,
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
  { text: "كم عدد القضايا المنظورة وما هو توزيعها على المحامين؟", icon: Users },
  { text: "ما هي الجلسات القضائية القادمة في المكتب هذا الأسبوع؟", icon: Clock },
  { text: "ما هي أحكام المادتين (94 و 138) في نظام المعاملات المدنية؟", icon: BookOpen },
  { text: "ما هي قواعد الإثبات للأدلة الرقمية والشهادة في نظام الإثبات؟", icon: Scale },
];

function BayanWorkbenchPage() {
  const { activeOrgId, user, activeRole } = useAuth();
  const sendMessageFn = useServerFn(sendBayanMessage);
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

  // إعداد الرسالة الترحيبية عند فتح أو تبديل النطاق
  useEffect(() => {
    const selectedCase = availableCases.find((c) => c.id === selectedCaseId);
    const caseTitle = selectedCase ? selectedCase.case_title : "جميع قضايا المكتب";

    setMessages([
      {
        sender: "assistant",
        content: `السلام عليكم ورحمة الله وبركاته،

أهلاً بك زميلي الكريم، معك **المحامية بيان** — المستشارة القانونية والباحثة الرقمية لمنصة «مِهلة».

أنا متصلة بقاعدة معرفة المكتب ومدرّبة على حزمة **الأنظمة القضائية السعودية الرسمية بالمواد والفقرات**:
* 🏛️ **الاستفسار عن أي قضية أو موظف بالمكتب** (مثل: *«كم قضية عند المحامي زياد؟»* أو *«ما موقف دعوى المقاولة؟»*).
* 📜 **التأصيل النظامي الدقيق بمواد الأنظمة** (نظام المعاملات المدنية، نظام الإثبات، نظام المرافعات الشرعية، المحاكم التجارية، العمل، الشركات).
* ⏱️ **متابعة الجلسات القادمة واحتساب المهل النظامية للاستئناف**.

${selectedCaseId === "global" ? "أنت الآن في وضع **الاستشارة العامة لجميع سجلات المكتب**." : `أنت الآن في نطاق دراسة قضية **«${caseTitle}»**.`}

تفضل بطرح استفسارك، وسأجيبك فوراً باللغة القانونية الرصينة ومطابقة المواد النظامية.`,
      },
    ]);
  }, [selectedCaseId, availableCases]);

  // التمرير التلقائي السلس لأسفل
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
      const data = await sendMessageFn({
        data: {
          caseId: selectedCaseId === "global" ? null : selectedCaseId,
          organizationId: activeOrgId,
          message: text,
        },
      });
      setMessages((prev) => [
        ...prev,
        {
          sender: "assistant",
          content: data.reply,
          citations: data.citations,
        },
      ]);
    } catch (err) {
      const msg = bayanErrorMessage(err);
      toast.error(msg);
      setMessages((prev) => [...prev, { sender: "assistant", content: msg }]);
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
      description="المستشارة القانونية الذكية لمنصة مِهلة — مدربة بالمواد الرسمية للأنظمة السعودية وتوزيع مهام المكتب."
    >
      {/* حاوية رئيسية بارتفاع متجاوب وبدون تمرير خارجي */}
      <div className="h-[calc(100dvh-200px)] lg:h-[calc(100dvh-175px)] min-h-[460px] max-h-[860px] grid gap-4 lg:grid-cols-4 overflow-hidden pb-12 lg:pb-0">
        
        {/* اللوحة الجانبية لاختيار النطاق وهوية بيان (تظهر في الشاشات الكبيرة) */}
        <div className="hidden lg:flex lg:col-span-1 flex-col gap-3 h-full overflow-hidden">
          
          {/* بطاقة هوية المحامية بيان */}
          <div className="surface-card p-3.5 rounded-2xl border border-border shrink-0">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-[#123C32] to-[#1E5648] text-white shadow-xs">
                <Bot className="h-5 w-5 text-[#C9A961]" />
                <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#121816]" />
              </div>
              <div>
                <h3 className="font-bold text-sm">المحامية بيان</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  <Sparkles className="h-3 w-3 text-gold" />
                  مستشارة مِهلة الذكية 🇸🇦
                </span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              مدرّبة على نصوص ومواد الأنظمة السعودية، وتجيب عن قضايا وموظفي المكتب وفق الصلاحيات.
            </p>
          </div>

          {/* محدد نطاق القضايا لسطح المكتب */}
          <div className="surface-card p-3 rounded-2xl border border-border flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex items-center justify-between gap-1 mb-2 pb-1.5 border-b border-border shrink-0">
              <span className="text-xs font-bold text-foreground flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5 text-primary" />
                نطاق الاستشارة:
              </span>
              <span className="text-[10px] text-muted-foreground">
                ({availableCases.length} قضية)
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              <button
                onClick={() => setSelectedCaseId("global")}
                className={`w-full text-right p-2 rounded-xl text-xs transition-all flex items-center justify-between ${
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
                  className={`w-full text-right p-2 rounded-xl text-xs transition-all block ${
                    selectedCaseId === c.id
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "bg-surface-muted hover:bg-surface-elevated text-foreground"
                  }`}
                >
                  <div className="truncate font-medium">{c.case_title}</div>
                  <div className={`text-[10px] mt-0.5 truncate ${selectedCaseId === c.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    {c.court_name || "محكمة مختصة"} {c.case_number ? `· ${c.case_number}` : ""}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* مساحة المحادثة الرئيسية */}
        <div className="lg:col-span-3 surface-card rounded-2xl border border-border flex flex-col h-full overflow-hidden min-h-0 shadow-sm">
          
          {/* شريط الأمان العلوي */}
          <div className="flex items-center justify-between border-b border-border bg-surface-muted px-3.5 py-2 text-xs text-muted-foreground shrink-0">
            <div className="flex items-center gap-1.5 truncate">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="truncate">استشارة مشفرة ومؤصلة بالمواد النظامية (Saudi PII Shield).</span>
            </div>
            <span className="text-[10.5px] font-semibold text-primary shrink-0 mr-2">
              {selectedCaseId === "global" ? "نطاق عام" : "نطاق قضية"}
            </span>
          </div>

          {/* شريط اختيار النطاق المخصص للجوال والتابلت */}
          <div className="flex lg:hidden items-center justify-between gap-2 border-b border-border bg-surface-muted/80 px-3 py-1.5 shrink-0">
            <span className="text-[11px] font-semibold text-foreground flex items-center gap-1 shrink-0">
              <Briefcase className="h-3.5 w-3.5 text-primary" />
              النطاق:
            </span>
            <select
              value={selectedCaseId}
              onChange={(e) => setSelectedCaseId(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground focus:outline-none truncate"
            >
              <option value="global">🌐 عام (كافة قضايا ومواعيد المكتب)</option>
              {availableCases.map((c) => (
                <option key={c.id} value={c.id}>
                  📁 {c.case_title} {c.case_number ? `(${c.case_number})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* منطقة الرسائل (التمرير الداخلي فقط) */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 custom-scrollbar min-h-0">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[92%] sm:max-w-[88%] rounded-2xl p-3.5 sm:p-4 text-xs sm:text-sm leading-relaxed ${
                    msg.sender === "user"
                      ? "bg-primary text-primary-foreground rounded-br-xs shadow-xs"
                      : "bg-surface text-foreground border border-border rounded-bl-xs shadow-xs"
                  }`}
                >
                  {msg.sender === "assistant" && (
                    <div className="flex items-center justify-between border-b border-border/50 pb-1.5 mb-2">
                      <span className="font-bold text-xs text-primary dark:text-gold flex items-center gap-1.5">
                        <Scale className="h-3.5 w-3.5" />
                        المحامية بيان
                      </span>
                      <button
                        onClick={() => handleCopy(msg.content, idx)}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1"
                        title="نسخ الاستشارة"
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
                    <div className="mt-2.5 pt-2 border-t border-border">
                      <span className="text-[10px] font-semibold text-muted-foreground block mb-1">
                        الأسانيد والأنظمة المرجعية:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {msg.citations.map((cite, cIdx) => (
                          <span
                            key={cIdx}
                            className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-0.5 text-[9.5px] text-primary dark:text-gold border border-border"
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
              <div className="flex items-center gap-2 rounded-2xl bg-surface p-3 text-xs text-muted-foreground border border-border shadow-xs">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>المحامية بيان تقوم بالدراسة ومطابقة الأنظمة ومواد القانون السعودي...</span>
              </div>
            )}
          </div>

          {/* الاقتراحات السريعة المثبتة فوق صندوق الإدخال */}
          {messages.length <= 2 && !loading && (
            <div className="px-3 py-1.5 border-t border-border bg-surface-muted/60 shrink-0">
              <div className="grid grid-cols-2 gap-1">
                {QUICK_ACTIONS.map((item, qIdx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={qIdx}
                      onClick={() => handleSend(item.text)}
                      className="flex items-start gap-1 p-1.5 rounded-xl bg-surface hover:bg-surface-elevated text-right text-[10px] sm:text-[11px] text-foreground border border-border transition-colors"
                    >
                      <Icon className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                      <span className="line-clamp-1 leading-tight">{item.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* صندوق إدخال الاستفسار المثبت في أسفل البطاقة */}
          <div className="p-2.5 sm:p-3 border-t border-border bg-surface shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-end gap-1.5"
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
                placeholder="اسأل بيان عن أي قضية، موظف بالمكتب، مادة نظامية، صياغة دفوع، أو مهلة..."
                rows={2}
                className="flex-1 resize-none rounded-xl border border-border bg-surface-muted p-2 text-xs sm:text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="flex h-9 sm:h-10 w-9 sm:w-10 items-center justify-center rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50 transition-colors shadow-xs shrink-0"
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

/**
 * ==============================================================================
 * MEHLA LEGAL PLATFORM — GLOBAL FLOATING BAYAN LEGAL COPILOT
 * المساعد القانوني الذكي العائم والشامل «المحامية بيان» لجميع صفحات وقضايا المنصة
 * ==============================================================================
 */
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
  ShieldCheck,
  X,
  Loader2,
  Minimize2,
  Maximize2,
  Briefcase,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { LegalMarkdown } from "@/components/ui/legal-markdown";
import { supabase } from "@/integrations/supabase/client";

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
}

interface CaseOption {
  id: string;
  case_title: string;
  case_number: string | null;
}

const GLOBAL_QUICK_PROMPTS = [
  { text: "ما هي الجلسات القضائية القادمة في المكتب؟", icon: Clock },
  { text: "استعرض لي حصر القضايا المنظورة وموقفها الإجرائي", icon: Briefcase },
  { text: "ما هي أهم القواعد في نظام الإثبات ونظام المعاملات المدنية؟", icon: BookOpen },
  { text: "كيف يتم احتساب مهل الاستئناف وفق النظام السعودي؟", icon: Scale },
];

export function GlobalBayanAssistant() {
  const { activeOrgId, user, activeRole } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("global");
  const [availableCases, setAvailableCases] = useState<CaseOption[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // جلب قائمة القضايا المتاحة للمستخدم
  useEffect(() => {
    if (!activeOrgId) return;

    async function loadCases() {
      try {
        let query = supabase
          .from("cases")
          .select("id, case_title, case_number, assigned_lawyer_id")
          .eq("organization_id", activeOrgId!);

        if (activeRole !== "owner" && activeRole !== "admin" && user?.id) {
          query = query.or(`assigned_lawyer_id.eq.${user.id},assigned_lawyer_id.is.null`);
        }

        const { data } = await query.limit(40);
        setAvailableCases((data ?? []).map((c) => ({
          id: c.id,
          case_title: c.case_title,
          case_number: c.case_number,
        })));
      } catch (err) {
        console.error("Failed to load cases for Bayan selector", err);
      }
    }

    loadCases();
  }, [activeOrgId, activeRole, user?.id]);

  // إعداد الرسالة الترحيبية عند فتح النافذة
  useEffect(() => {
    if (!isOpen) return;

    if (messages.length === 0) {
      setMessages([
        {
          sender: "assistant",
          content: `السلام عليكم ورحمة الله وبركاته،

أهلاً بك زميلي الكريم، معك **المحامية بيان** — المستشارة القانونية والباحثة الرقمية لمنصة «مِهلة».

أنا متصلة بمركز قيادة المكتب لمساندتك في:
* ⚖️ **دراسة وتفنيد وقائع أي قضية** من قضايا المكتب المصرح لك بها.
* 📜 **البحث وتأصيل المسائل** وفق الأنظمة السعودية (المعاملات المدنية، الإثبات، المرافعات، المحاكم التجارية، العمل، الشركات).
* ⏱️ **متابعة الجلسات القادمة والمهل النظامية**.

يمكنك اختيار قضية محددة من القائمة العلوية أو سؤالي مباشرة عن أي مسألة في قضاياك.`,
        },
      ]);
    }
  }, [isOpen]);

  // التمرير لأسفل
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

  if (!activeOrgId) return null;

  return (
    <>
      {/* الزر العائم الدائم في أسفل يسار الشاشة */}
      {!isOpen && (
        <button
          onClick={() => {
            setIsOpen(true);
            setIsMinimized(false);
          }}
          className="fixed bottom-6 left-6 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-[#123C32] to-[#1E5648] px-4 py-3 text-white shadow-xl hover:brightness-110 hover:scale-105 active:scale-95 transition-all group border border-[#C9A961]/40"
          title="استشارة المحامية بيان"
        >
          <div className="relative flex h-7 w-7 items-center justify-center rounded-full bg-[#123C32] text-[#C9A961]">
            <Sparkles className="h-4 w-4 animate-pulse" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#123C32]" />
          </div>
          <span className="text-sm font-bold tracking-wide">المحامية بيان</span>
          <span className="hidden sm:inline rounded-full bg-white/15 px-2 py-0.5 text-[11px] text-[#E8D49E]">
            مساعدك الذكي 🇸🇦
          </span>
        </button>
      )}

      {/* النافذة العائمة المتنقلة مع المستخدم */}
      {isOpen && (
        <div
          className={`fixed z-50 transition-all duration-300 ${
            isMinimized
              ? "bottom-6 left-6 w-80 rounded-2xl shadow-2xl bg-white dark:bg-[#17201D] border border-[#E6E2D8] dark:border-[#2A3632]"
              : "bottom-4 left-4 sm:bottom-6 sm:left-6 w-[95vw] sm:w-[480px] h-[85vh] sm:h-[620px] rounded-2xl shadow-2xl bg-[#FAF9F6] dark:bg-[#121816] border border-[#E6E2D8] dark:border-[#2A3632] flex flex-col overflow-hidden"
          }`}
        >
          {/* الترويسة العلوية للنافذة */}
          <div className="flex items-center justify-between border-b border-[#E6E2D8] dark:border-[#2A3632] bg-white dark:bg-[#17201D] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-[#123C32] text-[#C9A961]">
                <Bot className="h-4 w-4" />
                <span className="absolute -bottom-0.5 -right-0.5 flex h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-[#1A1A1A] dark:text-white text-sm">المحامية بيان</h3>
                  <span className="rounded bg-[#F5F3EE] dark:bg-[#202C28] px-1.5 py-0.5 text-[10px] font-semibold text-[#123C32] dark:text-[#C9A961]">
                    مستشارة مِهلة 🇸🇦
                  </span>
                </div>
                <p className="text-[11px] text-[#5F6B66] dark:text-[#8A9892]">
                  {selectedCaseId === "global"
                    ? "استشارة عامة في كافة قضايا المكتب"
                    : `قضية: ${availableCases.find((c) => c.id === selectedCaseId)?.case_title || "محددة"}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsMinimized((v) => !v)}
                className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={isMinimized ? "تكبير" : "تصغير"}
              >
                {isMinimized ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* شريط اختيار نطاق الاستشارة (عام أو قضية محددة) */}
              <div className="flex items-center justify-between gap-2 bg-[#F5F3EE] dark:bg-[#1A2420] px-3.5 py-2 border-b border-[#E6E2D8] dark:border-[#2A3632]">
                <div className="flex items-center gap-1.5 text-xs text-[#5F6B66] dark:text-[#8A9892]">
                  <Briefcase className="h-3.5 w-3.5 text-[#123C32] dark:text-[#C9A961]" />
                  <span>نطاق البحث:</span>
                </div>
                <select
                  value={selectedCaseId}
                  onChange={(e) => setSelectedCaseId(e.target.value)}
                  className="rounded-lg border border-[#E6E2D8] dark:border-[#2A3632] bg-white dark:bg-[#17201D] px-2.5 py-1 text-xs text-[#1A1A1A] dark:text-white focus:outline-none max-w-[240px] truncate"
                >
                  <option value="global">🌐 عام (كافة قضايا ومواعيد المكتب)</option>
                  {availableCases.map((c) => (
                    <option key={c.id} value={c.id}>
                      📁 {c.case_title} {c.case_number ? `(${c.case_number})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* منطقة المحادثة */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-3">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-2xl p-3.5 text-sm leading-relaxed ${
                        msg.sender === "user"
                          ? "bg-[#123C32] text-white rounded-br-xs shadow-xs"
                          : "bg-white dark:bg-[#1A2420] text-[#1A1A1A] dark:text-gray-100 border border-[#E6E2D8] dark:border-[#2A3632] rounded-bl-xs shadow-xs"
                      }`}
                    >
                      {msg.sender === "assistant" && (
                        <div className="flex items-center justify-between border-b border-[#E6E2D8]/50 dark:border-[#2A3632] pb-1.5 mb-2">
                          <span className="font-semibold text-xs text-[#123C32] dark:text-[#C9A961] flex items-center gap-1">
                            <Scale className="h-3 w-3" />
                            المحامية بيان
                          </span>
                          <button
                            onClick={() => handleCopy(msg.content, idx)}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
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

                      {/* عرض الماركداون المنسق */}
                      <LegalMarkdown content={msg.content} />

                      {/* الأسانيد النظامية */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-[#E6E2D8] dark:border-[#2A3632]">
                          <span className="text-[10.5px] font-semibold text-[#5F6B66] dark:text-[#8A9892] block mb-1">
                            الأسانيد والأنظمة:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {msg.citations.map((cite, cIdx) => (
                              <span
                                key={cIdx}
                                className="inline-flex items-center gap-1 rounded bg-[#F5F3EE] dark:bg-[#202C28] px-1.5 py-0.5 text-[9.5px] text-[#123C32] dark:text-[#C9A961] border border-[#E6E2D8] dark:border-[#2A3632]"
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
                  <div className="flex items-center gap-2 rounded-2xl bg-white dark:bg-[#1A2420] p-3 text-xs text-[#5F6B66] dark:text-[#8A9892] border border-[#E6E2D8] dark:border-[#2A3632] shadow-xs">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#123C32] dark:text-[#C9A961]" />
                    <span>المحامية بيان تدرس وقائع وسجلات المكتب...</span>
                  </div>
                )}
              </div>

              {/* اقتراحات سريعة */}
              {messages.length <= 2 && !loading && (
                <div className="px-3 py-1.5 border-t border-[#E6E2D8] dark:border-[#2A3632] bg-white/60 dark:bg-[#17201D]/60">
                  <div className="grid grid-cols-2 gap-1">
                    {GLOBAL_QUICK_PROMPTS.map((item, qIdx) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={qIdx}
                          onClick={() => handleSend(item.text)}
                          className="flex items-start gap-1 p-1.5 rounded-lg bg-[#FAF9F6] dark:bg-[#202C28] hover:bg-[#F0EDE6] dark:hover:bg-[#273530] text-right text-[10.5px] text-[#1A1A1A] dark:text-gray-200 border border-[#E6E2D8] dark:border-[#2A3632] transition-colors"
                        >
                          <Icon className="h-3 w-3 text-[#123C32] dark:text-[#C9A961] shrink-0 mt-0.5" />
                          <span className="line-clamp-1 leading-tight">{item.text}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* صندوق الإدخال */}
              <div className="p-3 border-t border-[#E6E2D8] dark:border-[#2A3632] bg-white dark:bg-[#17201D]">
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
                    placeholder="اسأل بيان عن أي قضية، جلسة، مهلة، أو استشارة في الأنظمة السعودية..."
                    rows={2}
                    className="flex-1 resize-none rounded-xl border border-[#E6E2D8] dark:border-[#2A3632] bg-[#FAF9F6] dark:bg-[#1A2420] p-2.5 text-xs text-[#1A1A1A] dark:text-white placeholder-[#8A928E] focus:border-[#123C32] focus:ring-1 focus:ring-[#123C32] focus:outline-none transition-all"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || loading}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#123C32] hover:bg-[#184E41] text-white disabled:opacity-50 transition-colors shadow-xs"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

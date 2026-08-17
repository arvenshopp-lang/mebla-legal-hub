/**
 * ==============================================================================
 * MEHLA LEGAL PLATFORM — BAYAN AI COPILOT DRAWER COMPONENT
 * واجهة المحادثة والاستشارة الذكية مع «المحامية بيان» لكل قضية
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
} from "lucide-react";
import { toast } from "sonner";
import { LegalMarkdown } from "@/components/ui/legal-markdown";
import { useAuth } from "@/hooks/use-auth";

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

interface BayanCopilotDrawerProps {
  caseId: string;
  caseTitle: string;
  orgId: string;
  isOpen: boolean;
  onClose: () => void;
}

const QUICK_PROMPTS = [
  { text: "لخص وقائع هذه الدعوى والموقف الإجرائي الحالي", icon: FileText },
  { text: "ما هي الدفوع الشكلية والموضوعية الموصى بتقديمها؟", icon: Scale },
  { text: "احسب المهل النظامية المتبقية ومواعيد الاعتراض", icon: Clock },
  { text: "حلل أسانيد الإثبات ومستندات القضية وفق نظام الإثبات", icon: BookOpen },
];

export function BayanCopilotDrawer({
  caseId,
  caseTitle,
  orgId,
  isOpen,
  onClose,
}: BayanCopilotDrawerProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // جلب سجل المحادثة عند فتح النافذة
  useEffect(() => {
    if (!isOpen || !caseId || !orgId) return;

    let mounted = true;
    async function loadHistory() {
      try {
        const res = await fetch(`/api/ai/bayan-chat?caseId=${caseId}&orgId=${orgId}&userId=${user?.id || ""}`);
        if (res.ok) {
          const data = await res.json();
          if (mounted) {
            setConversationId(data.conversationId || null);
            if (data.messages && data.messages.length > 0) {
              setMessages(data.messages);
            } else {
              // رسالة ترحيبية أولية راقية من المحامية بيان
              setMessages([
                {
                  sender: "assistant",
                  content: `السلام عليكم ورحمة الله وبركاته،

أهلاً بك زميلي الكريم، معك **المحامية بيان** — المستشارة القانونية والباحثة الرقمية لمنصة «مِهلة».

لقد أتممتُ دراسة وفحص ملف قضية **«${caseTitle}»**، وقمتُ بمطابقة وقائعها ومذكراتها ومستنداتها مع حزمة الأنظمة واللوائح والقرارات القضائية السارية في المملكة العربية السعودية.

يسعدني مساندتك وتقديم الرأي والمشورة القانونية في:
* ⚖️ **تأصيل وتفنيد الدفوع الموضوعية والشكلية** أمام الدائرة القضائية.
* 📜 **تحليل أسانيد الإثبات والمستندات** وتطبيق قواعد نظام الإثبات ونظام المعاملات المدنية.
* ⏱️ **احتساب ومتابعة المهل النظامية ومواعيد الطعن والاستئناف**.
* ✍️ **صياغة مسودات المذكرات الجوابية ولوائح الدعوى**.

تفضل بطرح استفسارك، أو اختر أحد المسارات المقترحة أدناه لنبدأ فوراً.`,
                },
              ]);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load Bayan chat history", err);
      }
    }

    loadHistory();
    return () => {
      mounted = false;
    };
  }, [isOpen, caseId, orgId, caseTitle, user?.id]);

  // التمرير لأسفل المحادثة
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function handleSend(textToSend?: string) {
    const text = (textToSend ?? input).trim();
    if (!text || loading) return;

    setInput("");
    const newMsg: Message = { sender: "user", content: text };
    setMessages((prev) => [...prev, newMsg]);
    setLoading(true);

    try {
      const res = await fetch("/api/ai/bayan-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          orgId,
          userId: user?.id,
          conversationId,
          message: text,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "فشل الاتصال بالمحامية بيان");
      }

      const data = await res.json();
      setConversationId(data.conversationId);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div className="flex h-full w-full max-w-xl flex-col bg-[#FAF9F6] dark:bg-[#121816] shadow-2xl border-r border-[#E6E2D8] dark:border-[#2A3632] animate-in slide-in-from-right duration-300">
        
        {/* الترويسة العلوية */}
        <div className="flex items-center justify-between border-b border-[#E6E2D8] dark:border-[#2A3632] bg-white dark:bg-[#17201D] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-[#123C32] to-[#1E5648] text-white shadow-xs">
              <Bot className="h-5 w-5 text-[#C9A961]" />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#17201D]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-[#1A1A1A] dark:text-white text-base">المحامية بيان</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#F5F3EE] dark:bg-[#202C28] px-2 py-0.5 text-[11px] font-medium text-[#123C32] dark:text-[#C9A961] border border-[#E6E2D8] dark:border-[#2A3632]">
                  <Sparkles className="h-3 w-3" />
                  مستشارة مِهلة الذكية 🇸🇦
                </span>
              </div>
              <p className="text-xs text-[#5F6B66] dark:text-[#8A9892] truncate max-w-[280px]">
                مرتبطة بقضية: {caseTitle}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5F6B66] hover:bg-[#F5F3EE] dark:hover:bg-[#202C28] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* شريط الأمان والعزل */}
        <div className="flex items-center gap-2 bg-[#F5F3EE] dark:bg-[#1A2420] px-4 py-2 text-xs text-[#5F6B66] dark:text-[#8A9892] border-b border-[#E6E2D8] dark:border-[#2A3632]">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>محادثة معزولة ومشفرة — مخصصة لوقائع ومستندات هذه القضية والأنظمة السعودية فقط.</span>
        </div>

        {/* منطقة الرسائل */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl p-4 text-sm leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-[#123C32] text-white rounded-br-xs shadow-xs"
                    : "bg-white dark:bg-[#1A2420] text-[#1A1A1A] dark:text-gray-100 border border-[#E6E2D8] dark:border-[#2A3632] rounded-bl-xs shadow-xs"
                }`}
              >
                {/* اسم المرسل في رسائل بيان */}
                {msg.sender === "assistant" && (
                  <div className="flex items-center justify-between border-b border-[#E6E2D8]/50 dark:border-[#2A3632] pb-2 mb-2">
                    <span className="font-semibold text-xs text-[#123C32] dark:text-[#C9A961] flex items-center gap-1.5">
                      <Scale className="h-3.5 w-3.5" />
                      المحامية بيان
                    </span>
                    <button
                      onClick={() => handleCopy(msg.content, idx)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
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

                {/* نص الرسالة المنسق بالماركداون القانوني */}
                <LegalMarkdown content={msg.content} />

                {/* الأسانيد والأنظمة المستشهد بها */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-[#E6E2D8] dark:border-[#2A3632] space-y-1.5">
                    <span className="text-[11px] font-semibold text-[#5F6B66] dark:text-[#8A9892] block">
                      الأسانيد والأنظمة المرجعية:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.citations.map((cite, cIdx) => (
                        <span
                          key={cIdx}
                          className="inline-flex items-center gap-1 rounded-md bg-[#F5F3EE] dark:bg-[#202C28] px-2 py-0.5 text-[10px] text-[#123C32] dark:text-[#C9A961] border border-[#E6E2D8] dark:border-[#2A3632]"
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

          {/* مؤشر المعالجة اللحظية */}
          {loading && (
            <div className="flex items-start gap-2">
              <div className="flex items-center gap-2 rounded-2xl bg-white dark:bg-[#1A2420] p-3.5 text-sm text-[#5F6B66] dark:text-[#8A9892] border border-[#E6E2D8] dark:border-[#2A3632] shadow-xs">
                <Loader2 className="h-4 w-4 animate-spin text-[#123C32] dark:text-[#C9A961]" />
                <span>المحامية بيان تدرس وقائع القضية وتطابق الأنظمة...</span>
              </div>
            </div>
          )}
        </div>

        {/* الاقتراحات السريعة (Quick Starter Chips) */}
        {messages.length <= 2 && !loading && (
          <div className="px-4 py-2 border-t border-[#E6E2D8] dark:border-[#2A3632] bg-white/60 dark:bg-[#17201D]/60">
            <p className="text-[11px] font-semibold text-[#5F6B66] dark:text-[#8A9892] mb-2">
              استفسارات شائعة في هذه القضية:
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_PROMPTS.map((item, qIdx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={qIdx}
                    onClick={() => handleSend(item.text)}
                    className="flex items-start gap-1.5 p-2 rounded-lg bg-[#FAF9F6] dark:bg-[#202C28] hover:bg-[#F0EDE6] dark:hover:bg-[#273530] text-right text-[11px] text-[#1A1A1A] dark:text-gray-200 border border-[#E6E2D8] dark:border-[#2A3632] transition-colors"
                  >
                    <Icon className="h-3.5 w-3.5 text-[#123C32] dark:text-[#C9A961] shrink-0 mt-0.5" />
                    <span className="line-clamp-2 leading-tight">{item.text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* صندوق إدخال الاستفسار */}
        <div className="p-4 border-t border-[#E6E2D8] dark:border-[#2A3632] bg-white dark:bg-[#17201D]">
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
              placeholder="اطلب استشارة، صياغة دفوع، أو سؤالاً عن وقائع ومستندات هذه القضية..."
              rows={2}
              className="flex-1 resize-none rounded-xl border border-[#E6E2D8] dark:border-[#2A3632] bg-[#FAF9F6] dark:bg-[#1A2420] p-3 text-sm text-[#1A1A1A] dark:text-white placeholder-[#8A928E] focus:border-[#123C32] focus:ring-1 focus:ring-[#123C32] focus:outline-none transition-all"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#123C32] hover:bg-[#184E41] text-white disabled:opacity-50 transition-colors shadow-xs"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <div className="mt-2 text-center text-[10px] text-[#8A928E]">
            المحامية بيان مساعد ذكي لدعم المحامين وفق الأنظمة القضائية السعودية.
          </div>
        </div>

      </div>
    </div>
  );
}

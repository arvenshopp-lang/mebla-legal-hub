/**
 * ==============================================================================
 * MEHLA LEGAL PLATFORM — PUBLIC BAYAN AI COPILOT & SALES ADVISOR
 * المستشارة والمساعدة الرقمية «المحامية بيان» لزوار الصفحة الرئيسية والعامة
 * مسؤولة عن: شرح مميزات المنصة + التوجيه للباقات + تحويل العملاء لخدمة العملاء
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
  ArrowLeft,
  X,
  Loader2,
  ShieldCheck,
  CreditCard,
  Briefcase,
  UserCheck,
  Building2,
  Phone,
  Mail,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { LegalMarkdown } from "@/components/ui/legal-markdown";

interface Message {
  sender: "user" | "assistant";
  content: string;
  isLeadForm?: boolean;
}

const PUBLIC_PROMPTS = [
  { text: "ما هي أبرز مميزات منصة مِهلة لإدارة مكاتب المحاماة؟", icon: Briefcase },
  { text: "كيف تساعدني المحامية بيان كباحثة قانونية في قضاياي؟", icon: Scale },
  { text: "ما هي باقات الاشتراك والأسعار المتاحة للمكاتب؟", icon: CreditCard },
  { text: "أرغب في تجربة المنصة والتواصل مع فريق المبيعات", icon: UserCheck },
];

export function PublicBayanCopilot({
  initialOpen = false,
  onCloseExternal,
}: {
  initialOpen?: boolean;
  onCloseExternal?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [leadForm, setLeadForm] = useState({
    name: "",
    phone: "",
    firmName: "",
    inquiry: "",
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  // تحديث حالة الفتح إذا تم التحكم بها خارجياً
  useEffect(() => {
    if (initialOpen) {
      setIsOpen(true);
    }
  }, [initialOpen]);

  // إعداد الرسالة الترحيبية عند فتح النافذة
  useEffect(() => {
    if (!isOpen) return;

    if (messages.length === 0) {
      setMessages([
        {
          sender: "assistant",
          content: `السلام عليكم ورحمة الله وبركاته،

أهلاً بك في منصة **«مِهلة»** — المنظومة السحابية المتكاملة لإدارة مكاتب وشركات المحاماة في المملكة العربية السعودية.

معك **المحامية بيان**، المستشارة القانونية والباحثة الرقمية للمنصة:
* ⚖️ **أشرح لك مميزات مِهلة** (إدارة القضايا، المهل، الجلسات، الفوترة، وخزينة OCR).
* 📜 **أوضح لك كيف أساعدك في قضاياك** بالبحث والتأصيل في الأنظمة السعودية (المعاملات المدنية، الإثبات، المرافعات، والشركات).
* 💳 **أرشدك لاختيار الباقة المناسبة** لمكتبك والبدء فوراً.
* 📞 **تنسيق تواصل مباشر** مع فريق المبيعات والحلول المخصصة.

تفضل باختيار أحد الاستفسارات السريعة أدناه أو اسألني عن أي ميزة!`,
        },
      ]);
    }
  }, [isOpen]);

  // التمرير التلقائي لأسفل
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

    const q = text.toLowerCase();

    // محاكاة الإجابة السريعة للموقع العام مع ذكاء تحويلي عالي
    setTimeout(() => {
      let reply = "";
      let showLead = false;

      if (q.includes("تواصل") || q.includes("مبيعات") || q.includes("تجربة") || q.includes("عرض") || q.includes("حجز")) {
        reply = `يسعدني جداً اهتمامك بالانضمام إلى نخبة المكاتب القانونية الرائدة في **«مِهلة»**!

لتنسيق جلسة تعريفية أو تواصل مباشر من مستشاري المبيعات، يرجى تزويدي ببياناتك عبر النموذج المباشر أدناه وسيتواصل معك فريقنا خلال وقت وجيز:`;
        showLead = true;
      } else if (q.includes("مميزات") || q.includes("منصة") || q.includes("وش تقدم") || q.includes("خدمات")) {
        reply = `تجمع منصة **«مِهلة»** كافة احتياجات مكتب المحاماة في منظومة سحابية واحدة ذكية:

1. 📁 **إدارة القضايا والملفات:** مساحة عمل متكاملة لكل قضية تشمل الأطراف، المذكرات، والخط الزمني القضائي.
2. ⏱️ **حساب المهل القضائية:** احتساب تلقائي لمدد الاعتراض والاستئناف مع تنبيهات استباقية قبل سقوط المهل.
3. 🏛️ **جدولة الجلسات القضائية:** تتبع مواعيد الجلسات والقرارات الصادرة وتوثيق مذكرات الدفاع.
4. 📄 **الخزينة الرقمية والـ OCR:** استخراج النصوص من الصكوك والمستندات والبحث الشامل في محتواها بالذكاء الاصطناعي.
5. 💳 **المطالبات والفوترة:** إصدار عروض الأتعاب والمطالبات ومتابعة التحصيل ونسب الإنجاز.
6. 🤖 **المحامية بيان:** مساعدك الاستشاري والبحثي الذكي في كافة الأنظمة السعودية.

💡 **هل تود تجربة المنصة أو استعراض باقات الاشتراك؟**`;
      } else if (q.includes("بيان") || q.includes("ذكاء") || q.includes("تساعدني") || q.includes("قضاياي")) {
        reply = `بصفتي **«المحامية بيان»**، أعمل كباحثة قضائية ومستشارة قانونية ذكية مخصصة لمكتبك:

* ⚖️ **تأصيل الدفوع والمذكرات:** استخراج ومطابقة أرقام المواد الدقيقة من حزمة الأنظمة السعودية (المعاملات المدنية، الإثبات، المرافعات، المحاكم التجارية، العمل، والشركات).
* 📜 **تحليل وقائع القضايا:** قراءة مذكرات الدعوى ومستندات الـ OCR واستنباط نقاط القوة والضعف وأسانيد الإثبات.
* ⏱️ **احتساب المهل القضائية:** ضبط مواعيد الاستئناف والطعن وحالات الالتماس.
* 🔒 **درع الخصوصية والسرية (PDPL):** تعمية البيانات الشخصية وحماية أسرار الموكلين بنسبة 100%.

كل ذلك متوفر لك بمجرد إنشاء حساب مكتبك في المنصة!`;
      } else if (q.includes("سعر") || q.includes("أسعار") || q.includes("باقات") || q.includes("اشتراك") || q.includes("تكلفة")) {
        reply = `تقدم **«مِهلة»** باقات مرنة صُممت لتناسب كافة أحجام المكاتب:

* 🥉 **الباقة الأساسية (للمحامي الفرد):** إدارة كاملة للقضايا والجلسات والمهل والمطالبات مع دعم المحامية بيان.
* 🥈 **الباقة الاحترافية (للمكاتب المتوسطة):** مشاركة الفريق، تعدد المحامين، مصفوفة الصلاحيات (RBAC)، وخزينة OCR متقدمة.
* 🥇 **باقة الشركات والمؤسسات:** إمكانيات غير محدودة، دعم فني مخصص على مدار الساعة، وتكامل متقدم.

👉 **يمكنك الاطلاع على تفاصيل الأسعار والبدء فوراً عبر صفحة [الأسعار والباقات](/pricing) أو التسجيل المباشر عبر [إنشاء حساب](/register).**`;
      } else if (q.includes("سرية") || q.includes("أمان") || q.includes("حماية") || q.includes("خصوصية")) {
        reply = `الأمان والسرية المهنية هما الأساس الراسخ لمنصة **«مِهلة»**:

* 🛡️ **الامتثال لنظام حماية البيانات الشخصية السعودي (PDPL)** وضوابط الهيئة الوطنية للأمن السيبراني (NCA).
* 🔒 **عزل تام للبيانات (Multi-Tenant Isolation):** كل مكتب لديه مساحة بيانات معزولة ومحمية بالكامل.
* 🛡️ **درع تعمية البيانات (Saudi PII Shield):** حجب الهويات وأرقام الجوالات والآيبان قبل أي معالجة ذكية.
* 🏢 **استضافة سحابية آمنة** بمعايير تشفير متقدمة (End-to-End Encryption).`;
      } else {
        reply = `أهلاً بك! بصفتي **المحامية بيان**، يسعدني الإجابة عن أي استفسار حول منصة «مِهلة» ومميزاتها القانونية لخدمة مكتبك.

كيف تفضل أن أساعدك الآن؟
* 🔹 استعراض مميزات المنصة وخدمات إدارة القضايا.
* 🔹 شرح دور المحامية بيان ومساندتها في البحث القضائي.
* 🔹 التعرف على باقات الاشتراك والتسجيل.
* 🔹 طلب التواصل مع فريق المبيعات وتنسيق عرض مخصص.`;
      }

      setMessages((prev) => [
        ...prev,
        {
          sender: "assistant",
          content: reply,
          isLeadForm: showLead,
        },
      ]);
      setLoading(false);
    }, 600);
  }

  async function handleLeadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!leadForm.name || !leadForm.phone) {
      toast.error("يرجى إدخال الاسم ورقم الجوال للتواصل");
      return;
    }

    try {
      // إرسال البيانات لنظام خدمة العملاء / Leads
      await fetch("/api/public/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: leadForm.name,
          phone: leadForm.phone,
          firmName: leadForm.firmName || "مكتب محاماة",
          message: `استفسار عبر المحامية بيان: ${leadForm.inquiry || "طلب تجربة المنصة والتواصل مع المبيعات"}`,
          source: "bayan_public_copilot",
        }),
      }).catch(() => null);

      setLeadSubmitted(true);
      toast.success("تم إرسال بياناتك لخدمة العملاء بنجاح!");
      setMessages((prev) => [
        ...prev,
        {
          sender: "assistant",
          content: `شكراً لك أستاذ **${leadForm.name}**! 

تم تسجيل طلبك وإرسال إشعار فوري لفريق خدمة العملاء والمبيعات في «مِهلة». سيتواصل معك أحد مستشارينا عبر رقم الجوال (**${leadForm.phone}**) لترتيب تجربة مخصصة لمكتبك.

يمكنك في هذه الأثناء استكشاف المنصة وإنشاء حسابك مباشرة من الرابط أدناه.`,
        },
      ]);
    } catch {
      toast.error("حدث خطأ، يرجى المحاولة لاحقاً");
    }
  }

  function handleClose() {
    setIsOpen(false);
    if (onCloseExternal) onCloseExternal();
  }

  function handleCopy(text: string, index: number) {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success("تم نسخ الرد");
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  return (
    <>
      {/* الزر العائم في الموقع العام */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 left-6 z-40 flex items-center gap-2.5 rounded-full bg-gradient-to-r from-[#123C32] to-[#1E5648] px-4.5 py-3.5 text-white shadow-2xl hover:brightness-110 hover:scale-105 active:scale-95 transition-all group border border-[#C9A961]/40 animate-in fade-in slide-in-from-bottom-5 duration-300"
          title="تحدث مع المحامية بيان"
          aria-label="المحامية بيان"
        >
          <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[#123C32] text-[#C9A961] shadow-xs">
            <Bot className="h-4.5 w-4.5" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#123C32] animate-pulse" />
          </div>
          <div className="text-right">
            <span className="block text-xs font-bold leading-tight">المحامية بيان</span>
            <span className="block text-[10px] text-[#E8D49E] leading-tight">مستشارة مِهلة الذكية 🇸🇦</span>
          </div>
        </button>
      )}

      {/* نافذة المحادثة العامة بحجم ربع الشاشة الأنيق */}
      {isOpen && (
        <div className="fixed inset-x-3 bottom-6 sm:inset-x-auto sm:bottom-6 sm:left-6 sm:w-[380px] h-[480px] sm:h-[520px] max-h-[75vh] sm:max-h-[85vh] z-50 rounded-2xl shadow-2xl bg-[#FAF9F6] dark:bg-[#121816] border border-[#E6E2D8] dark:border-[#2A3632] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          
          {/* الترويسة الفاخرة */}
          <div className="flex items-center justify-between border-b border-[#E6E2D8] dark:border-[#2A3632] bg-white dark:bg-[#17201D] px-4 py-3 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-[#123C32] to-[#1E5648] text-white shadow-xs">
                <Bot className="h-5 w-5 text-[#C9A961]" />
                <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-[#1A1A1A] dark:text-white text-sm">المحامية بيان</h3>
                  <span className="rounded-full bg-[#F5F3EE] dark:bg-[#202C28] px-2 py-0.5 text-[10px] font-semibold text-[#123C32] dark:text-[#C9A961] border border-[#E6E2D8] dark:border-[#2A3632]">
                    مستشارة مِهلة 🇸🇦
                  </span>
                </div>
                <p className="text-[11px] text-[#5F6B66] dark:text-[#8A9892]">
                  مرشدتك الذكية لاكتشاف منصة مِهلة وباقاتها
                </p>
              </div>
            </div>

            <button
              onClick={handleClose}
              aria-label="إغلاق"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          {/* شريط الضمان والأمان */}
          <div className="flex items-center gap-2 bg-[#F5F3EE] dark:bg-[#1A2420] px-3.5 py-2 text-xs text-[#5F6B66] dark:text-[#8A9892] border-b border-[#E6E2D8] dark:border-[#2A3632] shrink-0">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-[11.5px] truncate">محادثة استرشادية آمنة وممتثلة لنظام حماية البيانات السعودي (PDPL).</span>
          </div>

          {/* تيار الرسائل */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar min-h-0">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[90%] sm:max-w-[88%] rounded-2xl p-3.5 sm:p-4 text-xs sm:text-sm leading-relaxed ${
                    msg.sender === "user"
                      ? "bg-[#123C32] text-white rounded-br-xs shadow-xs"
                      : "bg-white dark:bg-[#1A2420] text-[#1A1A1A] dark:text-gray-100 border border-[#E6E2D8] dark:border-[#2A3632] rounded-bl-xs shadow-xs"
                  }`}
                >
                  {msg.sender === "assistant" && (
                    <div className="flex items-center justify-between border-b border-[#E6E2D8]/50 dark:border-[#2A3632] pb-1.5 mb-2">
                      <span className="font-bold text-xs text-[#123C32] dark:text-[#C9A961] flex items-center gap-1.5">
                        <Scale className="h-3.5 w-3.5" />
                        المحامية بيان
                      </span>
                      <button
                        onClick={() => handleCopy(msg.content, idx)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1"
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

                  <LegalMarkdown content={msg.content} />

                  {/* نموذج تسجيل رغبة العميل السريع */}
                  {msg.isLeadForm && !leadSubmitted && (
                    <form onSubmit={handleLeadSubmit} className="mt-3.5 pt-3 border-t border-[#E6E2D8] dark:border-[#2A3632] space-y-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#1A1A1A] dark:text-gray-200 mb-1">
                          الاسم الكريم *
                        </label>
                        <input
                          type="text"
                          required
                          value={leadForm.name}
                          onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })}
                          placeholder="المحامي / فلان الفلاني"
                          className="w-full rounded-lg border border-[#E6E2D8] dark:border-[#2A3632] bg-[#FAF9F6] dark:bg-[#121816] px-2.5 py-1.5 text-xs text-[#1A1A1A] dark:text-white focus:outline-none focus:border-[#123C32]"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-[#1A1A1A] dark:text-gray-200 mb-1">
                            رقم الجوال *
                          </label>
                          <input
                            type="tel"
                            required
                            dir="ltr"
                            value={leadForm.phone}
                            onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
                            placeholder="05XXXXXXXX"
                            className="w-full rounded-lg border border-[#E6E2D8] dark:border-[#2A3632] bg-[#FAF9F6] dark:bg-[#121816] px-2.5 py-1.5 text-xs text-[#1A1A1A] dark:text-white focus:outline-none focus:border-[#123C32] text-right"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#1A1A1A] dark:text-gray-200 mb-1">
                            اسم المكتب / المنشأة
                          </label>
                          <input
                            type="text"
                            value={leadForm.firmName}
                            onChange={(e) => setLeadForm({ ...leadForm, firmName: e.target.value })}
                            placeholder="مكتب محاماة"
                            className="w-full rounded-lg border border-[#E6E2D8] dark:border-[#2A3632] bg-[#FAF9F6] dark:bg-[#121816] px-2.5 py-1.5 text-xs text-[#1A1A1A] dark:text-white focus:outline-none focus:border-[#123C32]"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        className="w-full mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-[#123C32] hover:bg-[#184E41] py-2 text-xs font-bold text-white shadow-xs transition-colors"
                      >
                        <Send className="h-3.5 w-3.5" />
                        إرسال الطلب لفريق المبيعات
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 rounded-2xl bg-white dark:bg-[#1A2420] p-3 text-xs text-[#5F6B66] dark:text-[#8A9892] border border-[#E6E2D8] dark:border-[#2A3632] shadow-xs">
                <Loader2 className="h-4 w-4 animate-spin text-[#123C32] dark:text-[#C9A961]" />
                <span>المحامية بيان تجيبك وتنسق طلبك...</span>
              </div>
            )}
          </div>

          {/* فلاتر الأسئلة السريعة */}
          {messages.length <= 2 && !loading && (
            <div className="px-3.5 py-2 border-t border-[#E6E2D8] dark:border-[#2A3632] bg-white/80 dark:bg-[#17201D]/80 shrink-0">
              <p className="text-[10.5px] font-semibold text-[#5F6B66] dark:text-[#8A9892] mb-1.5">
                استفسارات شائعة:
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {PUBLIC_PROMPTS.map((item, qIdx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={qIdx}
                      onClick={() => handleSend(item.text)}
                      className="flex items-start gap-1 p-1.5 rounded-xl bg-[#FAF9F6] dark:bg-[#202C28] hover:bg-[#F0EDE6] dark:hover:bg-[#273530] text-right text-[10px] text-[#1A1A1A] dark:text-gray-200 border border-[#E6E2D8] dark:border-[#2A3632] transition-colors"
                    >
                      <Icon className="h-3 w-3 text-[#123C32] dark:text-[#C9A961] shrink-0 mt-0.5" />
                      <span className="line-clamp-1 leading-tight">{item.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* صندوق الإدخال مع أزرار الإجراء السريع */}
          <div className="p-3 border-t border-[#E6E2D8] dark:border-[#2A3632] bg-white dark:bg-[#17201D] shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-end gap-1.5 mb-2"
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
                placeholder="اسأل بيان عن مميزات المنصة، الأسعار، أو اطلب تجربة مخصصة..."
                rows={2}
                className="flex-1 resize-none rounded-xl border border-[#E6E2D8] dark:border-[#2A3632] bg-[#FAF9F6] dark:bg-[#1A2420] p-2 text-xs text-[#1A1A1A] dark:text-white placeholder-[#8A928E] focus:border-[#123C32] focus:ring-1 focus:ring-[#123C32] focus:outline-none transition-all"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#123C32] hover:bg-[#184E41] text-white disabled:opacity-50 transition-colors shadow-xs shrink-0"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>

            <div className="flex items-center justify-between gap-2 text-[11px]">
              <a
                href="/register"
                className="text-[#123C32] dark:text-[#C9A961] font-bold hover:underline flex items-center gap-1"
              >
                ابدأ الاستخدام مجاناً
                <ArrowLeft className="h-3 w-3" />
              </a>
              <a
                href="/pricing"
                className="text-[#5F6B66] dark:text-[#8A9892] hover:text-[#123C32] transition-colors"
              >
                استعراض باقات الاشتراك
              </a>
            </div>
          </div>

        </div>
      )}
    </>
  );
}

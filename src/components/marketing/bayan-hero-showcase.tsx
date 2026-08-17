/**
 * ==============================================================================
 * MEHLA LEGAL PLATFORM — BAYAN HERO SHOWCASE SECTION
 * بطاقة تسويقية فاخرة في الصفحة الرئيسية لتعريف الزوار بالمحامية بيان
 * ==============================================================================
 */
import { Bot, Sparkles, Scale, ShieldCheck, ArrowLeft, CheckCircle2, FileSearch, Clock, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export function BayanHeroShowcase({ onOpenChat }: { onOpenChat: () => void }) {
  return (
    <section className="relative overflow-hidden py-12 md:py-16 bg-gradient-to-b from-[#FAF9F6] to-[#F5F3EE] dark:from-[#121816] dark:to-[#17201D] border-y border-[#E6E2D8] dark:border-[#2A3632]">
      <div className="container-page relative">
        <div className="mx-auto max-w-5xl rounded-3xl bg-gradient-to-br from-[#123C32] via-[#16473B] to-[#0D2B24] p-6 sm:p-10 md:p-12 text-white shadow-2xl border border-[#C9A961]/30 relative overflow-hidden">
          
          {/* خلفية جمالية مائية */}
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#C9A961]/10 blur-3xl pointer-events-none" />
          <div className="absolute -left-20 -bottom-20 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 grid gap-8 lg:grid-cols-12 lg:items-center">
            
            {/* الجانب النصي التعريفي */}
            <div className="lg:col-span-7 space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full bg-[#C9A961]/20 border border-[#C9A961]/40 px-3.5 py-1 text-xs font-bold text-[#E8D49E]">
                <Sparkles className="h-3.5 w-3.5 text-[#E8D49E]" />
                الذكاء الاصطناعي القانوني السعودي الأول
              </div>

              <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight leading-tight">
                تعرّف على <span className="text-[#E8D49E]">«المحامية بيان»</span>
                <br />
                مستشارتك وباحثتك القضائية في المنصة 🇸🇦
              </h2>

              <p className="text-sm sm:text-base text-gray-200 leading-relaxed">
                مدرّبة على كامل الأنظمة القضائية بالمملكة (المعاملات المدنية، الإثبات، المرافعات، المحاكم التجارية، والعمل). توفر على فريق مكتبك مئات الساعات في البحث، وتأصيل الدفوع، وتلخيص وقائع القضايا بموثوقية واحترافية تامة.
              </p>

              {/* مزايا سريعة */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="flex items-center gap-2.5 text-xs text-gray-200">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#C9A961]/20 text-[#E8D49E] shrink-0">
                    <Scale className="h-3.5 w-3.5" />
                  </div>
                  <span>تأصيل قانوني بالمواد والأنظمة الرسمية</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-gray-200">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#C9A961]/20 text-[#E8D49E] shrink-0">
                    <FileSearch className="h-3.5 w-3.5" />
                  </div>
                  <span>قراءة الصكوك وفحص نصوص OCR</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-gray-200">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#C9A961]/20 text-[#E8D49E] shrink-0">
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                  <span>تتبع المهل والاعتراضات والاستئناف</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-gray-200">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#C9A961]/20 text-[#E8D49E] shrink-0">
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </div>
                  <span>حماية خصوصية وسرية بيانات الموكلين</span>
                </div>
              </div>

              {/* زر التجربة المباشرة */}
              <div className="pt-3 flex flex-wrap items-center gap-3.5">
                <button
                  onClick={onOpenChat}
                  className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#C9A961] to-[#D8BA76] px-5 py-3 text-sm font-bold text-[#123C32] shadow-lg hover:brightness-105 active:scale-98 transition-all"
                >
                  <Bot className="h-4.5 w-4.5" />
                  تحدث مع المحامية بيان الآن (تجربة حية)
                  <ArrowLeft className="h-4 w-4" />
                </button>

                <a
                  href="/register"
                  className="rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15 transition-colors"
                >
                  إنشاء حساب للمكتب
                </a>
              </div>
            </div>

            {/* الجانب التفاعلي البصري (بطاقة المحاكاة) */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl bg-[#0B241E]/80 border border-white/15 p-4.5 backdrop-blur-md space-y-3.5 shadow-xl">
                
                {/* رأس بطاقة المحاكاة */}
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-[#123C32] text-[#C9A961] border border-[#C9A961]/30">
                      <Bot className="h-4.5 w-4.5" />
                      <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">المحامية بيان</div>
                      <div className="text-[10px] text-[#E8D49E]">مستشارة مِهلة الذكية · متصلة الآن</div>
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">Saudi Law AI</span>
                </div>

                {/* عينة استشارة حية */}
                <div className="space-y-2.5 text-xs">
                  <div className="rounded-xl bg-white/10 p-2.5 text-right text-gray-200">
                    <span className="font-semibold text-white">المحامي:</span> «ما هو السند النظامي لاستحقاق التعويض عن فسخ عقد المقاولة؟»
                  </div>
                  <div className="rounded-xl bg-[#123C32] p-3 text-right text-gray-100 border border-[#C9A961]/30 space-y-1.5">
                    <div className="flex items-center gap-1 text-[11px] font-bold text-[#E8D49E]">
                      <Scale className="h-3 w-3" />
                      المحامية بيان:
                    </div>
                    <p className="text-[11.5px] leading-relaxed text-gray-200">
                      استناداً إلى **المادة (138)** و **المادة (461)** من *نظام المعاملات المدنية السعودي (1444هـ)*، يشمل التعويض ما لحق الدائن من خسارة وما فاته من كسب نتيجة الإخلال المباشر.
                    </p>
                  </div>
                </div>

                {/* محفز تفاعلي */}
                <button
                  onClick={onOpenChat}
                  className="w-full text-center py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-[#E8D49E] border border-white/10 transition-colors"
                >
                  اضغط هنا لتجربة استشارة حية مع بيان ✨
                </button>

              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}

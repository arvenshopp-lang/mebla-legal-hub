import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  Phone,
  MessageCircle,
  ShieldCheck,
  Briefcase,
  Calendar,
  FileText,
  LogOut,
  ArrowRight,
  ChevronLeft,
  Lock,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  AlertCircle,
  ExternalLink,
  Sparkles,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { CASE_STATUS, fmtDate } from "@/lib/enums";
import {
  getPortalOfficeInfo,
  requestClientOtp,
  verifyClientOtp,
  getClientPortalDashboard,
} from "@/lib/client-portal/portal-auth.functions";

export const Route = createFileRoute("/portal/$slug")({
  component: PortalPage,
  head: () => ({
    meta: [
      { title: "بوابة الموكلين | مِهلة" },
      { name: "description", content: "بوابة الموكلين الخاصة بالمكتب لمتابعة القضايا والجلسات والمستندات." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type OfficeInfo = {
  organizationId: string;
  name: string;
  legalName: string;
  logoUrl: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  taxNumber: string | null;
  slug: string;
};

type DashboardData = {
  office: OfficeInfo;
  client: {
    id: string;
    full_name: string;
    company_name: string | null;
    email: string | null;
    phone: string | null;
    city: string | null;
  } | null;
  cases: Array<{
    id: string;
    caseNumber: string | null;
    title: string;
    court: string | null;
    circuit: string | null;
    status: string;
    caseType: string | null;
    filingDate: string | null;
    nextActionDate: string | null;
    createdAt: string;
  }>;
  hearings: Array<{
    id: string;
    caseId: string;
    caseTitle: string;
    caseNumber: string;
    hearingDate: string;
    circuit: string | null;
    courtRoom: string | null;
    status: string;
    decision: string | null;
  }>;
  documents: Array<{
    id: string;
    caseId: string | null;
    caseTitle: string;
    caseNumber: string;
    fileName: string;
    fileSize: number | null;
    category: string | null;
    createdAt: string;
    source: string | null;
  }>;
};

function PortalPage() {
  const { slug } = useParams({ from: "/portal/$slug" });

  const getOfficeFn = useServerFn(getPortalOfficeInfo);
  const sendOtpFn = useServerFn(requestClientOtp);
  const verifyOtpFn = useServerFn(verifyClientOtp);
  const getDashboardFn = useServerFn(getClientPortalDashboard);

  const [office, setOffice] = useState<OfficeInfo | null>(null);
  const [loadingOffice, setLoadingOffice] = useState(true);
  const [officeError, setOfficeError] = useState<string | null>(null);

  // Authentication State
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(`mehla_portal_session_${slug}`);
    }
    return null;
  });

  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [authStep, setAuthStep] = useState<"phone" | "otp">("phone");
  const [authLoading, setAuthLoading] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  // Dashboard Data State
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [activeTab, setActiveTab] = useState<"cases" | "hearings" | "documents">("cases");

  // Load Office Info on mount
  useEffect(() => {
    let mounted = true;
    async function loadOffice() {
      try {
        setLoadingOffice(true);
        const res = await getOfficeFn({ data: { slug } });
        if (!mounted) return;
        if (res.ok && res.office) {
          setOffice(res.office);
        } else {
          setOfficeError(res.error || "تعذّر العثور على المكتب المطلوب.");
        }
      } catch (err: any) {
        if (!mounted) return;
        setOfficeError("حدث خطأ أثناء تحميل بيانات المكتب.");
      } finally {
        if (mounted) setLoadingOffice(false);
      }
    }
    loadOffice();
    return () => {
      mounted = false;
    };
  }, [slug]);

  // Load Dashboard data if session token exists
  useEffect(() => {
    if (!sessionToken || !office) return;
    let mounted = true;

    async function loadData() {
      try {
        setLoadingDashboard(true);
        const res = await getDashboardFn({
          data: {
            slug,
            sessionToken: sessionToken!,
          },
        });
        if (!mounted) return;
        if (res.ok && res.client) {
          setDashboardData(res as unknown as DashboardData);
        } else {
          // Token expired or invalid
          setSessionToken(null);
          if (typeof window !== "undefined") {
            localStorage.removeItem(`mehla_portal_session_${slug}`);
          }
          setAuthStep("phone");
          toast.error("انتهت جلسة تسجيل الدخول، يرجى تسجيل الدخول مجدداً.");
        }
      } catch (err) {
        if (!mounted) return;
        setSessionToken(null);
        if (typeof window !== "undefined") {
          localStorage.removeItem(`mehla_portal_session_${slug}`);
        }
      } finally {
        if (mounted) setLoadingDashboard(false);
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, [sessionToken, office, slug]);

  // Countdown timer for OTP
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      toast.error("يرجى إدخال رقم الجوال.");
      return;
    }

    try {
      setAuthLoading(true);
      const res = await sendOtpFn({
        data: {
          slug,
          phone: phone.trim(),
        },
      });

      if (res.ok && res.clientId) {
        setClientId(res.clientId);
        setAuthStep("otp");
        setCountdown(60);
        toast.success(`تم إرسال رمز التحقق إلى هاتفك (${res.clientName ? `أهلاً ${res.clientName}` : ""})`);
        if (res.debugOtp) {
          console.info("[Portal OTP Debug Code]:", res.debugOtp);
        }
      } else {
        toast.error(res.error || "فشل إرسال رمز التحقق.");
      }
    } catch (err: any) {
      toast.error(err.message || "تعذّر إرسال رمز التحقق حالياً.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim() || !clientId) {
      toast.error("يرجى إدخال رمز التحقق.");
      return;
    }

    try {
      setAuthLoading(true);
      const res = await verifyOtpFn({
        data: {
          slug,
          clientId,
          phone: phone.trim(),
          code: otpCode.trim(),
        },
      });

      if (res.ok && res.sessionToken) {
        setSessionToken(res.sessionToken);
        if (typeof window !== "undefined") {
          localStorage.setItem(`mehla_portal_session_${slug}`, res.sessionToken);
        }
        toast.success("تم تسجيل الدخول بنجاح.");
      } else {
        toast.error(res.error || "رمز التحقق غير صحيح.");
      }
    } catch (err: any) {
      toast.error(err.message || "تعذّر التحقق من الرمز.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setSessionToken(null);
    setDashboardData(null);
    setAuthStep("phone");
    setPhone("");
    setOtpCode("");
    if (typeof window !== "undefined") {
      localStorage.removeItem(`mehla_portal_session_${slug}`);
    }
    toast.info("تم تسجيل الخروج بنجاح.");
  };

  if (loadingOffice) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-200">
        <div className="w-12 h-12 border-3 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-400">جارٍ تهيئة بوابة المكتب…</p>
      </div>
    );
  }

  if (officeError || !office) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
          <AlertCircle size={32} />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">البوابة غير متوفرة</h1>
        <p className="text-slate-400 text-sm max-w-md mb-6">{officeError || "تعذّر العثور على بوابة هذا المكتب القانوني."}</p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition"
        >
          <ArrowRight size={16} />
          العودة للرئيسية
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 flex flex-col selection:bg-amber-500/30 selection:text-amber-200 font-sans antialiased" dir="rtl">
      {/* Top White-Label Branding Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between gap-4">
          {/* Office Branding */}
          <div className="flex items-center gap-3.5 min-w-0">
            {office.logoUrl ? (
              <img
                src={office.logoUrl}
                alt={office.name}
                className="w-11 h-11 rounded-xl object-contain bg-slate-800/90 border border-slate-700/60 p-1 flex-shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-700/10 border border-amber-500/30 text-amber-400 flex items-center justify-center flex-shrink-0 font-bold text-lg">
                <Building2 size={22} />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base sm:text-lg text-white truncate">{office.name}</h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium flex-shrink-0">
                  <ShieldCheck size={12} />
                  بوابة موكلين موثقة
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">
                {office.city ? `${office.city} • ` : ""}
                بوابة متابعة القضايا والملفات الرسمية
              </p>
            </div>
          </div>

          {/* Quick Actions & Logout */}
          <div className="flex items-center gap-2">
            {office.phone && (
              <a
                href={`tel:${office.phone}`}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 text-xs font-medium text-slate-200 transition"
              >
                <Phone size={14} className="text-amber-400" />
                اتصال بالمكتب
              </a>
            )}
            {office.phone && (
              <a
                href={`https://wa.me/${office.phone.replace(/\+/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-xs font-medium text-emerald-300 transition"
              >
                <MessageCircle size={14} className="text-emerald-400" />
                واتساب
              </a>
            )}
            {sessionToken && (
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-medium text-rose-300 transition mr-1"
                title="تسجيل الخروج"
              >
                <LogOut size={14} />
                <span className="hidden md:inline">خروج</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {!sessionToken ? (
          /* ======================== LOGIN FLOW ======================== */
          <div className="max-w-md mx-auto my-12">
            <div className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
              {/* Background Glow */}
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="text-center mb-8 relative">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-4 shadow-inner">
                  <Lock size={26} />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">تسجيل دخول الموكل</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  أدخل رقم جوالك المسجل لدى <strong className="text-slate-200">{office.name}</strong> للوصول إلى قضاياك، مواعيد جلساتك، ومستنداتك القانونية.
                </p>
              </div>

              {authStep === "phone" ? (
                <form onSubmit={handleSendOtp} className="space-y-4 relative">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-2">
                      رقم الجوال المسجل لدى المكتب
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        dir="ltr"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="05XXXXXXXX"
                        className="w-full h-12 px-4 rounded-xl bg-slate-950/80 border border-slate-700/80 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white text-sm font-mono tracking-wider placeholder:text-slate-600 transition"
                        disabled={authLoading}
                        autoFocus
                      />
                      <span className="absolute left-3 top-3.5 text-xs text-slate-500 font-mono select-none">
                        KSA +966
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1">
                      <ShieldCheck size={12} className="text-emerald-500" />
                      سيصلك رمز تحقق عبر رسالة نصية قصيرة (SMS).
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading || !phone.trim()}
                    className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {authLoading ? (
                      <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        إرسال رمز التحقق
                        <ChevronLeft size={16} />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-5 relative">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-slate-300">
                        رمز التحقق (OTP)
                      </label>
                      <button
                        type="button"
                        onClick={() => setAuthStep("phone")}
                        className="text-[11px] text-amber-400 hover:underline"
                      >
                        تغيير الرقم ({phone})
                      </button>
                    </div>
                    <input
                      type="text"
                      dir="ltr"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="••••••"
                      className="w-full h-13 px-4 text-center rounded-xl bg-slate-950/80 border border-slate-700/80 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-white text-xl font-mono tracking-[0.4em] placeholder:text-slate-700 transition"
                      disabled={authLoading}
                      autoFocus
                    />
                    <div className="flex items-center justify-between mt-2 text-xs">
                      {countdown > 0 ? (
                        <span className="text-slate-500 flex items-center gap-1 font-mono">
                          <Clock size={12} />
                          إعادة الإرسال خلال {countdown} ثانية
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={handleSendOtp}
                          disabled={authLoading}
                          className="text-amber-400 hover:underline font-medium"
                        >
                          إعادة إرسال الرمز
                        </button>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading || otpCode.length < 4}
                    className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {authLoading ? (
                      <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        تأكيد ودخول البوابة
                        <CheckCircle2 size={16} />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>

            {/* Security Assurance */}
            <div className="text-center mt-6 text-xs text-slate-500 flex items-center justify-center gap-2">
              <Lock size={13} className="text-slate-400" />
              اتصال مشفر وآمن بالكامل بتوافق مع نظام حماية البيانات الشخصية السعودي (PDPL)
            </div>
          </div>
        ) : loadingDashboard ? (
          /* ======================== LOADING DASHBOARD ======================== */
          <div className="py-24 text-center">
            <div className="w-12 h-12 border-3 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-400 text-sm font-medium">جارٍ جلب ملفات وقضايا الموكل…</p>
          </div>
        ) : dashboardData ? (
          /* ======================== CLIENT DASHBOARD ======================== */
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Welcome Greeting Card */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800/90 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
              <div className="absolute top-0 left-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">
                      بوابة الموكل
                    </span>
                    <span className="text-xs text-slate-400">
                      {office.name}
                    </span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                    أهلاً بك، {dashboardData.client?.full_name || "عزيزي الموكل"}
                  </h2>
                  <p className="text-slate-400 text-sm mt-1 max-w-xl">
                    تتيح لك هذه البوابة متابعة كافة قضاياك لدى مكتبنا، الاطلاع على مواعيد الجلسات والقرارات الصادرة، والاطلاع على المستندات المعتمدة.
                  </p>
                </div>

                {dashboardData.client?.phone && (
                  <div className="flex items-center gap-2 bg-slate-950/60 border border-slate-800 px-4 py-2.5 rounded-2xl flex-shrink-0 text-xs font-mono text-slate-300">
                    <Phone size={14} className="text-amber-400" />
                    {dashboardData.client.phone}
                  </div>
                )}
              </div>

              {/* KPI Summary Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8 pt-6 border-t border-slate-800/80">
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                    <span>القضايا النشطة</span>
                    <Briefcase size={16} className="text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold text-white font-mono">
                    {dashboardData.cases.filter((c) => c.status !== "closed" && c.status !== "resolved").length}
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                    <span>الجلسات القادمة</span>
                    <Calendar size={16} className="text-blue-400" />
                  </div>
                  <div className="text-2xl font-bold text-white font-mono">
                    {dashboardData.hearings.filter((h) => new Date(h.hearingDate) >= new Date()).length}
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                    <span>الوثائق والمستندات</span>
                    <FileText size={16} className="text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold text-white font-mono">
                    {dashboardData.documents.length}
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-1 overflow-x-auto">
              <button
                onClick={() => setActiveTab("cases")}
                className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition flex-shrink-0 ${
                  activeTab === "cases"
                    ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <Briefcase size={16} />
                قضاياي ({dashboardData.cases.length})
              </button>

              <button
                onClick={() => setActiveTab("hearings")}
                className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition flex-shrink-0 ${
                  activeTab === "hearings"
                    ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <Calendar size={16} />
                الجلسات القضائية ({dashboardData.hearings.length})
              </button>

              <button
                onClick={() => setActiveTab("documents")}
                className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition flex-shrink-0 ${
                  activeTab === "documents"
                    ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <FileText size={16} />
                المستندات والصكوك ({dashboardData.documents.length})
              </button>
            </div>

            {/* TAB 1: CASES */}
            {activeTab === "cases" && (
              <div className="space-y-4">
                {dashboardData.cases.length === 0 ? (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center">
                    <Briefcase size={40} className="text-slate-600 mx-auto mb-3" />
                    <h3 className="text-base font-bold text-white mb-1">لا توجد قضايا مسجلة حالياً</h3>
                    <p className="text-xs text-slate-400">سيظهر هنا أي ملف قضية يتم تسجيله ومشاركته معك من قِبل المكتب.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {dashboardData.cases.map((c) => (
                      <div
                        key={c.id}
                        className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 transition shadow-sm relative group"
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                              رقم القضية: {c.caseNumber || "قيد القيد"}
                            </span>
                            <h3 className="text-base font-bold text-white mt-1.5 line-clamp-1">{c.title}</h3>
                          </div>
                          <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-slate-800 text-slate-200 border border-slate-700 flex-shrink-0">
                            {CASE_STATUS[c.status] || c.status}
                          </span>
                        </div>

                        <div className="space-y-2 text-xs text-slate-400 mt-4 pt-3 border-t border-slate-800/80">
                          {c.court && (
                            <div className="flex items-center justify-between">
                              <span>المحكمة / الدائرة:</span>
                              <span className="text-slate-200 font-medium">{c.court} {c.circuit ? `— ${c.circuit}` : ""}</span>
                            </div>
                          )}
                          {c.nextActionDate && (
                            <div className="flex items-center justify-between">
                              <span>الموعد الإجرائي القادم:</span>
                              <span className="text-amber-300 font-mono">{fmtDate(c.nextActionDate)}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <span>تاريخ تسجيل القضية:</span>
                            <span className="text-slate-400 font-mono">{fmtDate(c.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: HEARINGS */}
            {activeTab === "hearings" && (
              <div className="space-y-4">
                {dashboardData.hearings.length === 0 ? (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center">
                    <Calendar size={40} className="text-slate-600 mx-auto mb-3" />
                    <h3 className="text-base font-bold text-white mb-1">لا توجد جلسات مجدولة</h3>
                    <p className="text-xs text-slate-400">ستظهر هنا تفاصيل الجلسات والقرارات الصادرة فور تحديدها.</p>
                  </div>
                ) : (
                  <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-medium">
                          <tr>
                            <th className="py-3.5 px-4">القضية</th>
                            <th className="py-3.5 px-4">تاريخ الجلسة</th>
                            <th className="py-3.5 px-4">الدائرة / القاعة</th>
                            <th className="py-3.5 px-4">حالة الجلسة</th>
                            <th className="py-3.5 px-4">القرار / النتيجة</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70">
                          {dashboardData.hearings.map((h) => {
                            const isUpcoming = new Date(h.hearingDate) >= new Date();
                            return (
                              <tr key={h.id} className="hover:bg-slate-800/40 transition">
                                <td className="py-3.5 px-4 font-medium text-white">
                                  <div>{h.caseTitle}</div>
                                  <div className="text-[10px] text-slate-500 font-mono">{h.caseNumber}</div>
                                </td>
                                <td className="py-3.5 px-4 font-mono text-slate-200">
                                  <div className={isUpcoming ? "text-amber-400 font-bold" : "text-slate-400"}>
                                    {fmtDate(h.hearingDate)}
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 text-slate-300">
                                  {h.circuit || "—"} {h.courtRoom ? `(قاعة ${h.courtRoom})` : ""}
                                </td>
                                <td className="py-3.5 px-4">
                                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                                    isUpcoming
                                      ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                      : "bg-slate-800 text-slate-400"
                                  }`}>
                                    {h.status === "scheduled" ? "مجدولة" : h.status === "completed" ? "منعقدة" : h.status}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 text-slate-300 max-w-xs truncate">
                                  {h.decision || "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: DOCUMENTS */}
            {activeTab === "documents" && (
              <div className="space-y-4">
                {dashboardData.documents.length === 0 ? (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center">
                    <FileText size={40} className="text-slate-600 mx-auto mb-3" />
                    <h3 className="text-base font-bold text-white mb-1">لا توجد مستندات متاحة للعرض</h3>
                    <p className="text-xs text-slate-400">ستظهر هنا المذكرات والصكوك المعتمدة والمرفوعة لقضاياك.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {dashboardData.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex flex-col justify-between transition group shadow-sm"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                              {doc.category || "مستند رسمي"}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {fmtDate(doc.createdAt)}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-white line-clamp-2 mt-1 mb-1">{doc.fileName}</h4>
                          <p className="text-xs text-slate-400 truncate">مرتبط بـ: {doc.caseTitle}</p>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                          <span className="text-slate-500 font-mono text-[11px]">
                            {doc.fileSize ? `${Math.round(doc.fileSize / 1024)} KB` : "ملف موثق"}
                          </span>
                          <span className="inline-flex items-center gap-1 text-amber-400 group-hover:text-amber-300 font-medium">
                            <Eye size={14} />
                            معاينة آمنة
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 {office.name} — جميع الحقوق محفوظة</p>
          <div className="flex items-center gap-1.5 text-slate-400">
            <span>مشغلة بأمان عبر</span>
            <span className="font-bold text-amber-400">منصة مِهلة</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

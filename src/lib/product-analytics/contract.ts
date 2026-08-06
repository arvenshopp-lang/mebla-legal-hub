/**
 * عقد تحليلات المنتج (PostHog) — قائمة مغلقة للأحداث والخصائص وأسماء الشاشات.
 * لا يُرسل أي شيء خارج هذه القوائم إطلاقاً: منصة مِهلة قانونية والخصوصية إلزامية.
 */

export const ANALYTICS_EVENTS = [
  "screen_viewed",
  "signup_started",
  "signup_completed",
  "onboarding_completed",
  "first_client_created",
  "first_case_created",
  "hearing_created",
  "deadline_created",
  "task_created",
  "document_uploaded",
  "team_member_invited",
  "subscription_started",
  "subscription_activated",
  "support_ticket_created",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export const SCREEN_NAMES = [
  "landing",
  "login",
  "signup",
  "onboarding",
  "dashboard",
  "clients",
  "cases",
  "hearings",
  "deadlines",
  "tasks",
  "documents",
  "team",
  "settings",
  "billing",
  "support",
] as const;

export type ScreenName = (typeof SCREEN_NAMES)[number];

/** الخصائص المسموح بها فقط. أي مفتاح آخر يُحذف قبل الإرسال. */
export const ALLOWED_PROPERTIES = [
  "screen_name",
  "auth_method",
  "plan_tier",
  "environment",
  "action_source",
] as const;

export type AnalyticsProperties = {
  screen_name?: ScreenName;
  auth_method?: "email" | "google";
  plan_tier?: "free" | "trial" | "professional";
  environment?: "production";
  action_source?: "dashboard" | "onboarding" | "settings";
};

const ALLOWED_VALUES: Record<string, readonly string[]> = {
  screen_name: SCREEN_NAMES,
  auth_method: ["email", "google"],
  plan_tier: ["free", "trial", "professional"],
  environment: ["production"],
  action_source: ["dashboard", "onboarding", "settings"],
};

/** تنقية صارمة: مفاتيح مسموح بها + قيم من قائمة مغلقة. لا نصوص حرة على الإطلاق. */
export function sanitizeProperties(input: AnalyticsProperties | undefined): Record<string, string> {
  const clean: Record<string, string> = {};
  if (!input) return clean;
  for (const key of ALLOWED_PROPERTIES) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value !== "string") continue;
    if (!ALLOWED_VALUES[key]?.includes(value)) continue;
    clean[key] = value;
  }
  return clean;
}

/**
 * خرائط ثابتة من المسار إلى اسم شاشة ثابت.
 * لا يُقرأ أي جزء ديناميكي من الرابط (معرّفات، توكنات، Query Params).
 */
const EXACT_SCREENS: Record<string, ScreenName> = {
  "/": "landing",
  "/login": "login",
  "/register": "signup",
  "/onboarding": "onboarding",
  "/dashboard": "dashboard",
  "/clients": "clients",
  "/cases": "cases",
  "/hearings": "hearings",
  "/deadlines": "deadlines",
  "/tasks": "tasks",
  "/documents": "documents",
  "/team": "team",
  "/settings": "settings",
  "/subscription": "billing",
  "/support": "support",
};

const PREFIX_SCREENS: Array<[string, ScreenName]> = [
  ["/cases/", "cases"],
  ["/documents/", "documents"],
];

export function screenNameForPath(pathname: string): ScreenName | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const exact = EXACT_SCREENS[path];
  if (exact) return exact;
  for (const [prefix, name] of PREFIX_SCREENS) {
    if (path.startsWith(prefix)) return name;
  }
  return null;
}

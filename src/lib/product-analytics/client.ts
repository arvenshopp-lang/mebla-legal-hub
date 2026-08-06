/**
 * تحليلات المنتج — تهيئة واحدة فقط لكل التطبيق.
 *
 * قواعد صارمة:
 * - الإنتاج فقط (mehlalex.com ونطاقاته الفرعية). لا شيء من localhost أو المعاينة.
 * - لا يعمل إلا بموافقة صريحة على «تحليلات الاستخدام».
 * - لا autocapture، لا session replay، لا نقرات/نماذج/حافظة، لا pageview تلقائي.
 * - لا Feature Flags ولا Experiments ولا Surveys ولا Error Tracking.
 * - لا روابط ولا Query Params ولا Referrer ولا IP ولا موقع جغرافي ولا Person Profiles.
 * - أي فشل في PostHog لا يظهر للمستخدم ولا يوقف المنصة.
 */
import type { PostHog } from "posthog-js";

import {
  ANALYTICS_EVENTS,
  sanitizeProperties,
  type AnalyticsEvent,
  type AnalyticsProperties,
  type ScreenName,
} from "./contract";
import {
  clearAnalyticsAnonymousId,
  getAnalyticsAnonymousId,
  isAnalyticsConsentGranted,
} from "./consent";

const PRODUCTION_HOST = "mehlalex.com";

/** خصائص PostHog التقنية المسموح ببقائها (لا تحمل أي بيانات تعريف). */
const ALLOWED_SYSTEM_PROPERTIES = new Set([
  "$lib",
  "$lib_version",
  "$insert_id",
  "$process_person_profile",
  "$ip",
]);

let client: PostHog | null = null;
let loading: Promise<PostHog | null> | null = null;
let active = false;

function isProductionOrigin(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host === PRODUCTION_HOST || host.endsWith(`.${PRODUCTION_HOST}`);
}

function projectToken(): string | undefined {
  const token = import.meta.env.VITE_LOVABLE_CONNECTOR_POSTHOG_API_KEY;
  return typeof token === "string" && token.length > 0 ? token : undefined;
}

function apiHost(): string {
  const region = (import.meta.env.VITE_LOVABLE_CONNECTOR_POSTHOG_REGION ?? "eu").toLowerCase();
  return region === "us" ? "https://us.i.posthog.com" : "https://eu.i.posthog.com";
}

export function isAnalyticsEnabled(): boolean {
  return isProductionOrigin() && !!projectToken();
}

/** تُزال كل خصائص PostHog الافتراضية (الرابط، المُحيل، الجهاز…) ويُبقى المسموح فقط. */
function stripPayload(properties: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (key.startsWith("$")) {
      if (ALLOWED_SYSTEM_PROPERTIES.has(key)) clean[key] = value;
      continue;
    }
    clean[key] = value;
  }
  clean["$ip"] = null; // يمنع استنتاج الـ IP والموقع الجغرافي على الخادم
  return clean;
}

async function ensureClient(): Promise<PostHog | null> {
  if (client) return client;
  if (loading) return loading;
  const token = projectToken();
  if (!isProductionOrigin() || !token) return null;
  const distinctId = getAnalyticsAnonymousId();
  if (!distinctId) return null;

  loading = (async () => {
    try {
      const { default: posthog } = await import("posthog-js");
      posthog.init(token, {
        api_host: apiHost(),
        persistence: "localStorage", // بدون أي Cookies
        bootstrap: { distinctID: distinctId },
        person_profiles: "never",
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_dead_clicks: false,
        capture_heatmaps: false,
        rageclick: false,
        disable_session_recording: true,
        disable_surveys: true,
        disable_external_dependency_loading: true,
        advanced_disable_feature_flags: true,
        advanced_disable_feature_flags_on_first_load: true,
        advanced_disable_decide: true,
        advanced_disable_toolbar_metrics: true,
        ip: false,
        save_referrer: false,
        mask_all_text: true,
        mask_all_element_attributes: true,
        before_send: (event) => {
          if (!event) return null;
          if (!active) return null;
          if (!ANALYTICS_EVENTS.includes(event.event as AnalyticsEvent)) return null;
          event.properties = stripPayload(event.properties ?? {});
          return event;
        },
        loaded: (instance) => {
          instance.register_once({});
        },
      });
      client = posthog;
      active = true;
      return posthog;
    } catch {
      // فشل التحميل أو الشبكة — المنصة تستمر بالعمل دون أي أثر ظاهر
      return null;
    } finally {
      loading = null;
    }
  })();

  return loading;
}

/** يبدأ التحليلات بعد الموافقة فقط. آمن للاستدعاء المتكرر. */
export function startAnalytics(): void {
  if (!isAnalyticsConsentGranted()) return;
  if (!isProductionOrigin()) return;
  if (client) {
    active = true;
    try {
      client.opt_in_capturing();
    } catch {
      // تجاهل
    }
    return;
  }
  void ensureClient();
}

/** يوقف الإرسال بالكامل ويمسح المعرّف العشوائي. */
export function stopAnalytics(): void {
  active = false;
  clearAnalyticsAnonymousId();
  if (!client) return;
  try {
    client.opt_out_capturing();
    client.reset(true);
  } catch {
    // تجاهل
  }
}

/** الواجهة الوحيدة لتسجيل حدث. تُستدعى بعد نجاح العملية فعلياً فقط. */
export function track(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
  if (typeof window === "undefined") return;
  if (!isAnalyticsConsentGranted() || !isProductionOrigin()) return;
  const payload = { ...sanitizeProperties(properties), environment: "production" as const };
  void (async () => {
    try {
      const instance = await ensureClient();
      if (!instance || !active) return;
      instance.capture(event, payload);
    } catch {
      // لا نُظهر أي خطأ للمستخدم
    }
  })();
}

export function trackScreen(screen: ScreenName): void {
  track("screen_viewed", { screen_name: screen });
}

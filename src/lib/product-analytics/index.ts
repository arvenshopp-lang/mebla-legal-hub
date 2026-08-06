export { track, trackScreen, startAnalytics, stopAnalytics, isAnalyticsEnabled } from "./client";
export {
  isAnalyticsConsentGranted,
  setAnalyticsConsent,
  subscribeToAnalyticsConsent,
  isConsentDecisionNeeded,
  getConsentRecord,
  openCookiePreferences,
  COOKIE_POLICY_VERSION,
  COOKIE_PREFS_EVENT,
  type ConsentRecord,
} from "./consent";
export { screenNameForPath, type AnalyticsEvent, type ScreenName } from "./contract";

/**
 * مراقب خمول الجلسة: يجدّد طابع النشاط عند تفاعل المستخدم، ويسجّل الخروج
 * ويوجّه إلى صفحة الدخول عند تجاوز 60 دقيقة دون نشاط.
 */
import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  ACTIVITY_WRITE_THROTTLE_MS,
  clearSessionActivity,
  isInactivityExpired,
  markSessionActive,
  readLastActiveAt,
} from "@/lib/session-activity";

const ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "mousemove",
  "wheel",
  "scroll",
  "touchstart",
] as const;

const CHECK_INTERVAL_MS = 60 * 1000;

export function useSessionTimeout(): void {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const expiring = useRef(false);
  const lastWrite = useRef(0);
  const active = !!session;

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    expiring.current = false;

    // جلسة قائمة دون طابع نشاط معروف (أول تحميل بعد تفعيل السياسة): نبدأ الآن.
    if (readLastActiveAt() === null) markSessionActive();

    const touch = () => {
      const now = Date.now();
      if (expiring.current) return;
      if (now - lastWrite.current < ACTIVITY_WRITE_THROTTLE_MS) return;
      lastWrite.current = now;
      markSessionActive(now);
    };

    const expire = async () => {
      if (expiring.current) return;
      expiring.current = true;
      clearSessionActivity();
      await queryClient.cancelQueries();
      queryClient.clear();
      await signOut();
      navigate({ to: "/login", search: { reason: "inactive" } as never, replace: true });
    };

    const check = () => {
      if (isInactivityExpired()) void expire();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, touch, { passive: true });
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    // عودة Safari/iOS من BFCache أو من تطبيق آخر: نفحص المهلة فوراً.
    const onPageShow = () => check();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    // تبويب آخر جدّد النشاط: لا نُخرج مستخدماً نشطاً في مكان آخر.
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    check();

    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, touch);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.clearInterval(timer);
    };
  }, [active, navigate, queryClient, signOut]);
}

import { useEffect, useMemo, useRef, useState } from "react";
import {
  PASSWORD_MIN_SCORE,
  STRENGTH_LABELS,
  evaluateRules,
  hasEdgeWhitespace,
  heuristicScore,
  type PasswordContext,
  type PasswordRulesEvaluation,
  type StrengthLevel,
} from "@/lib/password-policy";
import { countBreachesInRange, sha1Hex, type PasswordBreachStatus } from "@/lib/hibp.shared";
import { fetchPasswordBreachRange } from "@/lib/password-policy.functions";
import { logAuthEvent } from "@/lib/auth-errors";

const BREACH_DEBOUNCE_MS = 600;

type ZxcvbnScorer = (password: string, userInputs: string[]) => StrengthLevel;

let scorerPromise: Promise<ZxcvbnScorer> | null = null;

/** تحميل zxcvbn عند الحاجة فقط (خارج حزمة الصفحات العامة). */
function loadScorer(): Promise<ZxcvbnScorer> {
  if (!scorerPromise) {
    scorerPromise = Promise.all([
      import("@zxcvbn-ts/core"),
      import("@zxcvbn-ts/language-common"),
      import("@zxcvbn-ts/language-en"),
    ])
      .then(([{ ZxcvbnFactory }, common, en]) => {
        const zxcvbn = new ZxcvbnFactory({
          dictionary: { ...common.dictionary, ...en.dictionary },
          graphs: common.adjacencyGraphs,
          translations: en.translations,
        });
        const scorer: ZxcvbnScorer = (password, userInputs) =>
          zxcvbn.check(password, userInputs).score as StrengthLevel;
        return scorer;
      })
      .catch((error) => {
        scorerPromise = null;
        throw error;
      });
  }
  return scorerPromise;
}

export type PasswordStrengthState = {
  rules: PasswordRulesEvaluation;
  score: StrengthLevel;
  label: string;
  /** درجة القوة كافية (3 أو 4). */
  strongEnough: boolean;
  breachStatus: PasswordBreachStatus;
  /** سبب واحد واضح للرفض، أو null إذا كانت كلمة المرور مقبولة. */
  reason: string | null;
  /** ملاحظة غير مانعة (مثل تعذر الفحص الإضافي أو وجود مسافات طرفية). */
  notice: string | null;
  edgeWhitespace: boolean;
  /** جاهزة للإرسال: الشروط + القوة + عدم وجود فحص جارٍ أو تسريب مؤكد. */
  acceptable: boolean;
};

export function usePasswordStrength(password: string, ctx: PasswordContext = {}): PasswordStrengthState {
  const { name, email } = ctx;
  const stableCtx = useMemo<PasswordContext>(() => ({ name, email }), [name, email]);

  const rules = useMemo(() => evaluateRules(password, stableCtx), [password, stableCtx]);
  const [zxcvbnScore, setZxcvbnScore] = useState<StrengthLevel | null>(null);
  const [breachStatus, setBreachStatus] = useState<PasswordBreachStatus>("idle");
  const requestId = useRef(0);

  // تقييم القوة: zxcvbn عند توفره، وإلا تقييم محلي مكافئ.
  useEffect(() => {
    if (!password) {
      setZxcvbnScore(null);
      return;
    }
    let cancelled = false;
    loadScorer()
      .then((scorer) => {
        if (cancelled) return;
        const userInputs = [stableCtx.name, stableCtx.email, "mehla", "mehlalex"].filter(
          (v): v is string => Boolean(v),
        );
        setZxcvbnScore(scorer(password, userInputs));
      })
      .catch(() => {
        if (!cancelled) setZxcvbnScore(null);
      });
    return () => {
      cancelled = true;
    };
  }, [password, stableCtx]);

  const score: StrengthLevel = password
    ? (zxcvbnScore ?? heuristicScore(password, stableCtx))
    : 0;

  // فحص التسريبات: بعد استيفاء الشروط الأساسية فقط، مع debounce وإلغاء الطلبات القديمة.
  useEffect(() => {
    if (!rules.valid) {
      requestId.current += 1;
      setBreachStatus("idle");
      return;
    }
    const id = ++requestId.current;
    const controller = new AbortController();
    setBreachStatus("checking");

    const timer = setTimeout(async () => {
      const isStale = () => id !== requestId.current || controller.signal.aborted;
      try {
        const hash = await sha1Hex(password);
        if (isStale()) return;
        const result = await fetchPasswordBreachRange({
          data: { prefix: hash.slice(0, 5) },
          signal: controller.signal,
        });
        if (isStale()) return;
        if (!result.available) {
          setBreachStatus("unavailable");
          logAuthEvent({
            route: "/register",
            action: "password_breach_check",
            sanitizedMessage: "breach_service_unavailable",
          });
          return;
        }
        setBreachStatus(countBreachesInRange(result.body, hash.slice(5)) > 0 ? "breached" : "safe");
      } catch {
        if (isStale()) return;
        // خطأ شبكة لا يعني أن كلمة المرور مخترقة.
        setBreachStatus("unavailable");
        logAuthEvent({
          route: "/register",
          action: "password_breach_check",
          sanitizedMessage: "breach_check_failed",
        });
      }
    }, BREACH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [password, rules.valid]);

  const strongEnough = score >= PASSWORD_MIN_SCORE;
  const edgeWhitespace = hasEdgeWhitespace(password);

  let reason: string | null = null;
  if (password.length > 0) {
    if (rules.failures.length > 0) reason = rules.failures[0];
    else if (!strongEnough) reason = "كلمة المرور يسهل تخمينها، أضف كلمات أو رموزاً غير متوقعة";
    else if (breachStatus === "breached")
      reason = "ظهرت كلمة المرور ضمن تسريبات سابقة، اختر كلمة مختلفة";
  }

  let notice: string | null = null;
  if (breachStatus === "checking") notice = "جارٍ التحقق من أمان كلمة المرور…";
  else if (breachStatus === "unavailable")
    notice = "تعذر إكمال الفحص الإضافي، وتم التحقق من قوة كلمة المرور محلياً";
  else if (edgeWhitespace)
    notice = "كلمة المرور تبدأ أو تنتهي بمسافة — تأكد أن ذلك مقصود.";

  const acceptable =
    rules.valid && strongEnough && breachStatus !== "breached" && breachStatus !== "checking";

  return {
    rules,
    score,
    label: STRENGTH_LABELS[score],
    strongEnough,
    breachStatus,
    reason,
    notice,
    edgeWhitespace,
    acceptable,
  };
}

/**
 * تحقق نهائي من سياسة كلمة المرور على الخادم.
 * لا تُسجَّل كلمة المرور ولا تجزئتها الكاملة، ولا تُخزَّن في أي جدول.
 */
import {
  HIBP_RANGE_ENDPOINT,
  countBreachesInRange,
  isValidHashPrefix,
  sha1Hex,
} from "./hibp.shared";
import {
  PASSWORD_MIN_SCORE,
  evaluateRules,
  heuristicScore,
  type PasswordContext,
  type StrengthLevel,
} from "./password-policy";

const REQUEST_TIMEOUT_MS = 3500;

async function fetchRangeOnce(prefix: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${HIBP_RANGE_ENDPOINT}${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "MehlaLex-Password-Check" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** يعيد نص نطاق التجزئة (اللواحق فقط) أو null عند تعذر الوصول للخدمة. */
export async function fetchBreachRange(prefix: string): Promise<string | null> {
  const normalized = prefix.toUpperCase();
  if (!isValidHashPrefix(normalized)) return null;
  const first = await fetchRangeOnce(normalized);
  if (first !== null) return first;
  // إعادة محاولة واحدة فقط
  return await fetchRangeOnce(normalized);
}

async function zxcvbnScore(password: string, ctx: PasswordContext): Promise<StrengthLevel> {
  try {
    const [{ ZxcvbnFactory }, common, en] = await Promise.all([
      import("@zxcvbn-ts/core"),
      import("@zxcvbn-ts/language-common"),
      import("@zxcvbn-ts/language-en"),
    ]);
    const zxcvbn = new ZxcvbnFactory({
      dictionary: { ...common.dictionary, ...en.dictionary },
      graphs: common.adjacencyGraphs,
      translations: en.translations,
    });
    const userInputs = [ctx.name, ctx.email, "mehla", "mehlalex"].filter((v): v is string =>
      Boolean(v),
    );
    return zxcvbn.check(password, userInputs).score as StrengthLevel;
  } catch {
    return heuristicScore(password, ctx);
  }
}

export type ServerPasswordVerdict = {
  ok: boolean;
  reason: string | null;
  score: StrengthLevel;
  breachChecked: boolean;
};

export async function verifyPasswordPolicy(
  password: string,
  ctx: PasswordContext,
): Promise<ServerPasswordVerdict> {
  const rules = evaluateRules(password, ctx);
  const score = await zxcvbnScore(password, ctx);

  if (!rules.valid) return { ok: false, reason: rules.failures[0], score, breachChecked: false };
  if (score < PASSWORD_MIN_SCORE)
    return {
      ok: false,
      reason: "كلمة المرور يسهل تخمينها، أضف كلمات أو رموزاً غير متوقعة",
      score,
      breachChecked: false,
    };

  const hash = await sha1Hex(password);
  const body = await fetchBreachRange(hash.slice(0, 5));
  if (body === null) {
    // تعطّل خدمة خارجية لا يمنع التسجيل — التحقق المحلي القوي كافٍ.
    return { ok: true, reason: null, score, breachChecked: false };
  }
  if (countBreachesInRange(body, hash.slice(5)) > 0) {
    return {
      ok: false,
      reason: "ظهرت كلمة المرور ضمن تسريبات سابقة، اختر كلمة مختلفة",
      score,
      breachChecked: true,
    };
  }
  return { ok: true, reason: null, score, breachChecked: true };
}

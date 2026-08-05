/**
 * سياسة كلمات المرور لمنصة مِهلة.
 * منطق نقي (بدون React وبدون شبكة) يعمل في المتصفح وعلى الخادم بنفس النتيجة.
 * لا يُسجَّل أي كلمة مرور أو تجزئة في أي مكان داخل هذا الملف.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
/** الحد الأدنى المقبول لتقييم القوة (zxcvbn): 3 = قوية. */
export const PASSWORD_MIN_SCORE = 3;

/** كلمات مرور شائعة/مسربة يُمنع استخدامها (مطابقة غير حساسة لحالة الأحرف). */
const COMMON_PASSWORDS = new Set([
  "123456789",
  "1234567890",
  "123123123",
  "111111111",
  "000000000",
  "password",
  "password1",
  "password12",
  "password123",
  "password1234",
  "passw0rd",
  "p@ssw0rd",
  "p@ssword123",
  "passw0rd123",
  "qwerty",
  "qwerty123",
  "qwerty12345",
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm123",
  "admin123456",
  "administrator",
  "welcome123",
  "welcome12345",
  "letmein123",
  "iloveyou123",
  "sunshine123",
  "princess123",
  "football123",
  "baseball123",
  "abcd1234567",
  "a1b2c3d4e5",
  "test12345678",
  "user12345678",
  "master123456",
  "trustno1234",
  "superman123",
  "starwars123",
  "computer123",
  "internet123",
  "mehla123456",
  "mehlalex123",
  "lawyer123456",
  "saudi1234567",
]);

/** أنماط لوحة مفاتيح متتابعة تُعد ضعيفة عند ظهورها كجزء كبير من كلمة المرور. */
const KEYBOARD_RUNS = [
  "qwerty",
  "asdfgh",
  "zxcvbn",
  "1234567",
  "7654321",
  "abcdef",
  "fedcba",
  "qazwsx",
];

const SYMBOL_PATTERN = /[^A-Za-z0-9]/;

function normalize(raw: string): string {
  return raw.toLowerCase();
}

/**
 * كلمة مرور شائعة أو سهلة التخمين.
 * لا تعتمد على تجريد النهايات (كان مصدر رفض كلمات مرور قوية سابقاً)،
 * بل على مطابقة صريحة أو نمط يغطي معظم كلمة المرور.
 */
export function isCommonPassword(raw: string): boolean {
  const pwd = normalize(raw);
  if (!pwd) return false;
  if (COMMON_PASSWORDS.has(pwd)) return true;
  // حرف واحد مكرر بالكامل، أو تكرار مقطع قصير (abcabcabc)
  if (/^(.)\1+$/.test(pwd)) return true;
  if (/^(.{1,3})\1{2,}$/.test(pwd)) return true;
  // نمط متتابع يشكّل نصف كلمة المرور أو أكثر
  for (const run of KEYBOARD_RUNS) {
    if (pwd.includes(run) && run.length * 2 >= pwd.length) return true;
  }
  // كلمة شائعة تشكّل معظم كلمة المرور (مثل password2024 أو qwerty!!)
  for (const common of COMMON_PASSWORDS) {
    if (common.length >= 6 && pwd.includes(common) && common.length * 1.4 >= pwd.length)
      return true;
  }
  return false;
}

export type PasswordContext = { name?: string; email?: string };

/** أجزاء الهوية التي يُمنع ظهورها داخل كلمة المرور (البريد كاملاً، الاسم كاملاً، اسم المستخدم). */
function identityTokens(ctx: PasswordContext): string[] {
  const tokens: string[] = [];
  const email = (ctx.email ?? "").trim().toLowerCase();
  const name = (ctx.name ?? "").trim().toLowerCase();
  if (email.length >= 4) {
    tokens.push(email);
    const local = email.split("@")[0];
    if (local && local.length >= 4) tokens.push(local);
  }
  if (name.length >= 4) {
    tokens.push(name);
    tokens.push(name.replace(/\s+/g, ""));
    for (const part of name.split(/\s+/)) if (part.length >= 4) tokens.push(part);
  }
  return [...new Set(tokens.filter(Boolean))];
}

export function containsIdentity(password: string, ctx: PasswordContext = {}): boolean {
  const pwd = normalize(password);
  if (!pwd) return false;
  return identityTokens(ctx).some((token) => pwd.includes(token));
}

/** مسافات في البداية أو النهاية (تنبيه فقط — لا نعدّل كلمة المرور بصمت). */
export function hasEdgeWhitespace(password: string): boolean {
  return password.length > 0 && password !== password.trim();
}

export type PasswordRuleId =
  | "length"
  | "upper"
  | "lower"
  | "digit"
  | "symbol"
  | "noIdentity"
  | "notCommon";

export type PasswordRule = {
  id: PasswordRuleId;
  label: string;
  /** رسالة تُعرض للمستخدم عند عدم استيفاء الشرط. */
  failMessage: string;
  test: (password: string, ctx: PasswordContext) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: "length",
    label: `${PASSWORD_MIN_LENGTH} حرفاً على الأقل`,
    failMessage: `كلمة المرور قصيرة، استخدم ${PASSWORD_MIN_LENGTH} حرفاً على الأقل`,
    test: (p) => p.length >= PASSWORD_MIN_LENGTH && p.length <= PASSWORD_MAX_LENGTH,
  },
  {
    id: "upper",
    label: "حرف إنجليزي كبير واحد على الأقل (A-Z)",
    failMessage: "أضف حرفاً إنجليزياً كبيراً",
    test: (p) => /[A-Z]/.test(p),
  },
  {
    id: "lower",
    label: "حرف إنجليزي صغير واحد على الأقل (a-z)",
    failMessage: "أضف حرفاً إنجليزياً صغيراً",
    test: (p) => /[a-z]/.test(p),
  },
  {
    id: "digit",
    label: "رقم واحد على الأقل (0-9)",
    failMessage: "أضف رقماً واحداً على الأقل",
    test: (p) => /[0-9]/.test(p),
  },
  {
    id: "symbol",
    label: "رمز خاص واحد على الأقل (مثل ! @ # $ % ^ & *)",
    failMessage: "أضف رمزاً خاصاً",
    test: (p) => SYMBOL_PATTERN.test(p),
  },
  {
    id: "noIdentity",
    label: "لا تحتوي على اسمك أو بريدك الإلكتروني",
    failMessage: "كلمة المرور تحتوي على اسمك أو بريدك",
    test: (p, ctx) => p.length === 0 || !containsIdentity(p, ctx),
  },
  {
    id: "notCommon",
    label: "ليست كلمة مرور شائعة أو سهلة التخمين",
    failMessage: "كلمة المرور مستخدمة بكثرة ويسهل تخمينها",
    test: (p) => p.length > 0 && !isCommonPassword(p),
  },
];

export type RuleResults = Record<PasswordRuleId, boolean>;

export type PasswordRulesEvaluation = {
  results: RuleResults;
  valid: boolean;
  /** رسائل واضحة لكل شرط غير مستوفى، بالترتيب. */
  failures: string[];
};

export function evaluateRules(
  password: string,
  ctx: PasswordContext = {},
): PasswordRulesEvaluation {
  const results = {} as RuleResults;
  const failures: string[] = [];
  for (const rule of PASSWORD_RULES) {
    const ok = rule.test(password, ctx);
    results[rule.id] = ok;
    if (!ok && password.length > 0) failures.push(rule.failMessage);
  }
  return { results, valid: PASSWORD_RULES.every((r) => results[r.id]), failures };
}

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export const STRENGTH_LABELS: Record<StrengthLevel, string> = {
  0: "ضعيفة",
  1: "ضعيفة",
  2: "مقبولة",
  3: "قوية",
  4: "قوية جداً",
};

/**
 * تقييم محلي احتياطي يُستخدم قبل تحميل zxcvbn (أو إذا تعذر تحميلها).
 * متوافق مع نفس سلم الدرجات 0..4.
 */
export function heuristicScore(password: string, ctx: PasswordContext = {}): StrengthLevel {
  if (!password) return 0;
  if (isCommonPassword(password) || containsIdentity(password, ctx)) return 0;

  let points = 0;
  if (password.length >= 12) points += 2;
  if (password.length >= 16) points += 1;
  if (password.length >= 20) points += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) points += 1;
  if (/[0-9]/.test(password)) points += 1;
  if (SYMBOL_PATTERN.test(password)) points += 1;
  if (new Set(password).size >= 10) points += 1;
  if (/(.)\1{2,}/.test(password)) points -= 1;

  if (points <= 2) return 1;
  if (points <= 4) return 2;
  if (points <= 6) return 3;
  return 4;
}

/** رسالة موحّدة لسبب رفض كلمة المرور (تُستخدم في الواجهة والخادم). */
export function firstRejectionReason(
  password: string,
  score: StrengthLevel,
  ctx: PasswordContext = {},
): string | null {
  const { failures } = evaluateRules(password, ctx);
  if (failures.length > 0) return failures[0];
  if (score < PASSWORD_MIN_SCORE) return "كلمة المرور يسهل تخمينها، أضف كلمات أو رموزاً غير متوقعة";
  return null;
}

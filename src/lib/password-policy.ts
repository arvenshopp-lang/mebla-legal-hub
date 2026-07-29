/** سياسة كلمات المرور لمنصة مِهلة — تُستخدم في الواجهة قبل أي طلب للخادم. */

/** كلمات مرور شائعة/مسربة يُمنع استخدامها (مطابقة غير حساسة لحالة الأحرف). */
const COMMON_PASSWORDS = new Set([
  "12345678", "123456789", "1234567890", "123123123", "11111111", "00000000",
  "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd",
  "qwerty", "qwerty123", "qwertyui", "qwerty1234", "asdfghjk", "zxcvbnm1",
  "admin123", "administrator", "welcome1", "welcome123", "letmein1", "letmein123",
  "iloveyou", "sunshine", "princess", "football", "baseball", "monkey123",
  "abc12345", "a1b2c3d4", "test1234", "user1234", "master123", "dragon123",
  "trustno1", "superman", "starwars", "computer", "internet", "samsung1",
  "mehla123", "mehlalex", "lawyer123", "saudi123",
]);

/** أنماط ضعيفة: تكرار حرف واحد، تسلسل أرقام، تسلسل لوحة المفاتيح. */
const KEYBOARD_RUNS = ["qwerty", "asdfgh", "zxcvbn", "1234567", "7654321", "abcdefg"];

export function isCommonPassword(raw: string): boolean {
  const pwd = raw.trim().toLowerCase();
  if (!pwd) return false;
  if (COMMON_PASSWORDS.has(pwd)) return true;
  // إزالة الأرقام اللاحقة الشائعة مثل password2024
  const stripped = pwd.replace(/[0-9!@#$%^&*]+$/g, "");
  if (stripped.length >= 5 && COMMON_PASSWORDS.has(stripped)) return true;
  if (/^(.)\1+$/.test(pwd)) return true;
  if (KEYBOARD_RUNS.some((run) => pwd.includes(run))) return true;
  return false;
}

export type PasswordRule = {
  id: string;
  label: string;
  test: (pwd: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length", label: "8 أحرف على الأقل", test: (p) => p.length >= 8 },
  { id: "upper", label: "حرف كبير واحد على الأقل (A-Z)", test: (p) => /[A-Z]/.test(p) },
  { id: "lower", label: "حرف صغير واحد على الأقل (a-z)", test: (p) => /[a-z]/.test(p) },
  { id: "digit", label: "رقم واحد على الأقل (0-9)", test: (p) => /[0-9]/.test(p) },
  {
    id: "symbol",
    label: "رمز خاص واحد على الأقل (! @ # $ % ^ & *)",
    test: (p) => /[!@#$%^&*]/.test(p),
  },
  {
    id: "notCommon",
    label: "ليست كلمة مرور شائعة أو سهلة التخمين",
    test: (p) => p.length > 0 && !isCommonPassword(p),
  },
];

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export type PasswordEvaluation = {
  results: Record<string, boolean>;
  passedCount: number;
  valid: boolean;
  score: StrengthLevel;
  label: string;
};

const STRENGTH_LABELS: Record<StrengthLevel, string> = {
  0: "—",
  1: "ضعيفة",
  2: "متوسطة",
  3: "قوية",
  4: "قوية جداً",
};

export function evaluatePassword(password: string): PasswordEvaluation {
  const results: Record<string, boolean> = {};
  for (const rule of PASSWORD_RULES) results[rule.id] = rule.test(password);
  const passedCount = PASSWORD_RULES.filter((r) => results[r.id]).length;
  const valid = passedCount === PASSWORD_RULES.length;

  let score: StrengthLevel = 0;
  if (password.length > 0) {
    let points = 0;
    if (password.length >= 8) points += 1;
    if (password.length >= 12) points += 1;
    if (password.length >= 16) points += 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) points += 1;
    if (/[0-9]/.test(password)) points += 1;
    if (/[!@#$%^&*]/.test(password)) points += 1;
    if (new Set(password).size >= 8) points += 1;
    if (isCommonPassword(password)) points = Math.min(points, 1);

    if (points <= 2) score = 1;
    else if (points <= 4) score = 2;
    else if (points <= 6) score = 3;
    else score = 4;

    if (!valid && score > 2) score = 2;
  }

  return { results, passedCount, valid, score, label: STRENGTH_LABELS[score] };
}
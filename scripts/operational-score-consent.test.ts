/**
 * اختبارات مستهدفة لإعداد «الظهور في مؤشر الإنجاز» في إعدادات المكتب.
 * التشغيل: bun run score:consent:test
 */

import { readFileSync } from "node:fs";
import {
  CONSENT_STATUS_HINTS,
  CONSENT_STATUS_LABELS,
  evaluateConsentState,
  type ConsentEvaluationInput,
} from "../src/lib/operational-score/optin.shared";
import { setRankingConsent } from "../src/lib/operational-score/ranking.server";
import { PUBLIC_MINIMUM_SCORE } from "../src/lib/operational-score/score.shared";

let pass = 0;
const failures: string[] = [];
function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    pass += 1;
    console.log(`PASS — ${name}`);
  } else {
    failures.push(`${name}${detail ? ` :: ${detail}` : ""}`);
    console.log(`FAIL — ${name} ${detail}`);
  }
}

const base: ConsentEvaluationInput = {
  isManager: true,
  publicOptIn: false,
  scoreEligible: true,
  score: 84,
  minimumScore: PUBLIC_MINIMUM_SCORE,
  integrityStatus: "pass",
  organizationActive: true,
  subscriptionActive: true,
  platformExcluded: false,
  publicNameApproved: true,
  featureEnabled: true,
};

// 1. مكتب غير مؤهل يرى حالة معطّلة.
const notEligible = evaluateConsentState({ ...base, scoreEligible: false, score: null });
check(
  "1. مكتب غير مؤهل: حالة غير مؤهل والتفعيل معطّل",
  notEligible.status === "not_eligible" && !notEligible.canEnable && !notEligible.eligible,
);

// 2. مكتب مؤهل بحالة نزاهة pass يستطيع التفعيل.
const eligible = evaluateConsentState(base);
check(
  "2. مكتب مؤهل PASS: يمكنه التفعيل",
  eligible.status === "eligible_off" && eligible.canEnable && eligible.eligible,
);

// 3. review_required لا يستطيع التفعيل.
const review = evaluateConsentState({ ...base, integrityStatus: "review_required" });
check(
  "3. review_required: قيد المراجعة ولا تفعيل",
  review.status === "under_review" && !review.canEnable,
);

// 4. نزاهة ineligible لا تستطيع التفعيل.
const integrityIneligible = evaluateConsentState({ ...base, integrityStatus: "ineligible" });
check(
  "4. integrity ineligible: لا تفعيل",
  integrityIneligible.status === "not_eligible" && !integrityIneligible.canEnable,
);

// 5. عضو غير مخوّل لا يستطيع التبديل في أي اتجاه.
const member = evaluateConsentState({ ...base, isManager: false });
const memberOptedIn = evaluateConsentState({ ...base, isManager: false, publicOptIn: true });
check(
  "5. عضو غير مخوّل: لا تفعيل ولا إيقاف",
  !member.canEnable && !memberOptedIn.canDisable,
);

// 6. المدير يستطيع التفعيل والإيقاف.
const managerOptedIn = evaluateConsentState({ ...base, publicOptIn: true });
check(
  "6. المدير: تفعيل وإيقاف متاحان",
  eligible.canEnable && managerOptedIn.canDisable && managerOptedIn.status === "enabled",
);

// شروط أخرى تمنع التفعيل: اشتراك/اسم عام/استثناء منصة/مفتاح الميزة.
check(
  "6ب. شروط الظهور الأخرى تمنع التفعيل",
  !evaluateConsentState({ ...base, subscriptionActive: false }).canEnable &&
    !evaluateConsentState({ ...base, publicNameApproved: false }).canEnable &&
    !evaluateConsentState({ ...base, platformExcluded: true }).canEnable &&
    !evaluateConsentState({ ...base, featureEnabled: false }).canEnable &&
    !evaluateConsentState({ ...base, score: PUBLIC_MINIMUM_SCORE - 1 }).canEnable,
);

/* ---------- طبقة الخادم: الإيقاف يسحب الموافقة، والتفعيل يمر بالبوابة ---------- */

type Row = { public_opt_in: boolean; platform_excluded: boolean };
function makeClients(row: Row, opts: { manager: boolean }) {
  const writes: Array<Record<string, unknown>> = [];
  const client = {
    from(table: string) {
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        in: () => api,
        not: () => api,
        is: () => api,
        gte: () => api,
        lte: () => api,
        lt: () => api,
        gt: () => api,
        or: () => api,
        order: () => api,
        limit: () => api,
        // استعلامات القوائم تُعاد فارغة: المكتب بلا نشاط كافٍ (لا يمنع الإيقاف).
        then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
        maybeSingle: async () => {
          if (table === "organization_members")
            return { data: opts.manager ? { role: "owner" } : { role: "lawyer" }, error: null };
          if (table === "organizations")
            return { data: { is_active: true, suspended_at: null }, error: null };
          if (table === "organization_ranking_settings")
            return {
              data: {
                organization_id: ORG,
                public_opt_in: row.public_opt_in,
                opted_in_at: row.public_opt_in ? "2026-08-01T00:00:00.000Z" : null,
                platform_excluded: row.platform_excluded,
                exclusion_reason: null,
                opt_in_prompted_at: null,
                opt_in_snoozed_until: null,
              },
              error: null,
            };
          if (table === "platform_settings")
            return { data: { value: { enabled: true } }, error: null };
          return { data: null, error: null };
        },
        upsert: async (payload: Record<string, unknown>) => {
          writes.push({ table, ...payload });
          if (table === "organization_ranking_settings" && "public_opt_in" in payload) {
            row.public_opt_in = payload["public_opt_in"] as boolean;
          }
          return { error: null };
        },
        insert: async (payload: Record<string, unknown>) => {
          writes.push({ table, ...payload });
          return { error: null };
        },
      };
      return api;
    },
  };
  return { client, writes };
}

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

// 7. الإيقاف يسحب الموافقة ولا يحذف نتيجة/لقطة.
{
  const row: Row = { public_opt_in: true, platform_excluded: false };
  const { client, writes } = makeClients(row, { manager: true });
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await setRankingConsent(client as any, client as any, ORG, USER, false);
  } catch (error) {
    check("7. الإيقاف ينفَّذ", false, String(error));
  }
  const deletes = writes.filter((w) => String(w["table"]).includes("snapshot"));
  check(
    "7. الإيقاف يسحب الموافقة بلا مساس باللقطات",
    row.public_opt_in === false && deletes.length === 0,
  );
}

// 5ب/AUTH. عضو غير مخوّل يُرفض خادمياً.
{
  const row: Row = { public_opt_in: false, platform_excluded: false };
  const { client } = makeClients(row, { manager: false });
  let rejected = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await setRankingConsent(client as any, client as any, ORG, USER, true);
  } catch {
    rejected = true;
  }
  check("5ب. الخادم يرفض تبديل عضو غير مخوّل", rejected && row.public_opt_in === false);
}

// 8. لا معلومات حساسة في نصوص الواجهة (لا سبب Anti-Gaming تقني).
const copy = [
  ...Object.values(CONSENT_STATUS_LABELS),
  ...Object.values(CONSENT_STATUS_HINTS),
].join(" ");
const forbidden = [
  "burst",
  "concentration",
  "short_lived",
  "gaming",
  "SHORT_LIVED",
  "activeDays",
  "12 يوم",
  "78",
];
check(
  "8. لا كشف لأسباب تقنية أو حدود البوابة في النصوص",
  forbidden.every((word) => !copy.includes(word)),
);

// 9. الإعدادات والنافذة يستخدمان نفس مصدر الحقيقة `public_opt_in`.
const componentSource = readFileSync(
  "src/components/settings/public-ranking-consent-card.tsx",
  "utf8",
);
const promptSource = readFileSync(
  "src/components/dashboard/operational-score-prompt.tsx",
  "utf8",
);
const serverSource = readFileSync("src/lib/operational-score/ranking.server.ts", "utf8");
check(
  "9. مصدر حقيقة واحد بلا حالة موافقة موازية",
  componentSource.includes("publicOptIn") &&
    !/localStorage|sessionStorage/.test(componentSource) &&
    !/localStorage|sessionStorage/.test(promptSource) &&
    serverSource.includes("public_opt_in: optIn"),
);
check(
  "9ب. الإعدادات لا تعرض مكوّنات النتيجة الخام",
  !/dimensions|components|breakdown/i.test(componentSource),
);

console.log(`\n${pass} PASS / ${failures.length} FAIL`);
if (failures.length) {
  for (const f of failures) console.log(`- ${f}`);
  process.exit(1);
}

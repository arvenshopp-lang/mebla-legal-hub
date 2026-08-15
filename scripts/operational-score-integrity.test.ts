/**
 * اختبارات بوابة نزاهة الظهور العام (Integrity Model v1) — دوال نقية بلا قاعدة بيانات.
 * التشغيل: bun run score:integrity:test
 */

import { assessPublicIntegrity, type DeletionEvent } from "@/lib/operational-score/integrity.engine";
import { computeOperationalScore } from "@/lib/operational-score/score.engine";
import type { HearingMetric, WorkItemMetric } from "@/lib/operational-score/score.engine";
import {
  INTEGRITY_MODEL_VERSION,
  readSnapshotIntegrityStatus,
} from "@/lib/operational-score/integrity.shared";
import { evaluatePromptEligibility } from "@/lib/operational-score/optin.shared";
import { sanitizePublicRankingItems } from "@/lib/operational-score/score.shared";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-08-15T09:00:00.000Z");
const iso = (offsetDays: number, hourOffsetMs = 0): string =>
  new Date(NOW.getTime() - offsetDays * DAY + hourOffsetMs).toISOString();

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  ✓ ${name}`);
    return;
  }
  failures += 1;
  console.error(`  ✗ ${name}`, detail ?? "");
}

type ItemSpec = {
  dueOffset: number;
  createdOffset: number;
  completedOffset: number | null;
  status?: string;
  lateExtension?: boolean;
};

function item(type: "task" | "deadline", id: string, spec: ItemSpec): WorkItemMetric {
  const events =
    spec.lateExtension === true
      ? [
          {
            event: "due_changed" as const,
            occurredAt: iso(spec.dueOffset - 1),
            fromDueDate: iso(spec.dueOffset + 2),
            toDueDate: iso(spec.dueOffset),
          },
        ]
      : [];
  return {
    id,
    itemType: type,
    createdAt: iso(spec.createdOffset),
    dueDate: iso(spec.dueOffset),
    completedAt: spec.completedOffset === null ? null : iso(spec.completedOffset),
    status: spec.status ?? (spec.completedOffset === null ? "pending" : "completed"),
    events,
  };
}

/** مكتب طبيعي: عناصر موزّعة على أيام مختلفة، كلها أُنشئت قبل موعدها وأُنجزت في موعدها. */
function spreadItems(
  type: "task" | "deadline",
  count: number,
  spreadDays: number,
  prefix: string,
): WorkItemMetric[] {
  return Array.from({ length: count }, (_, index) => {
    const due = 5 + (index % spreadDays) * 2;
    return item(type, `${prefix}-${index}`, {
      dueOffset: due,
      createdOffset: due + 12,
      completedOffset: due + 1,
    });
  });
}

function assess(args: {
  tasks?: WorkItemMetric[];
  deadlines?: WorkItemMetric[];
  hearings?: HearingMetric[];
  deletionEvents?: DeletionEvent[];
  organizationCreatedAt?: string;
  baseEligible?: boolean;
}) {
  return assessPublicIntegrity({
    organizationCreatedAt: args.organizationCreatedAt ?? iso(400),
    tasks: args.tasks ?? [],
    deadlines: args.deadlines ?? [],
    hearings: args.hearings ?? [],
    deletionEvents: args.deletionEvents ?? [],
    baseEligible: args.baseEligible ?? true,
    baseEligibilityReason: (args.baseEligible ?? true) ? "eligible" : "insufficient_items",
    now: NOW.toISOString(),
  });
}

console.log("\n1) مكتب صغير منتظم (28 عملاً على أيام متعددة) = PASS");
const smallOffice = assess({
  tasks: spreadItems("task", 18, 20, "t"),
  deadlines: spreadItems("deadline", 10, 20, "d"),
});
check("PASS", smallOffice.status === "pass", smallOffice);
check("أيام نشطة ≥ 12", smallOffice.activeDays >= 12, smallOffice.activeDays);
check("بلا رموز أسباب", smallOffice.reasonCodes.length === 0, smallOffice.reasonCodes);

console.log("\n2) مكتب كبير طبيعي (400 عملاً على 70 يوماً) = PASS (لا عقوبة حجم)");
const largeOffice = assess({
  tasks: spreadItems("task", 300, 40, "lt"),
  deadlines: spreadItems("deadline", 100, 40, "ld"),
});
check("PASS", largeOffice.status === "pass", largeOffice.reasonCodes);

console.log("\n3) 25 عنصراً في يومين = INELIGIBLE / INSUFFICIENT_ACTIVITY_SPREAD");
const twoDays = assess({
  tasks: Array.from({ length: 20 }, (_, i) =>
    item("task", `s-${i}`, { dueOffset: 10, createdOffset: 30, completedOffset: 10 }),
  ),
  deadlines: Array.from({ length: 5 }, (_, i) =>
    item("deadline", `sd-${i}`, { dueOffset: 11, createdOffset: 31, completedOffset: 11 }),
  ),
});
check("INELIGIBLE", twoDays.status === "ineligible", twoDays.status);
check(
  "رمز INSUFFICIENT_ACTIVITY_SPREAD",
  twoDays.reasonCodes.includes("INSUFFICIENT_ACTIVITY_SPREAD"),
  twoDays.reasonCodes,
);

console.log("\n4) 60% من المهل أُنشئت بعد موعدها = REVIEW_REQUIRED (لا اتهام)");
const postDue = assess({
  tasks: spreadItems("task", 18, 20, "pt"),
  deadlines: [
    ...Array.from({ length: 6 }, (_, i) =>
      item("deadline", `pd-${i}`, {
        dueOffset: 12 + i * 2,
        createdOffset: 11 + i * 2,
        completedOffset: 10 + i * 2,
      }),
    ),
    ...spreadItems("deadline", 4, 14, "pdn"),
  ],
});
check("REVIEW_REQUIRED", postDue.status === "review_required", postDue.status);
check(
  "رمز POST_DUE_DEADLINE_CREATION_RATIO",
  postDue.reasonCodes.includes("POST_DUE_DEADLINE_CREATION_RATIO"),
  postDue.reasonCodes,
);
check("ليس INELIGIBLE", postDue.status !== "ineligible");

console.log("\n5) 4 تمديدات موعد متأخرة = REVIEW_REQUIRED");
const lateExtensions = assess({
  tasks: spreadItems("task", 18, 20, "et"),
  deadlines: [
    ...Array.from({ length: 4 }, (_, i) =>
      item("deadline", `ed-${i}`, {
        dueOffset: 14 + i * 3,
        createdOffset: 40,
        completedOffset: 13 + i * 3,
        lateExtension: true,
      }),
    ),
    ...spreadItems("deadline", 6, 12, "edn"),
  ],
});
check("REVIEW_REQUIRED", lateExtensions.status === "review_required", lateExtensions.status);
check(
  "رمز LATE_DUE_EXTENSION_PATTERN",
  lateExtensions.reasonCodes.includes("LATE_DUE_EXTENSION_PATTERN"),
  lateExtensions.reasonCodes,
);

console.log("\n6) نمط ترحيل بيانات عند بدء الاستخدام = REVIEW_REQUIRED لا INELIGIBLE");
const onboarding = assess({
  organizationCreatedAt: iso(60),
  tasks: [
    ...Array.from({ length: 30 }, (_, i) =>
      item("task", `ot-${i}`, { dueOffset: 55, createdOffset: 58, completedOffset: 54 }),
    ),
    ...spreadItems("task", 14, 13, "otn"),
  ],
  deadlines: spreadItems("deadline", 8, 13, "od"),
});
check("REVIEW_REQUIRED", onboarding.status === "review_required", onboarding.status);
check(
  "رمز ONBOARDING_IMPORT_PATTERN",
  onboarding.reasonCodes.includes("ONBOARDING_IMPORT_PATTERN"),
  onboarding.reasonCodes,
);

console.log("\n7) مكتب بلا جلسات = يمكنه PASS");
check("PASS بلا أي جلسة", smallOffice.signals.countedHearings === 0 && smallOffice.status === "pass");

console.log("\n8) جلسات أُنشئت بعد موعدها = إشارة مراجعة منخفضة الثقة");
const hearings: HearingMetric[] = Array.from({ length: 8 }, (_, i) => ({
  id: `h-${i}`,
  hearingDate: iso(20 + i * 2),
  status: "completed",
  createdAt: iso(19 + i * 2),
}));
const lateHearings = assess({
  tasks: spreadItems("task", 18, 20, "ht"),
  deadlines: spreadItems("deadline", 10, 20, "hd"),
  hearings,
});
check("REVIEW_REQUIRED", lateHearings.status === "review_required", lateHearings.status);
check(
  "رمز HEARINGS_CREATED_AFTER_DATE",
  lateHearings.reasonCodes.includes("HEARINGS_CREATED_AFTER_DATE"),
  lateHearings.reasonCodes,
);

console.log("\n9) ضغط موسمي موزّع بشكل كافٍ = PASS");
const seasonal = assess({
  tasks: spreadItems("task", 120, 30, "st"),
  deadlines: spreadItems("deadline", 40, 25, "sd2"),
});
check("PASS", seasonal.status === "pass", seasonal.reasonCodes);

console.log("\n10) 70% من النشاط في 3 أيام = REVIEW_REQUIRED");
const concentrated = assess({
  tasks: [
    ...Array.from({ length: 36 }, (_, i) =>
      item("task", `ct-${i}`, { dueOffset: 10, createdOffset: 11, completedOffset: 10 }),
    ),
    ...spreadItems("task", 8, 8, "cn"),
  ],
  deadlines: spreadItems("deadline", 6, 6, "cd"),
});
check("REVIEW_REQUIRED", concentrated.status === "review_required", concentrated.status);
check(
  "رمز HIGH_ACTIVITY_CONCENTRATION",
  concentrated.reasonCodes.includes("HIGH_ACTIVITY_CONCENTRATION"),
  concentrated.reasonCodes,
);

console.log("\n11/12) النتيجة الداخلية ومعامل النزاهة بلا تغيير");
const scoreInput = {
  organizationCreatedAt: iso(400),
  tasks: spreadItems("task", 18, 20, "zt"),
  deadlines: spreadItems("deadline", 10, 20, "zd"),
  hearings: [] as HearingMetric[],
  now: NOW.toISOString(),
};
const before = computeOperationalScore(scoreInput);
assess({ tasks: scoreInput.tasks, deadlines: scoreInput.deadlines });
const after = computeOperationalScore(scoreInput);
check("النتيجة لم تتغير", before.score === after.score, { before: before.score, after: after.score });
check("integrityFactor = 1.00", after.integrityFactor === 1, after.integrityFactor);

console.log("\n13/14/15) قراءة حالة النزاهة من اللقطة (Fail closed)");
const snapshotFor = (status: string) => ({
  deadlines: {},
  integrity: { status, modelVersion: INTEGRITY_MODEL_VERSION },
});
check("pass تُقرأ", readSnapshotIntegrityStatus(snapshotFor("pass")) === "pass");
check(
  "review_required تُقرأ",
  readSnapshotIntegrityStatus(snapshotFor("review_required")) === "review_required",
);
check("ineligible تُقرأ", readSnapshotIntegrityStatus(snapshotFor("ineligible")) === "ineligible");
check("غياب المفتاح = null", readSnapshotIntegrityStatus({ deadlines: {} }) === null);
check("إصدار مختلف = null", readSnapshotIntegrityStatus({ integrity: { status: "pass", modelVersion: "v0" } }) === null);
check("قيمة غير معروفة = null", readSnapshotIntegrityStatus(snapshotFor("ok")) === null);

console.log("\n16) الاستجابة العامة لا تحمل أي Metadata نزاهة");
const publicItems = sanitizePublicRankingItems([
  {
    rank: 1,
    publicName: "مكتب أ",
    score: 91,
    ...({ reasonCodes: ["X"], activeDays: 40, signals: {} } as unknown as object),
  },
]);
const publicKeys = Object.keys(publicItems[0] ?? {}).sort();
check(
  "الحقول العامة فقط",
  publicKeys.join(",") === "badge,logoUrl,publicName,rank,score",
  publicKeys,
);

console.log("\n17) دعوة الموافقة تتطلب PASS");
const promptBase = {
  isManager: true,
  scoreEligible: true,
  score: 90,
  minimumScore: 78,
  organizationActive: true,
  subscriptionActive: true,
  platformExcluded: false,
  publicOptIn: false,
  publicNameApproved: true,
  snoozedUntil: null,
  now: NOW.toISOString(),
};
check(
  "PASS ⇒ الدعوة تظهر",
  evaluatePromptEligibility({ ...promptBase, integrityPass: true }).visible,
);
const blockedPrompt = evaluatePromptEligibility({ ...promptBase, integrityPass: false });
check("غير PASS ⇒ لا دعوة", !blockedPrompt.visible && blockedPrompt.reason === "integrity_not_pass", blockedPrompt);

console.log("\n18) غياب الدليل وحده لا ينتج عقوبة ولا مراجعة");
const noEvidence = assess({
  tasks: spreadItems("task", 18, 20, "nt"),
  deadlines: spreadItems("deadline", 10, 20, "nd"),
  deletionEvents: [
    { itemType: "deadline", occurredAt: iso(5), dueDate: null },
    { itemType: "task", occurredAt: iso(6), dueDate: null },
  ],
});
check("PASS بلا إشارات", noEvidence.status === "pass", noEvidence.reasonCodes);
check(
  "نسبة الحذف بلا دليل = null/0",
  noEvidence.signals.deadlineDeletionAfterDueRatio === null ||
    noEvidence.signals.deadlineDeletionAfterDueRatio === 0,
  noEvidence.signals.deadlineDeletionAfterDueRatio,
);

console.log("\n19) أهلية أساسية غير محققة = INELIGIBLE موضوعي");
const baseFail = assess({ tasks: spreadItems("task", 6, 6, "bt"), baseEligible: false });
check("INELIGIBLE", baseFail.status === "ineligible", baseFail.status);
check(
  "رمز BASE_ELIGIBILITY_NOT_MET",
  baseFail.reasonCodes.includes("BASE_ELIGIBILITY_NOT_MET"),
  baseFail.reasonCodes,
);

if (failures > 0) {
  console.error(`\n❌ فشل ${failures} تحقق`);
  process.exit(1);
}
console.log("\n✅ كل اختبارات بوابة النزاهة ناجحة");
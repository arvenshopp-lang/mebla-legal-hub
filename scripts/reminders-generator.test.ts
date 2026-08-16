/**
 * اختبار المولّد بقاعدة بيانات وهمية داخلية — لا شبكة ولا إرسال بريد.
 * يتحقق من: عزل المكتب، استثناء الحالات، منع التكرار، واحترام التفضيلات.
 */
import { generateOperationalReminders } from "../src/lib/notifications/reminder-generator.server";

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean) => {
  if (ok) passed += 1;
  else {
    failed += 1;
    console.error("FAIL:", name);
  }
};

const now = new Date("2026-08-16T09:00:00Z");
const inDays = (d: number) =>
  new Date(now.getTime() + d * 86_400_000).toISOString();

type Query = { table: string; filters: Record<string, unknown>; rows: unknown[] };

function makeDb(seed: {
  hearings: unknown[];
  deadlines: unknown[];
  tasks: unknown[];
  prefs: unknown[];
  members: unknown[];
  existingDedup: Set<string>;
}) {
  const inserted: { user_id: string; type: string; dedup_key: string }[] = [];
  const queries: Query[] = [];

  const builder = (table: string) => {
    const filters: Record<string, unknown> = {};
    const api: Record<string, unknown> = {};
    const rows = () => {
      if (table === "hearings") return seed.hearings;
      if (table === "deadlines") return seed.deadlines;
      if (table === "tasks") return seed.tasks;
      if (table === "user_notification_preferences") return seed.prefs;
      if (table === "organization_members") return seed.members;
      return [];
    };
    const chain = () => api;
    for (const m of ["select", "in", "gte", "lte", "lt", "not", "eq", "limit"]) {
      api[m] = (...args: unknown[]) => {
        filters[m] = args;
        return chain();
      };
    }
    api["then"] = undefined;
    // النتيجة تُقرأ عند await على السلسلة
    (api as { then?: unknown }).then = (resolve: (v: unknown) => void) => {
      queries.push({ table, filters, rows: rows() });
      resolve({ data: rows(), error: null });
    };
    api["maybeSingle"] = async () => ({ data: null, error: null });
    api["insert"] = (payload: { user_id: string; type: string; dedup_key: string }) => ({
      select: () => ({
        maybeSingle: async () => {
          const key = `${payload.user_id}|${payload.dedup_key}`;
          if (seed.existingDedup.has(key)) {
            return { data: null, error: { code: "23505", message: "duplicate" } };
          }
          seed.existingDedup.add(key);
          inserted.push(payload);
          return { data: { id: `n-${inserted.length}` }, error: null };
        },
      }),
    });
    return api;
  };

  return {
    db: {
      from: (table: string) => builder(table),
    },
    inserted,
    queries,
  };
}

const baseSeed = () => ({
  hearings: [
    {
      id: "h-3d",
      organization_id: "org-1",
      case_id: "c-1",
      hearing_date: inDays(3),
      status: "scheduled",
      cases: { assigned_lawyer_id: "u-1" },
    },
    {
      id: "h-foreign",
      organization_id: "org-2",
      case_id: "c-2",
      hearing_date: inDays(1),
      status: "scheduled",
      cases: { assigned_lawyer_id: "u-1" },
    },
    {
      id: "h-nolawyer",
      organization_id: "org-1",
      case_id: "c-3",
      hearing_date: inDays(1),
      status: "scheduled",
      cases: { assigned_lawyer_id: null },
    },
    {
      id: "h-2d",
      organization_id: "org-1",
      case_id: "c-4",
      hearing_date: inDays(2),
      status: "scheduled",
      cases: { assigned_lawyer_id: "u-1" },
    },
  ],
  deadlines: [
    {
      id: "d-7d",
      organization_id: "org-1",
      case_id: "c-1",
      due_date: inDays(7),
      status: "active",
      responsible_user_id: "u-1",
    },
  ],
  tasks: [
    {
      id: "t-1",
      organization_id: "org-1",
      case_id: "c-1",
      due_date: inDays(-2),
      status: "pending",
      assigned_to: "u-1",
    },
  ],
  prefs: [],
  members: [{ organization_id: "org-1", user_id: "u-1", status: "active" }],
  existingDedup: new Set<string>(),
});

/* -------------------------------------------------- التشغيل الأول */
const seed = baseSeed();
const first = makeDb(seed);
const r1 = await generateOperationalReminders(first.db, now);

check("أُنشئت ثلاثة تذكيرات فقط", r1.created === 3);
check("جلسة org-2 لم تُنشئ تذكيراً (عزل المكتب)", !first.inserted.some((r) => r.dedup_key.includes("org-2")));
check("جلسة بلا محامٍ مسؤول مستثناة", !first.inserted.some((r) => r.dedup_key.includes("h-nolawyer")));
check("فارق يومين لا يُنتج تذكيراً", !first.inserted.some((r) => r.dedup_key.includes("h-2d")));
check("تذكير جلسة 3 أيام", first.inserted.some((r) => r.type === "hearing_reminder_3d"));
check("تذكير مهلة 7 أيام", first.inserted.some((r) => r.type === "deadline_reminder_7d"));
check("تذكير مهمة متأخرة", first.inserted.some((r) => r.type === "task_overdue"));
check("القضايا الخاملة: عتبة مفقودة", r1.inactiveCases === "THRESHOLD_MISSING");

const hearingQuery = first.queries.find((q) => q.table === "hearings");
check(
  "استعلام الجلسات يستثني غير المجدولة",
  JSON.stringify(hearingQuery?.filters["in"]).includes("scheduled"),
);
const deadlineQuery = first.queries.find((q) => q.table === "deadlines");
check(
  "استعلام المهل يقصر على النشطة",
  JSON.stringify(deadlineQuery?.filters["in"]).includes("active") &&
    !JSON.stringify(deadlineQuery?.filters["in"]).includes("completed"),
);
const taskQuery = first.queries.find((q) => q.table === "tasks");
check(
  "استعلام المهام يستثني المكتملة",
  !JSON.stringify(taskQuery?.filters["in"]).includes("completed"),
);
check("عضوية نشطة فقط", JSON.stringify(first.queries.find((q) => q.table === "organization_members")?.filters["eq"]).includes("active"));

/* ------------------------------------ التشغيل الثاني على نفس الحالة */
const second = makeDb(seed);
const r2 = await generateOperationalReminders(second.db, now);
check("التشغيل الثاني لا يُنشئ أي تذكير", r2.created === 0);
check("التشغيل الثاني يسجّل تكراراً", r2.duplicates === 3);
check("لا صفوف إضافية", second.inserted.length === 0);

/* ------------------------------------------ التفضيلات المُوقفة تمنع */
const offSeed = baseSeed();
offSeed.prefs = [
  {
    organization_id: "org-1",
    user_id: "u-1",
    hearing_3_days: false,
    deadline_7_days: false,
    task_overdue: false,
    in_app_enabled: true,
    email_enabled: true,
  },
];
const third = makeDb(offSeed);
const r3 = await generateOperationalReminders(third.db, now);
check("إيقاف التفضيلات يمنع كل التذكيرات", r3.created === 0 && r3.skippedPreference === 3);

/* --------------------------- مستلم بلا عضوية نشطة في مكتب الكيان */
const noMemberSeed = baseSeed();
noMemberSeed.members = [];
const fourth = makeDb(noMemberSeed);
const r4 = await generateOperationalReminders(fourth.db, now);
check("بلا عضوية نشطة = لا تذكير", r4.created === 0 && r4.skippedRecipient === 3);

console.log(`\nنتيجة: ${passed} ناجح / ${failed} فاشل`);
if (failed > 0) process.exit(1);

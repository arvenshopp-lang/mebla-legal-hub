/**
 * اختبارات مستهدفة لـ B3C — حماية توثيق الموافقة + دعوة التأهل.
 * التشغيل: bun run score:optin:test
 */

import { readFileSync } from "node:fs";
import {
  OPT_IN_SNOOZE_DAYS,
  evaluatePromptEligibility,
  resolveOptInMetadata,
  type PromptEligibilityInput,
} from "../src/lib/operational-score/optin.shared";
import {
  acceptOptInFromPrompt,
  evaluateOptInPrompt,
  snoozeOptInPrompt,
} from "../src/lib/operational-score/ranking.server";
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

const MIGRATION = readFileSync(
  "supabase/migrations/20260815131500_operational_score_optin_metadata.sql",
  "utf8",
);

const ORG = "11111111-1111-4111-8111-111111111111";
const MANAGER = "22222222-2222-4222-8222-222222222222";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-08-15T09:00:00.000Z");

type Row = Record<string, unknown>;
type Rows = Record<string, Row[]>;

/** عميل مزيّف يحاكي سلسلة PostgREST المستخدمة في طبقة الخادم، ويسجّل الكتابات. */
function fakeClient(rows: Rows, writes: Array<{ table: string; payload: Row }> = []) {
  const build = (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let rowLimit: number | null = null;
    const api: Record<string, unknown> = {};
    const self = () => api;
    api["select"] = self;
    api["order"] = self;
    api["limit"] = (value: number) => {
      rowLimit = value;
      return api;
    };
    api["eq"] = (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return api;
    };
    api["is"] = (col: string, val: unknown) => {
      filters.push((r) => (val === null ? r[col] == null : r[col] === val));
      return api;
    };
    api["not"] = (col: string, _op: string, val: unknown) => {
      filters.push((r) => (val === null ? r[col] != null : r[col] !== val));
      return api;
    };
    api["in"] = (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]));
      return api;
    };
    api["gte"] = (col: string, val: string) => {
      filters.push((r) => String(r[col] ?? "") >= val);
      return api;
    };
    api["lte"] = (col: string, val: string) => {
      filters.push((r) => String(r[col] ?? "") <= val);
      return api;
    };
    api["upsert"] = (payload: Row) => {
      writes.push({ table, payload });
      const list = (rows[table] ??= []);
      const existing = list.find((r) => r["organization_id"] === payload["organization_id"]);
      if (existing) Object.assign(existing, payload);
      else list.push({ ...payload });
      return Promise.resolve({ data: null, error: null });
    };
    api["insert"] = (payload: Row) => {
      writes.push({ table, payload });
      (rows[table] ??= []).push({ ...payload });
      return Promise.resolve({ data: null, error: null });
    };
    function result() {
      let data = (rows[table] ?? []).filter((r) => filters.every((f) => f(r)));
      if (rowLimit !== null) data = data.slice(0, rowLimit);
      if (table === "platform_settings") return { data: { value: { enabled: true } }, error: null };
      return { data, error: null };
    }
    api["maybeSingle"] = () => {
      if (table === "platform_settings") return Promise.resolve(result());
      const data = result().data as Row[];
      return Promise.resolve({ data: data[0] ?? null, error: null });
    };
    (api as { then?: unknown })["then"] = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve);
    return api;
  };
  return { from: (table: string) => build(table), __writes: writes };
}

/** مكتب مؤهل فعلياً: 30 مهلة و8 جلسات منجزة في موعدها داخل النافذة. */
function eligibleRows(overrides: Partial<Rows> = {}): Rows {
  const deadlines: Row[] = [];
  for (let i = 0; i < 30; i += 1) {
    const due = new Date(NOW.getTime() - (i + 5) * 2 * 24 * 60 * 60 * 1000).toISOString();
    deadlines.push({
      id: `d-${i}`,
      organization_id: ORG,
      created_at: new Date(new Date(due).getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      due_date: due,
      completed_at: new Date(new Date(due).getTime() - 60 * 60 * 1000).toISOString(),
      status: "completed",
    });
  }
  const hearings: Row[] = [];
  for (let i = 0; i < 8; i += 1) {
    const date = new Date(NOW.getTime() - (i + 2) * 3 * 24 * 60 * 60 * 1000).toISOString();
    hearings.push({
      id: `h-${i}`,
      organization_id: ORG,
      hearing_date: date,
      status: "completed",
      created_at: new Date(new Date(date).getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }
  return {
    organizations: [
      {
        id: ORG,
        is_active: true,
        suspended_at: null,
        created_at: new Date(NOW.getTime() - 400 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    organization_members: [
      { organization_id: ORG, user_id: MANAGER, role: "owner", status: "active" },
      { organization_id: ORG, user_id: MEMBER, role: "lawyer", status: "active" },
    ],
    organization_ranking_settings: [
      {
        organization_id: ORG,
        public_opt_in: false,
        opted_in_at: null,
        platform_excluded: false,
        exclusion_reason: null,
        opt_in_prompted_at: null,
        opt_in_snoozed_until: null,
      },
    ],
    subscriptions: [{ organization_id: ORG, status: "active", ends_at: null, suspended_at: null }],
    office_public_pages: [
      {
        organization_id: ORG,
        status: "published",
        suspended_by_platform: false,
        published: { office_name: "مكتب الاختبار" },
      },
    ],
    platform_settings: [{ key: "operational_score", value: { enabled: true } }],
    tasks: [],
    deadlines,
    hearings,
    work_item_events: [],
    activity_logs: [],
    ...overrides,
  };
}

const baseInput: PromptEligibilityInput = {
  isManager: true,
  scoreEligible: true,
  score: 90,
  minimumScore: PUBLIC_MINIMUM_SCORE,
  organizationActive: true,
  subscriptionActive: true,
  platformExcluded: false,
  publicOptIn: false,
  publicNameApproved: true,
  snoozedUntil: null,
  integrityPass: true,
  now: NOW.toISOString(),
};

const run = async () => {
  /* ---------- 1–5: توثيق الموافقة تحدده القاعدة ---------- */
  check(
    "1. office cannot forge opted_in_at (guard overwrites with now())",
    /NEW\.opted_in_at := now\(\)/.test(MIGRATION),
  );
  check(
    "2. office cannot forge opted_in_by (guard overwrites with auth.uid())",
    /NEW\.opted_in_by := v_uid/.test(MIGRATION) && /v_uid uuid := auth\.uid\(\)/.test(MIGRATION),
  );
  const turnedOn = resolveOptInMetadata({
    previous: { publicOptIn: false, optedInAt: "2020-01-01T00:00:00.000Z", optedInBy: MEMBER },
    nextOptIn: true,
    actorUserId: MANAGER,
    now: NOW.toISOString(),
  });
  check(
    "3. false → true gets trusted metadata",
    turnedOn.optedInAt === NOW.toISOString() && turnedOn.optedInBy === MANAGER,
    JSON.stringify(turnedOn),
  );
  const kept = resolveOptInMetadata({
    previous: { publicOptIn: true, optedInAt: "2026-01-01T00:00:00.000Z", optedInBy: MANAGER },
    nextOptIn: true,
    actorUserId: MEMBER,
    now: NOW.toISOString(),
  });
  check(
    "4. true → true preserves original metadata",
    kept.optedInAt === "2026-01-01T00:00:00.000Z" && kept.optedInBy === MANAGER,
    JSON.stringify(kept),
  );
  const cleared = resolveOptInMetadata({
    previous: { publicOptIn: true, optedInAt: "2026-01-01T00:00:00.000Z", optedInBy: MANAGER },
    nextOptIn: false,
    actorUserId: MANAGER,
    now: NOW.toISOString(),
  });
  check(
    "5. true → false clears current-consent metadata",
    cleared.optedInAt === null && cleared.optedInBy === null,
  );
  check(
    "5b. migration keeps platform exclusion fields platform-only",
    /استثناء الظهور العام من صلاحيات منصة مِهلة فقط/.test(MIGRATION),
  );
  check(
    "5c. migration adds prompt fields only (no new consent state)",
    /opt_in_prompted_at timestamptz/.test(MIGRATION) &&
      /opt_in_snoozed_until timestamptz/.test(MIGRATION) &&
      !/public_opt_in_state/.test(MIGRATION),
  );

  /* ---------- 6–13: محرك أهلية الدعوة ---------- */
  check(
    "6. eligible + score>=78 + no opt-in ⇒ prompt",
    evaluatePromptEligibility(baseInput).visible,
  );
  check(
    "7. score < 78 ⇒ no prompt",
    evaluatePromptEligibility({ ...baseInput, score: 70 }).reason === "score_below_threshold",
  );
  check(
    "8. operationally ineligible ⇒ no prompt",
    evaluatePromptEligibility({ ...baseInput, scoreEligible: false, score: null }).reason ===
      "score_not_eligible",
  );
  check(
    "9. inactive subscription ⇒ no prompt",
    evaluatePromptEligibility({ ...baseInput, subscriptionActive: false }).reason ===
      "subscription_inactive",
  );
  check(
    "10. platform excluded ⇒ no prompt",
    evaluatePromptEligibility({ ...baseInput, platformExcluded: true }).reason ===
      "platform_excluded",
  );
  check(
    "11. already opted in ⇒ no prompt",
    evaluatePromptEligibility({ ...baseInput, publicOptIn: true }).reason === "already_opted_in",
  );
  check(
    "12. future snooze ⇒ no prompt",
    evaluatePromptEligibility({
      ...baseInput,
      snoozedUntil: new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    }).reason === "snoozed",
  );
  check(
    "13. expired snooze ⇒ prompt allowed",
    evaluatePromptEligibility({
      ...baseInput,
      snoozedUntil: new Date(NOW.getTime() - 60 * 1000).toISOString(),
    }).visible,
  );
  check(
    "13b. missing approved public name ⇒ no prompt (no false eligibility claim)",
    evaluatePromptEligibility({ ...baseInput, publicNameApproved: false }).reason ===
      "public_name_missing",
  );
  check(
    "13c. inactive organization ⇒ no prompt",
    evaluatePromptEligibility({ ...baseInput, organizationActive: false }).reason ===
      "organization_inactive",
  );

  /* ---------- 14–16: مسار «ليس الآن» / الإغلاق ---------- */
  {
    const rows = eligibleRows();
    const client = fakeClient(rows);
    const settings = await snoozeOptInPrompt(client, ORG, MANAGER);
    const stored = rows["organization_ranking_settings"]![0]!;
    const snoozeMs = new Date(String(settings.optInSnoozedUntil)).getTime() - Date.now();
    check("14. «ليس الآن» keeps public_opt_in = false", stored["public_opt_in"] === false);
    check(
      "15. «ليس الآن» sets 30-day snooze",
      Math.round(snoozeMs / (24 * 60 * 60 * 1000)) === OPT_IN_SNOOZE_DAYS &&
        OPT_IN_SNOOZE_DAYS === 30,
      String(snoozeMs),
    );
    check(
      "16. close/X uses the same server snooze path (no client-only state)",
      readFileSync("src/components/dashboard/operational-score-prompt.tsx", "utf8").includes(
        "onClose={dismiss}",
      ) && settings.optInPromptedAt !== null,
    );
  }

  /* ---------- 17–20: الصلاحية وإعادة التحقق ---------- */
  {
    const client = fakeClient(eligibleRows());
    let rejected = false;
    try {
      await acceptOptInFromPrompt(client, client, ORG, MEMBER);
    } catch {
      rejected = true;
    }
    check("17. unauthorized office member cannot accept", rejected);
  }
  {
    const client = fakeClient(eligibleRows());
    let rejected = false;
    try {
      await snoozeOptInPrompt(client, ORG, MEMBER);
    } catch {
      rejected = true;
    }
    check("18. unauthorized office member cannot snooze", rejected);
  }
  {
    // مكتب غير مؤهل تشغيلياً: لا مهل ولا جلسات ⇒ القبول يُرفض خادمياً.
    const client = fakeClient(eligibleRows({ deadlines: [], hearings: [] }));
    let rejected = false;
    try {
      await acceptOptInFromPrompt(client, client, ORG, MANAGER);
    } catch {
      rejected = true;
    }
    check("19. accept rechecks eligibility server-side", rejected);
  }
  {
    const rows = eligibleRows();
    const writes: Array<{ table: string; payload: Row }> = [];
    const client = fakeClient(rows, writes);
    const settings = await acceptOptInFromPrompt(client, client, ORG, MANAGER);
    const consentWrites = writes.filter((w) => w.table === "organization_ranking_settings");
    check(
      "20. ordinary office path never writes consent metadata (DB owns it)",
      settings.publicOptIn === true &&
        consentWrites.every(
          (w) => !("opted_in_at" in w.payload) && !("opted_in_by" in w.payload),
        ) &&
        consentWrites.every((w) => !("platform_excluded" in w.payload)),
      JSON.stringify(consentWrites),
    );
    check(
      "20b. accept writes an audit entry",
      writes.some((w) => w.table === "activity_logs" && w.payload["action"] === "ranking.opt_in"),
    );
  }

  /* ---------- 21: خصوصية عقد الاستجابة ---------- */
  {
    const rows = eligibleRows();
    const writes: Array<{ table: string; payload: Row }> = [];
    const client = fakeClient(rows, writes);
    const state = await evaluateOptInPrompt(client, client, ORG, MANAGER);
    const serialized = JSON.stringify(state);
    check(
      "21. prompt response contains no sensitive data",
      state.visible &&
        !serialized.includes(ORG) &&
        !serialized.includes(MANAGER) &&
        !serialized.includes("مكتب الاختبار") &&
        !/d-\d|h-\d/.test(serialized) &&
        Object.keys(state).sort().join(",") ===
          ["minimumScore", "publicOptIn", "reason", "score", "snoozeDays", "visible"].join(","),
      serialized,
    );
    const promptMarks = writes.filter(
      (w) => w.table === "organization_ranking_settings" && "opt_in_prompted_at" in w.payload,
    );
    await evaluateOptInPrompt(client, client, ORG, MANAGER);
    const promptMarksAfter = rows["organization_ranking_settings"]!.length;
    check(
      "21b. prompted_at written once per 24h window (no write storm)",
      promptMarks.length === 1 &&
        writes.filter(
          (w) => w.table === "organization_ranking_settings" && "opt_in_prompted_at" in w.payload,
        ).length === 1 &&
        promptMarksAfter === 1,
    );
  }

  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length > 0) process.exit(1);
};

void run();

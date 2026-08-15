/**
 * اختبارات وحدة لأهلية الترتيب العام وتقليل البيانات (B3B/B4) — عميل قاعدة بيانات مزيّف.
 * التشغيل: bun run score:ranking:test
 */

import { getPublicRanking } from "../src/lib/operational-score/ranking.server";
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

type Rows = Record<string, unknown[]>;

/** عميل مزيّف يحاكي سلسلة PostgREST المستخدمة في `getPublicRanking`. */
function fakeClient(rows: Rows, settingValue: unknown = { enabled: true }) {
  const build = (table: string) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const api: Record<string, unknown> = {};
    const self = () => api;
    api["select"] = self;
    api["order"] = self;
    api["limit"] = () => ({
      then: undefined,
      ...result(),
    });
    api["eq"] = (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return api;
    };
    api["is"] = (col: string, val: unknown) => {
      filters.push((r) => (val === null ? r[col] == null : r[col] === val));
      return api;
    };
    api["in"] = (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]));
      return api;
    };
    api["maybeSingle"] = () => Promise.resolve(result());
    function result() {
      const data = ((rows[table] ?? []) as Array<Record<string, unknown>>).filter((r) =>
        filters.every((f) => f(r)),
      );
      return { data: table === "platform_settings" ? { value: settingValue } : data, error: null };
    }
    // السلسلة قابلة للانتظار في أي نقطة.
    (api as { then?: unknown })["then"] = (
      resolve: (value: unknown) => unknown,
    ) => Promise.resolve(result()).then(resolve);
    return api;
  };
  return { from: (table: string) => build(table) };
}

const ORG = "11111111-1111-1111-1111-111111111111";
const ORG2 = "22222222-2222-2222-2222-222222222222";

function baseRows(overrides: Partial<Rows> = {}): Rows {
  return {
    platform_settings: [{ key: "operational_score", value: { enabled: true } }],
    organization_ranking_settings: [
      { organization_id: ORG, public_opt_in: true, platform_excluded: false, updated_at: "x" },
    ],
    organizations: [{ id: ORG, is_active: true, suspended_at: null }],
    subscriptions: [{ organization_id: ORG, status: "active", ends_at: null, suspended_at: null }],
    office_public_pages: [
      {
        organization_id: ORG,
        status: "published",
        suspended_by_platform: false,
        published: { office_name: "مكتب الأول" },
      },
    ],
    operational_score_snapshots: [
      {
        organization_id: ORG,
        score: 90,
        eligible: true,
        computed_at: "2026-08-15T00:00:00.000Z",
        window_kind: "rolling_90",
      },
    ],
    ...overrides,
  };
}

const run = async () => {
  // الميزة معطّلة افتراضياً عند غياب المفتاح (Fail closed).
  const disabled = await getPublicRanking(fakeClient(baseRows(), {}));
  check("feature flag missing ⇒ disabled", disabled.enabled === false && disabled.items.length === 0);

  // مكتب مؤهل كامل يظهر مرة واحدة بالحقول العامة فقط.
  const ok = await getPublicRanking(fakeClient(baseRows()));
  const item = ok.items[0];
  check("eligible office ranked", ok.enabled && ok.items.length === 1 && item?.rank === 1);
  check(
    "public data minimization",
    !!item &&
      Object.keys(item).sort().join(",") === "badge,logoUrl,publicName,rank,score" &&
      !JSON.stringify(ok).includes(ORG),
  );

  // كل شرط أهلية على حدة يمنع الظهور.
  const cases: Array<[string, Partial<Rows>]> = [
    [
      "opt-out excluded",
      {
        organization_ranking_settings: [
          { organization_id: ORG, public_opt_in: false, platform_excluded: false },
        ],
      },
    ],
    [
      "platform exclusion",
      {
        organization_ranking_settings: [
          { organization_id: ORG, public_opt_in: true, platform_excluded: true },
        ],
      },
    ],
    ["inactive organization", { organizations: [{ id: ORG, is_active: false, suspended_at: null }] }],
    [
      "inactive subscription",
      { subscriptions: [{ organization_id: ORG, status: "expired", ends_at: null }] },
    ],
    ["unpublished public page", { office_public_pages: [] }],
    [
      "B1 ineligible snapshot",
      {
        operational_score_snapshots: [
          {
            organization_id: ORG,
            score: null,
            eligible: false,
            computed_at: "2026-08-15T00:00:00.000Z",
            window_kind: "rolling_90",
          },
        ],
      },
    ],
    [
      "score below minimum",
      {
        operational_score_snapshots: [
          {
            organization_id: ORG,
            score: PUBLIC_MINIMUM_SCORE - 1,
            eligible: true,
            computed_at: "2026-08-15T00:00:00.000Z",
            window_kind: "rolling_90",
          },
        ],
      },
    ],
  ];
  for (const [name, override] of cases) {
    const res = await getPublicRanking(fakeClient(baseRows(override)));
    check(`excluded: ${name}`, res.items.length === 0);
  }

  // تعادل النتيجة ⇒ ترتيب قطعي بالأقدم حساباً.
  const tie = await getPublicRanking(
    fakeClient(
      baseRows({
        organization_ranking_settings: [
          { organization_id: ORG, public_opt_in: true, platform_excluded: false },
          { organization_id: ORG2, public_opt_in: true, platform_excluded: false },
        ],
        organizations: [
          { id: ORG, is_active: true, suspended_at: null },
          { id: ORG2, is_active: true, suspended_at: null },
        ],
        subscriptions: [
          { organization_id: ORG, status: "active", ends_at: null },
          { organization_id: ORG2, status: "active", ends_at: null },
        ],
        office_public_pages: [
          {
            organization_id: ORG,
            status: "published",
            suspended_by_platform: false,
            published: { office_name: "مكتب الأول" },
          },
          {
            organization_id: ORG2,
            status: "published",
            suspended_by_platform: false,
            published: { office_name: "مكتب الثاني" },
          },
        ],
        operational_score_snapshots: [
          {
            organization_id: ORG,
            score: 90,
            eligible: true,
            computed_at: "2026-08-15T00:00:00.000Z",
            window_kind: "rolling_90",
          },
          {
            organization_id: ORG2,
            score: 90,
            eligible: true,
            computed_at: "2026-08-14T00:00:00.000Z",
            window_kind: "rolling_90",
          },
        ],
      }),
    ),
  );
  check(
    "deterministic tie-break by computed_at",
    tie.items.length === 2 && tie.items[0]?.publicName === "مكتب الثاني",
  );

  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length > 0) process.exit(1);
};

void run();

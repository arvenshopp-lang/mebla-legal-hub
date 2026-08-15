/**
 * اختبارات وحدة لأهلية الترتيب العام وتقليل البيانات (B3B/B4) — عميل قاعدة بيانات مزيّف.
 * التشغيل: bun run score:ranking:test
 */

import { getPublicRanking } from "../src/lib/operational-score/ranking.server";
import {
  OPERATIONAL_SCORE_FORMULA_VERSION,
  PUBLIC_MINIMUM_SCORE,
} from "../src/lib/operational-score/score.shared";
import { INTEGRITY_MODEL_VERSION } from "../src/lib/operational-score/integrity.shared";

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
    const orders: Array<{ column: string; ascending: boolean }> = [];
    let rowLimit: number | null = null;
    const api: Record<string, unknown> = {};
    const self = () => api;
    api["select"] = self;
    api["order"] = (column: string, options?: { ascending?: boolean }) => {
      orders.push({ column, ascending: options?.ascending !== false });
      return api;
    };
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
    api["in"] = (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]));
      return api;
    };
    api["maybeSingle"] = () => {
      const res = result();
      if (table === "platform_settings") return Promise.resolve(res);
      const data = res.data as Array<Record<string, unknown>>;
      return Promise.resolve({ data: data[0] ?? null, error: null });
    };
    function result() {
      let data = ((rows[table] ?? []) as Array<Record<string, unknown>>).filter((r) =>
        filters.every((f) => f(r)),
      );
      for (const { column, ascending } of [...orders].reverse()) {
        data = [...data].sort((a, b) => {
          const left = String(a[column] ?? "");
          const right = String(b[column] ?? "");
          return ascending ? left.localeCompare(right) : right.localeCompare(left);
        });
      }
      if (rowLimit !== null) data = data.slice(0, rowLimit);
      return { data: table === "platform_settings" ? { value: settingValue } : data, error: null };
    }
    // السلسلة قابلة للانتظار في أي نقطة.
    (api as { then?: unknown })["then"] = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve);
    return api;
  };
  return { from: (table: string) => build(table) };
}

const ORG = "11111111-1111-1111-1111-111111111111";
const ORG2 = "22222222-2222-2222-2222-222222222222";
const V1 = OPERATIONAL_SCORE_FORMULA_VERSION;

type SnapshotSeed = {
  organizationId: string;
  score: number | null;
  eligible: boolean;
  computedAt: string;
  formulaVersion?: string;
  /** حالة بوابة النزاهة داخل اللقطة — الافتراضي `pass` لحالات الاختبار المعتمدة. */
  integrityStatus?: "pass" | "review_required" | "ineligible" | null;
};

function snapshot(seed: SnapshotSeed): Record<string, unknown> {
  const integrityStatus = seed.integrityStatus === undefined ? "pass" : seed.integrityStatus;
  return {
    organization_id: seed.organizationId,
    score: seed.score,
    eligible: seed.eligible,
    computed_at: seed.computedAt,
    created_at: seed.computedAt,
    window_kind: "rolling_90",
    formula_version: seed.formulaVersion ?? V1,
    dimensions:
      integrityStatus === null
        ? {}
        : { integrity: { status: integrityStatus, modelVersion: INTEGRITY_MODEL_VERSION } },
  };
}

/** مكتب معتمد كامل الشروط (ما عدا اللقطة) — يُستخدم لتركيب حالات متعددة المكاتب. */
function officeRows(organizationId: string, publicName: string) {
  return {
    settings: { organization_id: organizationId, public_opt_in: true, platform_excluded: false },
    organization: { id: organizationId, is_active: true, suspended_at: null },
    subscription: {
      organization_id: organizationId,
      status: "active",
      ends_at: null,
      suspended_at: null,
    },
    page: {
      organization_id: organizationId,
      status: "published",
      suspended_by_platform: false,
      published: { office_name: publicName },
    },
  };
}

/** يبني مجموعة صفوف لمكتبين باسمين محددين مع لقطاتهما. */
function twoOfficeRows(
  nameOne: string,
  nameTwo: string,
  snapshots: Array<Record<string, unknown>>,
): Rows {
  const one = officeRows(ORG, nameOne);
  const two = officeRows(ORG2, nameTwo);
  return {
    platform_settings: [{ key: "operational_score", value: { enabled: true } }],
    organization_ranking_settings: [one.settings, two.settings],
    organizations: [one.organization, two.organization],
    subscriptions: [one.subscription, two.subscription],
    office_public_pages: [one.page, two.page],
    operational_score_snapshots: snapshots,
  };
}

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
      snapshot({
        organizationId: ORG,
        score: 90,
        eligible: true,
        computedAt: "2026-08-15T00:00:00.000Z",
      }),
    ],
    ...overrides,
  };
}

const run = async () => {
  // الميزة معطّلة افتراضياً عند غياب المفتاح (Fail closed).
  const disabled = await getPublicRanking(fakeClient(baseRows(), {}));
  check(
    "feature flag missing ⇒ disabled",
    disabled.enabled === false && disabled.items.length === 0,
  );

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
    [
      "inactive organization",
      { organizations: [{ id: ORG, is_active: false, suspended_at: null }] },
    ],
    [
      "inactive subscription",
      { subscriptions: [{ organization_id: ORG, status: "expired", ends_at: null }] },
    ],
    ["unpublished public page", { office_public_pages: [] }],
    [
      "B1 ineligible snapshot",
      {
        operational_score_snapshots: [
          snapshot({
            organizationId: ORG,
            score: null,
            eligible: false,
            computedAt: "2026-08-15T00:00:00.000Z",
          }),
        ],
      },
    ],
    [
      "score below minimum",
      {
        operational_score_snapshots: [
          snapshot({
            organizationId: ORG,
            score: PUBLIC_MINIMUM_SCORE - 1,
            eligible: true,
            computedAt: "2026-08-15T00:00:00.000Z",
          }),
        ],
      },
    ],
    [
      "only a foreign formula version snapshot",
      {
        operational_score_snapshots: [
          snapshot({
            organizationId: ORG,
            score: 95,
            eligible: true,
            computedAt: "2026-08-15T00:00:00.000Z",
            formulaVersion: "v0",
          }),
          snapshot({
            organizationId: ORG,
            score: 97,
            eligible: true,
            computedAt: "2026-08-16T00:00:00.000Z",
            formulaVersion: "v2",
          }),
        ],
      },
    ],
  ];
  for (const [name, override] of cases) {
    const res = await getPublicRanking(fakeClient(baseRows(override)));
    check(`excluded: ${name}`, res.items.length === 0);
  }

  // (1) مكتب بتاريخ لقطات طويل ومكتب بلقطة واحدة: كلاهما بأحدث لقطة صحيحة.
  const dense: Array<Record<string, unknown>> = [];
  for (let day = 1; day <= 30; day += 1) {
    dense.push(
      snapshot({
        organizationId: ORG,
        score: 80 + (day % 5),
        eligible: true,
        computedAt: `2026-07-${String(day).padStart(2, "0")}T00:00:00.000Z`,
      }),
    );
  }
  dense.push(
    snapshot({
      organizationId: ORG,
      score: 99,
      eligible: true,
      computedAt: "2026-08-14T00:00:00.000Z",
    }),
  );
  dense.push(
    snapshot({
      organizationId: ORG2,
      score: 88,
      eligible: true,
      computedAt: "2026-08-13T00:00:00.000Z",
    }),
  );
  const denseResult = await getPublicRanking(
    fakeClient(twoOfficeRows("مكتب الأول", "مكتب الثاني", dense)),
  );
  check(
    "latest snapshot per organization (30 vs 1)",
    denseResult.items.length === 2 &&
      denseResult.items[0]?.publicName === "مكتب الأول" &&
      denseResult.items[0]?.score === 99 &&
      denseResult.items[1]?.score === 88,
    JSON.stringify(denseResult.items),
  );
  check(
    "organization appears once only",
    new Set(denseResult.items.map((i) => i.publicName)).size === denseResult.items.length,
  );

  // (2) أحدث v0 + أقدم v1 ⇒ يُستخدم أحدث v1 فقط.
  const mixedVersions = await getPublicRanking(
    fakeClient(
      baseRows({
        operational_score_snapshots: [
          snapshot({
            organizationId: ORG,
            score: 100,
            eligible: true,
            computedAt: "2026-08-16T00:00:00.000Z",
            formulaVersion: "v0",
          }),
          snapshot({
            organizationId: ORG,
            score: 84,
            eligible: true,
            computedAt: "2026-08-10T00:00:00.000Z",
          }),
        ],
      }),
    ),
  );
  check(
    "formula version filter uses current v1 snapshot",
    mixedVersions.items.length === 1 && mixedVersions.items[0]?.score === 84,
    JSON.stringify(mixedVersions.items),
  );

  // (3) أحدث v1 غير مؤهلة ⇒ لا رجوع إلى لقطة قديمة مؤهلة.
  const staleEligible = await getPublicRanking(
    fakeClient(
      baseRows({
        operational_score_snapshots: [
          snapshot({
            organizationId: ORG,
            score: null,
            eligible: false,
            computedAt: "2026-08-16T00:00:00.000Z",
          }),
          snapshot({
            organizationId: ORG,
            score: 95,
            eligible: true,
            computedAt: "2026-08-10T00:00:00.000Z",
          }),
        ],
      }),
    ),
  );
  check("latest ineligible snapshot wins over older eligible", staleEligible.items.length === 0);

  // (4) تعادل النتيجة ⇒ الترتيب بالاسم لا بوقت الحساب.
  const tie = await getPublicRanking(
    fakeClient(
      twoOfficeRows("مكتب الألف", "مكتب الباء", [
        snapshot({
          organizationId: ORG,
          score: 90,
          eligible: true,
          computedAt: "2026-08-15T00:00:00.000Z",
        }),
        snapshot({
          organizationId: ORG2,
          score: 90,
          eligible: true,
          computedAt: "2026-08-10T00:00:00.000Z",
        }),
      ]),
    ),
  );
  check(
    "tie-break ignores computed_at",
    tie.items.length === 2 &&
      tie.items[0]?.publicName === "مكتب الألف" &&
      tie.items[1]?.publicName === "مكتب الباء",
    JSON.stringify(tie.items),
  );

  // (5) نفس النتيجة ونفس الاسم ⇒ ترتيب قطعي ثابت بين التشغيلات.
  const duplicateNames = twoOfficeRows("مكتب مِهلة", "مكتب مِهلة", [
    snapshot({
      organizationId: ORG,
      score: 91,
      eligible: true,
      computedAt: "2026-08-15T00:00:00.000Z",
    }),
    snapshot({
      organizationId: ORG2,
      score: 91,
      eligible: true,
      computedAt: "2026-08-09T00:00:00.000Z",
    }),
  ]);
  const firstRun = await getPublicRanking(fakeClient(duplicateNames));
  const secondRun = await getPublicRanking(fakeClient(duplicateNames));
  check(
    "duplicate public names order deterministically",
    firstRun.items.length === 2 &&
      JSON.stringify(firstRun.items) === JSON.stringify(secondRun.items),
    JSON.stringify(firstRun.items),
  );
  check(
    "public response never leaks organization ids",
    !JSON.stringify(firstRun).includes(ORG) && !JSON.stringify(firstRun).includes(ORG2),
  );

  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length > 0) process.exit(1);
};

void run();

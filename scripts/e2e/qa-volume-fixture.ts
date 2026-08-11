/**
 * تهيئة مكتب QA بحجم إنتاجي للاختبار الحي العميق.
 *
 * ينشئ مكتباً معزولاً واحداً ببادئة QA-LIVE-20260809- يحتوي:
 *   - مالك + مدير + 3 موظفين (محامٍ، مساعد قانوني، قارئ) بأسماء سعودية شبه حقيقية
 *   - 150 عميلاً ببيانات كاملة (أفراد/شركات/جهات حكومية)
 *   - 36 قضية موزعة الحالات، منها 10 نشطة، وكل قضية ببيانات كاملة
 *   - لكل قضية نشطة: جلسة قادمة + مهلة + مهمة + تحديثان زمنيان + طرف قضية
 *
 * المكتب يُنشأ عبر دالة الإنتاج create_organization_with_owner بجلسة المالك الحقيقية.
 * الصفوف الضخمة تُجهَّز بمفتاح الخدمة (تجهيز بيانات اختبار فقط)، ثم يتم التحقق من
 * القراءة بتوكن كل مستخدم عبر Data API مع RLS كما في الإنتاج.
 *
 * الاستخدام:
 *   bun scripts/e2e/qa-volume-fixture.ts             # تهيئة
 *   bun scripts/e2e/qa-volume-fixture.ts --cleanup   # حذف كامل
 */
import {
  assertE2eEnvironmentSafe,
  SUPABASE_URL,
  PUBLISHABLE,
  adminHeaders,
  adminFetch,
  signIn,
  asUser,
} from "./qa-support";

const PREFIX = "QA-LIVE-20260809-";
const FILE = "/tmp/browser/qa-volume.json";
const ORG_NAME = `${PREFIX}مكتب الرشيد للمحاماة والاستشارات`;

type Role = "owner" | "admin" | "lawyer" | "legal_assistant" | "viewer";
type Account = { role: Role; email: string; fullName: string; userId: string; token: string };

const PEOPLE: { role: Role; email: string; fullName: string }[] = [
  { role: "owner", email: "qa.live.owner@mehlaqa.test", fullName: "عبدالعزيز بن سعود الرشيد" },
  { role: "admin", email: "qa.live.admin@mehlaqa.test", fullName: "نورة بنت فهد القحطاني" },
  { role: "lawyer", email: "qa.live.lawyer@mehlaqa.test", fullName: "محمد بن خالد العمري" },
  {
    role: "legal_assistant",
    email: "qa.live.assistant@mehlaqa.test",
    fullName: "ريم بنت ناصر الشهري",
  },
  { role: "viewer", email: "qa.live.viewer@mehlaqa.test", fullName: "سلطان بن عبدالله الدوسري" },
];

const FIRST_M = [
  "عبدالله",
  "محمد",
  "خالد",
  "فهد",
  "سعد",
  "تركي",
  "بندر",
  "ماجد",
  "نايف",
  "سلمان",
  "عمر",
  "ياسر",
  "راكان",
  "مشعل",
  "وليد",
];
const FIRST_F = ["نورة", "سارة", "لطيفة", "هيا", "منى", "دانة", "الجوهرة", "شهد", "أمل", "رنا"];
const FAMILY = [
  "العتيبي",
  "القحطاني",
  "الغامدي",
  "الشهري",
  "الدوسري",
  "الحربي",
  "الزهراني",
  "العمري",
  "المطيري",
  "السبيعي",
  "الشمري",
  "البلوي",
  "الجهني",
  "السهلي",
  "الخالدي",
];
const CITIES = [
  "الرياض",
  "جدة",
  "الدمام",
  "مكة المكرمة",
  "المدينة المنورة",
  "الخبر",
  "أبها",
  "تبوك",
  "بريدة",
  "الطائف",
];
const COMPANIES = [
  "شركة الأفق للتجارة",
  "مؤسسة البناء الحديث",
  "شركة نماء القابضة",
  "شركة الخليج للمقاولات",
  "مجموعة التقنية المتقدمة",
  "شركة الواحة الغذائية",
  "شركة درة العقارية",
  "مصنع الرياض للبلاستيك",
];
const GOV = [
  "أمانة منطقة الرياض",
  "الهيئة العامة للعقار",
  "وزارة الشؤون البلدية",
  "الهيئة السعودية للمياه",
];
const COURTS = [
  "المحكمة العامة بالرياض",
  "المحكمة التجارية بجدة",
  "محكمة الاستئناف بالرياض",
  "المحكمة العمالية بالدمام",
  "محكمة التنفيذ بالرياض",
  "ديوان المظالم",
];
const CASE_TYPES = [
  "مطالبة مالية",
  "نزاع تجاري",
  "قضية عمالية",
  "تنفيذ حكم",
  "نزاع عقاري",
  "اعتراض على قرار",
  "قضية أحوال شخصية",
  "تحكيم تجاري",
];

const rnd = <T>(a: T[], i: number) => a[i % a.length]!;
const pad = (n: number, w = 3) => String(n).padStart(w, "0");
const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

async function findUser(email: string) {
  const res = await adminFetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
  );
  const body = (await res.json()) as { users?: { id: string; email: string }[] };
  return body.users?.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
}

async function ensureUser(email: string, password: string, fullName: string) {
  const existing = await findUser(email);
  if (existing) {
    await adminFetch(`${SUPABASE_URL}/auth/v1/admin/users/${existing}`, {
      method: "PUT",
      body: JSON.stringify({
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      }),
    });
    return existing;
  }
  const res = await adminFetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    }),
  });
  if (!res.ok) throw new Error(`تعذّر إنشاء ${email} (${res.status}) ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

async function insertRows(table: string, rows: unknown[], returning = false) {
  const out: { id: string }[] = [];
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const res = await adminFetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...adminHeaders, Prefer: returning ? "return=representation" : "return=minimal" },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) throw new Error(`فشل إدخال ${table} (${res.status}) ${await res.text()}`);
    if (returning) out.push(...((await res.json()) as { id: string }[]));
  }
  return out;
}

async function cleanup() {
  const res = await adminFetch(
    `${SUPABASE_URL}/rest/v1/organizations?name=like.${encodeURIComponent(PREFIX + "%")}&select=id`,
  );
  const orgs = (await res.json()) as { id: string }[];
  for (const o of orgs) {
    await adminFetch(`${SUPABASE_URL}/rest/v1/organizations?id=eq.${o.id}`, { method: "DELETE" });
  }
  let users = 0;
  for (const p of PEOPLE) {
    const id = await findUser(p.email);
    if (!id) continue;
    await adminFetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { method: "DELETE" });
    users += 1;
  }
  console.log(`تنظيف: ${orgs.length} مكتب و${users} حساب.`);
}

async function setup() {
  await cleanup();
  const password = `Qa!${crypto.randomUUID()}`;
  const accounts: Account[] = [];
  for (const p of PEOPLE) {
    const userId = await ensureUser(p.email, password, p.fullName);
    const token = await signIn(p.email, password);
    accounts.push({ ...p, userId, token });
  }
  const owner = accounts[0]!;

  const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_organization_with_owner`, {
    method: "POST",
    headers: {
      apikey: PUBLISHABLE,
      Authorization: `Bearer ${owner.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      _name: ORG_NAME,
      _city: "الرياض",
      _legal_name: "مكتب الرشيد للمحاماة والاستشارات القانونية",
      _commercial_registration: "1010777888",
      _tax_number: "310777888900003",
      _phone: "0112345678",
      _email: "office@mehlaqa.test",
      _address: "طريق الملك فهد، برج الرشيد، الرياض",
    }),
  });
  const rpcBody = (await rpc.json()) as { organization_id?: string }[] | { message?: string };
  const organizationId = Array.isArray(rpcBody) ? rpcBody[0]?.organization_id : undefined;
  if (!organizationId) throw new Error(`تعذّر إنشاء المكتب: ${JSON.stringify(rpcBody)}`);

  // ترقية الاشتراك للباقة الاحترافية حتى تسمح الحصص بـ 5 أعضاء و36 قضية.
  const planRes = await adminFetch(
    `${SUPABASE_URL}/rest/v1/platform_plans?code=eq.professional&select=id,code,name_ar`,
  );
  const plan = ((await planRes.json()) as { id: string; code: string; name_ar: string }[])[0];
  if (!plan) throw new Error("الباقة الاحترافية غير متاحة");
  const sub = await adminFetch(
    `${SUPABASE_URL}/rest/v1/subscriptions?organization_id=eq.${organizationId}`,
    {
      method: "PATCH",
      headers: { ...adminHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({
        plan_id: plan.id,
        plan_code: plan.code,
        plan_label: plan.name_ar,
        ends_at: days(300),
        status: "active",
        billing_note: "QA LIVE volume fixture",
      }),
    },
  );
  if (!sub.ok) throw new Error(`تعذّر تهيئة الاشتراك (${sub.status}) ${await sub.text()}`);

  await insertRows(
    "organization_members",
    accounts.slice(1).map((a) => ({
      organization_id: organizationId,
      user_id: a.userId,
      role: a.role,
      status: "active",
    })),
  );

  // 150 عميلاً ببيانات كاملة
  const clients: Record<string, unknown>[] = [];
  for (let i = 1; i <= 150; i += 1) {
    const kind = i % 10 === 0 ? "government" : i % 5 === 0 ? "company" : "individual";
    const person = `${i % 3 === 0 ? rnd(FIRST_F, i) : rnd(FIRST_M, i)} بن ${rnd(FIRST_M, i + 2)} ${rnd(FAMILY, i)}`;
    const isIndividual = kind === "individual";
    const name = isIndividual
      ? person
      : kind === "company"
        ? `${rnd(COMPANIES, i)} ${pad(i)}`
        : `${rnd(GOV, i)} — فرع ${rnd(CITIES, i)}`;
    clients.push({
      organization_id: organizationId,
      client_type: kind,
      full_name: `${PREFIX}${name}`,
      company_name: isIndividual ? null : `${PREFIX}${name}`,
      national_id: isIndividual ? `10${pad(i, 8)}` : null,
      commercial_registration: isIndividual ? null : `10107${pad(i, 5)}`,
      email: `client${pad(i)}@mehlaqa.test`,
      phone: `05${pad(10_000_000 + i * 37, 8)}`.slice(0, 10),
      city: rnd(CITIES, i),
      address: `حي ${rnd(FAMILY, i + 1)}، شارع ${pad(i)}، ${rnd(CITIES, i)}`,
      notes: `ملف عميل تجريبي رقم ${i} — بيانات QA للاختبار الحي.`,
      status: i % 25 === 0 ? "inactive" : "active",
      created_by: owner.userId,
    });
  }
  const clientRows = await insertRows("clients", clients, true);

  // 36 قضية: 10 نشطة (open/in_progress) والبقية حالات أخرى
  const STATUSES = [
    ...Array<string>(5).fill("open"),
    ...Array<string>(5).fill("in_progress"),
    ...Array<string>(6).fill("waiting"),
    ...Array<string>(5).fill("judgment_issued"),
    ...Array<string>(5).fill("execution"),
    ...Array<string>(7).fill("closed"),
    ...Array<string>(3).fill("archived"),
  ];
  const lawyers = accounts.filter(
    (a) => a.role === "lawyer" || a.role === "owner" || a.role === "admin",
  );
  const caseRows = await insertRows(
    "cases",
    STATUSES.map((status, idx) => {
      const i = idx + 1;
      const closed = status === "closed" || status === "archived";
      return {
        organization_id: organizationId,
        client_id: clientRows[(i * 7) % clientRows.length]!.id,
        case_number: `${PREFIX}${4500 + i}/1447`,
        case_title: `${PREFIX}${rnd(CASE_TYPES, i)} — ${rnd(FAMILY, i)} ضد ${rnd(COMPANIES, i)}`,
        case_type: rnd(CASE_TYPES, i),
        client_role: rnd(
          ["plaintiff", "defendant", "appellant", "respondent", "execution_applicant"],
          i,
        ),
        court_name: rnd(COURTS, i),
        court_branch: `فرع ${rnd(CITIES, i)}`,
        judicial_circuit: `الدائرة ${(i % 12) + 1}`,
        judge_name: `القاضي ${rnd(FIRST_M, i)} ${rnd(FAMILY, i + 3)}`,
        opponent_name: `${rnd(COMPANIES, i + 1)}`,
        status,
        priority: rnd(["low", "medium", "high", "urgent"], i),
        assigned_lawyer_id: rnd(lawyers, i).userId,
        opened_at: days(-200 + i * 3).slice(0, 10),
        closed_at: closed ? days(-10 + (i % 5)).slice(0, 10) : null,
        next_action: closed
          ? null
          : `متابعة ${rnd(["مذكرة الرد", "لائحة الاعتراض", "طلب الخبرة", "تنفيذ الحكم"], i)}`,
        next_action_date: closed ? null : days(3 + (i % 20)),
        last_activity_at: days(-(i % 15)),
        description: `ملف قضية تجريبي ${i}: ${rnd(CASE_TYPES, i)} أمام ${rnd(COURTS, i)} بمبلغ مطالبة ${(i * 12_500).toLocaleString("en-US")} ريال.`,
        internal_notes: `ملاحظات داخلية للقضية ${i} — لا تُعرض للعميل.`,
        created_by: owner.userId,
      };
    }),
    true,
  );

  const active = caseRows.slice(0, 10);
  await insertRows(
    "hearings",
    active.flatMap((c, i) => [
      {
        organization_id: organizationId,
        case_id: c.id,
        title: `${PREFIX}جلسة مرافعة ${i + 1}`,
        hearing_date: days(4 + i * 2),
        court_name: rnd(COURTS, i),
        judicial_circuit: `الدائرة ${(i % 12) + 1}`,
        hearing_type: "مرافعة",
        location: `قاعة ${i + 1} — ${rnd(CITIES, i)}`,
        status: "scheduled",
        result: null,
        notes: "جلسة قادمة مجدولة (بيانات QA).",
        created_by: owner.userId,
      },
      {
        organization_id: organizationId,
        case_id: c.id,
        title: `${PREFIX}جلسة سابقة ${i + 1}`,
        hearing_date: days(-20 + i),
        court_name: rnd(COURTS, i),
        judicial_circuit: `الدائرة ${(i % 12) + 1}`,
        hearing_type: "أولى",
        location: `قاعة ${i + 1} — ${rnd(CITIES, i)}`,
        status: "completed",
        result: "تم تبادل المذكرات وتحديد جلسة قادمة.",
        notes: "جلسة منتهية (بيانات QA).",
        created_by: owner.userId,
      },
    ]),
  );

  await insertRows(
    "deadlines",
    active.map((c, i) => ({
      organization_id: organizationId,
      case_id: c.id,
      title: `${PREFIX}مهلة ${rnd(["تقديم مذكرة الرد", "الاعتراض على الحكم", "تقديم المستندات", "تقرير الخبير"], i)} ${i + 1}`,
      deadline_type: rnd(["objection", "appeal", "response", "submission", "expert_report"], i),
      due_date: days(2 + i * 3),
      status: "active",
      priority: rnd(["medium", "high", "urgent"], i),
      responsible_user_id: rnd(lawyers, i).userId,
      notes: "مهلة نظامية (بيانات QA).",
      created_by: owner.userId,
    })),
  );

  await insertRows(
    "tasks",
    active.flatMap((c, i) => [
      {
        organization_id: organizationId,
        case_id: c.id,
        title: `${PREFIX}إعداد مذكرة القضية ${i + 1}`,
        description: "صياغة المذكرة ومراجعة المستندات المرفقة.",
        assigned_to: rnd(lawyers, i).userId,
        created_by: owner.userId,
        due_date: days(1 + i),
        priority: rnd(["medium", "high", "urgent"], i),
        status: i % 3 === 0 ? "in_progress" : "pending",
        completed_at: null,
      },
      {
        organization_id: organizationId,
        case_id: c.id,
        title: `${PREFIX}مهمة منجزة ${i + 1}`,
        description: "تم تقديم الطلب للمحكمة.",
        assigned_to: rnd(lawyers, i + 1).userId,
        created_by: owner.userId,
        due_date: days(-5 + i),
        priority: "medium",
        status: "completed",
        completed_at: days(-4 + i),
      },
    ]),
  );

  await insertRows(
    "case_updates",
    caseRows.flatMap((c, i) => [
      {
        organization_id: organizationId,
        case_id: c.id,
        update_type: "case_created",
        title: "تسجيل القضية في النظام",
        description: "تم فتح الملف وربطه بالعميل.",
        event_date: days(-180 + i * 3),
        created_by: owner.userId,
        is_client_visible: true,
      },
      {
        organization_id: organizationId,
        case_id: c.id,
        update_type: "court_update",
        title: "تحديث من المحكمة",
        description: "قُيدت الدعوى وأحيلت للدائرة المختصة.",
        event_date: days(-60 + (i % 30)),
        created_by: owner.userId,
        is_client_visible: i % 2 === 0,
      },
      {
        organization_id: organizationId,
        case_id: c.id,
        update_type: "note",
        title: "ملاحظة داخلية",
        description: "استراتيجية الدفاع الداخلية — غير مرئية للعميل.",
        event_date: days(-30 + (i % 20)),
        created_by: owner.userId,
        is_client_visible: false,
      },
    ]),
  );

  await insertRows(
    "case_parties",
    caseRows.map((c, i) => ({
      organization_id: organizationId,
      case_id: c.id,
      party_name: `${PREFIX}${rnd(COMPANIES, i + 2)}`,
      party_type: i % 2 === 0 ? "company" : "individual",
      legal_role: i % 2 === 0 ? "المدعى عليه" : "المدعي",
      phone: `05${pad(20_000_000 + i * 91, 8)}`.slice(0, 10),
      email: `party${pad(i + 1)}@mehlaqa.test`,
      representative_name: `${rnd(FIRST_M, i)} ${rnd(FAMILY, i)}`,
      notes: "طرف قضية تجريبي (QA).",
    })),
  );

  // تحقق فعلي: قراءة بتوكن المالك عبر Data API مع RLS
  const counts: Record<string, number> = {};
  for (const t of [
    "clients",
    "cases",
    "hearings",
    "deadlines",
    "tasks",
    "case_updates",
    "case_parties",
  ]) {
    const r = await asUser(
      accounts[0]!.token,
      `/rest/v1/${t}?organization_id=eq.${organizationId}&select=id`,
    );
    counts[t] = Array.isArray(r.body) ? r.body.length : -1;
  }
  const activeRead = await asUser(
    owner.token,
    `/rest/v1/cases?organization_id=eq.${organizationId}&status=in.(open,in_progress)&select=id`,
  );
  counts["cases_active"] = Array.isArray(activeRead.body) ? activeRead.body.length : -1;

  await Bun.write(
    FILE,
    JSON.stringify(
      { organizationId, orgName: ORG_NAME, password, prefix: PREFIX, accounts, counts },
      null,
      2,
    ),
  );
  console.log("عدّادات المكتب (قراءة بتوكن المالك مع RLS):", counts);
  console.log(`المكتب جاهز — البيانات في ${FILE}`);
}

assertE2eEnvironmentSafe();
if (process.argv.includes("--cleanup")) await cleanup();
else await setup();

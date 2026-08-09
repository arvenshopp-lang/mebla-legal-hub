/**
 * FEATURE 01 — الصفحة العامة للمكتب: القبول النهائي (E2E / أمن / تزامن).
 *
 * كل خطوة تُنفَّذ بالمسارات ودوال الإنتاج نفسها. التشغيل:
 *   bun scripts/e2e/f01/acceptance.e2e.ts
 */
import {
  APP,
  check,
  del,
  fixtureBase64,
  office,
  one,
  payload,
  publicGet,
  rec,
  rest,
  results,
  sendEvent,
  submitLead,
  summarize,
  call,
  ADMIN_ORG_FNS,
  wait,
} from "./lib";
import { setupEnv, resetFeatureData, teardownStaff, SLUG_A, SLUG_B, CLIENT_TAG, type Env } from "./setup";
import { snapshotA } from "./content";

let env: Env;

const C = {
  journey: "1. الرحلة الكاملة",
  snapshot: "2. سلامة اللقطة",
  lead: "3. طلبات الاستشارة",
  conc: "4. التزامن",
  leak: "5. تسريب البيانات",
  rls: "6. العزل والصلاحيات",
  media: "7. أمن الوسائط",
  seo: "8. SEO والفهرسة",
  stats: "9. الإحصاءات",
  audit: "10. سجل التدقيق",
  platform: "11. إيقاف المنصة",
  ent: "12. الاستحقاق",
};

/* ------------------------------------------------------------------ أدوات */

const leadBody = (over: Record<string, unknown> = {}) => ({
  slug: SLUG_A,
  full_name: `${CLIENT_TAG} فهد الشمري`,
  phone: "0551112233",
  email: "fahad.qa@example.com",
  city: "الرياض",
  service_key: "commercial",
  message: "أحتاج استشارة بخصوص نزاع تجاري مع مورد.",
  preferred_contact: "whatsapp",
  consent: true,
  channel: "web",
  utm: { utm_source: "google", utm_medium: "cpc" },
  ...over,
});

async function pageRow() {
  return await one(`office_public_pages?select=*&organization_id=eq.${env.orgA}`);
}

/* ------------------------------------------------- 1. الرحلة الكاملة */

async function phaseJourney() {
  const state0 = await office("getOfficePageState", env.ownerA.token, { organizationId: env.orgA });
  check(C.journey, "قراءة الحالة الأولية للمكتب", state0.ok, state0.message);

  const slug = await office("changeOfficePageSlug", env.ownerA.token, {
    organizationId: env.orgA,
    slug: SLUG_A,
  });
  check(C.journey, "تعيين رابط الصفحة", slug.ok, slug.message);

  const reserved = await office("changeOfficePageSlug", env.ownerA.token, {
    organizationId: env.orgA,
    slug: "admin",
  });
  check(C.journey, "رفض رابط محجوز", reserved.denied, reserved.message);

  // نشر قبل اكتمال المحتوى يجب أن يُرفض برسالة عربية واضحة.
  const empty = await office("saveOfficePageDraft", env.ownerA.token, {
    organizationId: env.orgA,
    draft: snapshotA({ about: "قصير", services: [], headline: "" }),
  });
  check(C.journey, "حفظ مسودة ناقصة مسموح", empty.ok, empty.message);
  const blocked = await office("publishOfficePage", env.ownerA.token, { organizationId: env.orgA });
  check(
    C.journey,
    "منع نشر صفحة ناقصة برسالة عربية",
    blocked.denied && /مطلوب|قصير|أضف/.test(blocked.message),
    blocked.message,
  );

  const logo = await office("uploadOfficePageMedia", env.ownerA.token, {
    organizationId: env.orgA,
    kind: "logo",
    contentType: "image/jpeg",
    base64: await fixtureBase64("logo.jpg"),
  });
  const logoPath = payload<{ path?: string }>(logo.raw)?.path ?? "";
  check(C.journey, "رفع شعار المكتب", logo.ok && Boolean(logoPath), logo.message || logoPath);

  const cover = await office("uploadOfficePageMedia", env.ownerA.token, {
    organizationId: env.orgA,
    kind: "cover",
    contentType: "image/png",
    base64: await fixtureBase64("cover.png"),
  });
  const coverPath = payload<{ path?: string }>(cover.raw)?.path ?? "";
  check(C.journey, "رفع صورة الغلاف", cover.ok && Boolean(coverPath), cover.message || coverPath);

  const team = await office("uploadOfficePageMedia", env.ownerA.token, {
    organizationId: env.orgA,
    kind: "team",
    contentType: "image/webp",
    base64: await fixtureBase64("team.webp"),
  });
  const teamPath = payload<{ path?: string }>(team.raw)?.path ?? "";
  check(C.journey, "رفع صورة عضو الفريق", team.ok && Boolean(teamPath), team.message || teamPath);

  const full = snapshotA({
    logo_path: logoPath,
    cover_path: coverPath,
    team: [
      {
        name: "أ. سارة العتيبي",
        title: "محامية شريكة",
        bio: "خبرة 12 سنة في القضايا التجارية والتحكيم.",
        photo_path: teamPath,
        specialties: ["تجاري", "تحكيم"],
      },
    ],
  });
  const save = await office("saveOfficePageDraft", env.ownerA.token, {
    organizationId: env.orgA,
    draft: full,
  });
  check(C.journey, "حفظ المسودة الكاملة", save.ok, save.message);

  // قبل النشر: المسار العام غير متاح.
  const beforePublish = await publicGet(`/office/${SLUG_A}`);
  check(
    C.journey,
    "الصفحة غير متاحة قبل النشر",
    beforePublish.status !== 200 || !beforePublish.body.includes("مكتب القبول ألفا"),
    `status=${beforePublish.status}`,
  );

  const pub = await office("publishOfficePage", env.ownerA.token, { organizationId: env.orgA });
  check(C.journey, "نشر الصفحة", pub.ok, pub.message);

  const live = await publicGet(`/office/${SLUG_A}`);
  check(
    C.journey,
    "الصفحة المنشورة متاحة للزائر",
    live.status === 200 && live.body.includes("مكتب القبول ألفا"),
    `status=${live.status}`,
  );
  check(
    C.journey,
    "المحتوى المنشور يظهر كاملاً (خدمات + فريق + ساعات)",
    live.body.includes("القضايا التجارية") &&
      live.body.includes("سارة العتيبي") &&
      live.body.includes("الأحد"),
  );

  const unpub = await office("unpublishOfficePage", env.ownerA.token, { organizationId: env.orgA });
  check(C.journey, "إلغاء النشر", unpub.ok, unpub.message);
  const afterUnpub = await publicGet(`/office/${SLUG_A}`);
  check(
    C.journey,
    "الصفحة تختفي فوراً بعد إلغاء النشر",
    afterUnpub.status !== 200 || !afterUnpub.body.includes("مكتب القبول ألفا"),
    `status=${afterUnpub.status}`,
  );

  const missing = await publicGet(`/office/qa-f01-does-not-exist`);
  check(C.journey, "رابط غير موجود يعيد صفحة غير متاحة", missing.status !== 200 || missing.body.includes("غير متاحة"), `status=${missing.status}`);

  const republish = await office("publishOfficePage", env.ownerA.token, { organizationId: env.orgA });
  check(C.journey, "إعادة النشر", republish.ok, republish.message);
  const back = await publicGet(`/office/${SLUG_A}`);
  check(C.journey, "الصفحة تعود بعد إعادة النشر", back.status === 200 && back.body.includes("مكتب القبول ألفا"));
}

/* ------------------------------------------------- 2. سلامة اللقطة */

async function phaseSnapshot() {
  const before = (await pageRow())!;
  const versionBefore = before["version"] as number;

  const dirty = snapshotA({
    ...(before["draft"] as Record<string, unknown>),
    headline: "عنوان مسودة لم يُنشر بعد",
    about:
      "نص مسودة داخلي لا يجوز أن يظهر للزائر قبل النشر، ويجب أن يبقى محجوباً تماماً حتى ينشره المكتب صراحة.",
  });
  const save = await office("saveOfficePageDraft", env.ownerA.token, {
    organizationId: env.orgA,
    draft: dirty,
  });
  check(C.snapshot, "حفظ تعديل على المسودة بعد النشر", save.ok, save.message);

  const live = await publicGet(`/office/${SLUG_A}`);
  check(
    C.snapshot,
    "المسودة غير المنشورة لا تظهر للزائر",
    !live.body.includes("عنوان مسودة لم يُنشر بعد") && !live.body.includes("نص مسودة داخلي"),
  );
  const rowMid = (await pageRow())!;
  check(
    C.snapshot,
    "رقم النسخة لا يتغيّر بحفظ المسودة",
    (rowMid["version"] as number) === versionBefore,
    `${rowMid["version"]} مقابل ${versionBefore}`,
  );

  const pub = await office("publishOfficePage", env.ownerA.token, { organizationId: env.orgA });
  check(C.snapshot, "نشر التعديل", pub.ok, pub.message);
  const after = (await pageRow())!;
  check(
    C.snapshot,
    "رقم النسخة يزيد بواحد عند النشر",
    (after["version"] as number) === versionBefore + 1,
    `${after["version"]}`,
  );
  const live2 = await publicGet(`/office/${SLUG_A}`);
  check(C.snapshot, "التعديل يظهر بعد النشر", live2.body.includes("عنوان مسودة لم يُنشر بعد"));

  // إعادة المحتوى الأصلي للاختبارات اللاحقة.
  const restored = await pageRow();
  const logoPath = ((restored!["published"] as Record<string, unknown>)["logo_path"] as string) ?? "";
  const coverPath = ((restored!["published"] as Record<string, unknown>)["cover_path"] as string) ?? "";
  await office("saveOfficePageDraft", env.ownerA.token, {
    organizationId: env.orgA,
    draft: snapshotA({ logo_path: logoPath, cover_path: coverPath }),
  });
  const rePub = await office("publishOfficePage", env.ownerA.token, { organizationId: env.orgA });
  check(C.snapshot, "استعادة المحتوى المعتمد ونشره", rePub.ok, rePub.message);
}

/* ------------------------------------------------- 3. طلبات الاستشارة */

async function phaseLeads() {
  await del(`office_leads?organization_id=eq.${env.orgA}`);

  const ip = (v: string) => ({ "x-forwarded-for": v });

  const noConsent = await submitLead(leadBody({ consent: false }), ip("10.0.0.1"));
  check(
    C.lead,
    "رفض الطلب بلا موافقة صريحة",
    noConsent.status === 400 && /الموافقة/.test(noConsent.json.message ?? ""),
    noConsent.json.message,
  );

  const noPhone = await submitLead(leadBody({ phone: "" }), ip("10.0.0.2"));
  check(
    C.lead,
    "فرض رقم الجوال حسب إعداد النموذج",
    noPhone.status === 400 && /الجوال/.test(noPhone.json.message ?? ""),
    noPhone.json.message,
  );

  const badPhone = await submitLead(leadBody({ phone: "12" }), ip("10.0.0.3"));
  check(C.lead, "رفض رقم جوال غير صحيح", badPhone.status === 400, badPhone.json.message);

  const html = await submitLead(
    leadBody({ message: "<script>alert(1)</script> استشارة" }),
    ip("10.0.0.4"),
  );
  check(
    C.lead,
    "رفض الحقول التي تحتوي وسوم أو سكربت",
    html.status === 400 && /رموز(اً)? غير مسموحة/.test(html.json.message ?? ""),
    html.json.message,
  );

  const wrongSlug = await submitLead(leadBody({ slug: "qa-f01-nope" }), ip("10.0.0.5"));
  check(C.lead, "رفض طلب لرابط غير منشور", wrongSlug.status === 400, wrongSlug.json.message);

  const spoof = await submitLead(
    { ...leadBody(), organization_id: env.orgB, organizationId: env.orgB },
    ip("10.0.0.6"),
  );
  const spoofRow = await one(
    `office_leads?select=organization_id&order=created_at.desc&limit=1&organization_id=eq.${env.orgA}`,
  );
  check(
    C.lead,
    "تجاهل معرّف المكتب القادم من الزائر",
    spoof.status === 200 && Boolean(spoofRow),
    `status=${spoof.status}`,
  );
  const leakedToB = await rest(`office_leads?select=id&organization_id=eq.${env.orgB}`);
  check(C.lead, "لا يُكتب أي طلب لمكتب آخر", leakedToB.length === 0, `${leakedToB.length}`);

  await del(`office_leads?organization_id=eq.${env.orgA}`);

  const ok = await submitLead(leadBody(), ip("10.0.1.1"));
  check(
    C.lead,
    "قبول طلب صحيح ورسالة شكر من إعداد المكتب",
    ok.status === 200 && ok.json.ok === true && /خلال يوم عمل/.test(ok.json.message ?? ""),
    ok.json.message,
  );

  const stored = await one(`office_leads?select=*&organization_id=eq.${env.orgA}&limit=1`);
  check(
    C.lead,
    "تطبيع رقم الجوال للصيغة الدولية",
    stored?.["phone"] === "+966551112233",
    String(stored?.["phone"]),
  );
  check(
    C.lead,
    "حفظ إثبات الموافقة ونسخة السياسة وبصمة النص",
    Boolean(stored?.["consent_at"]) && Boolean(stored?.["consent_text_hash"]),
  );
  check(
    C.lead,
    "حفظ UTM المسموح فقط",
    (() => {
      const utm = (stored?.["utm"] ?? {}) as Record<string, string>;
      return (
        Object.keys(utm).length === 2 && utm["utm_source"] === "google" && utm["utm_medium"] === "cpc"
      );
    })(),
    JSON.stringify(stored?.["utm"]),
  );
  check(C.lead, "عدم تخزين عنوان IP صريح", !("ip" in (stored ?? {})) && typeof stored?.["ip_hash"] === "string");

  const dup = await submitLead(leadBody(), ip("10.0.1.1"));
  check(
    C.lead,
    "الطلب المكرر يُعاد كنجاح بلا صف جديد",
    dup.status === 200 && dup.json.duplicate === true,
    dup.json.message,
  );
  const count = await rest(`office_leads?select=id&organization_id=eq.${env.orgA}`);
  check(C.lead, "عدد الطلبات المخزّنة يبقى واحداً", count.length === 1, `${count.length}`);

  // حد المحاولات: 5 لكل عنوان خلال 10 دقائق.
  const rateIp = ip("10.0.9.9");
  let limited = "";
  for (let i = 0; i < 7; i++) {
    const r = await submitLead(leadBody({ full_name: `${CLIENT_TAG} محاولة ${i}` }), rateIp);
    if (r.status === 400 && /تجاوز عدد المحاولات/.test(r.json.message ?? "")) {
      limited = `توقف عند المحاولة ${i + 1}`;
      break;
    }
  }
  check(C.lead, "تفعيل حد المحاولات لكل عنوان", Boolean(limited), limited || "لم يُفعّل الحد");

  await del(`office_leads?organization_id=eq.${env.orgA}`);
}

/* ------------------------------------------------- 4. التزامن */

async function phaseConcurrency() {
  await del(`office_leads?organization_id=eq.${env.orgA}`);
  await del(`office_page_events?organization_id=eq.${env.orgA}`);

  const body = leadBody({ full_name: `${CLIENT_TAG} تزامن الطلبات`, message: "طلب متزامن للاختبار." });
  const parallel = await Promise.all(
    Array.from({ length: 6 }, () => submitLead(body, { "x-forwarded-for": "10.5.5.5" })),
  );
  const rows = await rest(`office_leads?select=id&organization_id=eq.${env.orgA}`);
  check(
    C.conc,
    "٦ طلبات متطابقة متزامنة تُنتج صفاً واحداً",
    rows.length === 1,
    `${rows.length} صف / حالات: ${parallel.map((p) => p.status).join(",")}`,
  );
  check(
    C.conc,
    "كل الردود المتزامنة ناجحة بلا خطأ تقني",
    parallel.every((p) => p.status === 200),
  );
  const notif = await rest(
    `notifications?select=id,dedup_key&organization_id=eq.${env.orgA}&type=eq.office_lead_created`,
  );
  const uniqueKeys = new Set(notif.map((n) => n["dedup_key"] as string));
  check(
    C.conc,
    "لا تكرار في إشعارات المكتب",
    notif.length === uniqueKeys.size,
    `${notif.length} إشعار / ${uniqueKeys.size} مفتاح`,
  );

  // أحداث متزامنة على العدّاد نفسه.
  const events = await Promise.all(
    Array.from({ length: 12 }, () => sendEvent({ slug: SLUG_A, kind: "view", channel: "web" })),
  );
  check(C.conc, "مسار الأحداث يتحمّل التزامن", events.every((s) => s === 204 || s === 200), events.join(","));
  const evRows = await rest(
    `office_page_events?select=kind,channel,count&organization_id=eq.${env.orgA}&kind=eq.view`,
  );
  const total = evRows.reduce((s, r) => s + Number(r["count"] ?? 0), 0);
  check(C.conc, "عدّاد المشاهدات ذرّي بلا فقد", total === 12, `المجموع=${total} صفوف=${evRows.length}`);

  // نشر متزامن.
  const beforeVersion = (await pageRow())!["version"] as number;
  const pubs = await Promise.all([
    office("publishOfficePage", env.ownerA.token, { organizationId: env.orgA }),
    office("publishOfficePage", env.ownerA.token, { organizationId: env.orgA }),
  ]);
  const afterRow = (await pageRow())!;
  check(
    C.conc,
    "نشر متزامن لا يُفسد اللقطة",
    pubs.some((p) => p.ok) && Boolean(afterRow["published"]) && (afterRow["version"] as number) >= beforeVersion + 1,
    `النسخة ${beforeVersion} → ${afterRow["version"]}`,
  );
  const liveAfter = await publicGet(`/office/${SLUG_A}`);
  check(C.conc, "الصفحة العامة سليمة بعد النشر المتزامن", liveAfter.status === 200 && liveAfter.body.includes("مكتب القبول ألفا"));

  // تسابق على الرابط نفسه بين مكتبين.
  const raceSlug = "qa-f01-race";
  await del(`office_public_pages?slug=eq.${raceSlug}`);
  const race = await Promise.all([
    office("changeOfficePageSlug", env.ownerA.token, { organizationId: env.orgA, slug: raceSlug }),
    office("changeOfficePageSlug", env.ownerB.token, { organizationId: env.orgB, slug: raceSlug }),
  ]);
  const winners = race.filter((r) => r.ok).length;
  const holders = await rest(`office_public_pages?select=organization_id&slug=eq.${raceSlug}`);
  check(
    C.conc,
    "الرابط الفريد لا يُمنح لمكتبين",
    winners <= 1 && holders.length <= 1,
    `ناجح=${winners} مالكون=${holders.length} :: ${race.map((r) => r.message).filter(Boolean).join(" | ")}`,
  );
  // استعادة رابط المكتب أ.
  await office("changeOfficePageSlug", env.ownerA.token, { organizationId: env.orgA, slug: SLUG_A });
  await office("publishOfficePage", env.ownerA.token, { organizationId: env.orgA });

  // تحويل متزامن لطلب واحد.
  await del(`clients?organization_id=eq.${env.orgA}&full_name=like.*${CLIENT_TAG}*`);
  const lead = await one(`office_leads?select=id&organization_id=eq.${env.orgA}&limit=1`);
  if (!lead) {
    rec(C.conc, "تحويل متزامن لطلب واحد", "BLOCKED", "لا يوجد طلب للتحويل");
  } else {
    const conv = await Promise.all([
      office("convertOfficeLead", env.ownerA.token, { organizationId: env.orgA, leadId: lead["id"] }),
      office("convertOfficeLead", env.ownerA.token, { organizationId: env.orgA, leadId: lead["id"] }),
    ]);
    const clients = await rest(
      `clients?select=id&organization_id=eq.${env.orgA}&full_name=like.*${CLIENT_TAG}*`,
    );
    check(
      C.conc,
      "تحويل متزامن ينشئ عميلاً واحداً فقط",
      clients.length === 1,
      `${clients.length} عميل / ${conv.map((c) => (c.ok ? "ok" : c.message)).join(" | ")}`,
    );
    const leadAfter = await one(`office_leads?select=status,converted_client_id&id=eq.${lead["id"]}`);
    check(
      C.conc,
      "الطلب يُوسم محوّلاً ومرتبطاً بالعميل",
      leadAfter?.["status"] === "converted" && Boolean(leadAfter?.["converted_client_id"]),
      JSON.stringify(leadAfter),
    );
  }
}

/* ------------------------------------------------- 5. تسريب البيانات */

async function phaseLeak() {
  const live = await publicGet(`/office/${SLUG_A}`);
  const body = live.body;
  const secrets = [
    env.orgA,
    env.ownerA.id,
    env.ownerA.email,
    "office_leads",
    "supabase.co",
    "service_role",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  for (const s of secrets) {
    check(C.leak, `لا يظهر «${s.slice(0, 24)}» في الصفحة العامة`, !body.includes(s));
  }
  check(C.leak, "لا تظهر بيانات الطلبات في الصفحة العامة", !body.includes("فهد الشمري") && !body.includes("تزامن الطلبات"));

  const otherOrgPage = await publicGet(`/office/${SLUG_B}`);
  check(
    C.leak,
    "رابط مكتب غير منشور لا يكشف شيئاً",
    otherOrgPage.status !== 200 || !otherOrgPage.body.includes("مكتب"),
    `status=${otherOrgPage.status}`,
  );

  for (const attack of [
    `/api/public/office/media/${SLUG_A}/../../etc/passwd`,
    `/api/public/office/media/${SLUG_A}/..%2f..%2fpasswd`,
    `/api/public/office/media/${SLUG_A}/v1/${env.orgB}.jpg`,
    `/api/public/office/media/${SLUG_A}/`,
  ]) {
    const res = await publicGet(attack);
    check(C.leak, `منع محاولة الوصول: ${attack.slice(0, 60)}`, res.status !== 200, `status=${res.status}`);
  }

  const evilEvent = await sendEvent({ slug: SLUG_A, kind: "../../admin", channel: "web" });
  const evilEvent2 = await sendEvent({ slug: "qa-f01-nope", kind: "view", channel: "web" });
  check(C.leak, "الأحداث المجهولة لا تكشف حالة الصفحة", (evilEvent === 204 || evilEvent === 200) && (evilEvent2 === 204 || evilEvent2 === 200), `${evilEvent}/${evilEvent2}`);
  const badKinds = await rest(`office_page_events?select=kind&organization_id=eq.${env.orgA}&kind=not.in.(view,lead,call,whatsapp,email,directions,share)`);
  check(C.leak, "لا تُسجَّل أنواع أحداث غير معروفة", badKinds.length === 0, JSON.stringify(badKinds));

  const evCols = await one(`office_page_events?select=*&organization_id=eq.${env.orgA}&limit=1`);
  const forbidden = ["ip", "ip_hash", "user_agent", "referrer", "visitor_id", "email", "phone"];
  check(
    C.leak,
    "جدول الأحداث بلا أي بيانات تعريف للزائر",
    forbidden.every((k) => !(k in (evCols ?? {}))),
    Object.keys(evCols ?? {}).join(","),
  );
}

/* ------------------------------------------------- 6. العزل والصلاحيات */

async function phaseRls() {
  const cases: Array<[string, string, unknown]> = [
    ["قراءة حالة صفحة مكتب آخر", "getOfficePageState", { organizationId: env.orgA }],
    ["قراءة طلبات مكتب آخر", "listOfficeLeads", { organizationId: env.orgA }],
    ["قراءة إحصاءات مكتب آخر", "getOfficePageAnalytics", { organizationId: env.orgA, days: 30 }],
    ["حفظ مسودة مكتب آخر", "saveOfficePageDraft", { organizationId: env.orgA, draft: snapshotA() }],
    ["نشر صفحة مكتب آخر", "publishOfficePage", { organizationId: env.orgA }],
    ["تغيير رابط مكتب آخر", "changeOfficePageSlug", { organizationId: env.orgA, slug: "qa-f01-hijack" }],
    ["معاينة صفحة مكتب آخر", "previewOfficePage", { organizationId: env.orgA }],
  ];
  for (const [label, fn, data] of cases) {
    const res = await office(fn, env.ownerB.token, data);
    const leaked = res.ok && /مكتب القبول ألفا/.test(res.raw);
    check(C.rls, `منع مكتب آخر من: ${label}`, res.denied && !leaked, res.message.slice(0, 120));
  }

  const lead = await one(`office_leads?select=id&organization_id=eq.${env.orgA}&limit=1`);
  if (lead) {
    const crossLead = await office("updateOfficeLead", env.ownerB.token, {
      organizationId: env.orgA,
      leadId: lead["id"],
      status: "archived",
    });
    check(C.rls, "منع مكتب آخر من تعديل طلب ليس له", crossLead.denied, crossLead.message);
    const crossConvert = await office("convertOfficeLead", env.ownerB.token, {
      organizationId: env.orgB,
      leadId: lead["id"],
    });
    check(C.rls, "منع تحويل طلب مكتب آخر عبر تبديل المعرّفات", crossConvert.denied, crossConvert.message);
  } else {
    rec(C.rls, "اختبارات الطلبات عبر المكاتب", "BLOCKED", "لا يوجد طلب");
  }

  // المشاهد: يقرأ ولا يكتب.
  const viewerRead = await office("getOfficePageState", env.viewerA.token, { organizationId: env.orgA });
  check(C.rls, "المشاهد يقرأ حالة الصفحة", viewerRead.ok, viewerRead.message);
  const viewerWrites: Array<[string, string, unknown]> = [
    ["حفظ المسودة", "saveOfficePageDraft", { organizationId: env.orgA, draft: snapshotA() }],
    ["النشر", "publishOfficePage", { organizationId: env.orgA }],
    ["إلغاء النشر", "unpublishOfficePage", { organizationId: env.orgA }],
    ["تغيير الرابط", "changeOfficePageSlug", { organizationId: env.orgA, slug: "qa-f01-viewer" }],
    [
      "رفع وسائط",
      "uploadOfficePageMedia",
      { organizationId: env.orgA, kind: "logo", contentType: "image/jpeg", base64: "" },
    ],
  ];
  for (const [label, fn, data] of viewerWrites) {
    const body =
      fn === "uploadOfficePageMedia"
        ? { ...(data as object), base64: await fixtureBase64("logo.jpg") }
        : data;
    const res = await office(fn, env.viewerA.token, body);
    check(C.rls, `منع المشاهد من: ${label}`, res.denied, res.message.slice(0, 120));
  }

  // بلا توكن إطلاقاً.
  const anon = await office("getOfficePageState", undefined, { organizationId: env.orgA });
  check(C.rls, "منع الزائر المجهول من دوال الإدارة", anon.denied, `status=${anon.status}`);

  // منع الوصول المباشر لجداول الميزة بمفتاح anon.
  const { PUBLISHABLE, SUPABASE_URL } = await import("./lib");
  for (const table of ["office_leads", "office_public_pages", "office_page_events"]) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
      headers: { apikey: PUBLISHABLE },
    });
    const text = await res.text();
    check(
      C.rls,
      `منع القراءة المباشرة لجدول ${table} بمفتاح عام`,
      res.status !== 200 || text === "[]",
      `status=${res.status} ${text.slice(0, 80)}`,
    );
  }
}

/* ------------------------------------------------- 7. أمن الوسائط */

async function phaseMedia() {
  const fake = await office("uploadOfficePageMedia", env.ownerA.token, {
    organizationId: env.orgA,
    kind: "logo",
    contentType: "image/png",
    base64: await fixtureBase64("fake.png"),
  });
  check(C.media, "رفض ملف نوعه المعلن يخالف بايتاته", fake.denied, fake.message);

  const notImage = await office("uploadOfficePageMedia", env.ownerA.token, {
    organizationId: env.orgA,
    kind: "logo",
    contentType: "image/jpeg",
    base64: await fixtureBase64("notimage.bin"),
  });
  check(C.media, "رفض ملف ليس صورة", notImage.denied, notImage.message);

  const oversized = await office("uploadOfficePageMedia", env.ownerA.token, {
    organizationId: env.orgA,
    kind: "cover",
    contentType: "image/jpeg",
    base64: await fixtureBase64("mid.jpg"),
  });
  check(C.media, "رفض صورة تتجاوز الحد المسموح", oversized.denied, oversized.message);

  const svg = await office("uploadOfficePageMedia", env.ownerA.token, {
    organizationId: env.orgA,
    kind: "logo",
    contentType: "image/svg+xml",
    base64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString("base64"),
  });
  check(C.media, "رفض SVG القابل لتنفيذ سكربت", svg.denied, svg.message);

  // الصورة المنشورة تُخدم عبر المسار العام فقط، ومنزوعة البيانات الوصفية.
  const row = (await pageRow())!;
  const published = row["published"] as Record<string, unknown>;
  const logoPath = (published["logo_path"] as string) ?? "";
  const rest2 = logoPath.split("/").slice(1).join("/");
  const media = await publicGet(`/api/public/office/media/${SLUG_A}/${rest2}`);
  check(C.media, "الوسائط المنشورة تُخدم للزائر", media.status === 200, `status=${media.status} ${logoPath}`);
  const bytes = Buffer.from(media.body, "binary");
  check(
    C.media,
    "نزع البيانات الوصفية (EXIF) من الصورة المنشورة",
    !bytes.includes(Buffer.from("Exif")),
  );
  check(
    C.media,
    "ترويسة نوع المحتوى صورة",
    (media.headers.get("content-type") ?? "").startsWith("image/"),
    media.headers.get("content-type") ?? "",
  );

  const unreferenced = await publicGet(`/api/public/office/media/${SLUG_A}/v0/not-referenced.jpg`);
  check(C.media, "منع وسائط غير مرجعية في اللقطة المنشورة", unreferenced.status !== 200, `status=${unreferenced.status}`);

  const { SUPABASE_URL, PUBLISHABLE } = await import("./lib");
  const bucketList = await fetch(`${SUPABASE_URL}/storage/v1/object/list/office-public`, {
    method: "POST",
    headers: { apikey: PUBLISHABLE, "content-type": "application/json" },
    body: JSON.stringify({ prefix: "", limit: 5 }),
  });
  const listBody = await bucketList.text();
  check(
    C.media,
    "لا يمكن سرد محتوى مستودع الوسائط بمفتاح عام",
    bucketList.status !== 200 || listBody === "[]",
    `status=${bucketList.status} ${listBody.slice(0, 80)}`,
  );
  const direct = await fetch(`${SUPABASE_URL}/storage/v1/object/public/office-public/${logoPath}`);
  check(C.media, "لا وصول مباشر عام لمسار التخزين", direct.status !== 200, `status=${direct.status}`);
}

/* ------------------------------------------------- 8. SEO */

async function phaseSeo() {
  const live = await publicGet(`/office/${SLUG_A}`);
  const head = live.body;
  check(C.seo, "عنوان الصفحة من إعداد المكتب", /<title>[^<]*مكتب القبول ألفا/.test(head), (head.match(/<title>[^<]*/) ?? [""])[0]);
  check(C.seo, "وصف الصفحة موجود", /name="description"\s+content="[^"]{40,}/.test(head) || /content="[^"]{40,}"\s+name="description"/.test(head));
  check(C.seo, "رابط قانوني يشير للصفحة نفسها", head.includes(`https://mehlalex.com/office/${SLUG_A}`));
  check(C.seo, "وسوم OG كاملة", head.includes('property="og:title"') && head.includes('property="og:description"') && head.includes('property="og:url"'));
  check(C.seo, "بطاقة تويتر", head.includes('name="twitter:card"'));
  check(C.seo, "بيانات منظّمة LegalService", /application\/ld\+json/.test(head) && /LegalService|LocalBusiness|Attorney/.test(head));
  check(C.seo, "الصفحة المنشورة قابلة للفهرسة", !/name="robots"[^>]*noindex/.test(head));
  check(C.seo, "اتجاه الصفحة RTL ولغتها العربية", /dir="rtl"/.test(head) && /lang="ar"/.test(head));

  const sitemap = await publicGet("/sitemap.xml");
  check(C.seo, "خريطة الموقع تتضمن الصفحة المنشورة", sitemap.body.includes(`/office/${SLUG_A}`));
  check(C.seo, "خريطة الموقع لا تتضمن مكاتب غير منشورة", !sitemap.body.includes(`/office/${SLUG_B}`));

  const robots = await publicGet("/robots.txt");
  check(C.seo, "robots لا يحجب مسار المكاتب", !/Disallow:\s*\/office/i.test(robots.body) && !/Disallow:\s*\/\s*$/m.test(robots.body), robots.body.slice(0, 120));

  const missing = await publicGet("/office/qa-f01-nope");
  check(C.seo, "الروابط غير المتاحة غير قابلة للفهرسة", /noindex/.test(missing.body) || missing.status === 404, `status=${missing.status}`);
}

/* ------------------------------------------------- 9. الإحصاءات */

async function phaseStats() {
  await del(`office_page_events?organization_id=eq.${env.orgA}`);
  for (const kind of ["view", "call", "whatsapp", "email", "map", "lead"]) {
    await sendEvent({ slug: SLUG_A, kind, channel: "web" });
  }
  const analytics = await office("getOfficePageAnalytics", env.ownerA.token, {
    organizationId: env.orgA,
    days: 30,
  });
  check(C.stats, "قراءة الإحصاءات لصاحب المكتب", analytics.ok, analytics.message);
  check(
    C.stats,
    "الإحصاءات تعكس الأحداث الحقيقية",
    /"view"|view/.test(analytics.raw) && /whatsapp/.test(analytics.raw),
  );
  const rows = await rest(`office_page_events?select=kind,count&organization_id=eq.${env.orgA}`);
  check(C.stats, "تسجيل الأنواع الستة", new Set(rows.map((r) => r["kind"])).size === 6, JSON.stringify(rows));
}

/* ------------------------------------------------- 10. سجل التدقيق */

async function phaseAudit() {
  const logs = await rest(
    `activity_logs?select=action,description,created_at&organization_id=eq.${env.orgA}&action=like.office_page*&order=created_at.desc&limit=100`,
  );
  const actions = new Set(logs.map((l) => l["action"] as string));
  for (const a of ["office_page.publish", "office_page.unpublish", "office_page.slug.change", "office_page.lead.convert"]) {
    check(C.audit, `تسجيل الإجراء ${a}`, actions.has(a), [...actions].join(","));
  }
  const immutable = await rest(
    `activity_logs?id=eq.${(logs[0]?.["id"] as string) ?? "00000000-0000-0000-0000-000000000000"}`,
    { method: "DELETE" },
  ).then(
    () => false,
    () => true,
  );
  check(C.audit, "سجل النشاط محمي من الحذف", immutable || logs.length > 0);
}

/* ------------------------------------------------- 11. إيقاف المنصة */

async function phasePlatform() {
  const state = await call(ADMIN_ORG_FNS, "getOfficePagePlatformState", env.staff.token, {
    organizationId: env.orgA,
  });
  check(C.platform, "قراءة حالة الصفحة من لوحة المنصة", state.ok, state.message);

  const denied = await call(ADMIN_ORG_FNS, "setOfficePageSuspension", env.ownerA.token, {
    organizationId: env.orgA,
    suspended: true,
    reason: "محاولة من مالك مكتب",
  });
  check(C.platform, "منع مالك المكتب من إيقاف صفحته إدارياً", denied.denied, denied.message);

  const noReason = await call(ADMIN_ORG_FNS, "setOfficePageSuspension", env.staff.token, {
    organizationId: env.orgA,
    suspended: true,
  });
  check(C.platform, "إلزام سبب الإيقاف", noReason.denied, noReason.message);

  const suspend = await call(ADMIN_ORG_FNS, "setOfficePageSuspension", env.staff.token, {
    organizationId: env.orgA,
    suspended: true,
    reason: "اختبار قبول: محتوى مخالف",
  });
  check(C.platform, "إيقاف الصفحة من المنصة", suspend.ok, suspend.message);

  const live = await publicGet(`/office/${SLUG_A}`);
  check(C.platform, "الصفحة الموقوفة تختفي من العرض العام", live.status !== 200 || !live.body.includes("مكتب القبول ألفا"), `status=${live.status}`);
  const leadWhileSuspended = await submitLead(leadBody({ full_name: `${CLIENT_TAG} أثناء الإيقاف` }), {
    "x-forwarded-for": "10.7.7.7",
  });
  check(C.platform, "رفض الطلبات أثناء الإيقاف", leadWhileSuspended.status === 400, leadWhileSuspended.json.message);
  const republish = await office("publishOfficePage", env.ownerA.token, { organizationId: env.orgA });
  check(C.platform, "منع المكتب من إعادة النشر أثناء الإيقاف", republish.denied, republish.message);
  const sitemap = await publicGet("/sitemap.xml");
  check(C.platform, "خريطة الموقع تستبعد الصفحة الموقوفة", !sitemap.body.includes(`/office/${SLUG_A}`));

  const auditRow = await one(
    `admin_audit_logs?select=action,entity_type&action=eq.office_page.platform_suspend&order=created_at.desc&limit=1`,
  );
  check(C.platform, "تسجيل الإيقاف في تدقيق الإدارة", Boolean(auditRow), JSON.stringify(auditRow));

  const restore = await call(ADMIN_ORG_FNS, "setOfficePageSuspension", env.staff.token, {
    organizationId: env.orgA,
    suspended: false,
  });
  check(C.platform, "إعادة عرض الصفحة", restore.ok, restore.message);
  const back = await publicGet(`/office/${SLUG_A}`);
  check(C.platform, "الصفحة تعود بعد رفع الإيقاف", back.status === 200 && back.body.includes("مكتب القبول ألفا"));
}

/* ------------------------------------------------- 12. الاستحقاق */

async function phaseEntitlement() {
  const sub = await one(`subscriptions?select=id,status,ends_at&organization_id=eq.${env.orgA}&limit=1`);
  if (!sub) return rec(C.ent, "اختبار انتهاء الاشتراك", "BLOCKED", "لا يوجد اشتراك");
  const original = { status: sub["status"], ends_at: sub["ends_at"] };

  await rest(`subscriptions?id=eq.${sub["id"]}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "expired", ends_at: new Date(Date.now() - 86400_000).toISOString() }),
  });
  await wait(300);

  const live = await publicGet(`/office/${SLUG_A}`);
  check(C.ent, "الصفحة تُحجب عند انتهاء الاشتراك", live.status !== 200 || !live.body.includes("مكتب القبول ألفا"), `status=${live.status}`);
  const lead = await submitLead(leadBody({ full_name: `${CLIENT_TAG} بعد الانتهاء` }), {
    "x-forwarded-for": "10.8.8.8",
  });
  check(C.ent, "رفض الطلبات بعد انتهاء الاشتراك", lead.status === 400, lead.json.message);
  const pub = await office("publishOfficePage", env.ownerA.token, { organizationId: env.orgA });
  check(C.ent, "منع النشر بلا استحقاق برسالة عربية", pub.denied && pub.message.length > 5, pub.message);
  const sitemap = await publicGet("/sitemap.xml");
  check(C.ent, "خريطة الموقع تستبعد المكتب غير المستحق", !sitemap.body.includes(`/office/${SLUG_A}`));

  await rest(`subscriptions?id=eq.${sub["id"]}`, { method: "PATCH", body: JSON.stringify(original) });
  await wait(300);
  const restored = await publicGet(`/office/${SLUG_A}`);
  check(C.ent, "عودة الصفحة بعد تجديد الاشتراك", restored.status === 200 && restored.body.includes("مكتب القبول ألفا"), `status=${restored.status}`);
}

/* ------------------------------------------------------------------ التشغيل */

async function main() {
  console.log(`الهدف: ${APP}`);
  env = await setupEnv();
  console.log(`مكتب أ=${env.orgA.slice(0, 8)} مكتب ب=${env.orgB.slice(0, 8)}`);

  const phases: Array<[string, () => Promise<void>]> = [
    [C.journey, phaseJourney],
    [C.snapshot, phaseSnapshot],
    [C.lead, phaseLeads],
    [C.conc, phaseConcurrency],
    [C.leak, phaseLeak],
    [C.rls, phaseRls],
    [C.media, phaseMedia],
    [C.seo, phaseSeo],
    [C.stats, phaseStats],
    [C.audit, phaseAudit],
    [C.platform, phasePlatform],
    [C.ent, phaseEntitlement],
  ];

  for (const [name, fn] of phases) {
    console.log(`\n——— ${name} ———`);
    try {
      await fn();
    } catch (error) {
      rec(name, "تنفيذ المرحلة", "FAIL", error instanceof Error ? error.message : String(error));
    }
  }

  await teardownStaff(env.staff.id);
  const { fail, blocked } = summarize();
  await Bun.write("/tmp/browser/f01/report.json", JSON.stringify(results, null, 2));
  process.exit(fail + blocked === 0 ? 0 : 1);
}

await main();

export { resetFeatureData };
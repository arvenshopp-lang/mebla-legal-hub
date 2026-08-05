/**
 * تدوير مفاتيح تشفير الحقول الحساسة وإعادة التشفير التدريجية — خادم فقط.
 *
 * الضمانات:
 *  • لا تُحذف مادة المفتاح القديم؛ تبقى للقراءة حتى انتقال كل الصفوف.
 *  • البيانات الجديدة تُكتب دائماً بأحدث إصدار متاح فعلياً على الخادم.
 *  • إعادة التشفير تعمل على دفعات قابلة للاستئناف؛ الصف الذي يفشل فكّه يُترك
 *    كما هو (لا فقدان بيانات) ويُحتسب في عدّاد الإخفاقات مع سبب مُطهَّر.
 *  • تقاعد الإصدار القديم يمنعه تريجر قاعدة البيانات ما دام مرتبطاً بصفوف.
 *  • لا يُكتب أي مفتاح خام في قاعدة البيانات أو السجلات أو الواجهة.
 */
import {
  activePiiKeyVersion,
  hasKeyMaterial,
  keyMaterialPresence,
  reencryptValue,
} from "./pii.server";
import type { PiiField } from "./pii.shared";

const ENTITIES = ["clients", "case_parties"] as const;
export type RotationEntity = (typeof ENTITIES)[number];

const FIELDS: PiiField[] = ["national_id", "commercial_registration"];
const MAX_SCAN_VERSIONS = 12;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

async function countRows(entity: RotationEntity, version: number): Promise<number> {
  const db = await admin();
  const { count } = await db
    .from(entity)
    .select("id", { count: "exact", head: true })
    .eq("pii_key_version", version);
  return count ?? 0;
}

export type KeyVersionStatus = {
  key_version: number;
  status: string;
  purpose: string;
  activated_at: string | null;
  retired_at: string | null;
  master_key_present: boolean;
  blind_index_key_present: boolean;
  secret_names: string[];
  rows: { clients: number; case_parties: number; total: number };
  is_active_for_writes: boolean;
};

/** حالة كل إصدار مفتاح: تسجيله، توفر مادته، وعدد الصفوف المرتبطة به. */
export async function keyVersionsStatus(): Promise<{
  activeVersion: number;
  versions: KeyVersionStatus[];
}> {
  const db = await admin();
  const activeVersion = activePiiKeyVersion();
  const { data: registry } = await db
    .from("encryption_key_registry")
    .select("key_version, purpose, status, activated_at, retired_at")
    .order("key_version", { ascending: true });

  const registered = new Map<number, Record<string, unknown>>();
  for (const row of (registry ?? []) as Record<string, unknown>[]) {
    registered.set(Number(row["key_version"]), row);
  }

  const candidates = new Set<number>([activeVersion, ...registered.keys()]);
  for (let v = 1; v <= MAX_SCAN_VERSIONS; v += 1) if (hasKeyMaterial(v)) candidates.add(v);

  const versions: KeyVersionStatus[] = [];
  for (const version of Array.from(candidates).sort((a, b) => a - b)) {
    const row = registered.get(version);
    const presence = keyMaterialPresence(version);
    const [clients, caseParties] = await Promise.all([
      countRows("clients", version),
      countRows("case_parties", version),
    ]);
    versions.push({
      key_version: version,
      status: (row?.["status"] as string) ?? "unregistered",
      purpose: (row?.["purpose"] as string) ?? "pii_field_encryption",
      activated_at: (row?.["activated_at"] as string) ?? null,
      retired_at: (row?.["retired_at"] as string) ?? null,
      master_key_present: presence.master_key_present,
      blind_index_key_present: presence.blind_index_key_present,
      secret_names: presence.secret_names,
      rows: { clients, case_parties: caseParties, total: clients + caseParties },
      is_active_for_writes: version === activeVersion,
    });
  }
  return { activeVersion, versions };
}

/** يسجّل إصداراً جديداً ويحوّل الإصدارات الأقدم إلى «قراءة فقط». */
export async function registerKeyVersion(version: number, staffUserId: string) {
  if (!hasKeyMaterial(version)) {
    throw new Error(
      `مادة المفتاح للإصدار ${version} غير متوفرة على الخادم. أضف السرّين MEHLA_MASTER_KEY_V${version} و MEHLA_BLIND_INDEX_KEY_V${version} أولاً.`,
    );
  }
  const db = await admin();
  const { error } = await db.from("encryption_key_registry").upsert(
    {
      key_version: version,
      purpose: "pii_field_encryption",
      algorithm: "AES-256-GCM",
      derivation: "HKDF-SHA256 per organization/field",
      secret_name: `MEHLA_MASTER_KEY_V${version}`,
      status: "active",
      activated_at: new Date().toISOString(),
      rotated_by: staffUserId,
    },
    { onConflict: "key_version" },
  );
  if (error) throw new Error("تعذّر تسجيل إصدار المفتاح.");

  const { error: demoteError } = await db
    .from("encryption_key_registry")
    .update({ status: "read_only" })
    .lt("key_version", version)
    .eq("status", "active");
  if (demoteError) throw new Error("تعذّر تحويل الإصدارات السابقة إلى قراءة فقط.");
  return keyVersionsStatus();
}

/** تقاعد إصدار: يمنعه تريجر القاعدة إذا بقي أي صف مرتبط به. */
export async function retireKeyVersion(version: number) {
  const activeVersion = activePiiKeyVersion();
  if (version === activeVersion) throw new Error("لا يمكن تقاعد الإصدار النشط للكتابة.");
  const db = await admin();
  const { error } = await db
    .from("encryption_key_registry")
    .update({ status: "retired" })
    .eq("key_version", version);
  if (error) {
    if (/KEY_VERSION_STILL_IN_USE/.test(error.message ?? "")) {
      throw new Error("لا يمكن تقاعد هذا الإصدار قبل إعادة تشفير جميع البيانات المرتبطة به.");
    }
    throw new Error("تعذّر تقاعد الإصدار.");
  }
  return keyVersionsStatus();
}

export type BatchResult = {
  jobId: string;
  entity: RotationEntity;
  fromVersion: number;
  toVersion: number;
  processedNow: number;
  failedNow: number;
  processedTotal: number;
  failedTotal: number;
  remaining: number;
  status: "running" | "completed" | "failed";
};

/**
 * دفعة إعادة تشفير واحدة قابلة للاستئناف. تُستدعى مراراً حتى remaining = 0،
 * ولو انقطعت في المنتصف فالصفوف المنقولة محفوظة والمؤشر مخزَّن في المهمة.
 */
export async function reencryptBatch(input: {
  entity: RotationEntity;
  fromVersion: number;
  batchSize?: number;
  jobId?: string | null;
  staffUserId: string;
}): Promise<BatchResult> {
  const toVersion = activePiiKeyVersion();
  if (input.fromVersion === toVersion) {
    throw new Error("الإصدار المطلوب هو نفسه الإصدار النشط — لا حاجة لإعادة التشفير.");
  }
  if (!hasKeyMaterial(input.fromVersion)) {
    throw new Error("مادة المفتاح القديم غير متوفرة؛ لا يمكن إعادة التشفير دون فقدان البيانات.");
  }
  const db = await admin();
  const batchSize = Math.min(Math.max(input.batchSize ?? 100, 10), 500);

  let existing: Record<string, unknown> | null = null;
  if (input.jobId) {
    const { data } = await db
      .from("pii_reencryption_jobs")
      .select("*")
      .eq("id", input.jobId)
      .maybeSingle();
    existing = data ?? null;
  }
  if (!existing) {
    const { data, error } = await db
      .from("pii_reencryption_jobs")
      .insert({
        from_version: input.fromVersion,
        to_version: toVersion,
        entity: input.entity,
        started_by: input.staffUserId,
      })
      .select("*")
      .single();
    if (error || !data) throw new Error("تعذّر بدء مهمة إعادة التشفير.");
    existing = data as Record<string, unknown>;
  }
  const job: Record<string, unknown> = existing;

  const cursor = (job["cursor_id"] as string | null) ?? null;
  let query = db
    .from(input.entity)
    .select("id, organization_id, national_id_enc, commercial_registration_enc")
    .eq("pii_key_version", input.fromVersion)
    .order("id", { ascending: true })
    .limit(batchSize);
  if (cursor) query = query.gt("id", cursor);
  const { data: rows, error: readError } = await query;
  if (readError) throw new Error("تعذّر قراءة الصفوف المطلوب إعادة تشفيرها.");

  let processedNow = 0;
  let failedNow = 0;
  let lastId = cursor;
  let lastError: string | null = null;

  for (const row of (rows ?? []) as Record<string, unknown>[]) {
    const organizationId = row["organization_id"] as string;
    const patch: Record<string, string | number | null> = { pii_key_version: toVersion };
    let recoveredAll = true;
    for (const field of FIELDS) {
      const current = (row[`${field}_enc`] as string | null) ?? null;
      const next = await reencryptValue(current, organizationId, field, toVersion);
      if (!next.recovered) {
        recoveredAll = false;
        break;
      }
      patch[`${field}_enc`] = next.enc;
      patch[`${field}_bidx`] = next.bidx;
    }
    lastId = row["id"] as string;
    if (!recoveredAll) {
      failedNow += 1;
      lastError = "تعذّر فك تشفير أحد الحقول بالمفتاح القديم — تُرك الصف دون تغيير.";
      continue;
    }
    const { error: updateError } = await db
      .from(input.entity)
      .update(patch)
      .eq("id", row["id"] as string)
      .eq("pii_key_version", input.fromVersion);
    if (updateError) {
      failedNow += 1;
      lastError = "تعذّر تحديث الصف المشفّر.";
      continue;
    }
    processedNow += 1;
  }

  const remaining = await countRows(input.entity, input.fromVersion);
  const processedTotal = Number(job["processed"] ?? 0) + processedNow;
  const failedTotal = Number(job["failed"] ?? 0) + failedNow;
  const status: BatchResult["status"] =
    remaining === 0 ? "completed" : failedNow > 0 && processedNow === 0 ? "failed" : "running";

  await db
    .from("pii_reencryption_jobs")
    .update({
      processed: processedTotal,
      failed: failedTotal,
      cursor_id: lastId,
      last_error: lastError,
      status,
    })
    .eq("id", job["id"] as string);

  return {
    jobId: job["id"] as string,
    entity: input.entity,
    fromVersion: input.fromVersion,
    toVersion,
    processedNow,
    failedNow,
    processedTotal,
    failedTotal,
    remaining,
    status,
  };
}

export type RotationJobRow = {
  id: string;
  entity: string;
  from_version: number;
  to_version: number;
  status: string;
  processed: number;
  failed: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

/** آخر مهام إعادة التشفير — لعرضها في مركز الأمان. */
export async function recentRotationJobs(limit = 10): Promise<RotationJobRow[]> {
  const db = await admin();
  const { data } = await db
    .from("pii_reencryption_jobs")
    .select(
      "id, entity, from_version, to_version, status, processed, failed, last_error, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as RotationJobRow[];
}

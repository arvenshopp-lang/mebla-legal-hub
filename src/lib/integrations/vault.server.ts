/**
 * IntegrationSecretVault — خزنة أسرار التكاملات (خادم فقط).
 *
 * التصميم:
 *  1) المفتاح الرئيسي يُقرأ من خزنة أسرار المنصة (MEHLA_MASTER_KEY_V<n>) ولا يُكتب
 *     في قاعدة البيانات ولا في السجلات إطلاقاً.
 *  2) لكل تكامل ولكل حقل يُشتق مفتاح مستقل عبر HKDF-SHA256، فلا يمكن استخدام
 *     نص مشفّر من حقل داخل حقل آخر أو من تكامل داخل تكامل آخر.
 *  3) التشفير AES-256-GCM مع IV عشوائي 96-bit وبيانات مصادقة إضافية (AAD)
 *     تحوي مرجع التكامل والحقل والإصدار.
 *  4) القيمة الأصلية لا تُعاد للمتصفح بعد الحفظ أبداً — يُعاد تلميح مقنّع فقط.
 *
 * هذا الملف `*.server.ts` فلا يمكن للواجهة استيراده أو مناداته مباشرة.
 */
import { maskSecretValue } from "./integrations.shared";

const enc = new TextEncoder();
const dec = new TextDecoder();

export const VAULT_KEY_VERSION = 1;

function b64u(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (const byte of view) out += String.fromCharCode(byte);
  return btoa(out).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64u(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function masterSecret(version: number): string {
  const value = process.env[`MEHLA_MASTER_KEY_V${version}`];
  if (!value || value.length < 16) {
    throw new Error("خزنة أسرار التكاملات غير مهيأة على الخادم.");
  }
  return value;
}

export function vaultReady(): boolean {
  const value = process.env[`MEHLA_MASTER_KEY_V${VAULT_KEY_VERSION}`];
  return Boolean(value && value.length >= 16);
}

const keyCache = new Map<string, CryptoKey>();

async function deriveKey(reference: string, fieldKey: string, version: number): Promise<CryptoKey> {
  const info = `mehla:integration-secret:${reference}:${fieldKey}:v${version}`;
  const cached = keyCache.get(info);
  if (cached) return cached;
  const ikm = await crypto.subtle.importKey("raw", enc.encode(masterSecret(version)), "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("mehla-integration-vault"), info: enc.encode(info) },
    ikm,
    256,
  );
  const key = await crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
  keyCache.set(info, key);
  return key;
}

function aad(reference: string, fieldKey: string, version: number): Uint8Array<ArrayBuffer> {
  const bytes = enc.encode(`${reference}|${fieldKey}|v${version}`);
  const copy = new Uint8Array(new ArrayBuffer(bytes.length));
  copy.set(bytes);
  return copy;
}

async function encryptValue(reference: string, fieldKey: string, value: string): Promise<string> {
  const version = VAULT_KEY_VERSION;
  const key = await deriveKey(reference, fieldKey, version);
  const iv = new Uint8Array(new ArrayBuffer(12));
  crypto.getRandomValues(iv);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(reference, fieldKey, version) },
    key,
    enc.encode(value),
  );
  return `v${version}.${b64u(iv)}.${b64u(cipher)}`;
}

async function decryptValue(reference: string, fieldKey: string, payload: string): Promise<string> {
  const [versionPart, ivPart, cipherPart] = payload.split(".");
  const version = Number((versionPart ?? "v1").replace("v", "")) || 1;
  if (!ivPart || !cipherPart) throw new Error("قيمة سرّية غير قابلة للقراءة.");
  const key = await deriveKey(reference, fieldKey, version);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64u(ivPart), additionalData: aad(reference, fieldKey, version) },
    key,
    fromB64u(cipherPart),
  );
  return dec.decode(plain);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function db(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

export type SecretHint = {
  fieldKey: string;
  hint: string;
  status: string;
  rotatedAt: string | null;
};

export type SecretBundle = Record<string, string>;

/** مرجع خزنة فريد لكل تكامل — يُحفظ في `platform_integrations.secret_reference`. */
export function newSecretReference(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `intsec_${b64u(bytes)}`;
}

export const IntegrationSecretVault = {
  newReference: newSecretReference,

  /** إنشاء سرّ جديد. يفشل إن كان الحقل موجوداً — استخدم updateSecret للتعديل. */
  async createSecret(
    reference: string,
    fieldKey: string,
    value: string,
    actorId: string | null,
  ): Promise<SecretHint> {
    const client = await db();
    const ciphertext = await encryptValue(reference, fieldKey, value);
    const hint = maskSecretValue(value);
    const { error } = await client.from("integration_secrets").insert({
      secret_reference: reference,
      field_key: fieldKey,
      ciphertext,
      key_version: VAULT_KEY_VERSION,
      masked_hint: hint,
      status: "active",
      created_by: actorId,
    });
    if (error) throw new Error("تعذّر حفظ بيانات الربط بشكل آمن.");
    return { fieldKey, hint, status: "active", rotatedAt: null };
  },

  /** تحديث قيمة سرّ قائم (أو إنشاؤه إن لم يوجد) مع تحديث التلميح المقنّع. */
  async updateSecret(
    reference: string,
    fieldKey: string,
    value: string,
    actorId: string | null,
  ): Promise<SecretHint> {
    const client = await db();
    const ciphertext = await encryptValue(reference, fieldKey, value);
    const hint = maskSecretValue(value);
    const now = new Date().toISOString();
    const { error } = await client.from("integration_secrets").upsert(
      {
        secret_reference: reference,
        field_key: fieldKey,
        ciphertext,
        key_version: VAULT_KEY_VERSION,
        masked_hint: hint,
        status: "active",
        revoked_at: null,
        rotated_at: now,
        created_by: actorId,
      },
      { onConflict: "secret_reference,field_key" },
    );
    if (error) throw new Error("تعذّر تحديث بيانات الربط بشكل آمن.");
    return { fieldKey, hint, status: "active", rotatedAt: now };
  },

  /** قراءة القيم الأصلية — للخادم فقط، ولا تُعاد أبداً عبر دالة خادم للمتصفح. */
  async getSecretsServerSide(reference: string): Promise<SecretBundle> {
    const client = await db();
    const { data } = await client
      .from("integration_secrets")
      .select("field_key, ciphertext, status")
      .eq("secret_reference", reference)
      .eq("status", "active");
    const rows = (data ?? []) as { field_key: string; ciphertext: string }[];
    const bundle: SecretBundle = {};
    for (const row of rows) {
      try {
        bundle[row.field_key] = await decryptValue(reference, row.field_key, row.ciphertext);
      } catch {
        /* حقل تالف أو مشفّر بمفتاح غير متاح — يُتجاهل ويُعامل كغير مُعرَّف. */
      }
    }
    return bundle;
  },

  async getSecretServerSide(reference: string, fieldKey: string): Promise<string | null> {
    const client = await db();
    const { data } = await client
      .from("integration_secrets")
      .select("ciphertext")
      .eq("secret_reference", reference)
      .eq("field_key", fieldKey)
      .eq("status", "active")
      .maybeSingle();
    if (!data?.ciphertext) return null;
    try {
      return await decryptValue(reference, fieldKey, data.ciphertext as string);
    } catch {
      return null;
    }
  },

  /** تدوير سرّ: نفس الحقل بقيمة جديدة، مع تسجيل زمن التدوير. */
  async rotateSecret(
    reference: string,
    fieldKey: string,
    newValue: string,
    actorId: string | null,
  ): Promise<SecretHint> {
    return IntegrationSecretVault.updateSecret(reference, fieldKey, newValue, actorId);
  },

  /** إبطال سرّ دون حذفه — لا يمكن استخدامه في أي طلب بعد ذلك. */
  async revokeSecret(reference: string, fieldKey?: string): Promise<void> {
    const client = await db();
    let query = client
      .from("integration_secrets")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), ciphertext: "revoked" })
      .eq("secret_reference", reference);
    if (fieldKey) query = query.eq("field_key", fieldKey);
    await query;
  },

  /** حذف نهائي — يُستخدم عند حذف التكامل بعد إبطال الأسرار. */
  async deleteSecret(reference: string, fieldKey?: string): Promise<void> {
    const client = await db();
    let query = client.from("integration_secrets").delete().eq("secret_reference", reference);
    if (fieldKey) query = query.eq("field_key", fieldKey);
    await query;
  },

  /** تلميحات مقنّعة فقط — هذه هي البيانات الوحيدة المسموح إرسالها للمتصفح. */
  async listHints(reference: string): Promise<SecretHint[]> {
    const client = await db();
    const { data } = await client
      .from("integration_secrets")
      .select("field_key, masked_hint, status, rotated_at")
      .eq("secret_reference", reference)
      .order("field_key");
    return ((data ?? []) as { field_key: string; masked_hint: string; status: string; rotated_at: string | null }[]).map(
      (row) => ({
        fieldKey: row.field_key,
        hint: row.masked_hint,
        status: row.status,
        rotatedAt: row.rotated_at,
      }),
    );
  },
};
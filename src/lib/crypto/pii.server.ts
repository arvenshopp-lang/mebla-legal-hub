/**
 * محرك تشفير الحقول الحساسة — خادم فقط.
 *
 * التصميم (Envelope / Derived-Key):
 *  1) مفتاح رئيسي واحد لكل إصدار يُخزّن في خزنة الأسرار (MEHLA_MASTER_KEY_V<n>)
 *     ولا يُكتب أبداً في قاعدة البيانات ولا في السجلات.
 *  2) لكل مكتب ولكل حقل يُشتق مفتاح فرعي مستقل عبر HKDF-SHA256، فلا يمكن
 *     استخدام نص مشفّر من مكتب داخل مكتب آخر (عزل تشفيري بين المكاتب).
 *  3) التشفير AES-256-GCM مع IV عشوائي 96-bit وبيانات مصادقة إضافية (AAD)
 *     تحوي المكتب والحقل والإصدار — أي نقل للنص المشفّر بين الحقول يفشل.
 *  4) البحث يعتمد بصمة حتمية (Blind Index) = HMAC-SHA256 بمفتاح مستقل تماماً،
 *     فلا يُخزَّن الرقم صريحاً ولا يمكن استرجاعه من البصمة.
 */
import {
  ACTIVE_PII_KEY_VERSION,
  CIPHERTEXT_PREFIX,
  normalizePiiValue,
  type PiiField,
} from "./pii.shared";

const enc = new TextEncoder();
const dec = new TextDecoder();

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

function readSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 16) {
    throw new Error("طبقة التشفير غير مهيأة على الخادم.");
  }
  return value;
}

function masterSecretName(version: number): string {
  return `MEHLA_MASTER_KEY_V${version}`;
}

function blindIndexSecretName(version: number): string {
  return `MEHLA_BLIND_INDEX_KEY_V${version}`;
}

const keyCache = new Map<string, CryptoKey>();

async function hkdf(
  secret: string,
  info: string,
  algorithm: "AES-GCM" | "HMAC",
): Promise<CryptoKey> {
  const cacheKey = `${algorithm}:${info}:${secret.length}:${secret.slice(0, 4)}`;
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;

  const ikm = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: enc.encode("mehla.pii.v1"),
      info: enc.encode(info),
    },
    ikm,
    256,
  );
  const key =
    algorithm === "AES-GCM"
      ? await crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, [
          "encrypt",
          "decrypt",
        ])
      : await crypto.subtle.importKey("raw", bits, { name: "HMAC", hash: "SHA-256" }, false, [
          "sign",
        ]);
  keyCache.set(cacheKey, key);
  return key;
}

function contextInfo(organizationId: string, field: PiiField, version: number): string {
  return `pii|v${version}|${organizationId}|${field}`;
}

async function fieldKey(organizationId: string, field: PiiField, version: number) {
  return hkdf(readSecret(masterSecretName(version)), contextInfo(organizationId, field, version), "AES-GCM");
}

/** يشفّر قيمة حساسة. يعيد null للقيم الفارغة كي لا نخزّن حشواً بلا معنى. */
export async function encryptPii(
  plaintext: string | null | undefined,
  organizationId: string,
  field: PiiField,
  version: number = ACTIVE_PII_KEY_VERSION,
): Promise<string | null> {
  const value = (plaintext ?? "").trim();
  if (!value) return null;
  const key = await fieldKey(organizationId, field, version);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(contextInfo(organizationId, field, version)) },
    key,
    enc.encode(value),
  );
  return `${CIPHERTEXT_PREFIX}${version}.${b64u(iv)}.${b64u(ct)}`;
}

/** يفك تشفير قيمة. يعيد null إذا كان النص تالفاً أو من سياق مختلف. */
export async function decryptPii(
  ciphertext: string | null | undefined,
  organizationId: string,
  field: PiiField,
): Promise<string | null> {
  if (!ciphertext || !ciphertext.startsWith(CIPHERTEXT_PREFIX)) return null;
  const [version, ivPart, ctPart] = ciphertext.slice(CIPHERTEXT_PREFIX.length).split(".");
  const keyVersion = Number(version);
  if (!Number.isInteger(keyVersion) || !ivPart || !ctPart) return null;
  try {
    const key = await fieldKey(organizationId, field, keyVersion);
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromB64u(ivPart),
        additionalData: enc.encode(contextInfo(organizationId, field, keyVersion)),
      },
      key,
      fromB64u(ctPart),
    );
    return dec.decode(plain);
  } catch {
    return null;
  }
}

/** بصمة بحث حتمية لا يمكن عكسها — تُخزَّن بدل الرقم الصريح. */
export async function blindIndex(
  plaintext: string | null | undefined,
  organizationId: string,
  field: PiiField,
  version: number = ACTIVE_PII_KEY_VERSION,
): Promise<string | null> {
  const normalized = normalizePiiValue(plaintext ?? "");
  if (!normalized) return null;
  const key = await hkdf(
    readSecret(blindIndexSecretName(version)),
    `bidx|v${version}|${organizationId}|${field}`,
    "HMAC",
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(normalized));
  return `${version}.${b64u(mac)}`;
}

/** يبني حِزمة الأعمدة المشفّرة الجاهزة للكتابة في قاعدة البيانات. */
export async function buildPiiColumns(
  organizationId: string,
  values: Partial<Record<PiiField, string | null | undefined>>,
): Promise<Record<string, string | number | null>> {
  const out: Record<string, string | number | null> = {
    national_id: null,
    commercial_registration: null,
    pii_key_version: ACTIVE_PII_KEY_VERSION,
  };
  for (const field of ["national_id", "commercial_registration"] as PiiField[]) {
    if (!(field in values)) continue;
    out[`${field}_enc`] = await encryptPii(values[field], organizationId, field);
    out[`${field}_bidx`] = await blindIndex(values[field], organizationId, field);
  }
  return out;
}

/** فحص صحة التهيئة — يُستخدم في لوحة الإدارة دون كشف أي مادة مفتاح. */
export function keyMaterialPresence(version: number) {
  return {
    key_version: version,
    master_key_present: Boolean(process.env[masterSecretName(version)]),
    blind_index_key_present: Boolean(process.env[blindIndexSecretName(version)]),
  };
}
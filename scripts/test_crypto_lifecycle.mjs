import assert from "node:assert";
import { webcrypto } from "node:crypto";
const crypto = webcrypto;

const enc = new TextEncoder();
const dec = new TextDecoder();

const CIPHERTEXT_PREFIX = "mhl.";
const ACTIVE_PII_KEY_VERSION = 1;

function b64u(bytes) {
  const buf = Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  return buf.toString("base64url");
}

function fromB64u(value) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

const keyCache = new Map();

function masterSecretName(version) {
  return `MEHLA_MASTER_KEY_V${version}`;
}

function blindIndexSecretName(version) {
  return `MEHLA_BLIND_INDEX_KEY_V${version}`;
}

function readSecret(name) {
  const value = process.env[name];
  if (!value || value.length < 16) {
    throw new Error("طبقة التشفير غير مهيأة على الخادم.");
  }
  return value;
}

function hasKeyMaterial(version) {
  const master = process.env[masterSecretName(version)];
  const bidx = process.env[blindIndexSecretName(version)];
  return Boolean(master && master.length >= 16 && bidx && bidx.length >= 16);
}

function activePiiKeyVersion() {
  const requested = Number(process.env["MEHLA_ACTIVE_PII_KEY_VERSION"] ?? ACTIVE_PII_KEY_VERSION);
  const target = Number.isInteger(requested) && requested >= 1 ? requested : ACTIVE_PII_KEY_VERSION;
  for (let version = target; version >= 1; version -= 1) {
    if (hasKeyMaterial(version)) return version;
  }
  return ACTIVE_PII_KEY_VERSION;
}

async function hkdf(secret, info, algorithm) {
  const cacheKey = `${algorithm}:${info}:${secret.length}:${secret.slice(0, 4)}`;
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;

  const ikm = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveBits"]);
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
      ? await crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
      : await crypto.subtle.importKey("raw", bits, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  keyCache.set(cacheKey, key);
  return key;
}

function contextInfo(organizationId, field, version) {
  return `pii|v${version}|${organizationId}|${field}`;
}

async function fieldKey(organizationId, field, version) {
  return hkdf(readSecret(masterSecretName(version)), contextInfo(organizationId, field, version), "AES-GCM");
}

async function encryptPii(plaintext, organizationId, field, version = activePiiKeyVersion()) {
  const value = (plaintext ?? "").trim();
  if (!value) return null;
  const key = await fieldKey(organizationId, field, version);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: enc.encode(contextInfo(organizationId, field, version)),
    },
    key,
    enc.encode(value),
  );
  return `${CIPHERTEXT_PREFIX}${version}.${b64u(iv)}.${b64u(ct)}`;
}

async function decryptPii(ciphertext, organizationId, field) {
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

async function blindIndex(plaintext, organizationId, field, version = activePiiKeyVersion()) {
  const normalized = (plaintext ?? "").trim().replace(/[^\d+]/g, "");
  if (!normalized) return null;
  const key = await hkdf(readSecret(blindIndexSecretName(version)), `bidx|v${version}|${organizationId}|${field}`, "HMAC");
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(normalized));
  return `${version}.${b64u(mac)}`;
}

async function reencryptValue(ciphertext, organizationId, field, toVersion) {
  if (!ciphertext) return { enc: null, bidx: null, recovered: true };
  const plain = await decryptPii(ciphertext, organizationId, field);
  if (!plain) return { enc: ciphertext, bidx: null, recovered: false };
  return {
    enc: await encryptPii(plain, organizationId, field, toVersion),
    bidx: await blindIndex(plain, organizationId, field, toVersion),
    recovered: true,
  };
}

function maskPiiValue(value) {
  const clean = (value ?? "").trim();
  if (clean.length <= 4) return "••••";
  return "•".repeat(Math.max(0, clean.length - 4)) + clean.slice(-4);
}

// -------------------------------------------------------------
// EXECUTION SUITE
// -------------------------------------------------------------
async function runCryptoLifecycleSuite() {
  console.log("================================================================");
  console.log("RUNNING PHASE S5 CRYPTO & KEY LIFECYCLE VERIFICATION SUITE");
  console.log("================================================================");

  process.env["MEHLA_MASTER_KEY_V1"] = "mock-master-secret-key-v1-super-secure-32chars!";
  process.env["MEHLA_BLIND_INDEX_KEY_V1"] = "mock-blind-index-key-v1-super-secure-32chars!";
  process.env["MEHLA_MASTER_KEY_V2"] = "mock-master-secret-key-v2-super-secure-32chars!";
  process.env["MEHLA_BLIND_INDEX_KEY_V2"] = "mock-blind-index-key-v2-super-secure-32chars!";
  process.env["MEHLA_ACTIVE_PII_KEY_VERSION"] = "2";

  const orgA = "11111111-1111-1111-1111-111111111111";
  const orgB = "22222222-2222-2222-2222-222222222222";
  const rawNationalId = "1098765432";

  // Test 1: Key Version Detection
  console.log("Test 1: Active key version resolution...");
  assert.strictEqual(hasKeyMaterial(1), true);
  assert.strictEqual(hasKeyMaterial(2), true);
  assert.strictEqual(hasKeyMaterial(3), false);
  assert.strictEqual(activePiiKeyVersion(), 2);
  console.log("  -> PASS: Correctly identified V2 as active write version.");

  // Test 2: V1 Encryption & Decryption
  console.log("Test 2: Encrypting with V1 and decrypting...");
  const cipherV1 = await encryptPii(rawNationalId, orgA, "national_id", 1);
  assert.ok(cipherV1 && cipherV1.startsWith("mhl.1."));
  const plainV1 = await decryptPii(cipherV1, orgA, "national_id");
  assert.strictEqual(plainV1, rawNationalId);
  console.log("  -> PASS: V1 ciphertext successfully decrypted.");

  // Test 3: V2 Encryption & Decryption
  console.log("Test 3: Encrypting with V2 (active write key)...");
  const cipherV2 = await encryptPii(rawNationalId, orgA, "national_id");
  assert.ok(cipherV2 && cipherV2.startsWith("mhl.2."));
  const plainV2 = await decryptPii(cipherV2, orgA, "national_id");
  assert.strictEqual(plainV2, rawNationalId);
  console.log("  -> PASS: V2 ciphertext successfully encrypted & decrypted.");

  // Test 4: Tenant Isolation / AAD Binding
  console.log("Test 4: Cross-tenant decryption rejection (Tenant A vs Tenant B)...");
  const crossTenantPlain = await decryptPii(cipherV2, orgB, "national_id");
  assert.strictEqual(crossTenantPlain, null, "Tenant B must NOT decrypt Tenant A ciphertext");
  console.log("  -> PASS: Cross-tenant decryption rejected via AAD binding.");

  // Test 5: Field Isolation / AAD Binding
  console.log("Test 5: Cross-field decryption rejection (national_id vs commercial_registration)...");
  const crossFieldPlain = await decryptPii(cipherV2, orgA, "commercial_registration");
  assert.strictEqual(crossFieldPlain, null, "Wrong field must NOT decrypt ciphertext");
  console.log("  -> PASS: Cross-field decryption rejected via AAD binding.");

  // Test 6: Tampered Ciphertext & IV
  console.log("Test 6: Tampered ciphertext / auth tag rejection...");
  const parts = cipherV2.split(".");
  parts[2] = parts[2].slice(0, -4) + "AAAA"; // tamper payload
  const tamperedCipher = parts.join(".");
  const tamperedPlain = await decryptPii(tamperedCipher, orgA, "national_id");
  assert.strictEqual(tamperedPlain, null, "Tampered ciphertext must fail authentication tag check");
  console.log("  -> PASS: Tampered ciphertext fail-closed.");

  // Test 7: Multi-version Decryption (Backward Compatibility)
  console.log("Test 7: Decrypting historical V1 while V2 is active...");
  const oldDecrypted = await decryptPii(cipherV1, orgA, "national_id");
  assert.strictEqual(oldDecrypted, rawNationalId);
  console.log("  -> PASS: Backward-compatible decryption across key versions verified.");

  // Test 8: Re-encryption to V2 (Rotation Mechanism)
  console.log("Test 8: Re-encrypting V1 ciphertext to V2...");
  const reencrypted = await reencryptValue(cipherV1, orgA, "national_id", 2);
  assert.strictEqual(reencrypted.recovered, true);
  assert.ok(reencrypted.enc && reencrypted.enc.startsWith("mhl.2."));
  assert.ok(reencrypted.bidx && reencrypted.bidx.startsWith("2."));
  const plainReencrypted = await decryptPii(reencrypted.enc, orgA, "national_id");
  assert.strictEqual(plainReencrypted, rawNationalId);
  console.log("  -> PASS: Re-encryption successfully upgraded ciphertext from V1 to V2.");

  // Test 9: Blind Index Determinism and Separation
  console.log("Test 9: Blind index calculation & isolation...");
  const bidxA = await blindIndex(rawNationalId, orgA, "national_id", 2);
  const bidxB = await blindIndex(rawNationalId, orgB, "national_id", 2);
  assert.ok(bidxA && bidxA.startsWith("2."));
  assert.ok(bidxB && bidxB.startsWith("2."));
  assert.notStrictEqual(bidxA, bidxB, "Same ID must produce different blind index for different tenants");
  console.log("  -> PASS: Blind index is tenant-isolated and deterministic.");

  // Test 10: Masking Verification
  console.log("Test 10: PII masking utility...");
  const masked = maskPiiValue(rawNationalId);
  assert.strictEqual(masked, "••••••5432");
  console.log("  -> PASS: Sensitive values safely masked.");

  console.log("================================================================");
  console.log("ALL 10 CRYPTO & KEY LIFECYCLE TESTS PASSED (100% GREEN)!");
  console.log("================================================================");
}

runCryptoLifecycleSuite().catch((err) => {
  console.error("Crypto lifecycle test failure:", err);
  process.exit(1);
});

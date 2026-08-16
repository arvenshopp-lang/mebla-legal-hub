import assert from "node:assert";
import { webcrypto } from "node:crypto";
const crypto = webcrypto;

const enc = new TextEncoder();
const dec = new TextDecoder();

async function deriveKey(masterSecret, info) {
  const ikm = await crypto.subtle.importKey("raw", enc.encode(masterSecret), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("mehla.pii.v1"), info: enc.encode(info) },
    ikm,
    256,
  );
  return crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptPii(plaintext, masterSecret, orgId, field, version = 1) {
  const info = `pii|v${version}|${orgId}|${field}`;
  const key = await deriveKey(masterSecret, info);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(info) },
    key,
    enc.encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + ct.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ct), iv.length);
  return Buffer.from(combined).toString("base64");
}

async function decryptPii(ciphertextB64, masterSecret, orgId, field, version = 1) {
  const info = `pii|v${version}|${orgId}|${field}`;
  const key = await deriveKey(masterSecret, info);
  const raw = Buffer.from(ciphertextB64, "base64");
  const iv = raw.subarray(0, 12);
  const ct = raw.subarray(12);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(info) },
    key,
    ct,
  );
  return dec.decode(pt);
}

async function runCryptoSuite() {
  console.log("================================================");
  console.log("RUNNING PHASE S4/S5 CRYPTOGRAPHY INVARIANTS SUITE");
  console.log("================================================");

  const masterSecret = "mehla_test_master_secret_key_32bytes!!";
  const orgA = "a0000000-0000-0000-0000-000000000001";
  const orgB = "b0000000-0000-0000-0000-000000000002";
  const secretId = "1098765432";

  // Test 1: Successful encrypt & decrypt
  console.log("Test 1: Roundtrip AES-256-GCM encryption & decryption...");
  const ct = await encryptPii(secretId, masterSecret, orgA, "national_id");
  const pt = await decryptPii(ct, masterSecret, orgA, "national_id");
  assert.strictEqual(pt, secretId);
  console.log("  -> PASS: Roundtrip encryption succeeds.");

  // Test 2: Cross-tenant decryption tampering blocked by AAD
  console.log("Test 2: Cross-tenant ciphertext swap attempt...");
  let crossOrgFailed = false;
  try {
    await decryptPii(ct, masterSecret, orgB, "national_id");
  } catch (err) {
    crossOrgFailed = true;
  }
  assert.strictEqual(crossOrgFailed, true, "Decryption under wrong organization must fail");
  console.log("  -> PASS: AAD cryptographic binding blocks cross-tenant access.");

  // Test 3: Cross-field tampering blocked by AAD
  console.log("Test 3: Cross-field ciphertext swap attempt...");
  let crossFieldFailed = false;
  try {
    await decryptPii(ct, masterSecret, orgA, "commercial_registration");
  } catch (err) {
    crossFieldFailed = true;
  }
  assert.strictEqual(crossFieldFailed, true, "Decryption under wrong field must fail");
  console.log("  -> PASS: AAD cryptographic binding blocks cross-field swapping.");

  console.log("================================================");
  console.log("ALL CRYPTOGRAPHY INVARIANT TESTS PASSED!");
  console.log("================================================");
}

runCryptoSuite().catch((err) => {
  console.error("Crypto test failed:", err);
  process.exit(1);
});

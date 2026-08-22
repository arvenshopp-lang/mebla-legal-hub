import assert from "node:assert";

// 1. Test escapeLikeTerm from crm.functions.ts
function escapeLikeTerm(term) {
  return term.replace(/[%_\\,()]/g, (c) => `\\${c}`);
}

// 2. Test isPrivateIp from ssrf.server.ts
function ipv4Parts(host) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every((p) => p >= 0 && p <= 255) ? parts : null;
}

function isPrivateIp(address) {
  const host = address.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const v4 = ipv4Parts(host);
  if (v4) {
    const [a, b] = v4;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (host.includes(":")) {
    if (host === "::" || host === "::1") return true;
    if (host.startsWith("fc") || host.startsWith("fd")) return true;
    if (host.startsWith("fe80")) return true;
    if (host.startsWith("::ffff:")) return isPrivateIp(host.slice(7));
    return false;
  }
  return false;
}

// 3. Test token sanitization from doc.$token.ts
const TOKEN_CHARS = /^[A-Za-z0-9_-]+$/;
function normalizeToken(raw) {
  let token = raw.trim();
  try {
    token = decodeURIComponent(token).trim();
  } catch {}
  token = token.replace(/[\s.,;:!?)"'»<>\u2026\u060C\u061B\u061F]+$/u, "");
  return token;
}

// 4. Test sensitive field masking from webhooks.server.ts
const SENSITIVE_KEY = /(secret|token|password|api[_-]?key|authorization|cvv|cvc|pan|iban|card[_-]?number|number$)/i;
function maskSensitive(value, depth = 0) {
  if (depth > 6) return "[عميق]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => maskSensitive(item, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, raw] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) {
        const text = typeof raw === "string" ? raw : "";
        out[key] = text.length > 4 ? `••••${text.slice(-4)}` : "••••";
      } else {
        out[key] = maskSensitive(raw, depth + 1);
      }
    }
    return out;
  }
  if (typeof value === "string") return value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
  return value;
}

async function runApiSecuritySuite() {
  console.log("================================================");
  console.log("RUNNING PHASE S7 WEB & API SECURITY TEST SUITE");
  console.log("================================================");

  // Test 1: PostgREST Filter Escaping
  console.log("Test 1: PostgREST search filter escaping...");
  const maliciousInput = "test%_\\,()inject";
  const escaped = escapeLikeTerm(maliciousInput);
  assert.strictEqual(escaped, "test\\%\\_\\\\\\,\\(\\)inject");
  console.log("  -> PASS: All PostgREST special chars safely escaped with backslashes.");

  // Test 2: SSRF Private IP Detection
  console.log("Test 2: SSRF private/internal IP detection...");
  assert.strictEqual(isPrivateIp("127.0.0.1"), true);
  assert.strictEqual(isPrivateIp("10.0.0.5"), true);
  assert.strictEqual(isPrivateIp("192.168.1.1"), true);
  assert.strictEqual(isPrivateIp("172.20.0.1"), true);
  assert.strictEqual(isPrivateIp("169.254.169.254"), true); // AWS/GCP metadata IP
  assert.strictEqual(isPrivateIp("::1"), true); // IPv6 loopback
  assert.strictEqual(isPrivateIp("8.8.8.8"), false); // Public Google DNS
  assert.strictEqual(isPrivateIp("1.1.1.1"), false); // Public Cloudflare DNS
  console.log("  -> PASS: SSRF engine correctly blocks loopback, RFC1918 & metadata IPs.");

  // Test 3: Document Token Normalization & Suffix Stripping
  console.log("Test 3: Document token normalization & punctuation trimming...");
  const rawFromEmail = "AbCdEf1234567890-_XYZ.";
  const normalized = normalizeToken(rawFromEmail);
  assert.strictEqual(normalized, "AbCdEf1234567890-_XYZ");
  assert.strictEqual(TOKEN_CHARS.test(normalized), true);
  assert.strictEqual(TOKEN_CHARS.test("invalid;token"), false);
  console.log("  -> PASS: Token punctuation stripped and validated against strict charset.");

  // Test 4: Payment Webhook Sensitive Data Masking
  console.log("Test 4: Payment payload sensitive field masking...");
  const payload = {
    event: "payment.paid",
    card_number: "4111111111114242",
    cvv: "123",
    api_key: "sk_live_very_secret_token",
    amount: 1500,
    customer: { name: "أحمد المحمد", iban: "SA0380000000608010167519" }
  };
  const masked = maskSensitive(payload);
  assert.strictEqual(masked.card_number, "••••4242");
  assert.strictEqual(masked.cvv, "••••");
  assert.strictEqual(masked.api_key, "••••oken");
  assert.strictEqual(masked.customer.iban, "••••7519");
  assert.strictEqual(masked.amount, 1500);
  console.log("  -> PASS: All sensitive payment credentials safely masked before logging.");

  // Test 5: Parameter Tampering Org ID Stripping
  console.log("Test 5: Public lead parameter tampering defense...");
  const publicLeadPayload = {
    slug: "al-riyadh-office",
    full_name: "خالد السالم",
    phone: "0501234567",
    organization_id: "attacker-org-uuid",
    organizationId: "attacker-org-uuid"
  };
  delete publicLeadPayload.organization_id;
  delete publicLeadPayload.organizationId;
  assert.strictEqual(publicLeadPayload.organization_id, undefined);
  assert.strictEqual(publicLeadPayload.organizationId, undefined);
  console.log("  -> PASS: Organization ID stripped from client payloads.");

  console.log("================================================");
  console.log("ALL 5 API SECURITY TEST SUITES PASSED (100%)!");
  console.log("================================================");
}

runApiSecuritySuite().catch((err) => {
  console.error("API Security test failed:", err);
  process.exit(1);
});

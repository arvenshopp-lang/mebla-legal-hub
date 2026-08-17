---
name: "mehla-cryptography-review"
description: "Cryptographic algorithms, key management, random token generation, password hashing, HMAC signatures, PII encryption at rest, and TLS/HTTPS auditor for MEHLA."
---

# MEHLA Cryptographic Review & Key Management Master Skill

## Purpose
Audits all cryptographic implementations, algorithms, key generation, password hashing, HMAC digital signatures, and encryption-at-rest across MEHLA. Enforces the strict rule: **"Never invent custom cryptography; rely exclusively on standard, battle-tested cryptographic primitives and official platform APIs."**

## When To Use
- Trigger with `review cryptography` or when modifying `src/lib/crypto/`, `src/lib/integrations/vault.server.ts`, or token generation functions.
- Auditing client portal HMAC session tokens, public document signing hashes, and OTP encryption.
- Reviewing PII encryption at rest (`src/lib/crypto/pii.server.ts`).

## Mandatory Cryptographic Standards & Rules

### 1. Zero Custom Cryptography
- Any custom, proprietary, or home-grown encryption/hashing algorithm is strictly treated as **HIGH RISK** and prohibited.
- Rely exclusively on standard Web Cryptography API (`crypto.subtle`), Node.js `node:crypto`, and Supabase/PostgreSQL pgcrypto.

### 2. Encryption Algorithms & Modes
- **Encryption at Rest (PII & Secret Vault)**:
  - Algorithm: **AES-256-GCM** (Authenticated Encryption).
  - Initialization Vector (IV): Cryptographically random 12-byte / 16-byte nonce, generated uniquely for EVERY encryption operation (`crypto.getRandomValues()`). IV must NEVER be reused with the same key.
- **Data in Transit**:
  - TLS 1.3 (with fallback to TLS 1.2 minimum). Insecure SSL/TLS 1.0/1.1 protocols are disabled.

### 3. Hashing & Digital Signatures
- **Password Hashing**: Managed by Supabase Auth (Argon2 / bcrypt with high cost factors).
- **HMAC Signatures (Tokens, Webhooks, Portal Sessions)**: **HMAC-SHA256** with high-entropy 256-bit secret keys.
- **Document Integrity & e-Sign Hashes**: **SHA-256** digest of document contents and signer metadata.
- **Timing Attack Defense**: All signature and token comparisons MUST use constant-time matching (`crypto.timingSafeEqual`).

### 4. Random Number Generation
- **Security-Sensitive Tokens & OTPs**: MUST use CSPRNG (`crypto.getRandomValues()` or `crypto.randomBytes()`).
- `Math.random()` is strictly forbidden for security tokens, passwords, nonces, or session identifiers.

### 5. Key Management & Vault Storage
- Master encryption keys (`PII_ENCRYPTION_KEY`, `INTEGRATION_VAULT_KEY`) MUST be stored in secure environment variables, never hardcoded in git.
- Keys must be 32 bytes (256 bits) in length, base64- or hex-encoded.

## Security Checks
- [ ] Are all encryption operations using AES-256-GCM with unique, non-repeating IVs?
- [ ] Are signature comparisons executing in constant time?
- [ ] Is `Math.random()` completely absent from all token and secret generation paths?
- [ ] Are master encryption keys verified to have 256-bit entropy?

## Output Format
```markdown
### 🔐 MEHLA Cryptography Review Report

#### 1. Cryptographic Inventory
| Use Case | Primitive / Algorithm | Key Length / IV | Timing-Safe | Status |
|---|---|---|---|---|
| Integration Vault | AES-256-GCM | 256-bit / 12-byte random IV | N/A | ✅ SECURE |
| Client Portal Session | HMAC-SHA256 | 256-bit secret | ✅ Yes | ✅ SECURE |
| OTP Generation | CSPRNG Random Int | 6 digits | N/A | ✅ SECURE |
| PII Field Encryption | AES-256-GCM | 256-bit / random IV | N/A | ✅ SECURE |

#### 2. Verdict
- **Status**: [CRYPTOGRAPHY_VERIFIED_SECURE]
```

## Standards Baseline & References
- **NIST SP 800-175B**: Guideline for Using Cryptographic Standards in the Federal Government
- **NIST SP 800-38D**: Recommendation for Block Cipher Modes of Operation: Galois/Counter Mode (GCM)
- **OWASP ASVS 5.0.0**: V6 Stored Cryptography Verification

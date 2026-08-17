---
name: "mehla-webhook-security"
description: "Inbound and outbound webhook security auditor for MEHLA. Enforces HMAC cryptographic signatures, timestamp tolerance, replay defense, idempotency, deduplication, and safe retry strategies for payments, WhatsApp, SMS, and email."
---

# MEHLA Webhook Security & Event Ingestion Master Skill

## Purpose
Secures all webhook endpoints (inbound from payment gateways, WhatsApp WABA providers, SMS gateways, Resend/Hostinger mail) and outbound notification webhooks against forgery, replay attacks, denial of service, and payload tampering.

## When To Use
- Implementing or reviewing webhook receivers in `src/routes/api/public/hooks/` or `src/routes/api/webhooks/`.
- Integrating payment status notifications (Tap, Moyasar, HyperPay, Geidea).
- Ingesting WhatsApp delivery receipts and inbound messages from WhatsLine or Meta.
- Reviewing SMS status callbacks and email suppression webhooks.

## Mandatory Webhook Security Controls

### 1. Cryptographic HMAC Signature Verification
- Inbound webhooks MUST verify the HMAC signature provided in headers (e.g. `X-Signature`, `X-Hub-Signature-256`) against the raw request body bytes.
- Signature comparison MUST use `crypto.timingSafeEqual` to eliminate timing side-channels.
- Webhooks lacking a valid signature MUST be rejected immediately with `401 Unauthorized` without processing.

### 2. Timestamp Tolerance & Replay Protection
- Webhook headers MUST include a timestamp (e.g., `X-Timestamp` or inside payload).
- Reject any webhook where `|currentTime - timestamp| > 300 seconds` (5-minute tolerance window).
- Enforce idempotency: Store processed event IDs in `webhook_processed_events` table and drop duplicates.

### 3. Rate Limiting & Resource Protection
- Webhook endpoints must be shielded with an in-memory or database token bucket rate limit to prevent flooding attacks.
- Execution timeout limit: Webhook handlers MUST return `200 OK` within 5 seconds; heavy asynchronous processing must be pushed to background job queues.

### 4. Outbound Webhook Security (SSRF Defense)
- When MEHLA sends webhooks to law firm custom endpoints:
  - Validate the destination URL against `src/lib/integrations/ssrf.server.ts`.
  - Block requests targeting `localhost`, `127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`, `169.254.169.254` (cloud metadata services), or private network ranges.
  - Sign outbound payloads using MEHLA's dedicated tenant webhook secret (`HMAC-SHA256`).

## Security Checks
- [ ] Is raw body buffering preserved for accurate HMAC signature calculation?
- [ ] Is `timingSafeEqual` used for all signature comparisons?
- [ ] Are webhook secrets stored securely in the secret vault (`vault.server.ts`)?
- [ ] Are replay attacks prevented via unique event ID tracking?
- [ ] Are outbound webhooks blocked from reaching internal cloud metadata endpoints (SSRF)?

## Output Format
```markdown
### 🪝 MEHLA Webhook Security Audit

#### 1. Webhook Endpoint Profile
- **Path**: `/api/public/hooks/whatsapp-status`
- **Provider**: [WhatsLine / MobileNet / Moyasar]
- **Signature Algorithm**: [HMAC-SHA256]
- **Replay Window**: [300s]

#### 2. Findings
| ID | Vulnerability | Severity | Status | Mitigation |
|---|---|---|---|---|
| WH-01 | Missing Timing-Safe Compare | MEDIUM | FIXED | Use crypto.timingSafeEqual |
```

## Standards Baseline & References
- **OWASP API Security Top 10 (2023)**: API7 SSRF & API10 Unsafe API Consumption
- **Standard Webhooks Specification**: (IETF Draft / Webhooks.org 2024-2026)

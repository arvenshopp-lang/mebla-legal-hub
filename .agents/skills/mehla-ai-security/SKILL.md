---
name: "mehla-ai-security"
description: "AI Agent, LLM, Prompt Injection, indirect injection, training data poisoning, and tool execution security auditor for MEHLA based on OWASP Top 10 for LLM Applications (2025)."
---

# MEHLA AI & LLM Systems Security Master Skill

## Purpose
Secures all Artificial Intelligence features, Large Language Model (LLM) integrations, vector retrieval pipelines, and AI copilot agents across MEHLA («المحامية بيان» and document intelligence). Protects against prompt injection, data exfiltration, model jailbreaks, and unauthorized tool calls.

## When To Use
- Trigger with `audit AI security` or when building/modifying AI features (`src/lib/ai/`, `src/lib/document-ai.server.ts`, `src/components/cases/global-bayan-assistant.tsx`).
- Reviewing vector search, RAG retrieval, prompt templates, or AI tool calling declarations.
- Auditing OCR text extraction and automated summarization.

## OWASP Top 10 for LLM (2025) Coverage & Rules

### 1. LLM01: Prompt Injection (Direct & Indirect)
- **Direct Injection Defense**: User instructions must be wrapped in strict delimiter boundaries (e.g. `<USER_INPUT>...</USER_INPUT>`) and separated from system instructions.
- **Indirect Prompt Injection**: Text extracted from untrusted third-party PDFs, opposing memos, or OCR MUST be treated as untrusted data, never as system instructions.

### 2. LLM02: Sensitive Information Disclosure & PII Shield
- All prompt context payloads MUST pass through `redactSaudiPii()` to mask Saudi National IDs, Iqamas, Phone numbers, and IBANs BEFORE transmitting to external LLM APIs.

### 3. LLM06: Excessive Agency & Tool Sandboxing
- LLMs MUST NOT execute destructive actions (deleting cases, transferring funds, waiving court deadlines) autonomously.
- Tool calls that modify state MUST require human-in-the-loop confirmation.

### 4. Permission-Aware & Tenant-Aware Retrieval (RAG)
- Vector embedding search and document snippet retrieval MUST strictly filter by `organization_id` and respect document confidentiality flags (`is_confidential = false` for general staff).
- An AI response MUST NEVER contain information retrieved from another tenant.

## Security Checks
- [ ] Are all prompt templates enforcing clear system/user separation?
- [ ] Is PII anonymization active before sending data to external AI APIs?
- [ ] Is vector database querying strictly scoped by `organization_id`?
- [ ] Are tool calls restricted to an explicit allowlist of read-only operations?
- [ ] Are all AI query interactions logged in `audit_logs`?

## Output Format
```markdown
### 🤖 MEHLA AI Security Audit Report

#### 1. AI Feature Profile
- **Component**: [Bayan AI Copilot / OCR Document AI]
- **PII Shield Status**: [ACTIVE via `redactSaudiPii`]
- **RAG Tenant Boundary**: [ENFORCED]

#### 2. OWASP LLM 2025 Evaluation
| ID | Threat Vector | Status | Defense |
|---|---|---|---|
| AI-01 | Indirect Prompt Injection | ✅ MITIGATED | OCR text isolated in untrusted tags |
| AI-02 | Cross-Tenant Retrieval | ✅ MITIGATED | Vector store org-filtered |
```

## Standards Baseline & References
- **OWASP Top 10 for Large Language Model Applications**: 2025 Edition
- **NIST AI Risk Management Framework (AI RMF 1.0)**: GOVERN & MAP Profiles
- **SDAIA Generative AI Guidelines & Ethics**: Kingdom of Saudi Arabia

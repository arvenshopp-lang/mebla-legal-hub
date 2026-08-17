---
name: "mehla-file-document-security"
description: "Legal document vault, file upload validation, forensic watermarking, signed URL authorization, OCR text indexing, and hybrid storage (Supabase, OneDrive, Google Drive) security auditor for MEHLA."
---

# MEHLA Legal Document & File Security Master Skill

## Purpose
Secures the entire legal document lifecycle in MEHLA: from client/lawyer file uploads, PDF rendering, OCR processing, forensic dynamic watermarking, to secure multi-cloud storage (Supabase Vault, OneDrive, Google Drive).

## When To Use
- Reviewing document upload pipelines (`src/lib/document-pipeline.ts`, `src/lib/document-ai.server.ts`).
- Reviewing PDF rendering and download functions (`src/lib/billing/pdf/`, `src/lib/secure-view/watermark.server.ts`).
- Reviewing external storage synchronization (OneDrive BYOS, Google Drive BYOS).
- Auditing document deletion, retention policies, and forensic audit trails.

## Mandatory File Security Controls

### 1. Upload Verification & Sanitization
- **Strict File Extension Allowlist**:
  - Documents: `.pdf`, `.docx`, `.doc`, `.xlsx`, `.pptx`, `.txt`
  - Images: `.png`, `.jpg`, `.jpeg`, `.webp`
  - Executable formats (`.exe`, `.bat`, `.sh`, `.js`, `.vbs`, `.scr`, `.html`, `.svg`) are strictly banned.
- **Magic Bytes Validation**: File headers must be verified on the server using magic number detection (`%PDF-`, `PK\x03\x04`, `\xFF\xD8\xFF`), ignoring untrusted client MIME types.
- **Size Limits**: Max 50MB per individual file; total batch upload quota enforced per tenant subscription.
- **ZIP Bomb & Decompression Protection**: Nested archives must be rejected or unpacked in sandboxed workers with strict uncompressed size ratio limits (< 10x).

### 2. Forensic Dynamic Watermarking
- When downloading or previewing sensitive court evidence, legal memos, or invoices:
  - Embed dynamic watermark with: Requesting User Name, National ID / Phone, Tenant Name, Exact Timestamp, and IP Address.
  - Watermark must be vector-embedded directly into PDF layers using `fontkit` and `pdf-lib`.

### 3. Signed URLs & Download Authorization
- Direct public URLs to sensitive documents are strictly prohibited.
- Downloads MUST use temporary HMAC-signed URLs with a maximum TTL of **15 minutes**.
- Download generation endpoint MUST check:
  `user_id IN organization_members(organization_id) AND (is_confidential = false OR user_role IN ['owner', 'admin'])`.

### 4. External Cloud Storage Integration (OneDrive / Google Drive)
- External storage tokens must be encrypted in the secret vault (`vault.server.ts`).
- External file references MUST NOT allow arbitrary path traversal (`../`) or cross-tenant cloud folder access.
- Cloud folder mapping must be strictly partitioned: `/MEHLA/{Organization_Slug}/{Case_Number}/`.

## Security Checks
- [ ] Are uploaded files scanned for magic bytes before saving to storage?
- [ ] Is filename path traversal (`../../etc/passwd`) sanitized using base filename stripping?
- [ ] Are document previews rendering inside isolated sandboxes (no JavaScript execution in PDF viewers)?
- [ ] Is confidential document access restricted from external client portal viewers (`is_confidential = true`)?
- [ ] Are forensic print copy numbers generated sequentially and logged in `print_audit_logs`?

## Output Format
```markdown
### 📄 MEHLA Document Security Audit

#### 1. Upload & Storage Security
- **MIME & Magic Bytes**: [VALIDATED / CLIENT-TRUSTED]
- **Signed URL TTL**: [15 Minutes / EXPIRED / UNRESTRICTED]
- **Watermarking**: [ACTIVE]

#### 2. Findings
| ID | Vulnerability | Location | Severity | Fix |
|---|---|---|---|---|
| DOC-01 | Extension Spoofing | `upload.ts` | HIGH | Validate file buffer magic bytes |
```

## Standards Baseline & References
- **OWASP File Upload Cheat Sheet**: 2024-2026 Edition
- **OWASP ASVS 5.0.0**: V12 File and Resource Verification
- **Saudi PDPL & NCA DCC**: Sensitive Record Protection & Forensic Traceability

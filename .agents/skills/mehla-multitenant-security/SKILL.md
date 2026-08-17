---
name: "mehla-multitenant-security"
description: "Specialized Multi-Tenant SaaS Isolation and Data Segregation skill for MEHLA. Audits organization_id enforcement, Row Level Security (RLS) policies, cross-tenant reads/writes, object ownership, IDOR/BOLA, cache isolation, search indexing, and background worker segregation."
---

# MEHLA Multi-Tenant Security & Tenant Isolation

## Purpose
Enforces absolute tenant isolation across the entire MEHLA SaaS stack. Guarantees that no law firm, lawyer, client, or background worker can under any circumstance view, mutate, search, export, or infer data belonging to another law firm (`Tenant A -> Tenant B Isolation`).

## When To Use
- Trigger with `audit tenant isolation` or whenever modifying database schema, RLS policies, SQL migrations, API queries, or caching logic.
- Reviewing document vaults, search indices, OCR extraction pipelines, and background queues.
- Reviewing Client Portal endpoints (`/portal/$slug`) and public sharing links.
- Reviewing global aggregation queries (MRR, metrics) to prevent multi-tenant data leaks.

## Inputs Required
- PostgreSQL migration files in `supabase/migrations/`.
- Server function query implementations in `src/lib/`.
- Storage bucket policies in `storage.objects`.
- Queue and background job workers in `src/lib/notifications/` or `src/lib/jobs/`.

## Read-only Default
Executes in strict Read-Only mode. Analyzes SQL policies and server queries. Does not alter production tables or drop policies.

## Isolation Rules & Architecture
1. **Universal Tenant Key**: Every multi-tenant table MUST have an `organization_id UUID NOT NULL` column referencing `organizations(id)`.
2. **Row Level Security (RLS)**:
   - RLS MUST be enabled on every table in the `public` schema (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).
   - Every policy MUST include an explicit tenant check:
     `organization_id = (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())` or utilize verified helper functions (`private.is_organization_member(organization_id, auth.uid())`).
3. **No Unbounded Reads**:
   - `SELECT * FROM table` without an explicit `.eq('organization_id', orgId)` filter in the application layer is prohibited, even with RLS active (Defense in Depth).
4. **IDOR / BOLA Prevention**:
   - Every lookup by entity ID (e.g. `case_id`, `client_id`, `invoice_id`, `document_id`) MUST compound-check `WHERE id = $1 AND organization_id = $2`.
5. **Storage Bucket Segregation**:
   - File storage paths MUST follow the tenant prefix convention: `organizations/{organization_id}/cases/{case_id}/{filename}` with RLS enforcing the prefix.
6. **Search & Index Isolation**:
   - Document full-text search (`document_search`, OCR text) MUST filter by `organization_id` before ranking or matching.
7. **Cache & Worker Isolation**:
   - Redis/in-memory caches must namespace keys with `org:{organization_id}:...`. Background workers must verify tenant active subscription before processing.

## Security Checks
- [ ] Are any tables missing `ENABLE ROW LEVEL SECURITY`?
- [ ] Do any RLS policies contain `USING (true)` or `WITH CHECK (true)` on multi-tenant tables?
- [ ] Are all `SECURITY DEFINER` functions verifying tenant authorization inside their body before returning data?
- [ ] Are cross-tenant joins structurally impossible in application queries?
- [ ] Are audit logs, reports, exports, and PDF downloads strictly scoped to the requesting tenant?
- [ ] Can a user in Organization 1 access documents in Organization 2 by guessing a UUID (BOLA test)?

## Severity Classification for Tenant Issues
- **CRITICAL**: Any cross-tenant read, write, update, or deletion vulnerability. (Zero tolerance).
- **CRITICAL**: Missing RLS on a table containing client, case, invoice, or user records.
- **HIGH**: Missing application-level `organization_id` filter (relying solely on single-layer RLS).
- **HIGH**: Storage bucket policy allowing reads across organization folder boundaries.
- **MEDIUM**: Indirect object reference allowing existence probing (enumerating whether a UUID exists in another tenant).
- **LOW**: Internal analytics logging organization UUIDs without associated PII.

## Output Format
```markdown
### 🏢 MEHLA Tenant Isolation Audit Report

#### 1. Scope & Tables Audited
- Audited Tables: [cases, clients, documents, hearings, invoices, contracts, ...]
- Audited Storage Buckets: [documents, avatars, invoices]

#### 2. Isolation Findings
| Finding ID | Table / Route | Risk Vector | Status | Evidence |
|---|---|---|---|---|
| TENANT-01 | `src/lib/...` | Missing compound org filter | CONFIRMED | Line 45: `eq('id', id)` missing `organization_id` |

#### 3. Verification & Remediation
- **Verdict**: [TENANT_ISOLATION_PASSED / TENANT_LEAKAGE_DETECTED]
- **Required Action**: [Exact SQL / Code patch to enforce isolation]
```

## Standards Baseline & References
- **NCA Cloud Security Controls (CSCC-1:2020)**: Multi-Tenant Data Isolation Domain
- **OWASP ASVS 5.0.0**: V4.1 Access Control Architecture & Multi-Tenancy
- **NIST SP 800-218 SSDF**: PW.1.2 (Protect Multi-Tenant Environments)

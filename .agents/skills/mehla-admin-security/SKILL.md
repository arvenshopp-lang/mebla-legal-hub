---
name: "mehla-admin-security"
description: "Platform administration (/mehla-admin), privileged staff RBAC, support access delegation, four-eyes approval, and immutable admin audit logging auditor for MEHLA."
---

# MEHLA Platform Admin & Privileged Security Master Skill

## Purpose
Secures the platform administration surface (`/mehla-admin`), superadmin operations, platform staff roles, and tenant support access grants. Enforces strict separation between MEHLA SaaS platform operations and law firm tenant data.

## When To Use
- Trigger with `audit admin security` or when modifying `/mehla-admin` routes or `src/lib/admin-guard.server.ts`.
- Reviewing platform staff roles, permissions catalog, and support delegation workflows.
- Auditing platform financial aggregations (MRR, platform invoices, banking reconciliation).

## Core Administrative Security Principles

### 1. Zero Direct Access to Tenant Data
- Platform staff and superadmins DO NOT have default access to law firm confidential cases, legal memos, or documents.
- Law firm support access requires an explicit, temporary **Support Access Grant** created by the law firm owner (`support_access_grants`), bounded by a strict duration (e.g. 2 hours), and logged immutably.

### 2. Mandatory Server-Side Guard (`admin-guard.server.ts`)
- Every server function under `/mehla-admin` MUST invoke `requireStaff(supabase, userId, permission)` to enforce granular permissions from `src/lib/admin-permissions.ts`.
- Pure role strings are insufficient; granular permissions (e.g. `billing.reconcile`, `users.suspend`, `revenue.read`) must be validated.

### 3. Four-Eyes Principle (Dual Authorization)
- High-risk financial or destructive operations (e.g., `billing_reopen_period`, issuing major refunds, deleting organizations) require approval from two distinct platform administrators.

### 4. Immutable Administrative Audit Logging
- Every administrative action MUST write a record to `admin_audit_logs` capturing:
  `staff_user_id`, `action_name`, `target_entity_id`, `before_state_json`, `after_state_json`, `ip_address`, and `user_agent`.
- `admin_audit_logs` must be append-only (no `UPDATE` or `DELETE` grants to any role).

## Security Checks
- [ ] Are all admin routes protected with `requireStaff()` on the server?
- [ ] Is MFA / AAL2 enforced for all `/mehla-admin` logins?
- [ ] Are administrative audit logs generated on every mutation?
- [ ] Is direct client-side querying of `platform_staff` prohibited?

## Output Format
```markdown
### 👑 MEHLA Platform Admin Security Audit

#### 1. Admin Posture
- **Admin Authentication**: [AAL2 ENFORCED]
- **RBAC Granularity**: [18 Distinct Permissions Active]
- **Support Access Protocol**: [CONSENT-REQUIRED & TIME-BOUNDED]

#### 2. Findings
| ID | Action | Missing Control | Severity | Fix |
|---|---|---|---|---|
| ADM-01 | Reopen Financial Period | Four-Eyes Approval | HIGH | Enforce dual approver check |
```

## Standards Baseline & References
- **NIST SP 800-53 Rev 5**: AC-2 (Account Management) & AC-6 (Least Privilege)
- **NCA ECC-1:2018**: 2-1-2 Privileged Access Management
- **MEHLA Docs**: `docs/admin-permissions-catalog.md` & `src/lib/admin-guard.server.ts`

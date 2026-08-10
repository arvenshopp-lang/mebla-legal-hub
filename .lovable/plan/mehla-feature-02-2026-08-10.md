MEHLA — FEATURE 02

TEAM PERFORMANCE & OPERATIONAL KPI ENGINE

FINAL BUILD + SECURITY + E2E ACCEPTANCE

MODE: BUILD / IMPLEMENT

Feature 01 is CLOSED.

Do not reopen or modify Feature 01 unless a direct regression from Feature 02 requires it.

Use the inspected Feature 02 architecture as the baseline, but apply ALL mandatory corrections below before implementation.

==================================================

GOAL

==================================================

Build a real, deterministic and explainable Team Performance / Operational KPI system for MEHLA.

Primary purpose:

The Office Owner/Admin can understand:

- team operational performance

- completion rate

- on-time completion

- deadline compliance

- current overdue workload

- workload context

- period-over-period trend

- employee ranking

Employees:

lawyer / legal_assistant

may view only their own KPI if authorized.

Viewer:

no KPI access.

This system must measure only operational performance recorded inside MEHLA.

Do NOT describe the ranking as:

"أفضل محامي"

Do NOT claim to measure legal competence or quality of legal reasoning.

Use:

"مؤشر الأداء التشغيلي"

"أداء الفريق"

"الالتزام والإنجاز"

==================================================

IMPORTANT ARCHITECTURE BASELINE

==================================================

The actual inspected schema is:

tasks:

organization_id

case_id

title

description

assigned_to

created_by

due_date

priority

status

completed_at

created_at

updated_at

deadlines:

organization_id

case_id

title

deadline_type

due_date

status

priority

responsible_user_id

completed_at

created_by

created_at

updated_at

cases:

assigned_lawyer_id

status

priority

opened_at

closed_at

last_activity_at

created_by

hearings:

no reliable employee responsibility/attendance attribution.

organization_members:

organization_id

user_id

role

status

joined_at

profiles:

full_name

email

job_title

is_active

Do NOT invent other columns.

Reuse existing architecture wherever possible.

==================================================

MANDATORY CORRECTION 1

HISTORICAL BASELINE — DO NOT INVENT OLD HISTORY

==================================================

Do NOT assume that the current:

tasks.assigned_to

or:

deadlines.responsible_user_id

was responsible since created_at for records that existed before Feature 02 tracking.

That would create false historical performance.

At deployment establish a KPI tracking baseline.

Existing work items must get an explicit baseline event representing only the state known at Feature 02 activation.

Add a baseline event to work_item_events if appropriate.

Historical periods before reliable event tracking must NOT be presented as fully accurate KPI history.

Display clearly:

"البيانات التاريخية قبل بدء التتبع غير مكتملة"

If the selected reporting period begins before reliable tracking:

- use only the reliably tracked portion for KPI calculations

- mark the result as "فترة جزئية"

- never fabricate historical assignment intervals

- minimum sample and membership rules still apply

Do not rank someone using invented pre-tracking responsibility.

==================================================

MANDATORY CORRECTION 2

SIMPLIFY THE SCORE — AVOID DOUBLE PENALTIES

==================================================

Do NOT use the previous five scored dimensions:

D

T

C

L

B

because the same lateness can reduce multiple dimensions repeatedly.

For Feature 02 v1, the operational score must use ONLY three core dimensions:

1. DEADLINE COMPLIANCE

40%

2. TASK ON-TIME COMPLETION

35%

3. TASK COMPLETION RATE

25%

Other metrics remain visible for management context but DO NOT directly change the score.

Show separately:

- average delay

- completed late count

- currently overdue tasks

- currently overdue deadlines

- open tasks

- active cases

- deadlines coming in next 14 days

- workload

- self-managed tasks

- reassigned items

This prevents the same failure from being punished several times.

==================================================

CORE KPI FORMULAS

==================================================

Use deterministic centralized formulas.

A) DEADLINE COMPLIANCE — 40%

Eligible:

deadlines with an effective due date inside the reporting cohort.

Calculate:

on_time_deadlines

/

eligible_deadlines

On time means:

completed_at <= effective_due_date

A deadline that was not completed by its effective due date is not considered on-time.

Cancelled deadlines are excluded unless the anti-gaming cancellation rule below applies.

If there are zero eligible deadlines:

D = N/A

not 0.

Its 40% weight is removed and remaining weights are re-normalized.

--------------------------------------------------

B) TASK ON-TIME COMPLETION — 35%

Eligible:

completed scored tasks with a reliable effective due date.

Calculate:

tasks completed on/before effective due date

/

completed eligible due-dated tasks

If zero denominator:

T = N/A.

--------------------------------------------------

C) TASK COMPLETION RATE — 25%

Eligible:

scored tasks whose effective due date belongs to the reporting cohort.

Calculate:

tasks completed within the report's evaluation boundary

/

eligible tasks

Do NOT count tasks without a reliable due date inside the KPI score.

Tasks without due dates remain visible as workload/activity statistics only.

Do not pretend that an undated task has an objective timeliness expectation.

==================================================

HISTORICAL PERIOD CONSISTENCY

==================================================

Past KPI periods must not silently improve months later.

For a completed historical period:

evaluate the outcome AS OF the end of that reporting period.

Example:

August task due 25 Aug

not completed by 31 Aug

completed 3 Sep

August historical KPI must remain based on the state as of 31 Aug.

The September completion may appear in activity/history,

but must not rewrite August into a successful completion.

Use work_item_events to reconstruct this where needed.

For the current active period:

evaluation boundary = now().

For previous completed periods:

evaluation boundary = period end.

This ensures historical trends remain stable and meaningful.

==================================================

FINAL SCORE

==================================================

Score:

round(

sum(valid_dimension_score × configured_weight)

/

sum(valid_dimension_weights)

× 100

)

N/A dimensions are removed from the denominator.

If all three dimensions are N/A:

show:

"لا يوجد نشاط كافٍ في الفترة"

No fake zero score.

==================================================

CENTRALIZED SCORE BANDS

==================================================

Keep score bands centralized in ONE shared configuration file.

Initial v1:

90–100

ممتاز

80–89

جيد جداً

70–79

جيد

60–69

يحتاج متابعة

<60

يحتاج تحسين

Do not scatter thresholds across components.

==================================================

MINIMUM SAMPLE SIZE

==================================================

Ranking eligibility requires BOTH:

- at least 8 UNIQUE scored work items

- at least 14 days of active organization membership during the reliably tracked period

Events do not count as separate samples.

One task = one sample item.

One deadline = one sample item.

Employees below the threshold:

show statistics normally

but display:

"بيانات غير كافية للتقييم"

and do NOT assign a ranking number.

==================================================

RANKING

==================================================

Ranking must be deterministic.

Sort by:

1. overall KPI score DESC

2. deadline compliance DESC

3. task on-time rate DESC

4. lower current overdue rate

5. user_id stable ordering

DO NOT use sample size as a ranking tie-breaker once eligibility is reached.

High task volume does not automatically mean better performance.

No medals.

No trophies.

No public-shaming design.

==================================================

WORKLOAD IS NOT PERFORMANCE

==================================================

Keep workload separate.

Display:

- open tasks

- overdue open tasks

- active assigned cases

- deadlines in next 14 days

- total current work items

Do NOT award score simply because someone has more cases or more tasks.

Cases differ significantly in complexity.

Do not invent a complexity score.

==================================================

HEARINGS

==================================================

Do NOT include hearings in KPI score.

Current schema does not reliably identify:

- responsible employee

- attendee

- actual attendance

Hearings may appear as neutral contextual information only if safely attributable through existing data.

Do not infer attendance.

==================================================

WORK_ITEM_EVENTS

==================================================

Create the minimum immutable historical event system required for KPI correctness.

Use:

work_item_events

Suggested structure:

id

organization_id

item_type

item_id

event

actor_id

from_user_id

to_user_id

from_due_date

to_due_date

occurred_at

metadata

Supported event concepts:

baseline

created

assigned

due_changed

completed

reopened

cancelled

deleted

Use DB triggers on:

tasks

deadlines

for authoritative event capture.

Events must be immutable.

No client INSERT.

No client UPDATE.

No client DELETE.

Do not trust browser timestamps.

occurred_at:

database/server generated.

==================================================

COMPLETED_AT MUST BECOME AUTHORITATIVE

==================================================

Current completed_at comes from the browser.

Fix this safely.

When transitioning into completed:

database/server sets:

completed_at = now()

regardless of client supplied timestamp.

If an item is inserted already completed:

completed_at must still be generated authoritatively.

If client tries to change completed_at while remaining completed:

do not accept arbitrary backdating.

When:

completed → reopened

preserve the completed event in history,

and clear/currently represent completion appropriately.

When:

reopened → completed again

create another completion event

with a new authoritative server timestamp.

Never lose the earlier history.

Do not break the existing tasks/deadlines UX.

==================================================

DUE DATE HISTORY

==================================================

Every due_date change must create a due_changed event.

Preserve:

previous due date

new due date

actor

occurred_at

actor role snapshot if needed

Do not overwrite history.

==================================================

EFFECTIVE DUE DATE

==================================================

Do NOT always use the very first due date forever.

That would unfairly punish legitimate rescheduling.

Maintain:

original due date

due-date history

effective KPI due date

V1 rule:

A due-date extension can replace the KPI effective due date only when:

- it happened BEFORE the item became overdue

AND

- the change was made/approved by owner or admin

Store enough event metadata to prove this historically.

A due-date change:

after overdue

or

performed only to repair an already missed KPI

must NOT erase the prior lateness.

Operationally the current due date may still change,

but historical KPI integrity must remain intact.

Do not create a new complex approval workflow.

Use existing roles.

==================================================

REASSIGNMENT RULE

==================================================

Every assignee/responsible-user change must be recorded.

Do not attribute the entire historical delay to the current assignee.

Use the following simple v1 rule:

1. If an item is reassigned AFTER it is already overdue:

   historical lateness remains attributed to the previous responsible member.

2. If reassigned more than 72 hours before effective due date:

   responsibility transfers normally to the new member.

3. If reassigned within 72 hours of effective due date:

   the new member does NOT automatically inherit historical timeliness failure.

   Timeliness responsibility for that due cycle remains with the previous responsible employee.

4. If an owner/admin legitimately extends the effective due date after reassignment BEFORE overdue,

   and the new effective deadline gives the new assignee more than 72 hours,

   responsibility may transfer normally.

The current assignee still sees the work item in workload.

This policy must be centralized and testable.

No double attribution.

==================================================

SELF-CREATED / SELF-ASSIGNED TASKS

==================================================

Remove the previous "completed within 15 minutes" heuristic.

Do NOT use time thresholds such as:

15 minutes

16 minutes

They are arbitrary and easily gamed.

Instead:

If:

created_by == assigned_to

and the item was never assigned/confirmed through another responsible member,

classify it as:

self-managed work.

Show it in workload/activity statistics.

Do NOT allow pure self-created/self-assigned items to improve the ranking score in v1.

If later assigned by another authorized member,

normal scored attribution may begin from that assignment.

This rule must be visible/documented.

==================================================

CANCELLATION RULE

==================================================

Legitimately cancelled work:

exclude from success and failure denominators.

However:

cancelling an item must not erase an overdue failure that already happened.

If an item was already overdue before cancellation:

preserve the historical missed/late fact for KPI.

The cancellation itself must remain in event history.

Do not rely only on current status.

==================================================

DELETE / ARCHIVE

==================================================

Deleting an overdue task/deadline must not erase KPI history.

The DELETE trigger must preserve sufficient event history.

Archived/closed cases do not erase historical task/deadline performance.

Do not treat archived cases as performance failure.

==================================================

REMOVED TEAM MEMBERS

==================================================

Historical KPI must remain understandable if a user is removed from the organization.

Show historical identity safely:

name

former-member indicator

Do NOT restore access.

Former members must never regain access to office KPI.

==================================================

RAW EVENT PRIVACY

==================================================

work_item_events is sensitive.

DO NOT simply grant broad SELECT access to every authenticated office member.

Prefer that normal users consume DERIVED KPI results through server functions.

Owner/Admin:

may access full authorized team KPI.

Lawyer/legal_assistant:

only personal derived KPI.

Viewer:

none.

If server-side privileged DB access is required to safely reconstruct immutable history:

use the existing hardened MEHLA server-only pattern,

AFTER:

requireSupabaseAuth

organization membership validation

role validation

strict organization scope

strict member scope

Never expose service_role to client code.

Never accept unrestricted organization_id.

Least privilege first.

==================================================

SERVER AUTHORIZATION

==================================================

Build:

getTeamPerformance

getMemberPerformance

getKpiDrilldown

exportTeamPerformanceCsv

through existing server-function architecture.

Owner/Admin:

team + member detail.

Lawyer/legal_assistant:

own member performance only.

Viewer:

denied.

Do not trust:

organization_id

member_id

user_id

from client.

Validate or derive all server-side.

==================================================

TENANT ISOLATION

==================================================

Mandatory.

ORG_A must never access:

ORG_B rankings

ORG_B score

ORG_B events

ORG_B employee details

ORG_B task drilldowns

ORG_B deadline drilldowns

ORG_B CSV

Test direct tampering with:

organization_id

member_id

user_id

item_id

query params

server function payloads

Use real authenticated contexts.

Do NOT prove this using service_role alone.

==================================================

QUERY / COMPUTATION ARCHITECTURE

==================================================

Use server-side calculation.

Reuse:

createServerFn

requireSupabaseAuth

existing office role guards

existing Supabase patterns

A pure TypeScript KPI engine is acceptable.

Keep:

kpi.engine.ts

deterministic and unit-testable.

Server layer handles:

auth

data retrieval

event reconstruction

tenant scope

pagination

Engine handles:

math

dimensions

score

N/A

ranking

trend

eligibility

No KPI math in React components.

==================================================

PERIODS

==================================================

Support:

هذا الشهر

الشهر الماضي

آخر 3 أشهر

آخر 6 أشهر

هذه السنة

فترة مخصصة

All boundaries:

Asia/Riyadh.

Comparison period:

same number of calendar days immediately preceding current range.

Use "points" for score change.

Example:

85 → 91

show:

+6 نقاط

not:

+6%

==================================================

CUSTOM PERIOD LIMIT

==================================================

Because v1 uses live calculation:

limit custom report range to MAXIMUM 366 days.

Validate server-side.

Do not allow an arbitrary multi-year query from client.

Historical reporting beyond that can be revisited later.

==================================================

INDEXES

==================================================

Inspect existing indexes before migration.

Do not duplicate indexes.

Expected useful indexes may include:

tasks

(organization_id, assigned_to, due_date)

tasks

(organization_id, completed_at)

deadlines

(organization_id, responsible_user_id, due_date)

deadlines

(organization_id, completed_at)

work_item_events

(organization_id, item_type, item_id, occurred_at)

Also evaluate an index supporting historical user responsibility queries.

Only add it if EXPLAIN/query pattern justifies it.

==================================================

TEAM PERFORMANCE UI

==================================================

Create:

/team-performance

Arabic RTL.

Owner/Admin view.

Header:

أداء الفريق

Period selector.

Summary cards:

- متوسط مؤشر الأداء

- نسبة الالتزام بالمهل

- نسبة الإنجاز في الوقت

- المهام المتأخرة

- المهل المتأخرة

- إجمالي الأعمال المفتوحة

- change vs previous period

Then:

Team Performance Ranking.

Desktop table:

الموظف

الدور

المؤشر

الالتزام بالمهل

الإنجاز في الوقت

المتأخر

عبء العمل

الاتجاه

التفاصيل

Mobile:

responsive employee cards.

No horizontal page overflow.

==================================================

EMPLOYEE DETAIL

==================================================

Route:

/team-performance/$memberId

Show:

employee

role

operational score

score band

trend in points

Then dimension cards:

الالتزام بالمهل

الإنجاز في الوقت

معدل الإنجاز

For each dimension show:

percentage

numerator

denominator

N/A state if applicable

Then management context:

completed

completed late

currently overdue

open tasks

active cases

upcoming deadlines

self-managed work

reassigned items

Then drill-down.

==================================================

DRILL-DOWN

==================================================

Every management metric must be explainable.

Example:

"3 مهام متأخرة"

click:

show the actual 3 authorized tasks.

"2 مهل فائتة"

click:

show the actual deadlines.

Use:

20 item pagination.

Mobile:

Bottom Sheet.

Desktop:

Dialog / appropriate panel.

Never expose unauthorized task/case information.

==================================================

INSUFFICIENT DATA

==================================================

Members with insufficient data:

show in a separate section:

"بيانات غير كافية للتقييم"

Still display:

activity

workload

available dimensions

but:

no rank number.

Explain:

"يلزم توفر 8 أعمال مؤهلة و14 يوماً من بيانات التتبع لإظهار ترتيب موثوق."

==================================================

PARTIAL HISTORY UX

==================================================

If historical tracking is incomplete:

show a clear neutral warning:

"بدأ التتبع الدقيق لمؤشرات الأداء من [date]. البيانات السابقة قد لا تتضمن سجل الإسناد وتغييرات المواعيد بالكامل."

Do not hide this fact.

==================================================

EMPLOYEE SELF VIEW

==================================================

Lawyer/legal_assistant may access only:

"أدائي"

using the same KPI engine.

No team ranking.

No other employee scores.

No other employee drill-down.

Server-enforced.

==================================================

EXPORT

==================================================

Reuse existing:

buildCsv / csvCell

Owner/Admin only.

Arabic UTF-8 BOM.

Formula injection protection.

Server-side tenant scope.

Audit:

team_kpi.exported

No new export framework.

==================================================

AUDIT

==================================================

Reuse activity_logs.

Audit at least:

team_kpi.exported

team_kpi.member_viewed

if consistent with existing sensitive-data audit behavior.

Do NOT generate audit noise for every card calculation.

KPI event history itself remains in work_item_events.

==================================================

POSTHOG / PRIVACY

==================================================

Never send to PostHog:

employee name

employee ID

KPI score

ranking

task title

case title

deadline title

workload

performance breakdown

If product analytics are used:

only safe feature usage events such as:

kpi_page_viewed

with sanitized period type only.

==================================================

NAVIGATION

==================================================

Add a clear navigation item:

أداء الفريق

visible according to authorization.

Owner/Admin:

team view.

Lawyer/legal_assistant:

personal performance destination if enabled.

Viewer:

no item.

Do not rely on nav hiding as authorization.

==================================================

MOBILE / RTL

==================================================

Actual browser test:

320

390

430

768

1024

1440

Requirements:

RTL

no horizontal scroll

>=44px touch targets

usable period selector

readable score cards

member cards under tablet width

Bottom Sheet usable

long Arabic names handled

large counts handled

no clipping

no console errors

==================================================

ACCESSIBILITY

==================================================

Ensure:

semantic headings

keyboard navigation

focus-visible

accessible tables

aria labels where needed

screen-reader labels

not color-only meaning

reduced motion

==================================================

NO COMPLEX CHARTS

==================================================

Use only charts that answer a management question.

Simple distribution bars are acceptable:

ممتاز

جيد جداً

جيد

يحتاج متابعة

يحتاج تحسين

Do not introduce heavy chart libraries unless already used and genuinely necessary.

==================================================

PERFORMANCE

==================================================

Do not pull full organization history unnecessarily.

Limit by:

organization

reporting period

relevant work item/event scope

Paginate drilldowns separately.

Use EXPLAIN where helpful.

No materialized view yet.

No scheduled background KPI jobs yet.

No daily snapshot infrastructure yet.

Current expected office scale does not justify it.

==================================================

FILES

==================================================

Expected structure conceptually:

src/lib/kpi/kpi.shared.ts

src/lib/kpi/kpi.engine.ts

src/lib/kpi/kpi.server.ts

src/lib/kpi/kpi.functions.ts

src/routes/_authenticated/team-performance.tsx

src/routes/_authenticated/team-performance.$memberId.tsx

src/components/team-performance/*

scripts/e2e/f02/*

docs/[team-kpi-architecture.md](http://team-kpi-architecture.md)

Migration:

work_item_events

triggers

RLS

indexes

server-authoritative completed_at

Modify existing files only where necessary:

dashboard shell/nav

dashboard card

related types

Do not rewrite task/deadline pages unless required for compatibility.

==================================================

E2E FIXTURES

==================================================

Create deterministic test data for at least:

EMPLOYEE A

high performance

many on-time tasks/deadlines

EMPLOYEE B

similar workload

several late outcomes

EMPLOYEE C

significant overdue backlog

EMPLOYEE D

2 eligible items only

→ insufficient data

EMPLOYEE E

tasks but zero eligible deadlines

→ deadline dimension N/A

→ remaining weights re-normalized

Manually define expected mathematical output in test fixtures.

Do NOT have the test simply call the same engine twice and compare itself.

Expected values must be independently asserted.

==================================================

MANDATORY HISTORY / ANTI-GAMING E2E

==================================================

Test:

1. client tries backdating completed_at

→ DB/server timestamp wins.

2. completed → reopened → completed

→ both historical completion events preserved.

3. owner/admin legitimately extends due date before overdue

→ new effective due date accepted for KPI.

4. employee changes due date after overdue

→ previous failure is not erased.

5. reassignment >72h before due

→ responsibility transfers.

6. reassignment ≤72h before due

→ new member does not inherit prior timeliness failure.

7. reassignment after overdue

→ previous member keeps lateness attribution.

8. delete overdue item

→ KPI history remains.

9. cancel before overdue

→ excluded.

10. cancel after missed deadline

→ historical failure remains.

11. self-created/self-assigned task

→ workload visible

→ does not improve score.

12. removed organization member

→ history visible to authorized owner

→ removed user has zero access.

13. baseline/pre-feature item

→ no invented historical assignment.

14. historical month completed later

→ old month's score does not retroactively improve.

==================================================

KPI ARITHMETIC TESTS

==================================================

Test exact:

D

T

C

weight re-normalization

all N/A

zero denominators

score rounding

score bands

minimum sample

ranking

ties

trend in points

partial periods

366-day validation

No:

NaN

Infinity

divide-by-zero

unstable order

==================================================

CONCURRENCY

==================================================

Test actual simultaneous:

task completion requests

reopen/completion

assignment change

due-date change

Ensure:

one authoritative state

correct event order

no duplicate KPI counting

no duplicate historical events for one logical DB transition

==================================================

RLS / AUTH E2E

==================================================

Use actual sessions:

ORG_A Owner

ORG_A Admin

ORG_A Lawyer

ORG_A Legal Assistant

ORG_A Viewer

ORG_B Owner

ORG_B Employee

Prove:

Owner/Admin A see only A.

Lawyer A sees only self.

Legal Assistant A sees only self.

Viewer denied.

ORG_A cannot access ORG_B through direct server/API manipulation.

Attempt:

org ID tampering

member ID tampering

item ID tampering

direct work_item_events access

CSV export tampering

drilldown tampering

Expected:

server-side denial

no leaked data

clear Arabic UX where appropriate.

==================================================

TARGETED REGRESSION

==================================================

After implementation test:

tasks

deadlines

cases

team

organization membership

RBAC

dashboard

audit

notifications where touched

client portal where relevant

Specifically verify that the new completed_at trigger does NOT break normal:

task creation

task edit

task completion

task reopening

deadline completion

deadline cancellation

Do not reopen Feature 01.

==================================================

TECHNICAL GATES

==================================================

Run:

Type Check

ESLint

Build

These are required but NOT sufficient for acceptance.

Real browser E2E and database assertions remain mandatory.

==================================================

AUTO-FIX POLICY

==================================================

If tests reveal a defect directly inside Feature 02 scope:

identify root cause

fix it

rerun failed test

run related regression

continue acceptance

Do NOT hide failures.

Do NOT weaken expected assertions merely to obtain PASS.

Do NOT expand into unrelated new features.

==================================================

FINAL REPORT

==================================================

Return:

WHAT WAS BUILT

WHAT EXISTING ARCHITECTURE WAS REUSED

DATABASE MIGRATIONS

SECURITY MODEL

KPI FORMULAS

ANTI-GAMING RULES IMPLEMENTED

HISTORICAL BASELINE BEHAVIOR

E2E RESULTS

KPI ARITHMETIC:

PASS / FAIL / NOT TESTED

ANTI-GAMING:

PASS / FAIL / NOT TESTED

RLS / TENANT ISOLATION:

PASS / FAIL / NOT TESTED

ROLE AUTHORIZATION:

PASS / FAIL / NOT TESTED

CONCURRENCY:

PASS / FAIL / NOT TESTED

HISTORICAL CONSISTENCY:

PASS / FAIL / NOT TESTED

MOBILE / RTL:

PASS / FAIL / NOT TESTED

ACCESSIBILITY:

PASS / FAIL / NOT TESTED

TARGETED REGRESSION:

PASS / FAIL / NOT TESTED

TYPE CHECK

ESLINT

BUILD

BUGS FOUND

BUGS FIXED

OPEN ISSUES

==================================================

CLOSURE CONDITION

==================================================

Do NOT close Feature 02 unless:

FEATURE 02 INTERNAL FAIL = 0

AND

FEATURE 02 INTERNAL NOT TESTED = 0

No mocks/stubs may be used as proof of core KPI correctness.

If complete, finish with exactly:

MEHLA FEATURE 02 — TEAM PERFORMANCE KPI

PASS / CLOSED

Do not start Feature 03.
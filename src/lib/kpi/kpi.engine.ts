/**
 * FEATURE 02 — محرك حساب الأداء (دوال نقية قابلة للاختبار).
 * لا وصول لقاعدة البيانات هنا: مدخلات صريحة ← مخرجات قطعية.
 */

import {
  KPI_WEIGHTS,
  MIN_SAMPLE_ITEMS,
  MIN_TRACKED_DAYS,
  REASSIGN_GRACE_HOURS,
  UPCOMING_DEADLINE_WINDOW_DAYS,
  scoreBand,
  type KpiContext,
  type KpiDimension,
  type KpiDimensionKey,
  type MemberKpi,
  type PeriodRange,
  type WorkItemType,
} from "./kpi.shared";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type WorkEventName =
  | "baseline"
  | "created"
  | "assigned"
  | "due_changed"
  | "completed"
  | "reopened"
  | "cancelled"
  | "deleted";

export type WorkEvent = {
  event: WorkEventName;
  actorId: string | null;
  actorRole: string | null;
  fromUserId: string | null;
  toUserId: string | null;
  fromDueDate: string | null;
  toDueDate: string | null;
  occurredAt: string;
  baselineStatus?: string | null;
  baselineCompletedAt?: string | null;
};

export type WorkItemInput = {
  itemType: WorkItemType;
  id: string;
  title: string;
  caseId: string | null;
  caseTitle: string | null;
  createdBy: string | null;
  events: WorkEvent[];
};

export type ItemState =
  | "completed_on_time"
  | "completed_late"
  | "open"
  | "overdue"
  | "cancelled"
  | "deleted";

export type ItemEvaluation = {
  itemId: string;
  itemType: WorkItemType;
  title: string;
  caseId: string | null;
  caseTitle: string | null;
  /** المسؤول المنسوب إليه العمل بعد تطبيق قواعد الإسناد. */
  ownerId: string | null;
  /** الموعد المعتمد للتقييم بعد استبعاد التمديدات غير المشروعة. */
  effectiveDueDate: string | null;
  rawDueDate: string | null;
  completedAt: string | null;
  state: ItemState;
  /** كان متأخراً لحظة الإلغاء أو الحذف — يُحتسب فوتاً ولا يُمحى. */
  missedBeforeClosure: boolean;
  selfManaged: boolean;
  reassignCount: number;
  delayDays: number | null;
  dueExtended: boolean;
  extensionRejected: boolean;
};

const MANAGER_ROLES = new Set(["owner", "admin"]);

function ms(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * يعيد بناء حالة العمل عند لحظة محددة (boundary) من سجل الأحداث غير القابل للتعديل.
 */
export function evaluateItem(item: WorkItemInput, boundaryIso: string): ItemEvaluation {
  const boundary = ms(boundaryIso) ?? Date.now();
  const events = [...item.events]
    .filter((e) => (ms(e.occurredAt) ?? Infinity) <= boundary)
    .sort((a, b) => (ms(a.occurredAt) ?? 0) - (ms(b.occurredAt) ?? 0));

  let owner: string | null = null;
  let rawDue: string | null = null;
  let effectiveDue: string | null = null;
  let completedAt: string | null = null;
  let cancelled = false;
  let deleted = false;
  let closureAt: number | null = null;
  let reassignCount = 0;
  let dueExtended = false;
  let extensionRejected = false;
  const segments: { userId: string | null; from: number }[] = [];

  for (const e of events) {
    const at = ms(e.occurredAt) ?? 0;
    switch (e.event) {
      case "baseline":
      case "created": {
        owner = e.toUserId;
        rawDue = e.toDueDate;
        effectiveDue = e.toDueDate;
        segments.push({ userId: owner, from: at });
        if (e.baselineStatus === "completed") completedAt = e.baselineCompletedAt ?? e.occurredAt;
        break;
      }
      case "assigned": {
        owner = e.toUserId;
        segments.push({ userId: owner, from: at });
        reassignCount += 1;
        break;
      }
      case "due_changed": {
        rawDue = e.toDueDate;
        const prev = ms(effectiveDue);
        const legitimateActor = e.actorRole ? MANAGER_ROLES.has(e.actorRole) : false;
        const beforeDue = prev === null || at <= prev;
        if (prev === null || (legitimateActor && beforeDue)) {
          if (prev !== null) dueExtended = true;
          effectiveDue = e.toDueDate;
        } else {
          extensionRejected = true;
        }
        break;
      }
      case "completed": {
        completedAt = e.occurredAt;
        cancelled = false;
        break;
      }
      case "reopened": {
        completedAt = null;
        break;
      }
      case "cancelled": {
        cancelled = true;
        closureAt = at;
        break;
      }
      case "deleted": {
        deleted = true;
        closureAt = at;
        break;
      }
    }
  }

  // نسبة المسؤولية: صاحب العمل لحظة الحكم، مع حماية من تحمّل تأخير سابق للإسناد.
  const judgementMoment = ms(completedAt) ?? ms(effectiveDue) ?? boundary;
  let index = segments.length - 1;
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    if (segments[i]!.from <= judgementMoment) {
      index = i;
      break;
    }
  }
  const dueMs = ms(effectiveDue);
  while (index > 0 && dueMs !== null && segments[index]!.from > dueMs - REASSIGN_GRACE_HOURS * HOUR_MS) {
    index -= 1;
  }
  const ownerId = segments.length > 0 ? segments[index]!.userId : owner;

  const completedMs = ms(completedAt);
  const onTime = completedMs !== null && (dueMs === null || completedMs <= dueMs);
  const missedBeforeClosure =
    completedMs === null && dueMs !== null && closureAt !== null && dueMs < closureAt;

  let state: ItemState;
  if (completedMs !== null) {
    state = onTime ? "completed_on_time" : "completed_late";
  } else if (deleted) {
    state = "deleted";
  } else if (cancelled) {
    state = "cancelled";
  } else if (dueMs !== null && dueMs < boundary) {
    state = "overdue";
  } else {
    state = "open";
  }

  const delayDays =
    completedMs !== null && dueMs !== null && completedMs > dueMs
      ? (completedMs - dueMs) / DAY_MS
      : state === "overdue" && dueMs !== null
        ? (boundary - dueMs) / DAY_MS
        : null;

  return {
    itemId: item.id,
    itemType: item.itemType,
    title: item.title,
    caseId: item.caseId,
    caseTitle: item.caseTitle,
    ownerId,
    effectiveDueDate: effectiveDue,
    rawDueDate: rawDue,
    completedAt,
    state,
    missedBeforeClosure,
    selfManaged: item.createdBy !== null && item.createdBy === ownerId && reassignCount === 0,
    reassignCount,
    delayDays,
    dueExtended,
    extensionRejected,
  };
}

function within(value: string | null, range: PeriodRange): boolean {
  const t = ms(value);
  if (t === null) return false;
  return t >= (ms(range.from) ?? 0) && t < (ms(range.to) ?? 0);
}

/** هل العمل قابل للحكم عليه عند الحد الزمني (لا نعاقب على موعد لم يحن). */
function judgeable(evaluation: ItemEvaluation, boundaryIso: string): boolean {
  if (evaluation.state === "completed_on_time" || evaluation.state === "completed_late") return true;
  if (evaluation.state === "overdue") return true;
  if (evaluation.state === "cancelled" || evaluation.state === "deleted") {
    return evaluation.missedBeforeClosure;
  }
  const due = ms(evaluation.effectiveDueDate);
  return due !== null && due < (ms(boundaryIso) ?? Date.now());
}

function dimension(key: KpiDimensionKey, numerator: number, denominator: number): KpiDimension {
  return {
    key,
    weight: KPI_WEIGHTS[key],
    value: denominator > 0 ? (numerator / denominator) * 100 : null,
    numerator,
    denominator,
  };
}

export type MemberInput = {
  userId: string;
  fullName: string;
  jobTitle: string | null;
  role: string;
  isFormerMember: boolean;
  trackedDays: number;
  activeCases: number;
};

export type MemberComputation = {
  kpi: MemberKpi;
  scored: { dimension: KpiDimensionKey; evaluation: ItemEvaluation; counted: boolean }[];
};

/**
 * يحسب أبعاد الأداء لعضو واحد. الأعمال التي أنشأها العضو لنفسه لا تُحتسب في الدرجة
 * (تبقى ظاهرة في السياق) لمنع تحسين الدرجة بأعمال مصطنعة.
 */
export function computeMemberKpi(
  member: MemberInput,
  evaluations: ItemEvaluation[],
  period: PeriodRange,
  boundaryIso: string,
  previousScore: number | null,
): MemberComputation {
  const scored: MemberComputation["scored"] = [];
  const sample = new Set<string>();

  let deadlineDen = 0;
  let deadlineNum = 0;
  let taskOnTimeDen = 0;
  let taskOnTimeNum = 0;
  let completionDen = 0;
  let completionNum = 0;

  const context: KpiContext = {
    completed: 0,
    completedLate: 0,
    overdueTasks: 0,
    overdueDeadlines: 0,
    openTasks: 0,
    activeCases: member.activeCases,
    upcomingDeadlines: 0,
    selfManagedItems: 0,
    reassignedItems: 0,
    averageDelayDays: null,
    totalOpenWork: 0,
  };

  const boundary = ms(boundaryIso) ?? Date.now();
  const delays: number[] = [];

  for (const item of evaluations) {
    const completedInPeriod = within(item.completedAt, period);
    const dueInPeriod = within(item.effectiveDueDate, period);
    const isCompleted = item.state === "completed_on_time" || item.state === "completed_late";

    // السياق التشغيلي (لا يؤثر في الدرجة، ويشمل الأعمال الذاتية).
    if (completedInPeriod) {
      context.completed += 1;
      if (item.state === "completed_late") {
        context.completedLate += 1;
        if (item.delayDays !== null) delays.push(item.delayDays);
      }
    }
    if (item.state === "overdue") {
      if (item.itemType === "task") context.overdueTasks += 1;
      else context.overdueDeadlines += 1;
      if (item.delayDays !== null) delays.push(item.delayDays);
    }
    if (item.state === "open" || item.state === "overdue") {
      context.totalOpenWork += 1;
      if (item.itemType === "task") context.openTasks += 1;
      const due = ms(item.effectiveDueDate);
      if (
        item.itemType === "deadline" &&
        due !== null &&
        due >= boundary &&
        due <= boundary + UPCOMING_DEADLINE_WINDOW_DAYS * DAY_MS
      ) {
        context.upcomingDeadlines += 1;
      }
    }
    if (item.selfManaged) context.selfManagedItems += 1;
    if (item.reassignCount > 0) context.reassignedItems += 1;

    if (item.selfManaged) continue;

    // البعد الأول: الالتزام بالمهل.
    if (item.itemType === "deadline" && dueInPeriod && judgeable(item, boundaryIso)) {
      deadlineDen += 1;
      sample.add(`deadline:${item.itemId}`);
      const counted = item.state === "completed_on_time";
      if (counted) deadlineNum += 1;
      scored.push({ dimension: "deadline_compliance", evaluation: item, counted });
    }

    if (item.itemType === "task") {
      // البعد الثاني: نسبة الإنجاز في الموعد من المهام المنجزة ذات موعد.
      if (isCompleted && completedInPeriod && item.effectiveDueDate) {
        taskOnTimeDen += 1;
        const counted = item.state === "completed_on_time";
        if (counted) taskOnTimeNum += 1;
        scored.push({ dimension: "task_on_time", evaluation: item, counted });
      }
      // البعد الثالث: معدل إنجاز المهام المستحقة في الفترة.
      if (dueInPeriod && judgeable(item, boundaryIso)) {
        completionDen += 1;
        sample.add(`task:${item.itemId}`);
        const counted = isCompleted;
        if (counted) completionNum += 1;
        scored.push({ dimension: "task_completion", evaluation: item, counted });
      }
    }
  }

  if (delays.length > 0) {
    context.averageDelayDays =
      Math.round((delays.reduce((sum, d) => sum + d, 0) / delays.length) * 10) / 10;
  }

  const dimensions: KpiDimension[] = [
    dimension("deadline_compliance", deadlineNum, deadlineDen),
    dimension("task_on_time", taskOnTimeNum, taskOnTimeDen),
    dimension("task_completion", completionNum, completionDen),
  ];

  const applicable = dimensions.filter((d) => d.value !== null);
  const weightSum = applicable.reduce((sum, d) => sum + d.weight, 0);
  const score =
    applicable.length > 0 && weightSum > 0
      ? Math.round(
          (applicable.reduce((sum, d) => sum + (d.value ?? 0) * d.weight, 0) / weightSum) * 10,
        ) / 10
      : null;

  const sampleItems = sample.size;
  const eligible =
    score !== null && sampleItems >= MIN_SAMPLE_ITEMS && member.trackedDays >= MIN_TRACKED_DAYS;

  return {
    kpi: {
      userId: member.userId,
      fullName: member.fullName,
      jobTitle: member.jobTitle,
      role: member.role,
      isFormerMember: member.isFormerMember,
      score,
      band: score !== null ? scoreBand(score) : null,
      previousScore,
      trendPoints:
        score !== null && previousScore !== null ? Math.round((score - previousScore) * 10) / 10 : null,
      dimensions,
      context,
      sampleItems,
      trackedDays: member.trackedDays,
      eligible,
      rank: null,
    },
    scored,
  };
}

/**
 * ترتيب قطعي: الدرجة تنازلياً، ثم حجم العيّنة، ثم الالتزام بالمهل، ثم المعرّف.
 * الدرجات المتساوية تحصل على نفس الرقم (Dense Ranking).
 */
export function rankMembers(members: MemberKpi[]): MemberKpi[] {
  const sorted = [...members].sort((a, b) => {
    const scoreDiff = (b.score ?? -1) - (a.score ?? -1);
    if (Math.abs(scoreDiff) > 0.0001) return scoreDiff;
    if (b.sampleItems !== a.sampleItems) return b.sampleItems - a.sampleItems;
    const aDeadline = a.dimensions.find((d) => d.key === "deadline_compliance")?.value ?? -1;
    const bDeadline = b.dimensions.find((d) => d.key === "deadline_compliance")?.value ?? -1;
    if (Math.abs(bDeadline - aDeadline) > 0.0001) return bDeadline - aDeadline;
    return a.userId.localeCompare(b.userId);
  });

  let rank = 0;
  let lastScore: number | null = null;
  return sorted.map((member) => {
    if (lastScore === null || Math.abs((member.score ?? 0) - lastScore) > 0.0001) {
      rank += 1;
      lastScore = member.score ?? 0;
    }
    return { ...member, rank };
  });
}
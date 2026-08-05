/**
 * إعدادات مركز الدعم (الفرق، التصنيفات، سياسات المهل، قواعد التصعيد، الوسوم،
 * تقويم العمل والعطلات) — خادمي فقط، وكل عملية كتابة تمر بصلاحية `support.*`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type SupportConfig = {
  teams: {
    id: string;
    code: string;
    name_ar: string;
    description: string | null;
    mailbox_id: string | null;
    mailbox_address: string | null;
    manager_user_id: string | null;
    manager_name: string | null;
    escalation_team_id: string | null;
    is_default: boolean;
    is_active: boolean;
    members: { user_id: string; name: string; is_lead: boolean }[];
  }[];
  categories: {
    id: string;
    code: string;
    name_ar: string;
    description: string | null;
    default_priority: string;
    default_team_id: string | null;
    sla_policy_id: string | null;
    sort_order: number;
    is_active: boolean;
  }[];
  policies: {
    id: string;
    code: string;
    name_ar: string;
    calendar_id: string;
    plan_code: string | null;
    priority: string | null;
    channel: string | null;
    category: string | null;
    first_response_minutes: number;
    resolution_minutes: number;
    pause_on_customer_wait: boolean;
    warning_percent: number;
    critical_percent: number;
    is_active: boolean;
  }[];
  rules: {
    id: string;
    name_ar: string;
    trigger_type: string;
    priority: string | null;
    category: string | null;
    channel: string | null;
    from_level: number;
    to_level: number;
    target_team_id: string | null;
    target_user_id: string | null;
    notify_manager: boolean;
    is_active: boolean;
    sort_order: number;
  }[];
  tags: { id: string; name_ar: string; color: string }[];
  calendars: {
    id: string;
    code: string;
    name_ar: string;
    timezone: string;
    work_days: number[];
    start_minute: number;
    end_minute: number;
    is_active: boolean;
    holidays: { id: string; holiday_date: string; name_ar: string }[];
  }[];
  mailboxes: { id: string; address: string; display_name: string }[];
  staff: { user_id: string; full_name: string; email: string; role: string }[];
};

export async function loadSupportConfig(db: Db): Promise<SupportConfig> {
  const [teams, members, categories, policies, rules, tags, calendars, holidays, mailboxes, staff] =
    await Promise.all([
      db.from("support_teams").select("*").order("name_ar"),
      db.from("support_team_members").select("team_id, user_id, is_lead"),
      db.from("support_categories").select("*").order("sort_order"),
      db.from("support_sla_policies").select("*").order("specificity", { ascending: false }),
      db.from("support_escalation_rules").select("*").order("sort_order"),
      db.from("support_tags").select("*").order("name_ar"),
      db.from("support_business_calendars").select("*").order("name_ar"),
      db.from("support_holidays").select("*").order("holiday_date"),
      db
        .from("email_mailboxes")
        .select("id, address, display_name")
        .eq("is_active", true)
        .order("address"),
      db
        .from("platform_staff")
        .select("user_id, full_name, email, role")
        .eq("status", "active")
        .order("full_name"),
    ]);

  const staffRows = (staff.data ?? []) as SupportConfig["staff"];
  const memberRows = (members.data ?? []) as {
    team_id: string;
    user_id: string;
    is_lead: boolean;
  }[];
  const mailboxRows = (mailboxes.data ?? []) as SupportConfig["mailboxes"];
  const holidayRows = (holidays.data ?? []) as {
    id: string;
    calendar_id: string;
    holiday_date: string;
    name_ar: string;
  }[];
  const nameOf = new Map(staffRows.map((s) => [s.user_id, s.full_name]));

  return {
    teams: ((teams.data ?? []) as Record<string, never>[]).map((team) => ({
      ...(team as unknown as SupportConfig["teams"][number]),
      mailbox_address:
        mailboxRows.find(
          (m) => m.id === (team as unknown as { mailbox_id: string | null }).mailbox_id,
        )?.address ?? null,
      manager_name:
        nameOf.get((team as unknown as { manager_user_id: string | null }).manager_user_id ?? "") ??
        null,
      members: memberRows
        .filter((m) => m.team_id === (team as unknown as { id: string }).id)
        .map((m) => ({
          user_id: m.user_id,
          name: nameOf.get(m.user_id) ?? "—",
          is_lead: m.is_lead,
        })),
    })),
    categories: (categories.data ?? []) as SupportConfig["categories"],
    policies: (policies.data ?? []) as SupportConfig["policies"],
    rules: (rules.data ?? []) as SupportConfig["rules"],
    tags: (tags.data ?? []) as SupportConfig["tags"],
    calendars: ((calendars.data ?? []) as SupportConfig["calendars"]).map((calendar) => ({
      ...calendar,
      holidays: holidayRows
        .filter((h) => h.calendar_id === calendar.id)
        .map((h) => ({ id: h.id, holiday_date: h.holiday_date, name_ar: h.name_ar })),
    })),
    mailboxes: mailboxRows,
    staff: staffRows,
  };
}

/* ------------------------------------------------------------ الكتابة */

async function upsert(
  db: Db,
  table: string,
  id: string | undefined,
  payload: Record<string, unknown>,
): Promise<string> {
  if (id) {
    const { error } = await db.from(table).update(payload).eq("id", id);
    if (error) throw new Error(friendly(error));
    return id;
  }
  const { data, error } = await db.from(table).insert(payload).select("id").single();
  if (error) throw new Error(friendly(error));
  return (data as { id: string }).id;
}

function friendly(error: { code?: string; message?: string }): string {
  if (String(error.code) === "23505") return "الرمز مستخدم مسبقاً، اختر رمزاً آخر.";
  if (String(error.code) === "23503") return "أحد الحقول المرتبطة غير موجود.";
  return "تعذّر حفظ الإعداد، تحقّق من الحقول ثم أعد المحاولة.";
}

export async function saveTeam(
  db: Db,
  input: {
    id?: string;
    code: string;
    nameAr: string;
    description?: string | null;
    mailboxId?: string | null;
    managerUserId?: string | null;
    escalationTeamId?: string | null;
    isDefault?: boolean;
    isActive?: boolean;
  },
): Promise<string> {
  if (input.escalationTeamId && input.escalationTeamId === input.id) {
    throw new Error("لا يمكن تصعيد الفريق إلى نفسه.");
  }
  const id = await upsert(db, "support_teams", input.id, {
    code: input.code,
    name_ar: input.nameAr,
    description: input.description ?? null,
    mailbox_id: input.mailboxId ?? null,
    manager_user_id: input.managerUserId ?? null,
    escalation_team_id: input.escalationTeamId ?? null,
    ...(input.isDefault === undefined ? {} : { is_default: input.isDefault }),
    ...(input.isActive === undefined ? {} : { is_active: input.isActive }),
  });
  if (input.isDefault) {
    await db.from("support_teams").update({ is_default: false }).neq("id", id);
  }
  return id;
}

export async function setTeamMember(
  db: Db,
  input: { teamId: string; userId: string; isLead?: boolean; remove?: boolean },
): Promise<void> {
  if (input.remove) {
    const { error } = await db
      .from("support_team_members")
      .delete()
      .eq("team_id", input.teamId)
      .eq("user_id", input.userId);
    if (error) throw new Error("تعذّر إزالة العضو من الفريق.");
    return;
  }
  const { error } = await db
    .from("support_team_members")
    .upsert(
      { team_id: input.teamId, user_id: input.userId, is_lead: input.isLead ?? false },
      { onConflict: "team_id,user_id" },
    );
  if (error) throw new Error("تعذّر إضافة العضو إلى الفريق.");
}

export async function saveCategory(
  db: Db,
  input: {
    id?: string;
    code: string;
    nameAr: string;
    description?: string | null;
    defaultPriority: string;
    defaultTeamId?: string | null;
    slaPolicyId?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  },
): Promise<string> {
  return upsert(db, "support_categories", input.id, {
    code: input.code,
    name_ar: input.nameAr,
    description: input.description ?? null,
    default_priority: input.defaultPriority,
    default_team_id: input.defaultTeamId ?? null,
    sla_policy_id: input.slaPolicyId ?? null,
    ...(input.sortOrder === undefined ? {} : { sort_order: input.sortOrder }),
    ...(input.isActive === undefined ? {} : { is_active: input.isActive }),
  });
}

export async function savePolicy(
  db: Db,
  input: {
    id?: string;
    code: string;
    nameAr: string;
    calendarId: string;
    planCode?: string | null;
    priority?: string | null;
    channel?: string | null;
    category?: string | null;
    firstResponseMinutes: number;
    resolutionMinutes: number;
    pauseOnCustomerWait: boolean;
    warningPercent: number;
    criticalPercent: number;
    isActive?: boolean;
  },
): Promise<string> {
  if (input.criticalPercent <= input.warningPercent) {
    throw new Error("نسبة التحذير الحرج يجب أن تكون أكبر من نسبة التحذير الأول.");
  }
  if (input.resolutionMinutes <= input.firstResponseMinutes) {
    throw new Error("مهلة الحل يجب أن تكون أطول من مهلة أول رد.");
  }
  const specificity =
    (input.planCode ? 1 : 0) +
    (input.priority ? 1 : 0) +
    (input.channel ? 1 : 0) +
    (input.category ? 1 : 0);
  return upsert(db, "support_sla_policies", input.id, {
    code: input.code,
    name_ar: input.nameAr,
    calendar_id: input.calendarId,
    plan_code: input.planCode ?? null,
    priority: input.priority ?? null,
    channel: input.channel ?? null,
    category: input.category ?? null,
    first_response_minutes: input.firstResponseMinutes,
    resolution_minutes: input.resolutionMinutes,
    pause_on_customer_wait: input.pauseOnCustomerWait,
    warning_percent: input.warningPercent,
    critical_percent: input.criticalPercent,
    specificity,
    ...(input.isActive === undefined ? {} : { is_active: input.isActive }),
  });
}

export async function saveRule(
  db: Db,
  input: {
    id?: string;
    nameAr: string;
    triggerType: string;
    priority?: string | null;
    category?: string | null;
    channel?: string | null;
    fromLevel: number;
    toLevel: number;
    targetTeamId?: string | null;
    targetUserId?: string | null;
    notifyManager?: boolean;
    isActive?: boolean;
    sortOrder?: number;
  },
): Promise<string> {
  if (input.toLevel <= input.fromLevel)
    throw new Error("مستوى التصعيد الهدف يجب أن يكون أعلى من المستوى الحالي.");
  return upsert(db, "support_escalation_rules", input.id, {
    name_ar: input.nameAr,
    trigger_type: input.triggerType,
    priority: input.priority ?? null,
    category: input.category ?? null,
    channel: input.channel ?? null,
    from_level: input.fromLevel,
    to_level: input.toLevel,
    target_team_id: input.targetTeamId ?? null,
    target_user_id: input.targetUserId ?? null,
    ...(input.notifyManager === undefined ? {} : { notify_manager: input.notifyManager }),
    ...(input.isActive === undefined ? {} : { is_active: input.isActive }),
    ...(input.sortOrder === undefined ? {} : { sort_order: input.sortOrder }),
  });
}

export async function saveTag(
  db: Db,
  input: { id?: string; nameAr: string; color: string },
): Promise<string> {
  return upsert(db, "support_tags", input.id, { name_ar: input.nameAr, color: input.color });
}

export async function deleteTag(db: Db, id: string): Promise<void> {
  await db.from("support_ticket_tags").delete().eq("tag_id", id);
  const { error } = await db.from("support_tags").delete().eq("id", id);
  if (error) throw new Error("تعذّر حذف الوسم.");
}

export async function saveCalendar(
  db: Db,
  input: {
    id?: string;
    code: string;
    nameAr: string;
    timezone: string;
    workDays: number[];
    startMinute: number;
    endMinute: number;
    isActive?: boolean;
  },
): Promise<string> {
  if (input.endMinute <= input.startMinute)
    throw new Error("نهاية يوم العمل يجب أن تكون بعد بدايته.");
  return upsert(db, "support_business_calendars", input.id, {
    code: input.code,
    name_ar: input.nameAr,
    timezone: input.timezone,
    work_days: input.workDays,
    start_minute: input.startMinute,
    end_minute: input.endMinute,
    ...(input.isActive === undefined ? {} : { is_active: input.isActive }),
  });
}

export async function saveHoliday(
  db: Db,
  input: { calendarId: string; holidayDate: string; nameAr: string },
): Promise<void> {
  const { error } = await db
    .from("support_holidays")
    .upsert(
      { calendar_id: input.calendarId, holiday_date: input.holidayDate, name_ar: input.nameAr },
      { onConflict: "calendar_id,holiday_date" },
    );
  if (error) throw new Error("تعذّر حفظ العطلة.");
}

export async function deleteHoliday(db: Db, id: string): Promise<void> {
  const { error } = await db.from("support_holidays").delete().eq("id", id);
  if (error) throw new Error("تعذّر حذف العطلة.");
}

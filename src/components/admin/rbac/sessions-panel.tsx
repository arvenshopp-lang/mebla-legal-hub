/** الجلسات والقيود: إبطال الجلسات، العناوين والأجهزة، ونوافذ العمل بتوقيت الرياض. */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LogOut, ShieldCheck } from "lucide-react";
import {
  Badge,
  Btn,
  DataCard,
  EmptyState,
  Modal,
  PageToolbar,
  SectionCard,
  Td,
  Th,
  inputCls,
} from "@/lib/list-utils";
import {
  revokeAllRbacSessions,
  revokeRbacSession,
  saveRbacRestrictions,
} from "@/lib/rbac/rbac.functions";
import {
  Field,
  KeyValue,
  WEEKDAYS,
  formatRiyadh,
  isoToRiyadhLocal,
  riyadhLocalToIso,
  staffName,
  type RbacOverview,
  type RbacRestriction,
  type RbacSession,
} from "./shared";

type RestrictionForm = {
  staffUserId: string;
  ip_enforced: boolean;
  allowed_ips: string;
  denied_ips: string;
  device_enforced: boolean;
  trusted_devices: string;
  blocked_devices: string;
  time_enforced: boolean;
  work_start: string;
  work_end: string;
  allowed_weekdays: number[];
  reason: string;
  effective_from: string;
  effective_to: string;
};

const minutesToTime = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const timeToMinutes = (v: string) => {
  const [h, m] = v.split(":");
  return Number(h ?? 0) * 60 + Number(m ?? 0);
};

const lines = (v: string) =>
  v
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

function formFor(userId: string, r: RbacRestriction | undefined): RestrictionForm {
  return {
    staffUserId: userId,
    ip_enforced: r?.ip_enforced ?? false,
    allowed_ips: (r?.allowed_ips ?? []).join("\n"),
    denied_ips: (r?.denied_ips ?? []).join("\n"),
    device_enforced: r?.device_enforced ?? false,
    trusted_devices: (r?.trusted_devices ?? []).join("\n"),
    blocked_devices: (r?.blocked_devices ?? []).join("\n"),
    time_enforced: r?.time_enforced ?? false,
    work_start: minutesToTime(r?.work_start_minute ?? 8 * 60),
    work_end: minutesToTime(r?.work_end_minute ?? 18 * 60),
    allowed_weekdays: r?.allowed_weekdays ?? [0, 1, 2, 3, 4],
    reason: r?.reason ?? "",
    effective_from: isoToRiyadhLocal(r?.effective_from ?? null),
    effective_to: isoToRiyadhLocal(r?.effective_to ?? null),
  };
}

export function SessionsPanel({
  data,
  canRevoke,
  canManageRestrictions,
  refresh,
}: {
  data: RbacOverview;
  canRevoke: boolean;
  canManageRestrictions: boolean;
  refresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [onlyLive, setOnlyLive] = useState(true);
  const [revoke, setRevoke] = useState<{ session: RbacSession; reason: string } | null>(null);
  const [revokeAll, setRevokeAll] = useState<{ staffUserId: string; reason: string } | null>(null);
  const [limits, setLimits] = useState<RestrictionForm | null>(null);

  const revokeFn = useServerFn(revokeRbacSession);
  const revokeAllFn = useServerFn(revokeAllRbacSessions);
  const saveFn = useServerFn(saveRbacRestrictions);

  const done = (msg: string) => {
    toast.success(msg);
    setRevoke(null);
    setRevokeAll(null);
    setLimits(null);
    refresh();
  };

  const revokeMut = useMutation({
    mutationFn: () => revokeFn({ data: { id: revoke!.session.id, reason: revoke!.reason } }),
    onSuccess: () => done("تم إبطال الجلسة."),
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeAllMut = useMutation({
    mutationFn: () =>
      revokeAllFn({ data: { staffUserId: revokeAll!.staffUserId, reason: revokeAll!.reason } }),
    onSuccess: () => done("تم إبطال جميع جلسات الموظف."),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveLimits = useMutation({
    mutationFn: () => {
      const f = limits!;
      return saveFn({
        data: {
          staffUserId: f.staffUserId,
          ip_enforced: f.ip_enforced,
          allowed_ips: lines(f.allowed_ips),
          denied_ips: lines(f.denied_ips),
          device_enforced: f.device_enforced,
          trusted_devices: lines(f.trusted_devices),
          blocked_devices: lines(f.blocked_devices),
          time_enforced: f.time_enforced,
          work_start_minute: timeToMinutes(f.work_start),
          work_end_minute: timeToMinutes(f.work_end),
          allowed_weekdays: f.allowed_weekdays,
          reason: f.reason || null,
          effective_from: f.effective_from ? riyadhLocalToIso(f.effective_from) : null,
          effective_to: f.effective_to ? riyadhLocalToIso(f.effective_to) : null,
        },
      });
    },
    onSuccess: () => done("تم حفظ القيود."),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const q = search.trim();
    return data.sessions.filter((s) => {
      if (onlyLive && s.revoked_at) return false;
      if (!q) return true;
      const owner = staffName(data.staff, s.user_id);
      return (
        owner.includes(q) ||
        (s.ip ?? "").includes(q) ||
        (s.device ?? "").includes(q) ||
        (s.browser ?? "").includes(q) ||
        s.device_fingerprint.includes(q)
      );
    });
  }, [data.sessions, data.staff, onlyLive, search]);

  const restrictionOf = (userId: string) => data.restrictions.find((r) => r.user_id === userId);

  return (
    <div className="space-y-5">
      <SectionCard
        title="جلستك الحالية"
        description="تُستخدم هذه البيانات في فرض قيود العنوان والجهاز."
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <KeyValue label="عنوان IP">{data.me.facts.ip}</KeyValue>
          <KeyValue label="الجهاز">{data.me.facts.device ?? "—"}</KeyValue>
          <KeyValue label="المتصفح">{data.me.facts.browser ?? "—"}</KeyValue>
          <KeyValue label="بصمة الجهاز">
            <span dir="ltr" className="font-mono text-[11px]">
              {data.me.facts.fingerprint}
            </span>
          </KeyValue>
        </div>
      </SectionCard>

      <SectionCard
        title="قيود الموظفين"
        description="القيود تُفرض خادمياً على كل عملية، وتسري داخل نافذة سريانها."
      >
        <DataCard>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-right">
              <thead>
                <tr>
                  <Th>الموظف</Th>
                  <Th>قيد العنوان</Th>
                  <Th>قيد الجهاز</Th>
                  <Th>نافذة العمل</Th>
                  <Th className="w-40">إجراءات</Th>
                </tr>
              </thead>
              <tbody>
                {data.staff.map((s) => {
                  const r = restrictionOf(s.user_id);
                  return (
                    <tr key={s.user_id} className="border-t border-border">
                      <Td>
                        <span className="block font-semibold">{s.full_name}</span>
                        <span className="block text-[11px] text-text-muted">{s.email}</span>
                      </Td>
                      <Td>
                        {r?.ip_enforced ? (
                          <Badge tone="green">مُفعّل ({r.allowed_ips.length})</Badge>
                        ) : (
                          <Badge tone="muted">غير مُفعّل</Badge>
                        )}
                        {(r?.denied_ips.length ?? 0) > 0 && (
                          <span className="text-caption mt-0.5 block">
                            محظورة: {r?.denied_ips.length}
                          </span>
                        )}
                      </Td>
                      <Td>
                        {r?.device_enforced ? (
                          <Badge tone="green">مُفعّل ({r.trusted_devices.length})</Badge>
                        ) : (
                          <Badge tone="muted">غير مُفعّل</Badge>
                        )}
                        {(r?.blocked_devices.length ?? 0) > 0 && (
                          <span className="text-caption mt-0.5 block">
                            محظورة: {r?.blocked_devices.length}
                          </span>
                        )}
                      </Td>
                      <Td>
                        {r?.time_enforced ? (
                          <span className="text-[12px]">
                            {minutesToTime(r.work_start_minute)} –{" "}
                            {minutesToTime(r.work_end_minute)} ·{" "}
                            {r.allowed_weekdays.map((d) => WEEKDAYS[d]).join("، ")}
                          </span>
                        ) : (
                          <Badge tone="muted">بدون قيد زمني</Badge>
                        )}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1.5">
                          {canManageRestrictions && (
                            <Btn
                              size="sm"
                              variant="outline"
                              onClick={() => setLimits(formFor(s.user_id, r))}
                            >
                              <ShieldCheck className="h-4 w-4" aria-hidden /> القيود
                            </Btn>
                          )}
                          {canRevoke && (
                            <Btn
                              size="sm"
                              variant="outline"
                              onClick={() => setRevokeAll({ staffUserId: s.user_id, reason: "" })}
                            >
                              <LogOut className="h-4 w-4" aria-hidden /> إبطال الجلسات
                            </Btn>
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DataCard>
      </SectionCard>

      <div>
        <PageToolbar
          search={search}
          setSearch={setSearch}
          placeholder="بحث بالموظف أو العنوان أو الجهاز…"
          filters={
            <label className="flex h-11 items-center gap-2 rounded-[var(--radius-m)] border border-border px-3 text-[13px]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--color-primary)]"
                checked={onlyLive}
                onChange={(e) => setOnlyLive(e.target.checked)}
              />
              الجلسات النشطة فقط
            </label>
          }
        />
        {rows.length === 0 ? (
          <DataCard>
            <EmptyState title="لا توجد جلسات مطابقة" />
          </DataCard>
        ) : (
          <DataCard>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-right">
                <thead>
                  <tr>
                    <Th>الموظف</Th>
                    <Th>الجهاز والمتصفح</Th>
                    <Th>العنوان</Th>
                    <Th>آخر نشاط</Th>
                    <Th>الطلبات</Th>
                    <Th className="w-24">إجراء</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className="border-t border-border">
                      <Td>{staffName(data.staff, s.user_id)}</Td>
                      <Td>
                        <span className="block text-[12px]">
                          {s.device ?? "—"} · {s.browser ?? "—"} · {s.os ?? "—"}
                        </span>
                        <span dir="ltr" className="block font-mono text-[11px] text-text-muted">
                          {s.device_fingerprint}
                        </span>
                      </Td>
                      <Td>
                        <span dir="ltr" className="font-mono text-[12px]">
                          {s.ip ?? "—"}
                        </span>
                      </Td>
                      <Td>
                        <span className="block text-[12px]">{formatRiyadh(s.last_seen_at)}</span>
                        <span className="text-caption block">
                          بدأت {formatRiyadh(s.first_seen_at)}
                        </span>
                      </Td>
                      <Td>
                        <span className="tabular-nums">{s.requests_count}</span>
                      </Td>
                      <Td>
                        {s.revoked_at ? (
                          <Badge tone="red">مُبطلة</Badge>
                        ) : (
                          canRevoke && (
                            <Btn
                              size="sm"
                              variant="outline"
                              onClick={() => setRevoke({ session: s, reason: "" })}
                            >
                              إبطال
                            </Btn>
                          )
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DataCard>
        )}
      </div>

      <Modal open={!!revoke} onClose={() => setRevoke(null)} title="إبطال الجلسة">
        {revoke && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              revokeMut.mutate();
            }}
          >
            <Field label="سبب الإبطال">
              <textarea
                className={inputCls}
                rows={3}
                value={revoke.reason}
                onChange={(e) => setRevoke({ ...revoke, reason: e.target.value })}
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Btn variant="outline" onClick={() => setRevoke(null)}>
                إلغاء
              </Btn>
              <Btn type="submit" variant="danger" loading={revokeMut.isPending}>
                إبطال
              </Btn>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!revokeAll} onClose={() => setRevokeAll(null)} title="إبطال جميع جلسات الموظف">
        {revokeAll && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              revokeAllMut.mutate();
            }}
          >
            <p className="text-body-sm text-muted-foreground">
              سيُطلب من {staffName(data.staff, revokeAll.staffUserId)} تسجيل الدخول من جديد على كل
              الأجهزة.
            </p>
            <Field label="سبب الإبطال">
              <textarea
                className={inputCls}
                rows={3}
                value={revokeAll.reason}
                onChange={(e) => setRevokeAll({ ...revokeAll, reason: e.target.value })}
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Btn variant="outline" onClick={() => setRevokeAll(null)}>
                إلغاء
              </Btn>
              <Btn type="submit" variant="danger" loading={revokeAllMut.isPending}>
                إبطال الكل
              </Btn>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!limits}
        onClose={() => setLimits(null)}
        title="قيود الوصول"
        description="أدخل كل عنوان أو بصمة في سطر مستقل. التوقيت بتوقيت الرياض."
        size="lg"
      >
        {limits && (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              saveLimits.mutate();
            }}
          >
            <fieldset className="rounded-[var(--radius-m)] border border-border p-4">
              <legend className="px-1 text-[12px] font-semibold">عناوين الشبكة</legend>
              <label className="mb-3 flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--color-primary)]"
                  checked={limits.ip_enforced}
                  onChange={(e) => setLimits({ ...limits, ip_enforced: e.target.checked })}
                />
                السماح فقط للعناوين الموثوقة
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="عناوين موثوقة" hint="IP أو نطاق CIDR">
                  <textarea
                    dir="ltr"
                    rows={4}
                    className={inputCls}
                    value={limits.allowed_ips}
                    onChange={(e) => setLimits({ ...limits, allowed_ips: e.target.value })}
                  />
                </Field>
                <Field label="عناوين محظورة" hint="تُرفض دائماً حتى لو كانت موثوقة">
                  <textarea
                    dir="ltr"
                    rows={4}
                    className={inputCls}
                    value={limits.denied_ips}
                    onChange={(e) => setLimits({ ...limits, denied_ips: e.target.value })}
                  />
                </Field>
              </div>
            </fieldset>

            <fieldset className="rounded-[var(--radius-m)] border border-border p-4">
              <legend className="px-1 text-[12px] font-semibold">الأجهزة</legend>
              <label className="mb-3 flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--color-primary)]"
                  checked={limits.device_enforced}
                  onChange={(e) => setLimits({ ...limits, device_enforced: e.target.checked })}
                />
                السماح فقط للأجهزة الموثوقة
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="بصمات موثوقة">
                  <textarea
                    dir="ltr"
                    rows={4}
                    className={inputCls}
                    value={limits.trusted_devices}
                    onChange={(e) => setLimits({ ...limits, trusted_devices: e.target.value })}
                  />
                </Field>
                <Field label="بصمات محظورة">
                  <textarea
                    dir="ltr"
                    rows={4}
                    className={inputCls}
                    value={limits.blocked_devices}
                    onChange={(e) => setLimits({ ...limits, blocked_devices: e.target.value })}
                  />
                </Field>
              </div>
            </fieldset>

            <fieldset className="rounded-[var(--radius-m)] border border-border p-4">
              <legend className="px-1 text-[12px] font-semibold">نافذة العمل</legend>
              <label className="mb-3 flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--color-primary)]"
                  checked={limits.time_enforced}
                  onChange={(e) => setLimits({ ...limits, time_enforced: e.target.checked })}
                />
                تقييد العمل بأوقات وأيام محددة
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="من الساعة">
                  <input
                    type="time"
                    className={inputCls}
                    value={limits.work_start}
                    onChange={(e) => setLimits({ ...limits, work_start: e.target.value })}
                  />
                </Field>
                <Field label="إلى الساعة">
                  <input
                    type="time"
                    className={inputCls}
                    value={limits.work_end}
                    onChange={(e) => setLimits({ ...limits, work_end: e.target.value })}
                  />
                </Field>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {WEEKDAYS.map((label, idx) => {
                  const on = limits.allowed_weekdays.includes(idx);
                  return (
                    <label
                      key={label}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] ${
                        on ? "border-primary bg-primary-soft text-primary" : "border-border"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={on}
                        onChange={() =>
                          setLimits({
                            ...limits,
                            allowed_weekdays: on
                              ? limits.allowed_weekdays.filter((d) => d !== idx)
                              : [...limits.allowed_weekdays, idx].sort(),
                          })
                        }
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="بداية سريان القيد (اختياري)">
                <input
                  type="datetime-local"
                  className={inputCls}
                  value={limits.effective_from}
                  onChange={(e) => setLimits({ ...limits, effective_from: e.target.value })}
                />
              </Field>
              <Field label="نهاية سريان القيد (اختياري)">
                <input
                  type="datetime-local"
                  className={inputCls}
                  value={limits.effective_to}
                  onChange={(e) => setLimits({ ...limits, effective_to: e.target.value })}
                />
              </Field>
            </div>

            <Field label="سبب القيد">
              <textarea
                className={inputCls}
                rows={2}
                value={limits.reason}
                onChange={(e) => setLimits({ ...limits, reason: e.target.value })}
              />
            </Field>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Btn variant="outline" onClick={() => setLimits(null)}>
                إلغاء
              </Btn>
              <Btn type="submit" loading={saveLimits.isPending}>
                حفظ القيود
              </Btn>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

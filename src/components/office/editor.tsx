/**
 * محرر مسودة الصفحة العامة.
 *
 * قاعدة اللقطة الكاملة: كل الحقول (المحتوى، النموذج، SEO، ظهور الفريق) تُحفظ
 * داخل المسودة، ولا يظهر شيء للعامة قبل «نشر» صريح. المحرر لا يعرض أي زر
 * لا يعمل: غير المصرَّح له يرى الحقول للقراءة فقط برسالة واضحة.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Copy, Download, ImagePlus, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Btn,
  ConfirmDialog,
  FormField,
  IconBtn,
  Modal,
  inputCls,
} from "@/lib/list-utils";
import {
  OFFICE_PAGE_STATUSES,
  OFFICE_PAGE_STATUS_LABELS,
  OFFICE_SERVICES,
  WEEK_DAYS,
  emptySnapshot,
  officeSnapshotSchema,
  publishBlockers,
  slugSchema,
  suggestSlug,
  type OfficePageStatus,
  type OfficeSnapshot,
} from "@/lib/office-page.shared";
import {
  changeOfficePageSlug,
  publishOfficePage,
  saveOfficePageDraft,
  unpublishOfficePage,
  uploadOfficePageMedia,
} from "@/lib/office-page.functions";
import { errMsg } from "@/lib/errors";

export type OfficePageStateView = {
  slug: string;
  status: string;
  version: number;
  suspended: boolean;
  suspensionReason: string | null;
  publishedAt: string | null;
  entitled: boolean;
  draft: OfficeSnapshot;
  hasPublished: boolean;
  dirty: boolean;
  blockers: string[];
  publicUrl: string;
  mediaUrls: { logo: string; cover: string; team: string[] };
};

/** الحالة القادمة من الخادم نصية؛ نطبّعها لعرض تسمية عربية صحيحة دائماً. */
function normalizeStatus(status: string): OfficePageStatus {
  return (OFFICE_PAGE_STATUSES as readonly string[]).includes(status)
    ? (status as OfficePageStatus)
    : "draft";
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

async function fileToBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 0x8000) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function OfficePageEditor({
  state,
  organizationId,
  canEdit,
}: {
  state: OfficePageStateView;
  organizationId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<OfficeSnapshot>(state.draft);
  const [slug, setSlug] = useState(state.slug);
  const [slugOpen, setSlugOpen] = useState(false);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const serverVersion = useRef(state.version);

  // نعيد تحميل المسودة من الخادم فقط عند تغيّر النسخة، حتى لا يُفقد إدخال المستخدم.
  useEffect(() => {
    if (serverVersion.current !== state.version) {
      serverVersion.current = state.version;
      setDraft(state.draft);
    }
    setSlug(state.slug);
  }, [state.version, state.draft, state.slug]);

  const media = state.mediaUrls;
  const blockers = useMemo(() => publishBlockers(draft), [draft]);
  const localDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(state.draft),
    [draft, state.draft],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["office-page", organizationId] });

  const save = useMutation({
    mutationFn: async () => {
      const parsed = officeSnapshotSchema.safeParse(draft);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "تحقق من الحقول.");
      return await saveOfficePageDraft({ data: { organizationId, draft: parsed.data } });
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("تم حفظ المسودة.");
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const publishMut = useMutation({
    mutationFn: async () => {
      if (localDirty) {
        const parsed = officeSnapshotSchema.parse(draft);
        await saveOfficePageDraft({ data: { organizationId, draft: parsed } });
      }
      return await publishOfficePage({ data: { organizationId } });
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("تم نشر الصفحة العامة.");
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const unpublishMut = useMutation({
    mutationFn: () => unpublishOfficePage({ data: { organizationId } }),
    onSuccess: async () => {
      setUnpublishOpen(false);
      await invalidate();
      toast.success("تم إيقاف نشر الصفحة.");
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const slugMut = useMutation({
    mutationFn: async () => {
      const parsed = slugSchema.safeParse(slug);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "رابط غير صالح.");
      return await changeOfficePageSlug({ data: { organizationId, slug: parsed.data } });
    },
    onSuccess: async () => {
      setSlugOpen(false);
      await invalidate();
      toast.success("تم تحديث الرابط العام.");
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const upload = useMutation({
    mutationFn: async (input: { kind: "logo" | "cover" | "team"; file: File; index?: number }) => {
      if (input.file.size > MAX_IMAGE_BYTES) throw new Error("حجم الصورة أكبر من 2 ميجابايت.");
      const base64 = await fileToBase64(input.file);
      const result = await uploadOfficePageMedia({
        data: {
          organizationId,
          kind: input.kind,
          contentType: input.file.type || "image/jpeg",
          base64,
        },
      });
      return { ...result, ...input };
    },
    onSuccess: async (result) => {
      setDraft((current) => {
        if (result.kind === "logo") return { ...current, logo_path: result.path };
        if (result.kind === "cover") return { ...current, cover_path: result.path };
        const team = current.team.map((member, i) =>
          i === result.index ? { ...member, photo_path: result.path } : member,
        );
        return { ...current, team };
      });
      await invalidate();
      toast.success("تم رفع الصورة — احفظ المسودة لتثبيتها.");
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const busy = save.isPending || publishMut.isPending || unpublishMut.isPending;
  const set = <K extends keyof OfficeSnapshot>(key: K, value: OfficeSnapshot[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  if (!state.entitled) {
    return (
      <div className="surface-card space-y-3 p-6">
        <h2 className="text-lg font-bold">الصفحة العامة غير مشمولة في باقتك الحالية</h2>
        <p className="text-body-sm text-muted-foreground">
          ميزة «الصفحة العامة للمكتب» تحتاج باقة تشملها. مسودتك محفوظة، وستعمل الصفحة فور ترقية
          الباقة. إن كانت صفحتك منشورة سابقاً فقد تم إيقاف عرضها للزوار.
        </p>
        <Btn onClick={() => (window.location.href = "/subscription")}>الانتقال إلى الاشتراك</Btn>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <StatusBar
        state={state}
        localDirty={localDirty}
        blockers={blockers}
        canEdit={canEdit}
        busy={busy}
        onSave={() => save.mutate()}
        onPublish={() => publishMut.mutate()}
        onUnpublish={() => setUnpublishOpen(true)}
        onSlug={() => setSlugOpen(true)}
        saving={save.isPending}
        publishing={publishMut.isPending}
      />

      {!canEdit && (
        <p className="rounded-[var(--radius-l)] border border-border bg-surface-muted px-4 py-3 text-body-sm text-muted-foreground">
          تحتاج صلاحية إدارة المكتب لتعديل الصفحة العامة أو نشرها. العرض هنا للقراءة فقط.
        </p>
      )}

      <fieldset disabled={!canEdit} className="space-y-5">
        <Section title="هوية المكتب">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="اسم المكتب" required>
              <input
                className={inputCls}
                maxLength={120}
                value={draft.office_name}
                onChange={(e) => set("office_name", e.target.value)}
              />
            </FormField>
            <FormField label="المدينة" required>
              <input
                className={inputCls}
                maxLength={60}
                value={draft.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </FormField>
            <FormField label="العنوان الرئيسي" required hint="أول ما يقرأه الزائر.">
              <input
                className={inputCls}
                maxLength={120}
                value={draft.headline}
                onChange={(e) => set("headline", e.target.value)}
              />
            </FormField>
            <FormField label="سطر تعريفي">
              <input
                className={inputCls}
                maxLength={200}
                value={draft.tagline}
                onChange={(e) => set("tagline", e.target.value)}
              />
            </FormField>
          </div>
          <FormField label="نبذة المكتب" required hint="40 حرفاً على الأقل.">
            <textarea
              rows={5}
              maxLength={2000}
              className={`${inputCls} min-h-28`}
              value={draft.about}
              onChange={(e) => set("about", e.target.value)}
            />
          </FormField>
          <FormField label="رقم الترخيص">
            <input
              className={inputCls}
              maxLength={60}
              value={draft.license_number}
              onChange={(e) => set("license_number", e.target.value)}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <MediaField
              label="الشعار"
              url={media.logo}
              disabled={!canEdit || upload.isPending}
              onPick={(file) => upload.mutate({ kind: "logo", file })}
              onClear={() => set("logo_path", "")}
              hasValue={!!draft.logo_path}
            />
            <MediaField
              label="صورة الغلاف"
              url={media.cover}
              disabled={!canEdit || upload.isPending}
              onPick={(file) => upload.mutate({ kind: "cover", file })}
              onClear={() => set("cover_path", "")}
              hasValue={!!draft.cover_path}
            />
          </div>
        </Section>

        <Section title="التواصل">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="الجوال" hint="بالصيغة الدولية: +9665XXXXXXXX">
              <input
                dir="ltr"
                className={inputCls}
                maxLength={24}
                value={draft.phone}
                onChange={(e) => set("phone", e.target.value.trim())}
              />
            </FormField>
            <FormField label="واتساب" hint="بالصيغة الدولية: +9665XXXXXXXX">
              <input
                dir="ltr"
                className={inputCls}
                maxLength={24}
                value={draft.whatsapp}
                onChange={(e) => set("whatsapp", e.target.value.trim())}
              />
            </FormField>
            <FormField label="البريد الإلكتروني">
              <input
                dir="ltr"
                className={inputCls}
                maxLength={160}
                value={draft.email}
                onChange={(e) => set("email", e.target.value.trim())}
              />
            </FormField>
            <FormField label="الموقع الإلكتروني" hint="يبدأ بـ https://">
              <input
                dir="ltr"
                className={inputCls}
                maxLength={400}
                value={draft.website}
                onChange={(e) => set("website", e.target.value.trim())}
              />
            </FormField>
            <FormField label="العنوان">
              <input
                className={inputCls}
                maxLength={200}
                value={draft.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </FormField>
            <FormField label="رابط الموقع على الخريطة" hint="يبدأ بـ https://">
              <input
                dir="ltr"
                className={inputCls}
                maxLength={400}
                value={draft.map_url}
                onChange={(e) => set("map_url", e.target.value.trim())}
              />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["instagram", "إنستقرام"],
                ["x", "منصة X"],
                ["linkedin", "لينكدإن"],
                ["tiktok", "تيك توك"],
                ["youtube", "يوتيوب"],
                ["snapchat", "سناب شات"],
              ] as const
            ).map(([key, label]) => (
              <FormField key={key} label={label}>
                <input
                  dir="ltr"
                  className={inputCls}
                  maxLength={400}
                  value={draft.socials[key]}
                  onChange={(e) =>
                    set("socials", { ...draft.socials, [key]: e.target.value.trim() })
                  }
                />
              </FormField>
            ))}
          </div>
        </Section>

        <Section title="أوقات العمل">
          <div className="space-y-2">
            {WEEK_DAYS.map((day) => {
              const hour =
                draft.hours.find((h) => h.day === day.key) ??
                emptySnapshot().hours.find((h) => h.day === day.key)!;
              const update = (patch: Partial<typeof hour>) => {
                const next = draft.hours.some((h) => h.day === day.key)
                  ? draft.hours.map((h) => (h.day === day.key ? { ...h, ...patch } : h))
                  : [...draft.hours, { ...hour, ...patch }];
                set("hours", next);
              };
              return (
                <div key={day.key} className="flex flex-wrap items-center gap-3 text-body-sm">
                  <span className="w-20 shrink-0">{day.label}</span>
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={hour.closed}
                      onChange={(e) => update({ closed: e.target.checked })}
                    />
                    <span>مغلق</span>
                  </label>
                  <input
                    type="time"
                    aria-label={`بداية دوام ${day.label}`}
                    className={`${inputCls} w-32`}
                    disabled={hour.closed}
                    value={hour.from}
                    onChange={(e) => update({ from: e.target.value })}
                  />
                  <input
                    type="time"
                    aria-label={`نهاية دوام ${day.label}`}
                    className={`${inputCls} w-32`}
                    disabled={hour.closed}
                    value={hour.to}
                    onChange={(e) => update({ to: e.target.value })}
                  />
                </div>
              );
            })}
          </div>
        </Section>

        <Section
          title="مجالات العمل"
          action={
            canEdit && draft.services.length < 12 ? (
              <Btn
                variant="outline"
                size="sm"
                onClick={() =>
                  set("services", [...draft.services, { key: "", title: "", description: "" }])
                }
              >
                <Plus className="size-4" /> إضافة خدمة
              </Btn>
            ) : null
          }
        >
          {draft.services.length === 0 ? (
            <p className="text-body-sm text-muted-foreground">أضف خدمة واحدة على الأقل للنشر.</p>
          ) : (
            <div className="space-y-3">
              {draft.services.map((service, index) => (
                <div key={index} className="rounded-[var(--radius-l)] border border-border p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="نوع الخدمة">
                      <select
                        className={inputCls}
                        value={service.key}
                        onChange={(e) => {
                          const key = e.target.value;
                          const preset = OFFICE_SERVICES.find((s) => s.key === key);
                          set(
                            "services",
                            draft.services.map((s, i) =>
                              i === index
                                ? { ...s, key, title: s.title || (preset?.label ?? "") }
                                : s,
                            ),
                          );
                        }}
                      >
                        <option value="">اختر</option>
                        {OFFICE_SERVICES.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="العنوان الظاهر">
                      <input
                        className={inputCls}
                        maxLength={80}
                        value={service.title}
                        onChange={(e) =>
                          set(
                            "services",
                            draft.services.map((s, i) =>
                              i === index ? { ...s, title: e.target.value } : s,
                            ),
                          )
                        }
                      />
                    </FormField>
                  </div>
                  <FormField label="وصف مختصر">
                    <textarea
                      rows={2}
                      maxLength={300}
                      className={`${inputCls} min-h-20`}
                      value={service.description}
                      onChange={(e) =>
                        set(
                          "services",
                          draft.services.map((s, i) =>
                            i === index ? { ...s, description: e.target.value } : s,
                          ),
                        )
                      }
                    />
                  </FormField>
                  {canEdit && (
                    <div className="mt-2 flex justify-end">
                      <IconBtn
                        tone="danger"
                        aria-label={`حذف الخدمة ${service.title || index + 1}`}
                        title="حذف الخدمة"
                        onClick={() =>
                          set(
                            "services",
                            draft.services.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                      </IconBtn>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="فريق المكتب"
          action={
            canEdit && draft.team.length < 12 ? (
              <Btn
                variant="outline"
                size="sm"
                onClick={() =>
                  set("team", [
                    ...draft.team,
                    { name: "", title: "", bio: "", photo_path: "", specialties: [] },
                  ])
                }
              >
                <Plus className="size-4" /> إضافة عضو
              </Btn>
            ) : null
          }
        >
          <label className="flex min-h-11 items-center gap-2 text-body-sm">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={draft.team_visible}
              onChange={(e) => set("team_visible", e.target.checked)}
            />
            <span>إظهار الفريق في الصفحة العامة</span>
          </label>
          <p className="text-caption text-muted-foreground">
            بيانات الفريق هنا تسويقية فقط، ولا تُقرأ من سجلات الموظفين.
          </p>
          {draft.team.map((member, index) => (
            <div key={index} className="rounded-[var(--radius-l)] border border-border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="الاسم">
                  <input
                    className={inputCls}
                    maxLength={80}
                    value={member.name}
                    onChange={(e) =>
                      set(
                        "team",
                        draft.team.map((m, i) => (i === index ? { ...m, name: e.target.value } : m)),
                      )
                    }
                  />
                </FormField>
                <FormField label="المسمى">
                  <input
                    className={inputCls}
                    maxLength={80}
                    value={member.title}
                    onChange={(e) =>
                      set(
                        "team",
                        draft.team.map((m, i) =>
                          i === index ? { ...m, title: e.target.value } : m,
                        ),
                      )
                    }
                  />
                </FormField>
              </div>
              <FormField label="نبذة">
                <textarea
                  rows={2}
                  maxLength={400}
                  className={`${inputCls} min-h-20`}
                  value={member.bio}
                  onChange={(e) =>
                    set(
                      "team",
                      draft.team.map((m, i) => (i === index ? { ...m, bio: e.target.value } : m)),
                    )
                  }
                />
              </FormField>
              <div className="grid gap-3 sm:grid-cols-2">
                <MediaField
                  label="صورة العضو"
                  url={media.team[index] ?? ""}
                  disabled={!canEdit || upload.isPending}
                  onPick={(file) => upload.mutate({ kind: "team", file, index })}
                  onClear={() =>
                    set(
                      "team",
                      draft.team.map((m, i) => (i === index ? { ...m, photo_path: "" } : m)),
                    )
                  }
                  hasValue={!!member.photo_path}
                />
                {canEdit && (
                  <div className="flex items-end justify-end">
                    <IconBtn
                      tone="danger"
                      aria-label={`حذف العضو ${member.name || index + 1}`}
                      title="حذف العضو"
                      onClick={() =>
                        set(
                          "team",
                          draft.team.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </IconBtn>
                  </div>
                )}
              </div>
            </div>
          ))}
        </Section>

        <Section title="نموذج طلب الاستشارة">
          <div className="space-y-2">
            {(
              [
                ["enabled", "تفعيل النموذج"],
                ["require_phone", "الجوال مطلوب"],
                ["require_email", "البريد مطلوب"],
                ["require_city", "المدينة مطلوبة"],
                ["service_choice", "إظهار اختيار الخدمة"],
                ["consent_required", "طلب الموافقة على معالجة البيانات"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex min-h-11 items-center gap-2 text-body-sm">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={draft.lead_form[key]}
                  onChange={(e) =>
                    set("lead_form", { ...draft.lead_form, [key]: e.target.checked })
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <FormField label="رسالة الشكر بعد الإرسال">
            <input
              className={inputCls}
              maxLength={300}
              value={draft.lead_form.thank_you}
              onChange={(e) => set("lead_form", { ...draft.lead_form, thank_you: e.target.value })}
            />
          </FormField>
          <FormField label="نص الموافقة">
            <textarea
              rows={2}
              maxLength={400}
              className={`${inputCls} min-h-20`}
              value={draft.lead_form.consent_text}
              onChange={(e) =>
                set("lead_form", { ...draft.lead_form, consent_text: e.target.value })
              }
            />
          </FormField>
        </Section>

        <Section title="الظهور في محركات البحث">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="عنوان الصفحة" hint="70 حرفاً كحد أقصى.">
              <input
                className={inputCls}
                maxLength={70}
                value={draft.seo.title}
                onChange={(e) => set("seo", { ...draft.seo, title: e.target.value })}
              />
            </FormField>
            <FormField label="الوصف" hint="180 حرفاً كحد أقصى.">
              <input
                className={inputCls}
                maxLength={180}
                value={draft.seo.description}
                onChange={(e) => set("seo", { ...draft.seo, description: e.target.value })}
              />
            </FormField>
          </div>
        </Section>
      </fieldset>

      <Modal open={slugOpen} onClose={() => setSlugOpen(false)} title="تغيير الرابط العام">
        <div className="space-y-4">
          <FormField
            label="الرابط"
            hint="أحرف لاتينية صغيرة وأرقام وشرطة. تغيير الرابط يُبطل الرابط القديم فوراً."
          >
            <input
              dir="ltr"
              className={inputCls}
              maxLength={40}
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().trim())}
            />
          </FormField>
          <Btn
            variant="outline"
            size="sm"
            onClick={() => setSlug(suggestSlug(draft.office_name || state.slug))}
          >
            اقترح رابطاً من اسم المكتب
          </Btn>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Btn variant="outline" onClick={() => setSlugOpen(false)}>
              إلغاء
            </Btn>
            <Btn onClick={() => slugMut.mutate()} loading={slugMut.isPending}>
              حفظ الرابط
            </Btn>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={unpublishOpen}
        onClose={() => setUnpublishOpen(false)}
        onConfirm={() => unpublishMut.mutate()}
        title="إيقاف نشر الصفحة"
        message="سيتوقف ظهور الصفحة للزوار فوراً. المسودة والطلبات المستلمة تبقى محفوظة."
        confirmLabel="إيقاف النشر"
        loading={unpublishMut.isPending}
      />
    </div>
  );
}

function StatusBar({
  state,
  localDirty,
  blockers,
  canEdit,
  busy,
  saving,
  publishing,
  onSave,
  onPublish,
  onUnpublish,
  onSlug,
}: {
  state: OfficePageStateView;
  localDirty: boolean;
  blockers: string[];
  canEdit: boolean;
  busy: boolean;
  saving: boolean;
  publishing: boolean;
  onSave: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onSlug: () => void;
}) {
  const [qr, setQr] = useState("");
  const status = normalizeStatus(state.status);

  const buildQr = async () => {
    const QRCode = await import("qrcode");
    const url = await QRCode.toDataURL(state.publicUrl, { width: 512, margin: 1 });
    setQr(url);
  };

  return (
    <div className="surface-card space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge
          tone={
            state.suspended
              ? "red"
              : status === "published"
                ? "green"
                : status === "draft"
                  ? "muted"
                  : "warn"
          }
        >
          {state.suspended ? "موقوفة من المنصة" : OFFICE_PAGE_STATUS_LABELS[status]}
        </Badge>
        {(localDirty || state.dirty) && state.hasPublished && (
          <Badge tone="gold">تغييرات غير منشورة</Badge>
        )}
        <a
          href={state.publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          dir="ltr"
          className="break-all text-body-sm text-primary underline"
        >
          {state.publicUrl}
        </a>
        <IconBtn
          aria-label="نسخ الرابط العام"
          title="نسخ الرابط العام"
          onClick={() => {
            void navigator.clipboard
              .writeText(state.publicUrl)
              .then(() => toast.success("تم نسخ الرابط."))
              .catch(() => toast.error("تعذّر النسخ، انسخ الرابط يدوياً."));
          }}
        >
          <Copy className="size-4" />
        </IconBtn>
      </div>

      {state.suspended && (
        <p className="flex items-start gap-2 rounded-[var(--radius-l)] border border-danger/25 bg-danger-soft px-4 py-3 text-body-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            أوقفت منصة مِهلة نشر هذه الصفحة. {state.suspensionReason || "راسل دعم مِهلة للتفاصيل."}
          </span>
        </p>
      )}

      {blockers.length > 0 && (
        <div className="rounded-[var(--radius-l)] border border-warning/25 bg-warning-soft px-4 py-3 text-body-sm text-warning">
          <p className="font-semibold">لا يمكن النشر قبل إكمال:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Btn onClick={onSave} loading={saving} disabled={!canEdit || busy || !localDirty}>
          حفظ المسودة
        </Btn>
        <Btn
          variant="outline"
          onClick={onPublish}
          loading={publishing}
          disabled={!canEdit || busy || blockers.length > 0 || state.suspended}
          title={
            state.suspended
              ? "الصفحة موقوفة من المنصة"
              : blockers.length > 0
                ? "أكمل الحقول المطلوبة أولاً"
                : undefined
          }
        >
          {state.hasPublished ? "نشر التحديثات" : "نشر الصفحة"}
        </Btn>
        {status === "published" && (
          <Btn variant="danger" onClick={onUnpublish} disabled={!canEdit || busy}>
            إيقاف النشر
          </Btn>
        )}
        <Btn variant="outline" onClick={onSlug} disabled={!canEdit || busy}>
          تغيير الرابط
        </Btn>
        <Btn variant="outline" onClick={() => void buildQr()}>
          <ImagePlus className="size-4" /> رمز QR
        </Btn>
      </div>

      {qr && (
        <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius-l)] border border-border p-4">
          <img src={qr} alt={`رمز QR لصفحة ${state.slug}`} className="size-32" />
          <a
            href={qr}
            download={`mehla-office-${state.slug}.png`}
            className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-m)] border border-border px-4 text-body-sm"
          >
            <Download className="size-4" /> تنزيل الرمز
          </a>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function MediaField({
  label,
  url,
  hasValue,
  disabled,
  onPick,
  onClear,
}: {
  label: string;
  url: string;
  hasValue: boolean;
  disabled: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const inputId = useMemo(() => `media-${Math.random().toString(36).slice(2, 9)}`, []);
  return (
    <div className="space-y-2">
      <span className="block text-caption font-medium">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        {url ? (
          <img
            src={url}
            alt={label}
            className="size-16 rounded-[var(--radius-m)] border border-border object-cover"
          />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-[var(--radius-m)] border border-dashed border-border text-caption text-muted-foreground">
            لا صورة
          </div>
        )}
        <label
          htmlFor={inputId}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-m)] border border-border px-4 text-body-sm"
        >
          <ImagePlus className="size-4" /> اختيار صورة
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onPick(file);
          }}
        />
        {hasValue && (
          <IconBtn
            tone="danger"
            aria-label={`إزالة ${label}`}
            title={`إزالة ${label}`}
            onClick={onClear}
          >
            <Trash2 className="size-4" />
          </IconBtn>
        )}
      </div>
      <p className="text-caption text-muted-foreground">PNG أو JPG أو WEBP، بحد أقصى 2 ميجابايت.</p>
    </div>
  );
}

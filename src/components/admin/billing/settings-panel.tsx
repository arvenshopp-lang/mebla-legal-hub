import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, KeyRound, PlugZap, RefreshCw, ShieldAlert } from "lucide-react";
import {
  Btn,
  ErrorBlock,
  FormField,
  Modal,
  SectionCard,
  SectionLoader,
  Td,
  Th,
  inputCls,
  Badge,
} from "@/lib/list-utils";
import {
  billingListSettings,
  billingPreviewSequence,
  billingProviderStats,
  billingSaveProviderSecrets,
  billingSaveTaxSettings,
  billingSetProviderEnabled,
  billingTestProvider,
  billingUpdateProviderConfig,
  billingUpdateSequence,
} from "@/lib/billing/billing.functions";
import { PROVIDER_STATUS_LABELS, formatDateTime } from "@/lib/billing/billing.shared";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { num } from "./shared";

type SequenceKind = "invoice" | "quote" | "credit_note";

const SEQUENCE_LABELS: Record<SequenceKind, string> = {
  invoice: "الفواتير",
  quote: "عروض السعر",
  credit_note: "إشعارات الخصم",
};

const SECRET_LABELS: Record<string, string> = {
  api_key: "المفتاح السري (Secret Key)",
  secret_key: "المفتاح السري (Secret Key)",
  publishable_key: "المفتاح القابل للنشر (Publishable Key)",
  webhook_secret: "رمز التحقق للرسائل الواردة (Webhook Secret)",
};

export function SettingsPanel() {
  const qc = useQueryClient();
  const { can } = usePlatformAdmin();
  const manage = can("billing.manage_providers");

  const settingsFn = useServerFn(billingListSettings);
  const statsFn = useServerFn(billingProviderStats);
  const enableFn = useServerFn(billingSetProviderEnabled);
  const testFn = useServerFn(billingTestProvider);
  const secretsFn = useServerFn(billingSaveProviderSecrets);
  const configFn = useServerFn(billingUpdateProviderConfig);
  const sequenceFn = useServerFn(billingUpdateSequence);
  const previewFn = useServerFn(billingPreviewSequence);
  const taxFn = useServerFn(billingSaveTaxSettings);

  const settings = useQuery({
    queryKey: ["billing-settings"],
    queryFn: () => settingsFn({ data: undefined as never }),
  });
  const stats = useQuery({
    queryKey: ["billing-provider-stats"],
    queryFn: () => statsFn({ data: undefined as never }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["billing-settings"] });
    qc.invalidateQueries({ queryKey: ["billing-provider-stats"] });
  };

  /* ----------------------------------------------------------- المزوّدون */
  const [secretsFor, setSecretsFor] = useState<string | null>(null);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});

  const enable = useMutation({
    mutationFn: (input: { code: string; enabled: boolean }) => enableFn({ data: input as never }),
    onSuccess: (_r, input) => {
      toast.success(input.enabled ? "تم تفعيل المزوّد." : "تم تعطيل المزوّد.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const test = useMutation({
    mutationFn: (code: string) => testFn({ data: { code } as never }),
    onSuccess: (result) => {
      const outcome = result as { ok: boolean; message?: string };
      if (outcome.ok) toast.success(outcome.message ?? "نجح اختبار الاتصال.");
      else toast.error(outcome.message ?? "فشل اختبار الاتصال.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveSecrets = useMutation({
    mutationFn: (input: { code: string; secrets: Record<string, string> }) =>
      secretsFn({ data: input as never }),
    onSuccess: () => {
      toast.success("تم حفظ المفاتيح مشفّرة داخل الخزنة.");
      setSecretsFor(null);
      setSecretValues({});
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveConfig = useMutation({
    mutationFn: (input: { code: string; sortOrder?: number; mode?: "sandbox" | "production" }) =>
      configFn({ data: input as never }),
    onSuccess: () => {
      toast.success("تم تحديث إعدادات المزوّد.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const providers = settings.data?.providers ?? [];
  const statRows = useMemo(
    () => new Map((stats.data ?? []).map((row) => [row.code, row])),
    [stats.data],
  );
  const activeProvider = providers.find((provider) => provider.code === secretsFor) ?? null;

  useEffect(() => {
    if (!activeProvider) return;
    setSecretValues(Object.fromEntries(activeProvider.required_keys.map((key) => [key, ""])));
  }, [activeProvider]);

  /* -------------------------------------------------------------- الترقيم */
  const [seqEdit, setSeqEdit] = useState<{
    kind: SequenceKind;
    periodKey: string;
    prefix: string;
    padding: number;
  } | null>(null);
  const saveSequence = useMutation({
    mutationFn: (input: {
      kind: SequenceKind;
      periodKey: string;
      prefix: string;
      padding: number;
    }) => sequenceFn({ data: input as never }),
    onSuccess: () => {
      toast.success("تم تحديث إعدادات الترقيم.");
      setSeqEdit(null);
      qc.invalidateQueries({ queryKey: ["billing-settings"] });
      qc.invalidateQueries({ queryKey: ["billing-sequence-preview"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const year = String(new Date().getFullYear());
  const previews = useQuery({
    queryKey: ["billing-sequence-preview", year],
    queryFn: async () => {
      const kinds: SequenceKind[] = ["invoice", "quote", "credit_note"];
      const results = await Promise.all(
        kinds.map((kind) => previewFn({ data: { kind, periodKey: year } })),
      );
      return results;
    },
  });

  /* -------------------------------------------------------------- الضريبة */
  const [tax, setTax] = useState({
    defaultRate: 15,
    taxNumber: "",
    sellerName: "",
    sellerAddress: "",
    paymentTermsDays: 14,
    bankDetails: "",
    commercialRegistration: "",
    contactPhone: "",
    contactEmail: "",
    website: "",
    signatoryName: "",
    signatoryTitle: "",
    documentFooterNote: "",
  });
  const [taxDirty, setTaxDirty] = useState(false);

  useEffect(() => {
    if (settings.data?.tax && !taxDirty) setTax(settings.data.tax);
  }, [settings.data?.tax, taxDirty]);

  const saveTax = useMutation({
    mutationFn: () => taxFn({ data: tax as never }),
    onSuccess: () => {
      toast.success("تم حفظ إعدادات الضريبة والفوترة.");
      setTaxDirty(false);
      qc.invalidateQueries({ queryKey: ["billing-settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (settings.isPending)
    return <SectionLoader label="جاري تحميل إعدادات المركز المالي…" rows={5} />;
  if (settings.isError) return <ErrorBlock message={(settings.error as Error).message} />;

  return (
    <div className="space-y-5">
      <SectionCard
        title="مزودو الدفع"
        description="التحصيل اليدوي متاح دائماً. المزودون الإلكترونيون يحتاجون مفاتيح واختبار اتصال ناجح قبل التفعيل."
        actions={
          <Btn variant="outline" size="sm" onClick={() => invalidate()}>
            <RefreshCw className="h-4 w-4" aria-hidden /> تحديث
          </Btn>
        }
      >
        <div className="divide-y divide-border">
          {providers.map((provider) => {
            const stat = statRows.get(provider.code);
            return (
              <div key={provider.code} className="grid gap-3 p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-body font-semibold">{provider.name_ar}</h4>
                    <Badge tone={provider.is_enabled ? "green" : "muted"}>
                      {provider.is_enabled ? "مُفعّل" : "معطّل"}
                    </Badge>
                    <Badge
                      tone={
                        provider.connection_status === "verified"
                          ? "green"
                          : provider.connection_status === "failed"
                            ? "red"
                            : "warn"
                      }
                    >
                      {PROVIDER_STATUS_LABELS[provider.connection_status] ??
                        provider.connection_status}
                    </Badge>
                    {stat?.mode && (
                      <Badge tone={stat.mode === "production" ? "green" : "warn"}>
                        {stat.mode === "production" ? "بيئة الإنتاج" : "بيئة تجريبية"}
                      </Badge>
                    )}
                  </div>
                  {provider.description && (
                    <p className="text-caption mt-1">{provider.description}</p>
                  )}
                  <dl className="mt-3 grid gap-x-6 gap-y-1 text-caption sm:grid-cols-2">
                    <div>آخر اختبار: {formatDateTime(provider.last_tested_at)}</div>
                    <div>مسار الرسائل: {provider.webhook_path ?? "—"}</div>
                    <div>آخر عملية ناجحة: {formatDateTime(stat?.last_success_at ?? null)}</div>
                    <div>آخر عملية فاشلة: {formatDateTime(stat?.last_failure_at ?? null)}</div>
                    {stat?.supports_webhooks && (
                      <div>
                        رسائل فاشلة: {stat?.webhook_failed ?? 0} — فاشلة نهائياً:{" "}
                        {stat?.webhook_dead_letter ?? 0}
                      </div>
                    )}
                  </dl>
                  {provider.last_test_error && (
                    <p className="mt-2 flex items-start gap-1.5 text-[12px] text-danger">
                      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      {provider.last_test_error}
                    </p>
                  )}
                  {provider.secrets.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {provider.secrets.map((secret) => (
                        <li key={secret.fieldKey}>
                          <Badge tone={secret.status === "stored" ? "green" : "muted"}>
                            {SECRET_LABELS[secret.fieldKey] ?? secret.fieldKey}: {secret.hint}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                  {manage && provider.requires_credentials && (
                    <>
                      <Btn variant="outline" size="sm" onClick={() => setSecretsFor(provider.code)}>
                        <KeyRound className="h-4 w-4" aria-hidden /> المفاتيح
                      </Btn>
                      <Btn
                        variant="outline"
                        size="sm"
                        loading={test.isPending && test.variables === provider.code}
                        onClick={() => test.mutate(provider.code)}
                      >
                        <PlugZap className="h-4 w-4" aria-hidden /> اختبار الاتصال
                      </Btn>
                      <label className="inline-flex items-center gap-2 text-body-sm">
                        <span className="sr-only">بيئة التشغيل</span>
                        <select
                          className={`${inputCls} h-9 w-36 py-1`}
                          value={stat?.mode ?? "sandbox"}
                          onChange={(event) =>
                            saveConfig.mutate({
                              code: provider.code,
                              mode: event.target.value as "sandbox" | "production",
                            })
                          }
                        >
                          <option value="sandbox">بيئة تجريبية</option>
                          <option value="production">بيئة الإنتاج</option>
                        </select>
                      </label>
                    </>
                  )}
                  {manage && (
                    <Btn
                      variant={provider.is_enabled ? "outline" : "primary"}
                      size="sm"
                      loading={enable.isPending && enable.variables?.code === provider.code}
                      onClick={() =>
                        enable.mutate({ code: provider.code, enabled: !provider.is_enabled })
                      }
                    >
                      {provider.is_enabled ? "تعطيل" : "تفعيل"}
                    </Btn>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        title="الترقيم النظامي"
        description="البادئة وعدد الخانات فقط قابلة للتعديل. الرقم القادم يُدار في قاعدة البيانات بقفل يمنع التكرار نهائياً."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr>
                <Th>النوع</Th>
                <Th>الفترة</Th>
                <Th>البادئة</Th>
                <Th>عدد الخانات</Th>
                <Th>الرقم القادم</Th>
                <Th className="text-left">إجراءات</Th>
              </tr>
            </thead>
            <tbody>
              {(previews.data ?? []).map((row) => (
                <tr key={`${row.kind}-${row.periodKey}`} className="border-t border-border">
                  <Td>{SEQUENCE_LABELS[row.kind as SequenceKind] ?? row.kind}</Td>
                  <Td className="tabular-nums">{row.periodKey}</Td>
                  <Td className="tabular-nums">{row.prefix}</Td>
                  <Td className="tabular-nums">{row.padding}</Td>
                  <Td className="tabular-nums">{row.preview}</Td>
                  <Td className="text-left">
                    {manage && (
                      <Btn
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setSeqEdit({
                            kind: row.kind as SequenceKind,
                            periodKey: row.periodKey,
                            prefix: row.prefix,
                            padding: row.padding,
                          })
                        }
                      >
                        تعديل
                      </Btn>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="الضريبة وبيانات الجهة المُصدرة"
        description="تُطبَّق على الفواتير الجديدة. الفواتير المُصدرة تحتفظ بنسبتها المحفوظة وقت الإصدار."
        actions={
          manage && (
            <Btn
              size="sm"
              loading={saveTax.isPending}
              onClick={() => saveTax.mutate()}
              disabled={!taxDirty}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden /> حفظ
            </Btn>
          )
        }
      >
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <FormField label="نسبة ضريبة القيمة المضافة %" required>
            <input
              className={inputCls}
              inputMode="decimal"
              disabled={!manage}
              value={String(tax.defaultRate)}
              onChange={(event) => {
                setTaxDirty(true);
                setTax({ ...tax, defaultRate: num(event.target.value) });
              }}
            />
          </FormField>
          <FormField label="الرقم الضريبي للجهة">
            <input
              className={inputCls}
              disabled={!manage}
              value={tax.taxNumber}
              onChange={(event) => {
                setTaxDirty(true);
                setTax({ ...tax, taxNumber: event.target.value });
              }}
            />
          </FormField>
          <FormField label="اسم الجهة المُصدرة" required>
            <input
              className={inputCls}
              disabled={!manage}
              value={tax.sellerName}
              onChange={(event) => {
                setTaxDirty(true);
                setTax({ ...tax, sellerName: event.target.value });
              }}
            />
          </FormField>
          <FormField label="مدة السماح للسداد (يوم)">
            <input
              className={inputCls}
              inputMode="numeric"
              disabled={!manage}
              value={String(tax.paymentTermsDays)}
              onChange={(event) => {
                setTaxDirty(true);
                setTax({ ...tax, paymentTermsDays: Math.round(num(event.target.value)) });
              }}
            />
          </FormField>
          <FormField label="عنوان الجهة">
            <textarea
              className={`${inputCls} min-h-20`}
              disabled={!manage}
              value={tax.sellerAddress}
              onChange={(event) => {
                setTaxDirty(true);
                setTax({ ...tax, sellerAddress: event.target.value });
              }}
            />
          </FormField>
          <FormField label="بيانات التحويل البنكي" hint="تظهر في أسفل الفاتورة وفي بريد الإصدار.">
            <textarea
              className={`${inputCls} min-h-20`}
              disabled={!manage}
              value={tax.bankDetails}
              onChange={(event) => {
                setTaxDirty(true);
                setTax({ ...tax, bankDetails: event.target.value });
              }}
            />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard
        title="هوية المستندات (PDF)"
        description="تظهر في ترويسة وتذييل الفواتير وعروض الأسعار والعقود، وتُطبَّق فوراً على أي ملف يُصدَر بعد الحفظ."
        actions={
          manage && (
            <Btn
              size="sm"
              loading={saveTax.isPending}
              onClick={() => saveTax.mutate()}
              disabled={!taxDirty}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden /> حفظ
            </Btn>
          )
        }
      >
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <FormField label="السجل التجاري">
            <input
              className={inputCls}
              dir="ltr"
              disabled={!manage}
              value={tax.commercialRegistration}
              onChange={(event) => {
                setTaxDirty(true);
                setTax({ ...tax, commercialRegistration: event.target.value });
              }}
            />
          </FormField>
          <FormField label="جوال التواصل">
            <input
              className={inputCls}
              dir="ltr"
              inputMode="tel"
              disabled={!manage}
              value={tax.contactPhone}
              onChange={(event) => {
                setTaxDirty(true);
                setTax({ ...tax, contactPhone: event.target.value });
              }}
            />
          </FormField>
          <FormField label="بريد التواصل">
            <input
              className={inputCls}
              dir="ltr"
              type="email"
              disabled={!manage}
              value={tax.contactEmail}
              onChange={(event) => {
                setTaxDirty(true);
                setTax({ ...tax, contactEmail: event.target.value });
              }}
            />
          </FormField>
          <FormField label="الموقع الإلكتروني">
            <input
              className={inputCls}
              dir="ltr"
              disabled={!manage}
              value={tax.website}
              onChange={(event) => {
                setTaxDirty(true);
                setTax({ ...tax, website: event.target.value });
              }}
            />
          </FormField>
          <FormField label="اسم المُفوَّض بالتوقيع">
            <input
              className={inputCls}
              disabled={!manage}
              value={tax.signatoryName}
              onChange={(event) => {
                setTaxDirty(true);
                setTax({ ...tax, signatoryName: event.target.value });
              }}
            />
          </FormField>
          <FormField label="المسمى الوظيفي للمُفوَّض">
            <input
              className={inputCls}
              disabled={!manage}
              value={tax.signatoryTitle}
              onChange={(event) => {
                setTaxDirty(true);
                setTax({ ...tax, signatoryTitle: event.target.value });
              }}
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField
              label="سطر التذييل"
              hint="يظهر أسفل كل صفحة. اتركه فارغاً لاستخدام العبارة الافتراضية."
            >
              <input
                className={inputCls}
                disabled={!manage}
                maxLength={300}
                value={tax.documentFooterNote}
                onChange={(event) => {
                  setTaxDirty(true);
                  setTax({ ...tax, documentFooterNote: event.target.value });
                }}
              />
            </FormField>
          </div>
        </div>
      </SectionCard>

      <Modal
        open={Boolean(activeProvider)}
        onClose={() => setSecretsFor(null)}
        title={`مفاتيح ${activeProvider?.name_ar ?? ""}`}
        description="تُحفظ مشفّرة (AES-256-GCM) ولا تُعاد للواجهة أبداً. اتركها فارغة للإبقاء على القيمة الحالية."
        busy={saveSecrets.isPending}
        busyLabel="جاري الحفظ…"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!activeProvider) return;
            const filled = Object.fromEntries(
              Object.entries(secretValues).filter(([, value]) => value.trim().length > 0),
            );
            if (Object.keys(filled).length === 0) {
              toast.error("أدخل مفتاحاً واحداً على الأقل.");
              return;
            }
            saveSecrets.mutate({ code: activeProvider.code, secrets: filled });
          }}
        >
          {(activeProvider?.required_keys ?? []).map((key) => (
            <FormField key={key} label={SECRET_LABELS[key] ?? key}>
              <input
                className={inputCls}
                type="password"
                autoComplete="new-password"
                value={secretValues[key] ?? ""}
                onChange={(event) =>
                  setSecretValues({ ...secretValues, [key]: event.target.value })
                }
              />
            </FormField>
          ))}
          <div className="flex justify-end gap-2">
            <Btn variant="outline" onClick={() => setSecretsFor(null)}>
              إلغاء
            </Btn>
            <Btn type="submit" loading={saveSecrets.isPending}>
              حفظ المفاتيح
            </Btn>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(seqEdit)}
        onClose={() => setSeqEdit(null)}
        title="تعديل الترقيم"
        description="لا يمكن إرجاع الرقم القادم للخلف حمايةً من تكرار الأرقام النظامية."
      >
        {seqEdit && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveSequence.mutate(seqEdit);
            }}
          >
            <FormField label="النوع">
              <input className={inputCls} value={SEQUENCE_LABELS[seqEdit.kind]} disabled />
            </FormField>
            <FormField label="البادئة" required hint="حروف لاتينية كبيرة وأرقام وشرطات فقط.">
              <input
                className={inputCls}
                value={seqEdit.prefix}
                onChange={(event) =>
                  setSeqEdit({ ...seqEdit, prefix: event.target.value.toUpperCase() })
                }
              />
            </FormField>
            <FormField label="عدد الخانات" required hint="بين 3 و 10.">
              <input
                className={inputCls}
                inputMode="numeric"
                value={String(seqEdit.padding)}
                onChange={(event) =>
                  setSeqEdit({ ...seqEdit, padding: Math.round(num(event.target.value)) })
                }
              />
            </FormField>
            <div className="flex justify-end gap-2">
              <Btn variant="outline" onClick={() => setSeqEdit(null)}>
                إلغاء
              </Btn>
              <Btn type="submit" loading={saveSequence.isPending}>
                حفظ
              </Btn>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

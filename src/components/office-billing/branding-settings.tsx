/**
 * هوية مستندات الفوترة: شعار المكتب، تذييل المستند، بيانات التحويل البنكي،
 * ومفوّض التوقيع. الرفع والحفظ يمرّان بدوال خادمية تتحقق من صلاحية الإدارة.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ImageUp, Trash2 } from "lucide-react";
import { Btn, FormField, inputCls, LoadingBlock, ErrorBlock } from "@/lib/list-utils";
import {
  deleteInvoiceBrandingLogo,
  getInvoiceBranding,
  saveInvoiceBranding,
  uploadInvoiceBrandingLogo,
} from "@/lib/office-billing/pdf.functions";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg"];

const errMsg = (e: unknown): string =>
  e instanceof Error ? e.message : "حدث خطأ غير متوقع. أعد المحاولة.";

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function InvoiceBrandingSettings({ orgId }: { orgId: string | null }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const load = useServerFn(getInvoiceBranding);
  const save = useServerFn(saveInvoiceBranding);
  const upload = useServerFn(uploadInvoiceBrandingLogo);
  const removeLogo = useServerFn(deleteInvoiceBrandingLogo);

  const [footerNote, setFooterNote] = useState("");
  const [bankDetails, setBankDetails] = useState("");
  const [signatoryName, setSignatoryName] = useState("");
  const [signatoryTitle, setSignatoryTitle] = useState("");
  const [showSignature, setShowSignature] = useState(true);

  const query = useQuery({
    queryKey: ["office-invoice-branding", orgId],
    enabled: !!orgId,
    queryFn: () => load({ data: { organizationId: orgId! } }),
  });

  useEffect(() => {
    const data = query.data;
    if (!data) return;
    setFooterNote(data.footerNote ?? "");
    setBankDetails(data.bankDetails ?? "");
    setSignatoryName(data.signatoryName ?? "");
    setSignatoryTitle(data.signatoryTitle ?? "");
    setShowSignature(data.showSignature);
  }, [query.data]);

  const canManage = query.data?.canManage ?? false;

  const saveText = useMutation({
    mutationFn: () =>
      save({
        data: {
          organizationId: orgId!,
          footerNote: footerNote.trim() || null,
          bankDetails: bankDetails.trim() || null,
          signatoryName: signatoryName.trim() || null,
          signatoryTitle: signatoryTitle.trim() || null,
          showSignature,
        },
      }),
    onSuccess: () => {
      toast.success("تم حفظ هوية مستندات الفوترة.");
      void qc.invalidateQueries({ queryKey: ["office-invoice-branding"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      if (!ACCEPTED.includes(file.type)) throw new Error("الصيغة المدعومة: PNG أو JPEG فقط.");
      if (file.size > MAX_BYTES) throw new Error("حجم الشعار يجب أن يكون أقل من 2 ميجابايت.");
      return upload({
        data: { organizationId: orgId!, base64: toBase64(await file.arrayBuffer()) },
      });
    },
    onSuccess: () => {
      toast.success("تم رفع شعار الفواتير.");
      void qc.invalidateQueries({ queryKey: ["office-invoice-branding"] });
    },
    onError: (e) => toast.error(errMsg(e)),
    onSettled: () => {
      if (fileRef.current) fileRef.current.value = "";
    },
  });

  const clearLogo = useMutation({
    mutationFn: () => removeLogo({ data: { organizationId: orgId! } }),
    onSuccess: () => {
      toast.success("تم حذف الشعار.");
      void qc.invalidateQueries({ queryKey: ["office-invoice-branding"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (!orgId) return null;
  if (query.isLoading) return <LoadingBlock />;
  if (query.error) return <ErrorBlock message={errMsg(query.error)} />;

  const preview = query.data?.logoPreview ?? null;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold">هوية مستندات الفوترة</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        تصدر الفواتير وكشوف الحسابات وإيصالات الدفع باسم مكتبك وشعاره. هذه الإعدادات لا تظهر
        للعملاء إلا داخل المستندات الصادرة.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <div className="flex h-24 w-40 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/40">
          {preview ? (
            <img
              src={preview}
              alt="شعار المكتب المستخدم في مستندات الفوترة"
              className="max-h-20 max-w-36 object-contain"
            />
          ) : (
            <span className="text-caption text-muted-foreground">لا يوجد شعار</span>
          )}
        </div>
        <div className="space-y-2">
          <input
            ref={fileRef}
            id="invoice-logo-input"
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            disabled={!canManage || uploadLogo.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadLogo.mutate(file);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Btn
              variant="outline"
              disabled={!canManage}
              loading={uploadLogo.isPending}
              onClick={() => fileRef.current?.click()}
            >
              <ImageUp className="inline h-4 w-4 me-1" aria-hidden /> رفع شعار
            </Btn>
            {preview ? (
              <Btn
                variant="outline"
                disabled={!canManage}
                loading={clearLogo.isPending}
                onClick={() => clearLogo.mutate()}
              >
                <Trash2 className="inline h-4 w-4 me-1" aria-hidden /> حذف الشعار
              </Btn>
            ) : null}
          </div>
          <p className="text-caption text-muted-foreground">
            PNG أو JPEG بحد أقصى 2 ميجابايت. يُفضّل خلفية شفافة وارتفاع 200 بكسل على الأقل.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <FormField label="اسم مفوّض التوقيع">
          <input
            className={inputCls}
            value={signatoryName}
            disabled={!canManage}
            maxLength={120}
            onChange={(e) => setSignatoryName(e.target.value)}
          />
        </FormField>
        <FormField label="صفة المفوّض">
          <input
            className={inputCls}
            value={signatoryTitle}
            disabled={!canManage}
            maxLength={120}
            onChange={(e) => setSignatoryTitle(e.target.value)}
          />
        </FormField>
        <FormField label="بيانات التحويل البنكي" hint="تظهر في الفاتورة وكشف الحساب.">
          <textarea
            className={`${inputCls} min-h-24`}
            value={bankDetails}
            disabled={!canManage}
            maxLength={600}
            onChange={(e) => setBankDetails(e.target.value)}
          />
        </FormField>
        <FormField label="تذييل المستند" hint="سطر أو سطران يظهران أسفل كل مستند مالي.">
          <textarea
            className={`${inputCls} min-h-24`}
            value={footerNote}
            disabled={!canManage}
            maxLength={600}
            onChange={(e) => setFooterNote(e.target.value)}
          />
        </FormField>
      </div>

      <label className="mt-4 flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={showSignature}
          disabled={!canManage}
          onChange={(e) => setShowSignature(e.target.checked)}
        />
        إظهار خانات التوقيع في المستندات الصادرة
      </label>

      {canManage ? (
        <div className="mt-5">
          <Btn loading={saveText.isPending} onClick={() => saveText.mutate()}>
            حفظ الهوية
          </Btn>
        </div>
      ) : (
        <p className="mt-5 text-caption text-muted-foreground">
          تعديل هوية مستندات الفوترة متاح لمالك المكتب والمدير فقط.
        </p>
      )}
    </section>
  );
}
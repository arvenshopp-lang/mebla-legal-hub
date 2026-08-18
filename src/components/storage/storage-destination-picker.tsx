/**
 * مكون اختيار وجهة التخزين مع التحقق اللحظي من اتصال OneDrive
 * Storage Destination Selector Component with Real-Time OAuth Connection Verification
 */
import * as React from "react";
import { ShieldCheck, Cloud, RefreshCw, Check, AlertCircle, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getHybridStorageSettingsFn } from "@/lib/storage/hybrid-storage.functions";
import type { StorageDestination } from "@/lib/storage/hybrid-storage.shared";
import { toast } from "sonner";

interface Props {
  value: StorageDestination;
  onChange: (val: StorageDestination) => void;
  label?: string;
  className?: string;
  organizationId?: string;
}

export function StorageDestinationPicker({
  value,
  onChange,
  label = "وجهة حفظ المستندات",
  className = "",
  organizationId,
}: Props) {
  const { data } = useQuery({
    queryKey: ["hybrid-storage-settings", organizationId],
    queryFn: () => getHybridStorageSettingsFn({ data: { organizationId } }),
    staleTime: 30000,
  });

  const isOneDriveConnected = Boolean(data?.settings?.onedrive?.connected);
  const onedriveAuthUrl = data?.onedriveAuthUrl;

  const handleSelectOneDrive = (target: "onedrive" | "both") => {
    if (!isOneDriveConnected) {
      toast.warning("حساب Microsoft OneDrive غير متصل", {
        description: "يلزم تسجيل الدخول وربط حساب مايكروسوفت أولاً لتفعيل الرفع إلى OneDrive.",
        action: onedriveAuthUrl
          ? {
              label: "ربط الحساب الآن",
              onClick: () => {
                window.open(onedriveAuthUrl, "_blank", "noopener,noreferrer");
              },
            }
          : undefined,
      });
      if (onedriveAuthUrl) {
        window.open(onedriveAuthUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }
    onChange(target);
  };

  return (
    <div className={`space-y-2.5 ${className}`}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-foreground">{label}</label>
          <span className="text-[11px] text-muted-foreground">تخزين هجين مشفر (BYOS)</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {/* Option 1: MEHLA Secure Vault */}
        <button
          type="button"
          onClick={() => onChange("vault")}
          className={`relative flex flex-col items-start rounded-xl border p-3.5 text-right transition ${
            value === "vault"
              ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm"
              : "border-border bg-card hover:border-border/80 hover:bg-muted/30"
          }`}
        >
          <div className="flex w-full items-center justify-between">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <ShieldCheck className="h-4 w-4" />
            </div>
            {value === "vault" && (
              <div className="rounded-full bg-primary p-0.5 text-primary-foreground">
                <Check className="h-3 w-3" />
              </div>
            )}
          </div>
          <span className="mt-2 text-xs font-bold text-foreground">خزينة مِهلة الآمنة</span>
          <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">
            حفظ وتشفير محلي مع ميزات البحث الذكي والـ OCR الفوري.
          </p>
        </button>

        {/* Option 2: Microsoft OneDrive */}
        <button
          type="button"
          onClick={() => handleSelectOneDrive("onedrive")}
          className={`relative flex flex-col items-start rounded-xl border p-3.5 text-right transition ${
            value === "onedrive" && isOneDriveConnected
              ? "border-blue-600 bg-blue-500/5 ring-1 ring-blue-600 shadow-sm"
              : isOneDriveConnected
                ? "border-border bg-card hover:border-border/80 hover:bg-muted/30"
                : "border-dashed border-amber-300 dark:border-amber-800 bg-amber-50/20 dark:bg-amber-950/10 hover:border-amber-400"
          }`}
        >
          <div className="flex w-full items-center justify-between">
            <div className={`rounded-lg p-2 ${isOneDriveConnected ? "bg-blue-500/10 text-blue-600" : "bg-amber-500/10 text-amber-600"}`}>
              <Cloud className="h-4 w-4" />
            </div>
            {value === "onedrive" && isOneDriveConnected ? (
              <div className="rounded-full bg-blue-600 p-0.5 text-white">
                <Check className="h-3 w-3" />
              </div>
            ) : !isOneDriveConnected ? (
              <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">
                <span>انقر للربط</span>
                <ExternalLink className="h-2.5 w-2.5" />
              </div>
            ) : null}
          </div>
          <span className="mt-2 text-xs font-bold text-foreground">سحابة OneDrive</span>
          <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">
            {isOneDriveConnected
              ? "توجيه ورفع الملفات مباشرة لحساب OneDrive الخاص بالمكتب."
              : "يتطلب ربط حساب مايكروسوفت لتفعيل الرفع المباشر."}
          </p>
        </button>

        {/* Option 3: Dual Sync (Both) */}
        <button
          type="button"
          onClick={() => handleSelectOneDrive("both")}
          className={`relative flex flex-col items-start rounded-xl border p-3.5 text-right transition ${
            value === "both" && isOneDriveConnected
              ? "border-indigo-600 bg-indigo-500/5 ring-1 ring-indigo-600 shadow-sm"
              : isOneDriveConnected
                ? "border-border bg-card hover:border-border/80 hover:bg-muted/30"
                : "border-dashed border-amber-300 dark:border-amber-800 bg-amber-50/20 dark:bg-amber-950/10 hover:border-amber-400"
          }`}
        >
          <div className="flex w-full items-center justify-between">
            <div className={`rounded-lg p-2 ${isOneDriveConnected ? "bg-indigo-500/10 text-indigo-600" : "bg-amber-500/10 text-amber-600"}`}>
              <RefreshCw className="h-4 w-4" />
            </div>
            {value === "both" && isOneDriveConnected ? (
              <div className="rounded-full bg-indigo-600 p-0.5 text-white">
                <Check className="h-3 w-3" />
              </div>
            ) : !isOneDriveConnected ? (
              <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">
                <span>انقر للربط</span>
                <ExternalLink className="h-2.5 w-2.5" />
              </div>
            ) : null}
          </div>
          <span className="mt-2 text-xs font-bold text-foreground">مزامنة مزدوجة (كلاهما)</span>
          <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">
            {isOneDriveConnected
              ? "نسخة في خزينة مِهلة للذكاء الاصطناعي ونسخة في OneDrive."
              : "يتطلب ربط حساب مايكروسوفت لتفعيل المزامنة المزدوجة."}
          </p>
        </button>
      </div>
    </div>
  );
}

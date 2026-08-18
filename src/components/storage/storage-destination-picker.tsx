/**
 * مكون اختيار وجهة التخزين (خزينة مِهلة / سحابة ون درايف / كلاهما)
 * Storage Destination Selector Component
 */
import * as React from "react";
import { ShieldCheck, Cloud, RefreshCw, Check } from "lucide-react";
import type { StorageDestination } from "@/lib/storage/hybrid-storage.shared";

interface Props {
  value: StorageDestination;
  onChange: (val: StorageDestination) => void;
  label?: string;
  className?: string;
}

export function StorageDestinationPicker({
  value,
  onChange,
  label = "وجهة حفظ المستندات",
  className = "",
}: Props) {
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
          onClick={() => onChange("onedrive")}
          className={`relative flex flex-col items-start rounded-xl border p-3.5 text-right transition ${
            value === "onedrive"
              ? "border-blue-600 bg-blue-500/5 ring-1 ring-blue-600 shadow-sm"
              : "border-border bg-card hover:border-border/80 hover:bg-muted/30"
          }`}
        >
          <div className="flex w-full items-center justify-between">
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600">
              <Cloud className="h-4 w-4" />
            </div>
            {value === "onedrive" && (
              <div className="rounded-full bg-blue-600 p-0.5 text-white">
                <Check className="h-3 w-3" />
              </div>
            )}
          </div>
          <span className="mt-2 text-xs font-bold text-foreground">سحابة OneDrive</span>
          <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">
            توجيه ورفع الملفات مباشرة لحساب OneDrive الخاص بالمكتب.
          </p>
        </button>

        {/* Option 3: Dual Sync (Both) */}
        <button
          type="button"
          onClick={() => onChange("both")}
          className={`relative flex flex-col items-start rounded-xl border p-3.5 text-right transition ${
            value === "both"
              ? "border-indigo-600 bg-indigo-500/5 ring-1 ring-indigo-600 shadow-sm"
              : "border-border bg-card hover:border-border/80 hover:bg-muted/30"
          }`}
        >
          <div className="flex w-full items-center justify-between">
            <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-600">
              <RefreshCw className="h-4 w-4" />
            </div>
            {value === "both" && (
              <div className="rounded-full bg-indigo-600 p-0.5 text-white">
                <Check className="h-3 w-3" />
              </div>
            )}
          </div>
          <span className="mt-2 text-xs font-bold text-foreground">مزامنة مزدوجة (كلاهما)</span>
          <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">
            نسخة في خزينة مِهلة للذكاء الاصطناعي ونسخة في OneDrive.
          </p>
        </button>
      </div>
    </div>
  );
}

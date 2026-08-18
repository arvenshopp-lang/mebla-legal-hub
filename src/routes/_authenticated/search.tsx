import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Search, ScanText } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { FeatureGate } from "@/components/subscription/feature-gate";
import { supabase } from "@/integrations/supabase/client";
import { searchDocumentPages } from "@/lib/documents/search.functions";
import { useAuth } from "@/hooks/use-auth";
import { fmtDate } from "@/lib/enums";
import {
  Badge,
  Btn,
  EmptyState,
  ErrorBlock,
  FormField,
  LoadingBlock,
  Pagination,
  inputCls,
  useDebounced,
} from "@/lib/list-utils";
import { ExtractedTextDialog, type DocumentRow } from "@/components/documents/text-intel";

export const Route = createFileRoute("/_authenticated/search")({
  component: Page,
  head: () => ({
    meta: [
      { title: "البحث في المستندات | مِهلة" },
      {
        name: "description",
        content: "ابحث داخل نصوص مستندات مكتبك وملفات PDF المفهرسة والصور الممسوحة ضوئياً.",
      },
      { property: "og:title", content: "البحث في المستندات | مِهلة" },
      {
        property: "og:description",
        content: "بحث نصي متقدم داخل مستندات القضايا مع تحديد الصفحة المطابقة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PAGE_SIZE = 20;

type Hit = {
  document_id: string;
  page_id: string;
  page_number: number;
  file_name: string;
  file_type: string | null;
  document_created_at: string;
  case_id: string | null;
  case_title: string | null;
  client_id: string | null;
  client_name: string | null;
  ocr_used: boolean;
  snippet: string;
  rank: number;
  total_count: number;
};

/** يعرض مقتطف الـ ts_headline بأمان — يُقسَّم إلى نص عادي وأجزاء مُبرَزة بدل إدخال HTML. */
function Snippet({ html }: { html: string }) {
  const parts = html.split(/(<mark>.*?<\/mark>)/g).filter(Boolean);
  return (
    <p dir="auto" className="text-[13px] leading-7 text-muted-foreground">
      {parts.map((part, i) =>
        part.startsWith("<mark>") ? (
          <mark key={i} className="rounded bg-accent/25 px-0.5 font-semibold text-foreground">
            {part.replace(/<\/?mark>/g, "")}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

function Page() {
  return (
    <DashboardShell title="البحث في المستندات">
      <FeatureGate feature="pdf_search_enabled">
        <SearchPanel />
      </FeatureGate>
    </DashboardShell>
  );
}

function SearchPanel() {
  const { activeOrgId } = useAuth();
  const runSearch = useServerFn(searchDocumentPages);
  const [term, setTerm] = useState("");
  const [caseId, setCaseId] = useState("");
  const [clientId, setClientId] = useState("");
  const [fileType, setFileType] = useState("");
  const [ocrOnly, setOcrOnly] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<DocumentRow | null>(null);
  const q = useDebounced(term);

  const { data: cases } = useQuery({
    queryKey: ["cases-basic", activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () =>
      (await supabase.from("cases").select("id, case_title").eq("organization_id", activeOrgId!))
        .data ?? [],
  });
  const { data: clients } = useQuery({
    queryKey: ["clients-basic", activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () =>
      (await supabase.from("clients").select("id, full_name").eq("organization_id", activeOrgId!))
        .data ?? [],
  });

  const { data, isLoading, isFetching, error } = useQuery({
    placeholderData: keepPreviousData,
    queryKey: [
      "document-search",
      activeOrgId,
      q,
      caseId,
      clientId,
      fileType,
      ocrOnly,
      from,
      to,
      page,
    ],
    enabled: !!activeOrgId && q.trim().length >= 2,
    queryFn: async () => {
      const result = await runSearch({
        data: {
          organizationId: activeOrgId!,
          query: q.trim(),
          caseId: caseId || null,
          clientId: clientId || null,
          fileType: fileType || null,
          ocrOnly,
          from: from || null,
          to: to || null,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        },
      });
      return { rows: result.rows as Hit[], count: result.count };
    },
  });

  const resetPage =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setPage(1);
    };

  return (
    <div className="space-y-5">
      <div className="surface-card p-4 sm:p-5">
        <label className="relative block">
          <span className="sr-only">كلمة البحث داخل المستندات</span>
          <Search
            className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            value={term}
            onChange={(e) => resetPage(setTerm)(e.target.value)}
            placeholder="ابحث عن كلمة أو عبارة داخل نصوص المستندات…"
            className={`${inputCls} pe-10 text-[14.5px]`}
          />
        </label>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="القضية">
            <select
              value={caseId}
              onChange={(e) => resetPage(setCaseId)(e.target.value)}
              className={inputCls}
            >
              <option value="">كل القضايا</option>
              {(cases ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.case_title}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="العميل">
            <select
              value={clientId}
              onChange={(e) => resetPage(setClientId)(e.target.value)}
              className={inputCls}
            >
              <option value="">كل العملاء</option>
              {(clients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="نوع الملف">
            <select
              value={fileType}
              onChange={(e) => resetPage(setFileType)(e.target.value)}
              className={inputCls}
            >
              <option value="">كل الأنواع</option>
              <option value="pdf">PDF</option>
              <option value="word">Word</option>
              <option value="image">صور</option>
              <option value="text">نص</option>
            </select>
          </FormField>
          <FormField label="من تاريخ">
            <input
              type="date"
              value={from}
              onChange={(e) => resetPage(setFrom)(e.target.value)}
              className={inputCls}
            />
          </FormField>
          <FormField label="إلى تاريخ">
            <input
              type="date"
              value={to}
              onChange={(e) => resetPage(setTo)(e.target.value)}
              className={inputCls}
            />
          </FormField>
          <FormField label="مصدر النص">
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ocrOnly}
                onChange={(e) => resetPage(setOcrOnly)(e.target.checked)}
              />
              الصفحات المقروءة ضوئياً فقط
            </label>
          </FormField>
        </div>
      </div>

      {q.trim().length < 2 ? (
        <EmptyState
          title="ابدأ البحث داخل مستنداتك"
          hint="اكتب حرفين على الأقل. يشمل البحث ملفات PDF وWord والصور الممسوحة ضوئياً بعد فهرستها."
        />
      ) : isLoading ? (
        <LoadingBlock rows={5} cols={1} />
      ) : error ? (
        <ErrorBlock message={(error as Error).message} />
      ) : !data?.rows.length ? (
        <EmptyState title="لا توجد نتائج مطابقة" hint="جرّب كلمات أقل أو أزل عوامل التصفية." />
      ) : (
        <>
          <p className="text-[13px] text-muted-foreground" aria-live="polite">
            {data.count} نتيجة مطابقة{isFetching ? " · جاري التحديث…" : ""}
          </p>
          <ul className="space-y-3">
            {data.rows.map((hit) => (
              <li key={hit.page_id}>
                <div className="surface-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="flex items-center gap-2 text-[14.5px] font-semibold">
                        <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                        <span className="truncate">{hit.file_name}</span>
                      </h3>
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        صفحة {hit.page_number}
                        {hit.case_title ? ` · ${hit.case_title}` : ""}
                        {hit.client_name ? ` · ${hit.client_name}` : ""} ·{" "}
                        {fmtDate(hit.document_created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {hit.ocr_used && (
                        <Badge tone="warn">
                          <ScanText className="me-1 inline h-3 w-3" aria-hidden /> OCR
                        </Badge>
                      )}
                      <Btn
                        variant="outline"
                        onClick={() =>
                          setViewing({
                            id: hit.document_id,
                            organization_id: activeOrgId!,
                            file_name: hit.file_name,
                            file_path: "",
                            file_type: hit.file_type,
                          })
                        }
                      >
                        فتح النص
                      </Btn>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-border pt-3">
                    <Snippet html={hit.snippet} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={page} setPage={setPage} total={data.count} pageSize={PAGE_SIZE} />
        </>
      )}

      <ExtractedTextDialog doc={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

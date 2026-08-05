/** أنواع مشتقة من دوال الدعم الخادمية — مصدر واحد للحقيقة. */
import type {
  getSupportConfig,
  getSupportReport,
  getSupportWorkspace,
} from "@/lib/support/support.functions";

type Awaited2<T> = T extends Promise<infer U> ? U : T;

export type SupportWorkspace = Awaited2<ReturnType<typeof getSupportWorkspace>>;
export type SupportConfigData = Awaited2<ReturnType<typeof getSupportConfig>>;
export type SupportReportData = Awaited2<ReturnType<typeof getSupportReport>>;

import type { Db as SupabaseDb } from "@/lib/supabase-db.shared";
/**
 * توجيه البريد الوارد على «الأسماء المستعارة» (Aliases) — خادمي فقط.
 *
 * في إعداد Hostinger الحالي هناك حساب حقيقي واحد يملك بيانات الدخول
 * (SMTP/IMAP أو Agentic)، أما support/sales/billing/legal/info فهي Aliases
 * تُسلَّم إلى نفس الصندوق الحقيقي. لذلك لا يُسجَّل الدخول إلى أي Alias، ويُحدَّد
 * القسم من عناوين الرسالة نفسها: Delivered-To ثم X-Original-To ثم To ثم Cc.
 *
 * لا جداول ولا محرك بريد جديد: هذه الطبقة تُرجع عنوان الصندوق المنطقي فقط
 * ليُمرَّر إلى `ingestInbound` و`linkInboundToTicket` القائمين.
 */

type Db = SupabaseDb;

export type AliasRoutingResult = {
  /** عنوان الصندوق المنطقي الذي ستُستوعب الرسالة تحته. */
  address: string;
  /** true إذا طابق أحد عناوين الرسالة صندوقاً مُفعّلاً فعلاً. */
  matched: boolean;
  /** العنوان الذي حقّق المطابقة (للتدقيق فقط). */
  matchedHeader: "delivered-to" | "original-to" | "to" | "cc" | null;
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** عناوين الصناديق البشرية المُفعّلة للاستقبال (Aliases منطقية). */
export async function inboundAliasAddresses(db: Db): Promise<Set<string>> {
  const { data } = await db
    .from("email_mailboxes")
    .select("address, type, is_active, inbound_enabled")
    .neq("type", "system")
    .eq("is_active", true)
    .eq("inbound_enabled", true);
  return new Set(
    ((data ?? []) as { address: string }[]).map((row) => normalize(row.address)).filter(Boolean),
  );
}

/**
 * تحديد الصندوق المنطقي لرسالة واردة وصلت إلى الحساب الحقيقي.
 * الأولوية للترويسة الأقرب لواقع التسليم، ثم To ثم Cc، وأخيراً الصندوق الافتراضي.
 */
export function routeInboundAddress(
  aliases: Set<string>,
  headers: {
    deliveredTo?: string[] | null;
    originalTo?: string[] | null;
    to?: string[] | null;
    cc?: string[] | null;
  },
  fallbackAddress: string,
): AliasRoutingResult {
  const groups: { key: AliasRoutingResult["matchedHeader"]; values: string[] }[] = [
    { key: "delivered-to", values: headers.deliveredTo ?? [] },
    { key: "original-to", values: headers.originalTo ?? [] },
    { key: "to", values: headers.to ?? [] },
    { key: "cc", values: headers.cc ?? [] },
  ];
  for (const group of groups) {
    for (const raw of group.values) {
      const address = normalize(raw);
      if (address && aliases.has(address)) {
        return { address, matched: true, matchedHeader: group.key };
      }
    }
  }
  return { address: normalize(fallbackAddress), matched: false, matchedHeader: null };
}

/** نسخة تقرأ الأسماء المستعارة من القاعدة عند الحاجة لرسالة واحدة. */
export async function resolveInboundAddress(
  db: Db,
  headers: Parameters<typeof routeInboundAddress>[1],
  fallbackAddress: string,
): Promise<AliasRoutingResult> {
  return routeInboundAddress(await inboundAliasAddresses(db), headers, fallbackAddress);
}

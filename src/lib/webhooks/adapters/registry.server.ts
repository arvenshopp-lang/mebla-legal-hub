/**
 * سجل المُحوِّلات — نقطة التوسّع الوحيدة.
 * ربط مزوّد جديد = صنف مُحوِّل واحد + سطر هنا + صف في `webhook_endpoints`.
 */
import type { WebhookAdapter } from "./base.server";
import { GenericJsonWebhookAdapter } from "./generic-json.server";
import { WhatsLineWebhookAdapter } from "./whatsline.server";

const ADAPTERS: Record<string, WebhookAdapter> = {
  whatsline: new WhatsLineWebhookAdapter(),
  generic_json: new GenericJsonWebhookAdapter(),
};

/** يُعيد المُحوِّل المطلوب، ويرتد إلى المُحوِّل العام إن لم يوجد مخصص. */
export function getWebhookAdapter(adapterType: string): WebhookAdapter {
  return ADAPTERS[adapterType] ?? ADAPTERS["generic_json"]!;
}

export function webhookAdapterExists(adapterType: string): boolean {
  return Boolean(ADAPTERS[adapterType]);
}

export function listWebhookAdapterTypes(): string[] {
  return Object.keys(ADAPTERS);
}
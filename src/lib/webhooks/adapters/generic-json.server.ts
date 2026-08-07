/**
 * مُحوِّل عام لأي مزوّد يرسل JSON — نقطة البداية لأي ربط مستقبلي
 * قبل كتابة مُحوِّل مخصص له.
 */
import {
  readObject,
  readString,
  redactRecord,
  toIso,
  type NormalizedWebhookEvent,
  type WebhookAdapter,
} from "./base.server";

export class GenericJsonWebhookAdapter implements WebhookAdapter {
  readonly adapterType = "generic_json";

  normalize(payload: unknown): NormalizedWebhookEvent[] {
    const body = readObject(payload, "data") ?? readObject(payload, "payload") ?? payload;
    return [
      {
        type: readString(payload, "event", "event_type", "type") ?? "generic.event",
        providerEventId: readString(payload, "id", "event_id") ?? readString(body, "id"),
        occurredAt: toIso(readString(payload, "timestamp", "created_at", "occurred_at")),
        subject: readString(payload, "reference", "subject") ?? null,
        data: { provider: "generic_json" },
      },
    ];
  }

  redact(payload: unknown): Record<string, unknown> {
    return redactRecord(payload);
  }
}

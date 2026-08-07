/**
 * مُحوِّل Whats Line Official API.
 * يترجم الرسائل الواردة وتحديثات حالة الرسائل إلى الحدث الموحّد داخل مِهلة.
 */
import { maskPhone } from "../webhooks.shared";
import {
  readObject,
  readString,
  redactRecord,
  toIso,
  type NormalizedWebhookEvent,
  type WebhookAdapter,
} from "./base.server";

const TYPE_MAP: Record<string, string> = {
  "message.received": "message.received",
  message_received: "message.received",
  inbound_message: "message.received",
  "message.status": "message.status",
  message_status: "message.status",
  status_update: "message.status",
};

export class WhatsLineWebhookAdapter implements WebhookAdapter {
  readonly adapterType = "whatsline";

  normalize(payload: unknown): NormalizedWebhookEvent[] {
    const rawType =
      readString(payload, "event", "event_type", "type", "eventType") ?? "unknown";
    const type = TYPE_MAP[rawType] ?? rawType;
    const body = readObject(payload, "data") ?? readObject(payload, "payload") ?? payload;

    const phone =
      readString(body, "from", "sender", "msisdn", "phone", "wa_id", "to", "recipient") ?? "";
    const providerEventId =
      readString(payload, "id", "event_id", "message_id", "messageId") ??
      readString(body, "id", "message_id", "messageId");
    const occurredAt =
      toIso(readString(payload, "timestamp", "created_at", "occurred_at")) ??
      toIso(readString(body, "timestamp", "created_at"));

    const data: Record<string, unknown> = {
      provider: "whatsline",
      rawType,
      messageId: readString(body, "message_id", "messageId", "id"),
      phoneMasked: phone ? maskPhone(phone) : null,
      status: readString(body, "status", "state", "delivery_status"),
      text: readString(body, "text", "body", "message", "caption"),
      conversationId: readString(body, "conversation_id", "chat_id", "session_id"),
    };

    return [
      {
        type,
        providerEventId,
        occurredAt,
        subject: phone ? maskPhone(phone) : (data.conversationId as string | null),
        data,
      },
    ];
  }

  redact(payload: unknown): Record<string, unknown> {
    return redactRecord(payload);
  }
}
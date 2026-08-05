/**
 * OCR provider layer — server only.
 *
 * The rest of the platform depends on the `OcrProvider` interface, never on a
 * concrete vendor, so a provider can be swapped without touching UI or pipeline
 * code. The default provider runs through the Lovable AI gateway (Gemini vision),
 * which handles Arabic, English and mixed pages and needs no customer-managed key.
 */

export type OcrInput = {
  /** صورة الصفحة بترميز base64 دون بادئة data:. */
  imageBase64: string;
  mimeType: string;
  pageNumber: number;
  /** تلميح اللغة: ar | en | mixed. */
  languageHint?: "ar" | "en" | "mixed";
};

export type OcrResult = {
  text: string;
  confidence: number;
  language: string;
  isBlank: boolean;
  provider: string;
};

export interface OcrProvider {
  readonly name: string;
  extractDocument(input: OcrInput): Promise<OcrResult>;
}

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.6-flash";

const PROMPT = [
  "أنت محرك OCR دقيق للوثائق القانونية السعودية.",
  "استخرج نص الصفحة كما هو حرفياً، بالعربية والإنجليزية معاً إن وُجدا.",
  "حافظ على ترتيب السطور والفواصل، وصحّح اتجاه الصفحة إن كانت مقلوبة أو مدوّرة.",
  "لا تُضف أي شرح أو ترجمة أو تعليق، ولا تختصر.",
  'أعد النتيجة بصيغة JSON فقط: {"text": "...", "confidence": 0.0, "language": "ar|en|mixed", "blank": false}',
  "اجعل confidence بين 0 و1 بحسب وضوح الصفحة، وblank=true إذا كانت الصفحة فارغة فعلياً.",
].join("\n");

/** يستخرج JSON من ردّ النموذج حتى لو أُحيط بعلامات كود. */
function parseModelJson(raw: string): {
  text: string;
  confidence: number;
  language: string;
  blank: boolean;
} {
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
      return {
        text: typeof parsed["text"] === "string" ? parsed["text"] : "",
        confidence: typeof parsed["confidence"] === "number" ? parsed["confidence"] : 0.75,
        language: typeof parsed["language"] === "string" ? parsed["language"] : "ar",
        blank: parsed["blank"] === true,
      };
    } catch {
      /* يتم اللجوء إلى النص الخام أدناه */
    }
  }
  return { text: cleaned, confidence: 0.6, language: "ar", blank: cleaned.length === 0 };
}

class LovableGatewayOcrProvider implements OcrProvider {
  readonly name = "lovable-ai/gemini-vision";

  async extractDocument(input: OcrInput): Promise<OcrResult> {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("OCR_PROVIDER_UNAVAILABLE");

    const response = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              {
                type: "image_url",
                image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      // لا يُسجَّل أي محتوى قانوني — فقط رمز الحالة ونص خطأ المزوّد.
      const detail = await response.text().catch(() => "");
      console.error(`[ocr] provider failed ${response.status}: ${detail.slice(0, 300)}`);
      if (response.status === 429) throw new Error("OCR_RATE_LIMITED");
      if (response.status === 402) throw new Error("OCR_CREDITS_EXHAUSTED");
      throw new Error("OCR_FAILED");
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = payload.choices?.[0]?.message?.content ?? "";
    const parsed = parseModelJson(raw);
    const text = parsed.text.trim();

    return {
      text,
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
      language: parsed.language,
      isBlank: parsed.blank || text.length === 0,
      provider: this.name,
    };
  }
}

let provider: OcrProvider | null = null;

/** نقطة التبديل الوحيدة للمزوّد. */
export function getOcrProvider(): OcrProvider {
  if (!provider) provider = new LovableGatewayOcrProvider();
  return provider;
}

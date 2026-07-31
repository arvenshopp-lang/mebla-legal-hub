import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const prefixSchema = z.object({ prefix: z.string().regex(/^[0-9a-fA-F]{5}$/) });

const passwordSchema = z.object({
  password: z.string().min(1).max(256),
  name: z.string().max(200).optional(),
  email: z.string().max(320).optional(),
});

/** يعيد لواحق التجزئة لنطاق k-anonymity — لا يستقبل كلمة المرور ولا التجزئة الكاملة. */
export const fetchPasswordBreachRange = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => prefixSchema.parse(data))
  .handler(async ({ data }) => {
    const { fetchBreachRange } = await import("./password-policy.server");
    const body = await fetchBreachRange(data.prefix);
    return { available: body !== null, body: body ?? "" };
  });

/** تحقق نهائي على الخادم قبل إنشاء الحساب. لا يُسجَّل أو يُخزَّن أي شيء. */
export const validatePasswordPolicy = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => passwordSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyPasswordPolicy } = await import("./password-policy.server");
    const verdict = await verifyPasswordPolicy(data.password, {
      name: data.name,
      email: data.email,
    });
    return { ok: verdict.ok, reason: verdict.reason, score: verdict.score };
  });

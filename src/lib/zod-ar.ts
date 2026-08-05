import { z } from "zod";

// خريطة رسائل التحقق بالعربية (تُطبَّق على كل نماذج المنصة)
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === "undefined" || issue.received === "null")
        return { message: "هذا الحقل مطلوب" };
      return { message: "قيمة غير صالحة" };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: "اختر قيمة من القائمة" };
    case z.ZodIssueCode.too_small:
      return {
        message:
          issue.minimum === 1
            ? "هذا الحقل مطلوب"
            : `القيمة قصيرة جداً (الحد الأدنى ${issue.minimum})`,
      };
    case z.ZodIssueCode.too_big:
      return { message: `القيمة طويلة جداً (الحد الأقصى ${issue.maximum})` };
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === "email") return { message: "بريد إلكتروني غير صالح" };
      return { message: "صيغة غير صالحة" };
    default:
      return { message: ctx.defaultError === "Required" ? "هذا الحقل مطلوب" : ctx.defaultError };
  }
});

export {};

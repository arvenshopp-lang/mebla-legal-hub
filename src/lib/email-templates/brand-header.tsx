import * as React from "react";

import { Hr, Img } from "@react-email/components";

import { styles } from "./brand";

/** رابط مطلق لشعار مِهلة — عملاء البريد لا يقرأون الروابط النسبية. */
export const MEHLA_EMAIL_LOGO_URL = "https://mehlalex.com/email-logo-mehla.png";

/**
 * ترويسة موحّدة لكل رسائل مِهلة: شعار المنصة الرسمي بارتفاع ثابت
 * مع نص بديل يظهر إذا حجب عميل البريد الصور، ثم الفاصل الذهبي.
 */
export function BrandHeader({ alt = "مِهلة | MEHLA" }: { alt?: string }) {
  return (
    <>
      <Img src={MEHLA_EMAIL_LOGO_URL} alt={alt} height="34" style={styles.logo} />
      <Hr style={styles.rule} />
    </>
  );
}

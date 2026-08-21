import React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from "@react-email/components";
import { styles } from "./brand";
import { BrandHeader } from "./brand-header";

export interface NotificationReminderProps {
  /** رابط داخل المنصة — لا يحمل أي بيانات حساسة. */
  actionUrl: string;
  /** عنوان التذكير المعتمد (بلا اسم عميل ولا رقم قضية). */
  heading: string;
  /** نص التذكير الآمن. */
  body: string;
}

/**
 * قالب التذكيرات التشغيلية — قالب واحد مشترك للجلسات والمهل والمهام المتأخرة.
 * لا يعرض بيانات عميل ولا تفاصيل قضية ولا مستندات ولا معلومات مالية.
 */
export function NotificationReminderEmail({ actionUrl, heading, body }: NotificationReminderProps) {
  return (
    <Html lang="ar" dir="rtl">
      <Head />
      <Preview>{heading}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <BrandHeader />
          <Heading style={styles.h1}>{heading}</Heading>
          <Text style={styles.text}>{body} يمكنك مراجعة التفاصيل الكاملة داخل المنصة.</Text>
          <Button href={actionUrl} style={styles.button}>
            فتح في مِهلة
          </Button>
          <Text style={styles.footer}>
            وصلتك هذه الرسالة لأن تنبيهات البريد مفعّلة في إعدادات حسابك. يمكنك إيقافها أو تعديل
            تذكيرات الجلسات والمهل من إعدادات التنبيهات في أي وقت.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

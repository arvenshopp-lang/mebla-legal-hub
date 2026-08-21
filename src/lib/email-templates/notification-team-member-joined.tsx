import React from "react";
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Text } from "@react-email/components";
import { styles } from "./brand";
import { BrandHeader } from "./brand-header";

export interface NotificationTeamMemberJoinedProps {
  /** رابط داخل المنصة — لا يحمل أي بيانات حساسة. */
  actionUrl: string;
}

/** انضمام عضو للفريق — ملخّص آمن بلا أسماء أو بيانات تواصل. */
export function NotificationTeamMemberJoinedEmail({
  actionUrl,
}: NotificationTeamMemberJoinedProps) {
  return (
    <Html lang="ar" dir="rtl">
      <Head />
      <Preview>انضم عضو جديد إلى فريق مكتبك في مِهلة</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <BrandHeader />
          <Heading style={styles.h1}>انضمام عضو جديد للفريق</Heading>
          <Text style={styles.text}>
            قَبِل أحد المدعوين دعوة الانضمام إلى مكتبك، وأصبح عضواً نشطاً في الفريق. يمكنك مراجعة
            بيانات العضو وصلاحياته من صفحة الفريق داخل المنصة.
          </Text>
          <Button href={actionUrl} style={styles.button}>
            فتح في مِهلة
          </Button>
          <Text style={styles.footer}>
            وصلتك هذه الرسالة لأن تنبيهات البريد مفعّلة في إعدادات حسابك. يمكنك إيقافها من إعدادات
            التنبيهات في أي وقت.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

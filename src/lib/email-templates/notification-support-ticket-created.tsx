import React from "react";
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Text } from "@react-email/components";
import { styles } from "./brand";

export interface NotificationSupportTicketCreatedProps {
  actionUrl: string;
}

/** تأكيد استلام تذكرة — بلا موضوع التذكرة ولا نص الرسالة. */
export function NotificationSupportTicketCreatedEmail({
  actionUrl,
}: NotificationSupportTicketCreatedProps) {
  return (
    <Html lang="ar" dir="rtl">
      <Head />
      <Preview>استلمنا طلب الدعم الخاص بك</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Text style={styles.brand}>مِهلة | MEHLA</Text>
          <Hr style={styles.rule} />
          <Heading style={styles.h1}>استلمنا طلب الدعم</Heading>
          <Text style={styles.text}>
            تم فتح تذكرة دعم جديدة باسم حسابك، وسيتابعها فريق الدعم وفق مدة الاستجابة المعتمدة.
            تفاصيل التذكرة ومتابعتها متاحة من مركز الدعم داخل المنصة.
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

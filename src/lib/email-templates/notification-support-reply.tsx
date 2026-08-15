import React from "react";
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Text } from "@react-email/components";
import { styles } from "./brand";

export interface NotificationSupportReplyProps {
  actionUrl: string;
}

/** رد دعم جديد — إشعار بوجود رد فقط، بلا نص الرد ولا رقم التذكرة. */
export function NotificationSupportReplyEmail({ actionUrl }: NotificationSupportReplyProps) {
  return (
    <Html lang="ar" dir="rtl">
      <Head />
      <Preview>وصلك رد جديد من فريق دعم مِهلة</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Text style={styles.brand}>مِهلة | MEHLA</Text>
          <Hr style={styles.rule} />
          <Heading style={styles.h1}>رد جديد من فريق الدعم</Heading>
          <Text style={styles.text}>
            سجّل فريق دعم مِهلة رداً جديداً على إحدى تذاكرك. لحماية خصوصية بياناتك لا نُرسل نص الرد
            في البريد؛ يمكنك قراءته والرد عليه من مركز الدعم داخل المنصة.
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

import * as React from "react";

import { Body, Container, Head, Heading, Hr, Html, Preview, Text } from "@react-email/components";

import { styles } from "./brand";
import { BrandHeader } from "./brand-header";

interface ReauthenticationEmailProps {
  token: string;
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>رمز التحقق الخاص بك</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <BrandHeader />
        <Heading style={styles.h1}>تأكيد الهوية</Heading>
        <Text style={styles.text}>استخدم الرمز التالي لتأكيد هويتك وإتمام العملية المطلوبة:</Text>
        <Text style={styles.code}>{token}</Text>
        <Text style={styles.footer}>
          صلاحية الرمز قصيرة. إذا لم تطلبه، يمكنك تجاهل هذه الرسالة بأمان.
        </Text>
      </Container>
    </Body>
  </Html>
);

export default ReauthenticationEmail;

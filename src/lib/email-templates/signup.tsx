import * as React from "react";

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";

import { styles } from "./brand";
import { BrandHeader } from "./brand-header";

interface SignupEmailProps {
  siteName: string;
  siteUrl: string;
  recipient: string;
  confirmationUrl: string;
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>تأكيد بريدك الإلكتروني في {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <BrandHeader />
        <Heading style={styles.h1}>تأكيد البريد الإلكتروني</Heading>
        <Text style={styles.text}>
          شكراً لانضمامك إلى{" "}
          <Link href={siteUrl} style={styles.link}>
            {siteName}
          </Link>
          . لتفعيل حسابك، يرجى تأكيد بريدك الإلكتروني{" "}
          <span style={{ direction: "ltr", display: "inline-block" }}>{recipient}</span> عبر الزر
          التالي.
        </Text>
        <Button style={styles.button} href={confirmationUrl}>
          تأكيد البريد الإلكتروني
        </Button>
        <Text style={styles.footer}>إذا لم تقم بإنشاء حساب، يمكنك تجاهل هذه الرسالة بأمان.</Text>
      </Container>
    </Body>
  </Html>
);

export default SignupEmail;

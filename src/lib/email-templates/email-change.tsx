import * as React from "react";

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";

import { styles } from "./brand";
import { BrandHeader } from "./brand-header";

interface EmailChangeEmailProps {
  siteName: string;
  // oldEmail is the user's current address (HookData.OldEmail). For the
  // NEW-recipient half of a secure email_change fanout, `email` equals the
  // recipient (NEW), so the "from" line must render oldEmail.
  oldEmail: string;
  email: string;
  newEmail: string;
  confirmationUrl: string;
}

const ltr = { direction: "ltr" as const, display: "inline-block" };

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>تأكيد تغيير البريد الإلكتروني في {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <BrandHeader />
        <Heading style={styles.h1}>تأكيد تغيير البريد الإلكتروني</Heading>
        <Text style={styles.text}>
          تم طلب تغيير البريد الإلكتروني لحسابك في {siteName} من <span style={ltr}>{oldEmail}</span>{" "}
          إلى <span style={ltr}>{newEmail}</span>. اضغط الزر التالي لتأكيد التغيير.
        </Text>
        <Button style={styles.button} href={confirmationUrl}>
          تأكيد التغيير
        </Button>
        <Text style={styles.footer}>إذا لم تطلب هذا التغيير، يرجى تأمين حسابك على الفور.</Text>
      </Container>
    </Body>
  </Html>
);

export default EmailChangeEmail;

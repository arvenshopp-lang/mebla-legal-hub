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

interface InviteEmailProps {
  siteName: string;
  siteUrl: string;
  confirmationUrl: string;
  /** اسم المكتب الداعي (رسائل دعوات الفريق داخل المنصة) */
  orgName?: string;
  /** صفة العضو المدعو بالعربية */
  roleLabel?: string;
  /** اسم الشخص الذي أرسل الدعوة */
  inviterName?: string;
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
  orgName,
  roleLabel,
  inviterName,
}: InviteEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>{orgName ? `دعوة للانضمام إلى ${orgName}` : `دعوة للانضمام إلى ${siteName}`}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <BrandHeader />
        <Heading style={styles.h1}>لديك دعوة للانضمام</Heading>
        <Text style={styles.text}>
          {inviterName ? <b>{inviterName}</b> : "أحد مسؤولي المكتب"} دعاك للانضمام إلى فريق العمل
          على منصة{" "}
          <Link href={siteUrl} style={styles.link}>
            {siteName}
          </Link>{" "}
          لإدارة القضايا والجلسات والمهل النظامية بمكان واحد.
        </Text>
        <Text style={styles.text}>
          تمت دعوتك للانضمام إلى{" "}
          {orgName ? (
            <b>{orgName}</b>
          ) : (
            <Link href={siteUrl} style={styles.link}>
              {siteName}
            </Link>
          )}
          {roleLabel ? ` بصفة ${roleLabel}` : ""}. اضغط الزر التالي لقبول الدعوة والانضمام إلى فريق
          العمل.
        </Text>
        <Button style={styles.button} href={confirmationUrl}>
          انضم إلى المكتب
        </Button>
        <Text style={styles.footer}>إذا لم يعمل الزر، انسخ الرابط التالي والصقه في المتصفح:</Text>
        <Text
          style={{ ...styles.footer, direction: "ltr", textAlign: "left", wordBreak: "break-all" }}
        >
          <Link href={confirmationUrl} style={styles.link}>
            {confirmationUrl}
          </Link>
        </Text>
        <Text style={styles.footer}>
          إذا لم تكن تتوقع هذه الدعوة، يمكنك تجاهل هذه الرسالة بأمان.
        </Text>
      </Container>
    </Body>
  </Html>
);

export default InviteEmail;

import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from '@react-email/components'

import { styles } from './brand'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
  /** اسم المكتب الداعي (رسائل دعوات الفريق داخل المنصة) */
  orgName?: string
  /** صفة العضو المدعو بالعربية */
  roleLabel?: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
  orgName,
  roleLabel,
}: InviteEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>{orgName ? `دعوة للانضمام إلى ${orgName}` : `دعوة للانضمام إلى ${siteName}`}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Text style={styles.brand}>{siteName}</Text>
        <Hr style={styles.rule} />
        <Heading style={styles.h1}>لديك دعوة للانضمام</Heading>
        <Text style={styles.text}>
          تمت دعوتك للانضمام إلى{' '}
          {orgName ? (
            <b>{orgName}</b>
          ) : (
            <Link href={siteUrl} style={styles.link}>
              {siteName}
            </Link>
          )}
          {roleLabel ? ` بصفة ${roleLabel}` : ''}
          {' '}على منصة{' '}
          <Link href={siteUrl} style={styles.link}>
            {siteName}
          </Link>
          . اضغط الزر التالي لقبول الدعوة والانضمام إلى فريق العمل.
        </Text>
        <Button style={styles.button} href={confirmationUrl}>
          قبول الدعوة
        </Button>
        <Text style={styles.footer}>
          إذا لم تكن تتوقع هذه الدعوة، يمكنك تجاهل هذه الرسالة بأمان.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

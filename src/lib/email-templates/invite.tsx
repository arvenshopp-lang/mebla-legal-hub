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
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>دعوة للانضمام إلى {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Text style={styles.brand}>{siteName}</Text>
        <Hr style={styles.rule} />
        <Heading style={styles.h1}>لديك دعوة للانضمام</Heading>
        <Text style={styles.text}>
          تمت دعوتك للانضمام إلى{' '}
          <Link href={siteUrl} style={styles.link}>
            {siteName}
          </Link>
          . اضغط الزر التالي لقبول الدعوة وإنشاء حسابك.
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

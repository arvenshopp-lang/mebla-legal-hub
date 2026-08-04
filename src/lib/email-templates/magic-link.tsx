import * as React from 'react'

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
} from '@react-email/components'

import { styles } from './brand'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>رابط الدخول إلى {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Text style={styles.brand}>{siteName}</Text>
        <Hr style={styles.rule} />
        <Heading style={styles.h1}>رابط الدخول إلى حسابك</Heading>
        <Text style={styles.text}>
          اضغط الزر التالي لتسجيل الدخول إلى {siteName}. هذا الرابط صالح لفترة
          قصيرة ولمرة واحدة فقط.
        </Text>
        <Button style={styles.button} href={confirmationUrl}>
          تسجيل الدخول
        </Button>
        <Text style={styles.footer}>
          إذا لم تطلب رابط الدخول، يمكنك تجاهل هذه الرسالة بأمان.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

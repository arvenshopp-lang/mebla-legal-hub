import * as React from 'react'

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from '@react-email/components'

import { styles } from './brand'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({
  token,
}: ReauthenticationEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>رمز التحقق الخاص بك</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Text style={styles.brand}>مِهلة | MEHLA</Text>
        <Hr style={styles.rule} />
        <Heading style={styles.h1}>تأكيد الهوية</Heading>
        <Text style={styles.text}>
          استخدم الرمز التالي لتأكيد هويتك وإتمام العملية المطلوبة:
        </Text>
        <Text style={styles.code}>{token}</Text>
        <Text style={styles.footer}>
          صلاحية الرمز قصيرة. إذا لم تطلبه، يمكنك تجاهل هذه الرسالة بأمان.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

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

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>إعادة تعيين كلمة المرور في {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Text style={styles.brand}>{siteName}</Text>
        <Hr style={styles.rule} />
        <Heading style={styles.h1}>إعادة تعيين كلمة المرور</Heading>
        <Text style={styles.text}>
          وصلنا طلب لإعادة تعيين كلمة المرور الخاصة بحسابك في {siteName}. اضغط
          الزر التالي لتعيين كلمة مرور جديدة.
        </Text>
        <Button style={styles.button} href={confirmationUrl}>
          تعيين كلمة مرور جديدة
        </Button>
        <Text style={styles.footer}>
          إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة ولن يتم تغيير كلمة المرور.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

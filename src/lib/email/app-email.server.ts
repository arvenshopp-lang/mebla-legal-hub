/**
 * إرسال رسائل المنصة (غير رسائل المصادقة التي يديرها Supabase) عبر خدمة البريد
 * المُدارة. يُستخدم خادمياً فقط، ولا يرمي أبداً حتى لا تتعطل العملية الأساسية.
 */
import type * as React from 'react'
import { render } from '@react-email/render'
import { EmailAPIError, sendLovableEmail } from '@lovable.dev/email-js'

export const SITE_NAME = 'مِهلة | MEHLA'
export const SITE_URL = 'https://mehlalex.com'

const SENDER_DOMAIN = 'mail.mehlalex.com'
const FROM = 'MEHLA <noreply@mehlalex.com>'

export type AppEmailResult = { sent: boolean; reason?: string }

export async function sendAppEmail(options: {
  to: string
  subject: string
  element: React.ReactElement
  label?: string
  idempotencyKey?: string
}): Promise<AppEmailResult> {
  const apiKey = process.env['LOVABLE_API_KEY']
  if (!apiKey) return { sent: false, reason: 'email_not_configured' }

  try {
    const [html, text] = await Promise.all([
      render(options.element),
      render(options.element, { plainText: true }),
    ])

    const response = await sendLovableEmail(
      {
        to: options.to,
        from: FROM,
        sender_domain: SENDER_DOMAIN,
        subject: options.subject,
        html,
        text,
        ...(options.label ? { label: options.label } : {}),
        ...(options.idempotencyKey ? { idempotency_key: options.idempotencyKey } : {}),
      },
      {
        apiKey,
        sendUrl: process.env['LOVABLE_SEND_URL'],
        ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
      },
    )
    return { sent: response.success === true }
  } catch (error) {
    if (error instanceof EmailAPIError) {
      return { sent: false, reason: error.code ?? `http_${error.status}` }
    }
    return { sent: false, reason: 'send_failed' }
  }
}
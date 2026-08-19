import React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type BillingEventKind =
  | "invoice_issued"
  | "due_soon"
  | "overdue"
  | "payment_approved"
  | "payment_rejected"
  | "payment_failed"
  | "refund_completed"
  | "credit_note_issued";

const TITLES: Record<BillingEventKind, string> = {
  invoice_issued: "صدرت فاتورتك",
  due_soon: "تذكير باستحقاق الفاتورة",
  overdue: "فاتورة متأخرة السداد",
  payment_approved: "تم اعتماد دفعتك",
  payment_rejected: "لم يُعتمد إثبات السداد",
  payment_failed: "تعذّر إتمام عملية السداد",
  refund_completed: "تم تنفيذ الاسترداد",
  credit_note_issued: "صدر إشعار خصم",
};

export function billingSubject(event: BillingEventKind, invoiceNumber: string): string {
  return `${TITLES[event]} — الفاتورة ${invoiceNumber} | مِهلة`;
}

export interface BillingEventEmailProps {
  event: BillingEventKind;
  invoiceNumber: string;
  customerName: string;
  total: number;
  remaining: number;
  currency: string;
  dueAt: string | null;
  amount?: number | null;
  reason?: string | null;
  reference?: string | null;
}

const money = (value: number, currency: string) =>
  `${new Intl.NumberFormat("ar-SA-u-nu-latn", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${
    currency === "SAR" ? "ريال سعودي" : currency
  }`;

const hijriSafeDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "long" }).format(
        new Date(value),
      )
    : "—";

function bodyText(props: BillingEventEmailProps): string {
  const { event, currency } = props;
  switch (event) {
    case "invoice_issued":
      return `صدرت الفاتورة ${props.invoiceNumber} بمبلغ ${money(props.total, currency)}، ويستحق سدادها في ${hijriSafeDate(props.dueAt)}.`;
    case "due_soon":
      return `نودّ تذكيرك بأن المتبقي على الفاتورة ${props.invoiceNumber} هو ${money(props.remaining, currency)}، ويستحق في ${hijriSafeDate(props.dueAt)}.`;
    case "overdue":
      return `تجاوزت الفاتورة ${props.invoiceNumber} تاريخ استحقاقها، والمتبقي عليها ${money(props.remaining, currency)}.`;
    case "payment_approved":
      return `تم اعتماد دفعة بمبلغ ${money(props.amount ?? 0, currency)} على الفاتورة ${props.invoiceNumber}. المتبقي حالياً ${money(props.remaining, currency)}.`;
    case "payment_rejected":
      return `لم يُعتمد إثبات السداد المرفق للفاتورة ${props.invoiceNumber}${props.reason ? ` للسبب التالي: ${props.reason}` : ""}.`;
    case "payment_failed":
      return `تعذّر إتمام عملية سداد بمبلغ ${money(props.amount ?? 0, currency)} على الفاتورة ${props.invoiceNumber}. يمكنك إعادة المحاولة في أي وقت.`;
    case "refund_completed":
      return `تم تنفيذ استرداد بمبلغ ${money(props.amount ?? 0, currency)} المرتبط بالفاتورة ${props.invoiceNumber}.`;
    case "credit_note_issued":
      return `صدر إشعار خصم${props.reference ? ` رقم ${props.reference}` : ""} بمبلغ ${money(props.amount ?? 0, currency)} على الفاتورة ${props.invoiceNumber}.`;
    default:
      return `تحديث على الفاتورة ${props.invoiceNumber}.`;
  }
}

export function BillingEventEmail(props: BillingEventEmailProps) {
  const title = TITLES[props.event];
  return (
    <Html lang="ar" dir="rtl">
      <Head />
      <Preview>{`${title} — ${props.invoiceNumber}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>مِهلة | MEHLA</Text>
          <Heading style={heading}>{title}</Heading>
          <Text style={text}>
            {props.customerName ? `عناية ${props.customerName}،` : "مرحباً،"}
          </Text>
          <Text style={text}>{bodyText(props)}</Text>
          <Section style={box}>
            <Text style={row}>رقم الفاتورة: {props.invoiceNumber}</Text>
            <Text style={row}>إجمالي الفاتورة: {money(props.total, props.currency)}</Text>
            <Text style={row}>المتبقي: {money(props.remaining, props.currency)}</Text>
            <Text style={row}>تاريخ الاستحقاق: {hijriSafeDate(props.dueAt)}</Text>
          </Section>
          <Hr style={hr} />
          <Text style={footer}>
            هذه رسالة تلقائية بخصوص حسابك في منصة مِهلة. للاستفسارات المالية يمكنك الرد على هذه
            الرسالة.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default BillingEventEmail;

const main = {
  backgroundColor: "#ffffff",
  fontFamily: "'IBM Plex Sans Arabic', Arial, sans-serif",
};
const container = { padding: "28px 24px", maxWidth: "560px", margin: "0 auto" };
const brand = {
  color: "#173F35",
  fontSize: "15px",
  fontWeight: 700,
  letterSpacing: "0.5px",
  margin: "0 0 18px",
};
const heading = { color: "#173F35", fontSize: "21px", margin: "0 0 14px" };
const text = { color: "#33403c", fontSize: "15px", lineHeight: "26px", margin: "0 0 12px" };
const box = {
  backgroundColor: "#F5F3EE",
  borderRadius: "12px",
  padding: "16px 18px",
  margin: "18px 0",
};
const row = { color: "#173F35", fontSize: "14px", lineHeight: "24px", margin: "0" };
const hr = { borderColor: "#e5e2da", margin: "22px 0" };
const footer = { color: "#7a827f", fontSize: "12px", lineHeight: "20px", margin: "0" };

import React from "react";
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";
import { serviceLabel } from "@/lib/office-page.shared";

export interface OfficeLeadEmailProps {
  officeName: string;
  leadName: string;
  channel: string;
  serviceKey: string;
}

const CHANNELS: Record<string, string> = {
  direct: "زيارة مباشرة",
  instagram: "إنستقرام",
  tiktok: "تيك توك",
  x: "منصة X",
  google: "بحث Google",
  qr: "رمز QR",
  campaign: "حملة تسويقية",
};

/** ملخّص آمن فقط: لا نص الرسالة ولا بيانات تواصل — التفاصيل داخل المنصة. */
export function OfficeLeadEmail({ officeName, leadName, channel, serviceKey }: OfficeLeadEmailProps) {
  return (
    <Html lang="ar" dir="rtl">
      <Head />
      <Preview>طلب استشارة جديد من الصفحة العامة</Preview>
      <Body style={{ backgroundColor: "#F5F3EE", fontFamily: "Tahoma, Arial, sans-serif", margin: 0 }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, margin: "24px auto", maxWidth: 560, padding: 28 }}>
          <Heading style={{ color: "#123C32", fontSize: 20, margin: "0 0 12px" }}>
            طلب استشارة جديد
          </Heading>
          <Text style={{ color: "#3f4a45", fontSize: 15, lineHeight: 1.8, margin: "0 0 8px" }}>
            وصل مكتب {officeName} طلب استشارة جديد من الصفحة العامة.
          </Text>
          <Section style={{ backgroundColor: "#F5F3EE", borderRadius: 8, padding: 16 }}>
            <Text style={{ color: "#123C32", fontSize: 14, margin: "0 0 6px" }}>مقدّم الطلب: {leadName}</Text>
            <Text style={{ color: "#123C32", fontSize: 14, margin: "0 0 6px" }}>
              المصدر: {CHANNELS[channel] ?? "زيارة مباشرة"}
            </Text>
            {serviceKey ? (
              <Text style={{ color: "#123C32", fontSize: 14, margin: 0 }}>الخدمة: {serviceLabel(serviceKey)}</Text>
            ) : null}
          </Section>
          <Text style={{ color: "#6b7671", fontSize: 13, lineHeight: 1.8, marginTop: 16 }}>
            بيانات التواصل وتفاصيل الطلب متاحة داخل منصة مِهلة في «الإعدادات ← الصفحة العامة ← العملاء المحتملون».
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { publicSiteQueryOptions } from "@/lib/public-site.query";
import {
  privacyContactEmail,
  publicContactEmail,
  supportContactEmail,
} from "@/lib/public-site.shared";
import { PageHeading, PublicShell } from "@/components/marketing/public-shell";
import { socialPreviewMeta } from "@/config/brand-assets";

const TITLE = "تواصل معنا — مِهلة";
const DESCRIPTION =
  "قنوات التواصل الرسمية مع منصة مِهلة: البريد العام، دعم المشتركين، طلبات الخصوصية، وبيانات الكيان النظامية.";

export const Route = createFileRoute("/contact")({
  loader: ({ context }) => context.queryClient.ensureQueryData(publicSiteQueryOptions()),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mehlalex.com/contact" },
      ...socialPreviewMeta({ title: TITLE, description: DESCRIPTION }),
    ],
    links: [{ rel: "canonical", href: "https://mehlalex.com/contact" }],
  }),
  component: ContactRoute,
});

function ContactRoute() {
  const { data: info } = useSuspenseQuery(publicSiteQueryOptions());
  const channels = [
    {
      icon: Mail,
      label: "الاستفسارات العامة",
      value: publicContactEmail(info),
      href: `mailto:${publicContactEmail(info)}`,
      hint: "الشراكات والاستفسارات التجارية.",
    },
    {
      icon: Mail,
      label: "دعم المشتركين",
      value: supportContactEmail(info),
      href: `mailto:${supportContactEmail(info)}`,
      hint: "المشكلات التقنية وطلبات المساعدة داخل المنصة.",
    },
    {
      icon: Mail,
      label: "طلبات الخصوصية",
      value: privacyContactEmail(info),
      href: `mailto:${privacyContactEmail(info)}`,
      hint: "الوصول إلى بياناتك أو تصحيحها أو حذفها.",
    },
    ...(info.phone
      ? [
          {
            icon: Phone,
            label: "الهاتف",
            value: info.phone,
            href: `tel:${info.phone}`,
            hint: "أوقات العمل الرسمية.",
          },
        ]
      : []),
    ...(info.whatsapp
      ? [
          {
            icon: MessageCircle,
            label: "واتساب",
            value: info.whatsapp,
            href: `https://wa.me/${info.whatsapp.replace("+", "")}`,
            hint: "للاستفسارات السريعة.",
          },
        ]
      : []),
  ];

  const legalRows = [
    { label: "الاسم النظامي", value: info.legal_name },
    { label: "السجل التجاري", value: info.commercial_registration },
    { label: "الرقم الضريبي", value: info.tax_number },
    { label: "العنوان الوطني", value: info.legal_address || info.address },
  ].filter((row) => Boolean(row.value));

  return (
    <PublicShell>
      <PageHeading
        eyebrow="مركز الثقة"
        title="تواصل معنا"
        intro="اختر القناة المناسبة لطلبك ليصل إلى الفريق المختص مباشرة."
      />
      <div className="container-page max-w-3xl py-10 md:py-14">
        <ul className="grid gap-3 sm:grid-cols-2">
          {channels.map((channel) => (
            <li key={`${channel.label}-${channel.value}`}>
              <a
                href={channel.href}
                className="flex h-full flex-col rounded-[var(--radius-m)] border border-border bg-surface p-5 transition hover:border-border-strong"
              >
                <span className="flex items-center gap-2 text-[13px] font-bold">
                  <channel.icon className="h-4 w-4 text-primary" aria-hidden />
                  {channel.label}
                </span>
                <span dir="ltr" className="mt-2 text-body-sm font-medium text-foreground">
                  {channel.value}
                </span>
                <span className="mt-1 text-caption">{channel.hint}</span>
              </a>
            </li>
          ))}
        </ul>

        {info.address && (
          <div className="mt-8 rounded-[var(--radius-m)] border border-border bg-surface p-5">
            <h2 className="flex items-center gap-2 text-[13px] font-bold">
              <MapPin className="h-4 w-4 text-primary" aria-hidden />
              العنوان
            </h2>
            <p className="mt-2 text-body-sm leading-7 text-muted-foreground">{info.address}</p>
            {info.maps_url && (
              <a
                href={info.maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex min-h-9 items-center text-[13.5px] font-medium text-foreground underline-offset-4 hover:underline"
              >
                فتح الموقع على الخريطة
              </a>
            )}
          </div>
        )}

        {legalRows.length > 0 && (
          <div className="mt-8 rounded-[var(--radius-m)] border border-border bg-surface p-5">
            <h2 className="text-[13px] font-bold">بيانات الكيان النظامية</h2>
            <dl className="mt-3 divide-y divide-border">
              {legalRows.map((row) => (
                <div key={row.label} className="flex flex-wrap justify-between gap-2 py-2.5">
                  <dt className="text-body-sm text-muted-foreground">{row.label}</dt>
                  <dd className="text-body-sm font-medium text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <p className="mt-10 rounded-[var(--radius-m)] bg-surface-muted p-4 text-body-sm leading-7 text-muted-foreground">
          مِهلة منصة تقنية ولا تُقدّم استشارات قانونية. لا تُرسل تفاصيل قضية أو مستندات عبر قنوات
          التواصل هذه.
        </p>
      </div>
    </PublicShell>
  );
}

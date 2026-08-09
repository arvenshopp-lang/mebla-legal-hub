/** محتوى لقطة QA كاملة وصالحة للنشر — يمثّل مكتب محاماة حقيقياً. */
export function snapshotA(overrides: Record<string, unknown> = {}) {
  return {
    office_name: "مكتب القبول ألفا للمحاماة",
    headline: "تمثيل قانوني موثوق في الرياض",
    tagline: "قضايا تجارية وتنفيذ ومطالبات",
    about:
      "مكتب محاماة سعودي متخصص في القضايا التجارية والتنفيذ والمطالبات المالية، ويقدّم استشارات قانونية مبنية على الأنظمة السعودية النافذة مع متابعة دقيقة لمواعيد الجلسات والمهل النظامية.",
    city: "الرياض",
    address: "طريق الملك فهد، برج القبول، الدور 12",
    map_url: "https://maps.google.com/?q=24.7136,46.6753",
    phone: "+966501234567",
    whatsapp: "+966501234567",
    email: "support@mehlalex.com",
    website: "https://mehlalex.com",
    license_number: "QA-LIC-4471",
    logo_path: "",
    cover_path: "",
    hours: [
      { day: "sun", closed: false, from: "09:00", to: "17:00" },
      { day: "mon", closed: false, from: "09:00", to: "17:00" },
      { day: "tue", closed: false, from: "09:00", to: "17:00" },
      { day: "wed", closed: false, from: "09:00", to: "17:00" },
      { day: "thu", closed: false, from: "09:00", to: "15:00" },
      { day: "fri", closed: true, from: "09:00", to: "17:00" },
      { day: "sat", closed: true, from: "09:00", to: "17:00" },
    ],
    services: [
      { key: "commercial", title: "القضايا التجارية", description: "تمثيل الشركات في النزاعات التجارية." },
      { key: "execution", title: "التنفيذ والمطالبات", description: "تحصيل المديونيات عبر محاكم التنفيذ." },
      { key: "contracts", title: "صياغة العقود", description: "مراجعة وصياغة العقود التجارية." },
    ],
    team_visible: true,
    team: [
      {
        name: "أ. سارة العتيبي",
        title: "محامية شريكة",
        bio: "خبرة 12 سنة في القضايا التجارية والتحكيم.",
        photo_path: "",
        specialties: ["commercial", "arbitration"],
      },
    ],
    socials: {
      instagram: "https://instagram.com/mehla",
      x: "https://x.com/mehla",
      linkedin: "",
      tiktok: "",
      youtube: "",
      snapchat: "",
    },
    lead_form: {
      enabled: true,
      require_phone: true,
      require_email: false,
      require_city: false,
      consent_required: true,
      consent_text: "أوافق على معالجة بياناتي للتواصل معي بشأن طلب الاستشارة.",
      thank_you: "تم استلام طلبك، وسنتواصل معك خلال يوم عمل.",
    },
    seo: {
      title: "مكتب القبول ألفا للمحاماة | الرياض",
      description: "مكتب محاماة سعودي للقضايا التجارية والتنفيذ والمطالبات في الرياض.",
    },
    consent_policy_version: "",
    ...overrides,
  };
}
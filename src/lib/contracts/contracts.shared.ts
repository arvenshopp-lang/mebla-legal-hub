/**
 * وحدة العقود والاتفاقيات القانونية الرقمية — الأنواع والقوالب المعتمدة.
 */

export type ContractType =
  | "fee_agreement" // عقد أتعاب وترافع محاماة
  | "legal_retainer" // عقد استشارات سنوي للمنشآت
  | "nda" // اتفاقية سرية وعدم إفصاح
  | "settlement" // محضر صلح وتسوية ودية
  | "custom"; // عقد مخصص

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  fee_agreement: "عقد أتعاب وترافع محاماة",
  legal_retainer: "عقد استشارات وتمثيل سنوي",
  nda: "اتفاقية سرية وعدم إفصاح (NDA)",
  settlement: "محضر صلح وتسوية ودية",
  custom: "عقد واتفاقية مخصصة",
};

export type ContractStatus = "draft" | "pending_signature" | "signed" | "cancelled" | "expired";

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "مسودة قيد الصياغة",
  pending_signature: "بانتظار توقيع الموكل",
  signed: "موقع ومعتمد رسمياً",
  cancelled: "ملغي",
  expired: "منتهي الصلاحية",
};

export type ContractClause = {
  id: string;
  title: string;
  content: string;
  isMandatory?: boolean;
};

export type ContractParty = {
  role: "first_party" | "second_party"; // الطرف الأول (المكتب) / الطرف الثاني (الموكل)
  name: string;
  identifierType: "cr" | "national_id" | "iqama";
  identifierNumber: string;
  phone: string;
  email?: string;
  city?: string;
  address?: string;
  representedBy?: string;
};

export type ContractSignature = {
  signedBy: string;
  signedAt: string;
  signatureImageBase64: string; // Base64 PNG signature
  ipAddress?: string;
  userAgent?: string;
  verificationHash?: string;
};

export type ContractModel = {
  id: string;
  organizationId: string;
  clientId?: string | null;
  caseId?: string | null;
  contractNumber: string;
  title: string;
  contractType: ContractType;
  status: ContractStatus;
  firstParty: ContractParty; // المكتب
  secondParty: ContractParty; // الموكل
  totalAmount?: number | null;
  advanceAmount?: number | null;
  finalAmount?: number | null;
  clauses: ContractClause[];
  lawyerSignature?: ContractSignature | null;
  clientSignature?: ContractSignature | null;
  signToken?: string | null;
  signUrl?: string | null;
  expiresAt?: string | null;
  signedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

/** بنك القوالب السعودية الجاهزة والمعتمدة */
export const SAUDI_CONTRACT_TEMPLATES: Record<
  ContractType,
  {
    title: string;
    description: string;
    clauses: ContractClause[];
  }
> = {
  fee_agreement: {
    title: "عقد أتعاب وترافع في دعوى قضائية",
    description: "عقد أتعاب محاماة وترافع رسمي وفق نظام المحاماة وقواعد السلوك المهني ونظام المعاملات المدنية.",
    clauses: [
      {
        id: "c1",
        title: "البند الأول: موضوع العقد ونطاق التوكيل",
        content:
          "اتفق الطرفان على أن يقوم الطرف الأول (المكتب) بتمثيل والترافع عن الطرف الثاني (الموكل) في موضوع النزاع والدعوى القضائية، وإعداد اللوائح والمذكرات وحضور الجلسات القضائية وتقديم كافة أوجه الدفاع النظامية.",
        isMandatory: true,
      },
      {
        id: "c2",
        title: "البند الثاني: قيمة الأتعاب وطريقة السداد",
        content:
          "اتفق الطرفان على أن تكون أتعاب المحاماة الإجمالية شاملة ضريبة القيمة المضافة، وتسدد على دفعات: دفعة مقدمة غير مستردة عند التوقيع، ودفعة عند تقديم لائحة الدعوى/الرد، والدفعة الختامية عند صدور الحكم الابتدائي/النهائي.",
        isMandatory: true,
      },
      {
        id: "c3",
        title: "البند الثالث: التزامات الطرف الأول (المكتب)",
        content:
          "يلتزم الطرف الأول ببذل العناية والجهد المهني الواجب وفق الأصول القضائية ونظام المحاماة وقواعد السلوك المهني، وإحاطة الموكل بمجريات القضية والجلسات وقرارات المحكمة فور صدورها.",
        isMandatory: true,
      },
      {
        id: "c4",
        title: "البند الرابع: التزامات الطرف الثاني (الموكل)",
        content:
          "يلتزم الطرف الثاني بتزويد الطرف الأول بكافة المستندات والأدلة والمعلومات الصحيحة المتعلقة بالدعوى في المواعيد المحددة، وسداد الدفعات المالية في مواعيد استحقاقها دون تأخير.",
        isMandatory: true,
      },
      {
        id: "c5",
        title: "البند الخامس: السرية وحفظ الأسرار",
        content:
          "يلتزم الطرف الأول بالمحافظة التامة على سرية المعلومات والمستندات المسلمة إليه من الطرف الثاني وفق المادة (11) من نظام المحاماة.",
        isMandatory: true,
      },
      {
        id: "c6",
        title: "البند السادس: فسخ العقد وإنهاؤه والشرط الجزائي",
        content:
          "إذا رغب الطرف الثاني في إنهاء الوكالة دون سبب مشروع، استحق الطرف الأول كامل الأتعاب المتفق عليها أو أجر المثل عن الجهد المبذول وفق المبادئ القضائية المستقرة للمحكمة العليا ونظام المعاملات المدنية.",
        isMandatory: true,
      },
      {
        id: "c7",
        title: "البند السابع: الاختصاص القضائي والنظام الواجب التطبيق",
        content:
          "يخضع هذا العقد ويفسر وفق الأنظمة واللوائح السارية في المملكة العربية السعودية، وتختص المحكمة المختصة بمدينة مقر المكتب بالنظر في أي نزاع ينشأ عن تنفيذ هذا العقد.",
        isMandatory: true,
      },
    ],
  },

  legal_retainer: {
    title: "عقد تقديم خدمات واستشارات قانونية سنوية للمنشآت",
    description: "عقد تمثيل واستشارات قانونية دورية للشركات والمؤسسات لحماية مصالحها ومراجعة عقودها.",
    clauses: [
      {
        id: "c1",
        title: "البند الأول: نطاق الخدمات الاستشارية",
        content:
          "يقدم الطرف الأول للطرف الثاني الاستشارات القانونية الشفهية والمكتوبة، ومراجعة وصياغة العقود التجارية والعمالية، وحضور الاجتماعات القانونية وإبداء الرأي النظامي في شؤون الشركة.",
        isMandatory: true,
      },
      {
        id: "c2",
        title: "البند الثاني: مدة العقد والتجديد",
        content:
          "مدة هذا العقد سنة ميلادية تبدأ من تاريخ توقيعه، وتتجدد تلقائياً لمدد مماثلة ما لم يشعر أحد الطرفين الآخر كتابة برغبته في عدم التجديد قبل (30) يوماً من انتهاء المدة.",
        isMandatory: true,
      },
      {
        id: "c3",
        title: "البند الثالث: المقابل المالي والفوترة",
        content:
          "يدفع الطرف الثاني للطرف الأول مقابلاً شهرياً/سنوياً مقطوعاً بالإضافة لضريبة القيمة المضافة 15% بموجب فواتير ضريبية تصدر في بداية كل فترة تعاقدية.",
        isMandatory: true,
      },
    ],
  },

  nda: {
    title: "اتفاقية حماية السرية وعدم إفشاء المعلومات (NDA)",
    description: "حماية الأسرار التجارية والبيانات الفنية والمالية للشركات ورواد الأعمال وفق نظام المعاملات المدنية.",
    clauses: [
      {
        id: "c1",
        title: "البند الأول: تعريف المعلومات السرية",
        content:
          "تشمل المعلومات السرية كافة البيانات والوثائق الفنية والمالية والخطط التشغيلية وقواعد العملاء التي يفصح عنها أحد الطرفين للآخر.",
        isMandatory: true,
      },
      {
        id: "c2",
        title: "البند الثاني: التزامات عدم الإفصاح",
        content:
          "يلتزم الطرف المستلم بحفظ سرية المعلومات وعدم استخدامها إلا في الغرض المحدد، وعدم نسخها أو إفشائها لأي طرف ثالث دون موافقة كتابية مسبقة.",
        isMandatory: true,
      },
      {
        id: "c3",
        title: "البند الثالث: التعويض عن الإخلال بالسرية",
        content:
          "يتحمل الطرف المخل بالسرية المسؤولية الكاملة عن تعويض الطرف المتضرر عن كافة الأضرار المادية المباشرة والخسائر وفق المادة (138) من نظام المعاملات المدنية.",
        isMandatory: true,
      },
    ],
  },

  settlement: {
    title: "محضر صلح وتسوية ودية وإبراء ذمة",
    description: "توثيق الاتفاق على إنهاء النزاع صلحاً وفق نظام الإثبات ونظام المعاملات المدنية.",
    clauses: [
      {
        id: "c1",
        title: "البند الأول: إنهاء النزاع والتنازل القضائي",
        content:
          "اتفق الطرفان على إنهاء كافة الخلافات والدعاوى المتبادلة بينهما صلحاً وتنازلاً قاطعاً لا رجعة فيه عن أي مطالبات حالية أو مستقبلية ناشئة عن موضوع النزاع.",
        isMandatory: true,
      },
      {
        id: "c2",
        title: "البند الثاني: تسوية الالتزامات المالية وإبراء الذمة",
        content:
          "يلتزم الطرف المدين بسداد المبلغ المتفق عليه، وبمجرد السداد يقر الطرف الدائن بإبراء ذمة الطرف المدين إبراءً شاملاً وكاملاً ومسقطاً لكافة الحقوق.",
        isMandatory: true,
      },
    ],
  },

  custom: {
    title: "عقد واتفاقية قانونية مخصصة",
    description: "صياغة عقد حر وفق الشروط والبنود المتفق عليها بين الطرفين.",
    clauses: [
      {
        id: "c1",
        title: "البند الأول: موضوع الاتفاقية",
        content: "اتفق الطرفان على الشروط والالتزامات المتبادلة وفق ما هو مبين في البنود التالية.",
        isMandatory: true,
      },
    ],
  },
};

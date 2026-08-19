import { createFileRoute } from "@tanstack/react-router";
import { ContractSigningView } from "@/components/contracts/contract-signing-view";

export const Route = createFileRoute("/sign/$token")({
  head: () => ({
    meta: [
      { title: "توقيع العقد إلكترونياً | مِهلة" },
      {
        name: "description",
        content: "مراجعة بنود العقد وتوقيعه إلكترونياً برابط آمن صادر من مكتب المحاماة.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PublicSignContractPage,
});

/** صفحة عامة مستقلة للطرف الثاني الخارجي — لا تحتوي قشرة مساحة العمل بحكم طبيعتها. */
function PublicSignContractPage() {
  const { token } = Route.useParams();

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 py-8 px-4 sm:px-6" dir="rtl">
      <div className="max-w-3xl mx-auto">
        <ContractSigningView token={token} />
      </div>
    </div>
  );
}

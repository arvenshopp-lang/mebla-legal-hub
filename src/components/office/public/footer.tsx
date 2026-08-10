/** فوتر خفيف لا يزاحم هوية المكتب ولا يعرض أي تحكم إداري. */
export function OfficePublicFooter({ officeName }: { officeName: string }) {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="office-container flex flex-col items-center gap-2 py-8 text-center">
        <p className="text-body-sm font-medium">{officeName}</p>
        <p className="text-caption">صفحة المكتب على منصة مِهلة</p>
        <a
          href="https://mehlalex.com/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center text-caption text-primary hover:underline"
        >
          سياسة الخصوصية
        </a>
      </div>
    </footer>
  );
}

/**
 * محرر CSS (CodeMirror 6) — تلوين صياغة، أرقام أسطر، بحث/استبدال، طيّ.
 * المحتوى LTR داخل واجهة RTL. يُحمّل lazy من محرر التصميم فقط.
 */
import CodeMirror from "@uiw/react-codemirror";
import { css as cssLang } from "@codemirror/lang-css";
import { EditorView } from "@codemirror/view";

export default function CssCodeEditor({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
}) {
  return (
    <div
      dir="ltr"
      className="overflow-hidden rounded-[var(--radius-m)] border border-border bg-surface"
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        height="380px"
        extensions={[cssLang(), EditorView.lineWrapping]}
        basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }}
        aria-label={ariaLabel}
      />
    </div>
  );
}

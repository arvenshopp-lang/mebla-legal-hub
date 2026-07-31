import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Modal, FormField, inputCls } from "@/lib/list-utils";

export const Route = createFileRoute("/focus-probe")({ component: Probe });

function Probe() {
  const [open, setOpen] = useState(true);
  const [v, setV] = useState("");
  return (
    <Modal open={open} onClose={() => { setV(""); setOpen(false); }} title="probe">
      <FormField label="t">
        <input data-testid="probe" value={v} onChange={(e) => setV(e.target.value)} className={inputCls} />
      </FormField>
    </Modal>
  );
}

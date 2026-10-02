import { useEffect, useRef } from "react";

export function ConfirmDialog({ title, message, confirmLabel, onCancel, onConfirm }: {
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);

  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancelRef.current();
      } else if (event.key === "Tab") {
        const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
        if (!buttons.length) return;
        if (event.shiftKey && document.activeElement === buttons[0]) {
          event.preventDefault();
          buttons.at(-1)?.focus();
        } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
          event.preventDefault();
          buttons[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); opener?.focus(); };
  }, []);

  return <div className="modal-backdrop" role="presentation">
    <section ref={dialogRef} className="modal-card modal-card-small plan-management-dialog" role="alertdialog" aria-modal="true" aria-labelledby="converter-confirm-title" aria-describedby="converter-confirm-message">
      <div className="modal-heading">
        <h2 id="converter-confirm-title">{title}</h2>
        <button type="button" aria-label={`Close ${title}`} onClick={onCancel}>×</button>
      </div>
      <p id="converter-confirm-message">{message}</p>
      <div className="modal-actions">
        <button ref={cancelRef} type="button" onClick={onCancel}>Cancel</button>
        <button type="button" className="danger" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </section>
  </div>;
}

import type { MouseEvent, KeyboardEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";

const interactive =
  "a, button, input, select, textarea, label, summary, [role='button'], [role='link'], [contenteditable='true'], [data-row-action]";

export function NavigableRow({
  to,
  label,
  children,
}: {
  to: string;
  label: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  function onClick(event: MouseEvent<HTMLTableRowElement>) {
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    if ((event.target as HTMLElement).closest(interactive)) return;
    if (window.getSelection()?.toString()) return;
    navigate(to);
  }
  function onKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    navigate(to);
  }
  return (
    <tr
      className="navigable-row"
      tabIndex={0}
      aria-label={label}
      aria-keyshortcuts="Enter Space"
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {children}
    </tr>
  );
}

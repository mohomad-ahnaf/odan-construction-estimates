export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status status-${status.toLowerCase()}`}>
      <span>●</span> {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

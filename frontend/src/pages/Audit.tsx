import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
export function Audit() {
  const query = useQuery({
    queryKey: ["audit"],
    queryFn: () =>
      api<
        {
          id: string;
          actorId: string | null;
          action: string;
          entityId: string | null;
          createdAt: string;
        }[]
      >("/audit"),
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">WORKSPACE ACTIVITY</span>
          <h1>Audit trail</h1>
          <p className="muted">The latest 100 recorded actions.</p>
        </div>
      </div>
      <section className="panel table-scroll">
        {query.isPending ? (
          <p className="empty">Loading activity…</p>
        ) : query.isError ? (
          <p role="alert">{query.error.message}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>TIME</th>
                <th>ACTION</th>
                <th>ACTOR ID</th>
                <th>RECORD ID</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((record) => (
                <tr key={record.id}>
                  <td>{new Date(record.createdAt).toLocaleString()}</td>
                  <td>{record.action.replaceAll("_", " ")}</td>
                  <td className="small">{record.actorId ?? "Anonymous"}</td>
                  <td className="small">{record.entityId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

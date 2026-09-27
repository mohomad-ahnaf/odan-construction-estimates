import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../auth";
import type { Project } from "../types";
export function ProjectDetail() {
  const { id } = useParams();
  const { session } = useAuth();
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["project", id],
    queryFn: () => api<Project>(`/projects/${id}`),
  });
  if (query.isPending) return <p>Loading project…</p>;
  if (query.isError)
    return (
      <p role="alert">
        {query.error.message}{" "}
        <button onClick={() => void query.refetch()}>Retry</button>
      </p>
    );
  const p = query.data;
  const canWrite = session?.user?.role !== "VIEWER";
  return (
    <>
      <Link className="back-link" to={`/clients/${p.clientId}?tab=projects`}>
        ← Client workspace
      </Link>
      <div className="page-heading">
        <div>
          <h1>{p.projectName}</h1>
          <p>{p.status}</p>
        </div>
        <div className="action-group">
          {canWrite && (
            <>
              <Link className="button" to={`/projects/${id}/edit`}>
                Edit Project
              </Link>
              {p.status === "ACTIVE" && (
                <Link
                  className="button primary"
                  to={`/estimates/new?clientId=${p.clientId}&projectId=${p.id}`}
                >
                  Create Estimate
                </Link>
              )}
              <button
                onClick={async () => {
                  await api(`/projects/${id}/status`, {
                    method: "PATCH",
                    body: JSON.stringify({
                      status: p.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE",
                    }),
                  });
                  await cache.invalidateQueries({ queryKey: ["project", id] });
                  await cache.invalidateQueries({
                    queryKey: ["client-projects", p.clientId],
                  });
                  await cache.invalidateQueries({ queryKey: ["dashboard"] });
                }}
              >
                {p.status === "ACTIVE" ? "Archive" : "Reactivate"}
              </button>
            </>
          )}
        </div>
      </div>
      <section className="panel form-section">
        <p>
          <strong>Code:</strong> {p.projectCode || "—"}
        </p>
        <p>
          <strong>Site:</strong> {p.siteAddress || "—"}
        </p>
        <p>
          <strong>Dates:</strong> {p.startDate || "—"} to{" "}
          {p.completionDate || "—"}
        </p>
        <p>
          <strong>Description:</strong> {p.description || "—"}
        </p>
      </section>
    </>
  );
}

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api, money } from "../lib/api";
import { useAuth } from "../auth";
import { StatusBadge } from "../components/StatusBadge";
import type { Client, Estimate, Page, Project } from "../types";

export function ProjectDetail() {
  const { id } = useParams();
  const { session } = useAuth();
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const project = useQuery({
    queryKey: ["project", id],
    queryFn: () => api<Project>(`/projects/${id}`),
  });
  const owner = project.data?.clientId;
  const client = useQuery({
    queryKey: ["client", owner],
    queryFn: () => api<Client>(`/clients/${owner}`),
    enabled: !!owner,
  });
  const estimates = useQuery({
    queryKey: ["project-estimates", id, search, page],
    queryFn: () =>
      api<Page<Estimate>>(
        `/projects/${id}/estimates?search=${encodeURIComponent(search)}&page=${page}`,
      ),
    enabled: !!id,
  });
  if (project.isError || client.isError)
    return (
      <p role="alert">
        {project.error?.message ?? client.error?.message}{" "}
        <button
          onClick={() => {
            void project.refetch();
            void client.refetch();
          }}
        >
          Retry
        </button>
      </p>
    );
  if (project.isPending || client.isPending) return <p>Loading project…</p>;
  const p = project.data;
  const ownerName = client.data?.name ?? "Client";
  const canWrite = session?.user?.role !== "VIEWER";
  const canCreate = canWrite && p.status === "ACTIVE" && client.data?.active;
  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/clients">Clients</Link>
        <span>›</span>
        <Link to={`/clients/${p.clientId}?tab=projects`}>{ownerName}</Link>
        <span>›</span>
        <span aria-current="page">{p.projectName}</span>
      </nav>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PROJECT WORKSPACE</span>
          <h1>{p.projectName}</h1>
          <p>{p.status}</p>
        </div>
        <div className="action-group">
          {canWrite && (
            <>
              <Link className="button" to={`/projects/${id}/edit`}>
                Edit Project
              </Link>
              {canCreate && (
                <Link
                  className="button primary"
                  to={`/projects/${id}/estimates/new`}
                >
                  Create Estimate
                </Link>
              )}
              <button
                onClick={async () => {
                  setActionError("");
                  try {
                    await api(`/projects/${id}/status`, {
                      method: "PATCH",
                      body: JSON.stringify({
                        status: p.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE",
                      }),
                    });
                    await cache.invalidateQueries({
                      queryKey: ["project", id],
                    });
                    await cache.invalidateQueries({
                      queryKey: ["client-projects", p.clientId],
                    });
                    await cache.invalidateQueries({ queryKey: ["dashboard"] });
                  } catch (e) {
                    setActionError((e as Error).message);
                  }
                }}
              >
                {p.status === "ACTIVE" ? "Archive" : "Reactivate"}
              </button>
            </>
          )}
        </div>
      </div>
      {actionError && (
        <p className="error" role="alert">
          {actionError}
        </p>
      )}
      <section className="panel form-section">
        <h2>Project overview</h2>
        <div className="form-grid">
          <p>
            <strong>Code</strong>
            <br />
            {p.projectCode || "—"}
          </p>
          <p>
            <strong>Site address</strong>
            <br />
            {p.siteAddress || "—"}
          </p>
          <p>
            <strong>Start date</strong>
            <br />
            {p.startDate || "—"}
          </p>
          <p>
            <strong>Completion date</strong>
            <br />
            {p.completionDate || "—"}
          </p>
        </div>
        <p>
          <strong>Description</strong>
          <br />
          {p.description || "—"}
        </p>
      </section>
      <section className="panel">
        <div className="panel-toolbar">
          <h2>Estimates for this Project</h2>
          <input
            aria-label="Search project estimates"
            placeholder="Search estimates…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        {estimates.isPending ? (
          <p className="empty">Loading estimates…</p>
        ) : estimates.isError ? (
          <p role="alert">
            {estimates.error.message}{" "}
            <button onClick={() => void estimates.refetch()}>Retry</button>
          </p>
        ) : estimates.data.data.length === 0 ? (
          <p className="empty">No estimates for this Project yet.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>NUMBER</th>
                  <th>ESTIMATE DATE</th>
                  <th>STATUS</th>
                  <th>TOTAL</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {estimates.data.data.map((e) => (
                  <tr key={e.id}>
                    <td>{e.number}</td>
                    <td>
                      {e.estimateDate
                        ? new Date(e.estimateDate).toLocaleDateString("en-GB")
                        : "—"}
                    </td>
                    <td>
                      <StatusBadge status={e.status} />
                    </td>
                    <td>{money(e.totals.total, e.currency)}</td>
                    <td>
                      <Link to={`/estimates/${e.id}`}>View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            {estimates.data?.total ?? 0} estimates · Page {page}
          </span>
          <div>
            <button disabled={page === 1} onClick={() => setPage((v) => v - 1)}>
              Previous
            </button>
            <button
              disabled={!estimates.data || page * 20 >= estimates.data.total}
              onClick={() => setPage((v) => v + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

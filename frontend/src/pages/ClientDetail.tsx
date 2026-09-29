import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, money } from "../lib/api";
import { useAuth } from "../auth";
import type { Client, Project, Page } from "../types";

export function ClientDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState("");
  const { session } = useAuth();
  const cache = useQueryClient();
  const showActivity =
    params.get("tab") === "activity" && session?.user?.role === "ADMIN";
  const client = useQuery({
    queryKey: ["client", id],
    queryFn: () => api<Client>(`/clients/${id}`),
  });
  const projects = useQuery({
    queryKey: ["client-projects", id, page],
    queryFn: () =>
      api<Page<Project>>(`/clients/${id}/projects?page=${page}&pageSize=100`),
  });
  const activity = useQuery({
    queryKey: ["client-activity", id],
    queryFn: () =>
      api<Page<{ action: string; createdAt: string }>>(
        `/clients/${id}/activity?pageSize=100&sort=createdAt&direction=desc`,
      ),
    enabled: showActivity,
  });
  if (client.isPending) return <p>Loading client…</p>;
  if (client.isError)
    return (
      <p role="alert">
        {client.error.message}{" "}
        <button onClick={() => void client.refetch()}>Retry</button>
      </p>
    );
  const c = client.data;
  const canWrite = session?.user?.role !== "VIEWER";
  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/clients">Clients</Link>
        <span>›</span>
        <span aria-current="page">{c.name}</span>
      </nav>
      <div className="page-heading workspace-heading">
        <div>
          <span className="eyebrow">CLIENT WORKSPACE</span>
          <h1>{c.name}</h1>
          <div className="heading-meta">
            <span className="code-label">
              Client Number: {c.clientCode ?? "Unavailable for legacy client"}
            </span>
            <span className={`status ${c.active ? "status-approved" : ""}`}>
              {c.active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
        {canWrite && (
          <div className="action-group">
            <Link className="button" to={`/clients/${id}/edit`}>
              Edit Client
            </Link>
            <button
              onClick={async () => {
                setActionError("");
                try {
                  await api(`/clients/${id}/status`, {
                    method: "PATCH",
                    body: JSON.stringify({ active: !c.active }),
                  });
                  await Promise.all([
                    cache.invalidateQueries({ queryKey: ["client", id] }),
                    cache.invalidateQueries({ queryKey: ["clients"] }),
                    cache.invalidateQueries({ queryKey: ["dashboard"] }),
                  ]);
                } catch (error) {
                  setActionError((error as Error).message);
                }
              }}
            >
              {c.active ? "Deactivate" : "Activate"}
            </button>
            {c.active && (
              <Link
                className="button primary"
                to={`/clients/${id}/projects/new`}
              >
                Add Project
              </Link>
            )}
          </div>
        )}
      </div>
      {actionError && (
        <p className="error" role="alert">
          {actionError}
        </p>
      )}
      <section
        className="workspace-section"
        aria-labelledby="client-projects-heading"
      >
        <div className="section-heading">
          <div>
            <span className="eyebrow">CLIENT PROJECTS</span>
            <h2 id="client-projects-heading">
              Projects{" "}
              <span className="muted">
                ({projects.data?.total ?? c.projectCount})
              </span>
            </h2>
          </div>
          {session?.user?.role === "ADMIN" && (
            <button
              className="secondary-action"
              onClick={() => setParams(showActivity ? {} : { tab: "activity" })}
            >
              {showActivity ? "Hide activity" : "Activity"}
            </button>
          )}
        </div>
        {projects.isPending ? (
          <p className="empty panel">Loading projects…</p>
        ) : projects.isError ? (
          <p role="alert">
            {projects.error.message}{" "}
            <button onClick={() => void projects.refetch()}>Retry</button>
          </p>
        ) : projects.data.data.length === 0 ? (
          <div className="panel empty">
            <p>No projects yet. Add a Project to start an estimate.</p>
          </div>
        ) : (
          <div className="project-card-grid">
            {projects.data.data.map((p) => (
              <Link
                className="panel project-card"
                key={p.id}
                to={`/projects/${p.id}`}
                aria-label={`Open project ${p.projectName}`}
              >
                <div className="project-card-top">
                  <span className="code-label">
                    {p.projectCode ?? "Legacy project"}
                  </span>
                  <span
                    className={`status ${p.status === "ACTIVE" ? "status-approved" : ""}`}
                  >
                    {p.status === "ACTIVE" ? "Active" : "Archived"}
                  </span>
                </div>
                <h3>{p.projectName}</h3>
                <div className="project-card-meta">
                  <span>
                    Start date{" "}
                    <strong>
                      {p.startDate
                        ? new Date(
                            `${p.startDate}T00:00:00Z`,
                          ).toLocaleDateString("en-GB")
                        : "Not set"}
                    </strong>
                  </span>
                  <span>
                    Estimates <strong>{p.estimateCount ?? 0}</strong>
                  </span>
                </div>
                <div className="project-card-bottom">
                  <span>
                    {p.latestEstimateValue
                      ? `Latest estimate ${money(p.latestEstimateValue.total, p.latestEstimateValue.currency)}`
                      : "No estimates yet"}
                  </span>
                  <span aria-hidden="true">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
        {(projects.data?.total ?? 0) > 100 && (
          <div className="pagination">
            <span>
              Page {page} of {Math.ceil((projects.data?.total ?? 0) / 100)}
            </span>
            <div>
              <button
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </button>
              <button
                disabled={page * 100 >= (projects.data?.total ?? 0)}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
      {showActivity && (
        <section className="panel form-section secondary-panel">
          <h2>Activity</h2>
          {activity.isPending ? (
            <p>Loading activity…</p>
          ) : activity.isError ? (
            <p role="alert">{activity.error.message}</p>
          ) : activity.data.data.length === 0 ? (
            <p>No activity yet.</p>
          ) : (
            <ul>
              {activity.data.data.map((event, index) => (
                <li key={index}>
                  {event.action.replaceAll("_", " ")} ·{" "}
                  {new Date(event.createdAt).toLocaleString("en-GB")}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

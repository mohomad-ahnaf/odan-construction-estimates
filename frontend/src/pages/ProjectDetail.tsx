import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, money } from "../lib/api";
import { useAuth } from "../auth";
import { StatusBadge } from "../components/StatusBadge";
import { NavigableRow } from "../components/NavigableRow";
import { estimateDescription } from "../lib/estimateDescription";
import { ProjectDocuments } from "../components/ProjectDocuments";
import { PlanMeasurementWorkspace } from "../components/PlanMeasurementWorkspace";
import { DesignerWorkspace } from "../components/DesignerWorkspace";
import type { Client, ClientEstimate, Estimate, Page, Project } from "../types";

export function ProjectDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const requestedTab = searchParams.get("tab");
  const tab =
    requestedTab === "client-estimates" ||
    ((requestedTab === "documents" || requestedTab === "plans" || requestedTab === "designer") &&
      session?.user?.role === "ADMIN")
      ? requestedTab
      : "estimates";
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [clientEstimatePage, setClientEstimatePage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [actionError, setActionError] = useState("");
  const project = useQuery({
    queryKey: ["project", id],
    queryFn: () => api<Project>(`/projects/${id}`),
  });
  const clientId = project.data?.clientId;
  const client = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => api<Client>(`/clients/${clientId}`),
    enabled: !!clientId,
  });
  const estimates = useQuery({
    queryKey: ["project-estimates", id, search, status, page],
    queryFn: () =>
      api<Page<Estimate>>(
        `/projects/${id}/estimates?search=${encodeURIComponent(search)}&page=${page}${status ? `&status=${status}` : ""}`,
      ),
    enabled: !!id,
  });
  const clientEstimates = useQuery({
    queryKey: ["project-client-estimates", id, clientEstimatePage],
    queryFn: () =>
      api<Page<ClientEstimate>>(
        `/projects/${id}/client-estimates?page=${clientEstimatePage}`,
      ),
    enabled: !!id && tab === "client-estimates",
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
  const canWrite = session?.user?.role !== "VIEWER";
  const canCreate = canWrite && p.status === "ACTIVE" && client.data.active;
  const createPath = `/projects/${id}/estimates/new`;
  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/clients">Clients</Link>
        <span>›</span>
        <Link to={`/clients/${p.clientId}`}>{client.data.name}</Link>
        <span>›</span>
        <span aria-current="page">{p.projectName}</span>
      </nav>
      <div className="page-heading workspace-heading">
        <div>
          <span className="eyebrow">PROJECT WORKSPACE</span>
          <h1>{p.projectName}</h1>
          <div className="heading-meta">
            <span className="code-label">
              {p.projectCode ?? "Legacy project"}
            </span>
            <Link className="inline-link" to={`/clients/${p.clientId}`}>
              {client.data.name}
            </Link>
            {client.data.clientCode && (
              <span>Client Number: {client.data.clientCode}</span>
            )}
            <span
              className={`status ${p.status === "ACTIVE" ? "status-approved" : ""}`}
            >
              {p.status === "ACTIVE" ? "Active" : "Archived"}
            </span>
            <span>
              Start:{" "}
              {p.startDate
                ? new Date(`${p.startDate}T00:00:00Z`).toLocaleDateString(
                    "en-GB",
                  )
                : "Not set"}
            </span>
          </div>
        </div>
        <div className="action-group">
          {canWrite && (
            <>
              <Link className="button" to={`/projects/${id}/edit`}>
                Edit Project
              </Link>
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
                    await Promise.all([
                      cache.invalidateQueries({ queryKey: ["project", id] }),
                      cache.invalidateQueries({
                        queryKey: ["client-projects", p.clientId],
                      }),
                      cache.invalidateQueries({ queryKey: ["dashboard"] }),
                    ]);
                  } catch (error) {
                    setActionError((error as Error).message);
                  }
                }}
              >
                {p.status === "ACTIVE" ? "Archive Project" : "Activate Project"}
              </button>
              {canCreate && tab === "estimates" && (
                <Link className="button primary" to={createPath}>
                  Create Estimate
                </Link>
              )}
            </>
          )}
        </div>
      </div>
      {actionError && (
        <p className="error" role="alert">
          {actionError}
        </p>
      )}
      {(p.siteAddress || p.description) && (
        <details className="project-details panel">
          <summary>Project details</summary>
          {p.siteAddress && (
            <p>
              <strong>Site address</strong>
              <br />
              {p.siteAddress}
            </p>
          )}
          {p.description && (
            <p>
              <strong>Description</strong>
              <br />
              {p.description}
            </p>
          )}
        </details>
      )}
      <div
        className="workspace-tabs"
        role="tablist"
        aria-label="Project workspaces"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "estimates"}
          onClick={() => setSearchParams({ tab: "estimates" })}
        >
          Estimates
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "client-estimates"}
          onClick={() => setSearchParams({ tab: "client-estimates" })}
        >
          Client Estimates
        </button>
        {session?.user?.role === "ADMIN" && (
          <>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "documents"}
              onClick={() => setSearchParams({ tab: "documents" })}
            >
              Documents
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "plans"}
              onClick={() => setSearchParams({ tab: "plans" })}
            >
              Plans
            </button>
            <button type="button" role="tab" aria-selected={tab === "designer"}
              onClick={() => setSearchParams({ tab: "designer" })}>3D Designer</button>
          </>
        )}
      </div>
      {tab === "estimates" ? (
        <section className="panel" aria-labelledby="project-estimates-heading">
          <div className="panel-toolbar project-estimate-toolbar">
            <h2 id="project-estimates-heading">Estimates for this Project</h2>
            <div className="filter-group">
              <input
                aria-label="Search project estimates"
                placeholder="Search code or title…"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
              <select
                aria-label="Filter estimate status"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="SENT">Sent</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
          </div>
          {estimates.isPending ? (
            <p className="empty">Loading estimates…</p>
          ) : estimates.isError ? (
            <p role="alert" className="error">
              {estimates.error.message}{" "}
              <button onClick={() => void estimates.refetch()}>Retry</button>
            </p>
          ) : estimates.data.data.length === 0 ? (
            <div className="empty">
              <p>
                {search || status
                  ? "No estimates match these filters."
                  : "No estimates for this Project yet."}
              </p>
              {canCreate && !search && !status && (
                <Link className="button primary" to={createPath}>
                  Create First Estimate
                </Link>
              )}
            </div>
          ) : (
            <div className="table-scroll">
              <table className="project-estimate-table">
                <thead>
                  <tr>
                    <th>ESTIMATE</th>
                    <th>DATE</th>
                    <th>STATUS</th>
                    <th>TOTAL</th>
                    <th>UPDATED</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {estimates.data.data.map((e) => (
                    <NavigableRow
                      key={e.id}
                      to={`/estimates/${e.id}`}
                      label={`Open estimate ${e.number}`}
                    >
                      <td>
                        <strong>{e.number}</strong>
                        <small>{estimateDescription(e)}</small>
                      </td>
                      <td>
                        {e.estimateDate
                          ? new Date(e.estimateDate).toLocaleDateString("en-GB")
                          : "—"}
                      </td>
                      <td>
                        <StatusBadge status={e.status} />
                      </td>
                      <td className="amount">
                        {money(e.totals.total, e.currency)}
                      </td>
                      <td>
                        {new Date(e.updatedAt).toLocaleDateString("en-GB")}
                      </td>
                      <td>
                        <div className="row-actions">
                          <Link to={`/estimates/${e.id}`}>View</Link>
                          {canWrite && e.status === "DRAFT" && (
                            <Link to={`/estimates/${e.id}/edit`}>Edit</Link>
                          )}
                        </div>
                      </td>
                    </NavigableRow>
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
              <button
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </button>
              <button
                disabled={!estimates.data || page * 20 >= estimates.data.total}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      ) : tab === "client-estimates" ? (
        <section className="panel" aria-labelledby="client-estimates-heading">
          <div className="panel-toolbar project-estimate-toolbar">
            <div>
              <h2 id="client-estimates-heading">
                Client Estimates for this Project
              </h2>
              <p className="muted">
                Saved customer-facing summaries of selected Project estimates.
              </p>
            </div>
            {canCreate && (
              <Link
                className="button primary"
                to={`/projects/${id}/client-estimates/new`}
              >
                Create Client Estimate
              </Link>
            )}
          </div>
          {clientEstimates.isPending ? (
            <p className="empty">Loading Client Estimates…</p>
          ) : clientEstimates.isError ? (
            <p role="alert" className="error">
              {clientEstimates.error.message}{" "}
              <button onClick={() => void clientEstimates.refetch()}>
                Retry
              </button>
            </p>
          ) : clientEstimates.data.data.length === 0 ? (
            <p className="empty">No Client Estimates for this Project yet.</p>
          ) : (
            <div className="table-scroll">
              <table className="project-estimate-table">
                <thead>
                  <tr>
                    <th>CLIENT ESTIMATE</th>
                    <th>DATE</th>
                    <th>STATUS</th>
                    <th>ESTIMATES</th>
                    <th>GRAND TOTAL</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {clientEstimates.data.data.map((record) => (
                    <NavigableRow
                      key={record.id}
                      to={`/client-estimates/${record.id}`}
                      label={`Open Client Estimate ${record.clientEstimateNumber}`}
                    >
                      <td>
                        <strong>{record.clientEstimateNumber}</strong>
                        <small>{record.title}</small>
                      </td>
                      <td>
                        {new Date(record.clientEstimateDate).toLocaleDateString(
                          "en-GB",
                        )}
                      </td>
                      <td>
                        <StatusBadge status={record.status} />
                      </td>
                      <td>{record.items.length}</td>
                      <td className="amount">
                        {money(record.grandTotal, record.currency)}
                      </td>
                      <td>
                        <div className="row-actions">
                          <Link to={`/client-estimates/${record.id}`}>
                            View
                          </Link>
                          {canWrite && record.status === "DRAFT" && (
                            <Link to={`/client-estimates/${record.id}/edit`}>
                              Edit
                            </Link>
                          )}
                        </div>
                      </td>
                    </NavigableRow>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pagination">
            <span>
              {clientEstimates.data?.total ?? 0} Client Estimates · Page{" "}
              {clientEstimatePage}
            </span>
            <div>
              <button
                disabled={clientEstimatePage === 1}
                onClick={() => setClientEstimatePage((value) => value - 1)}
              >
                Previous
              </button>
              <button
                disabled={
                  !clientEstimates.data ||
                  clientEstimatePage * 20 >= clientEstimates.data.total
                }
                onClick={() => setClientEstimatePage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      ) : tab === "documents" ? (
        <ProjectDocuments projectId={id!} initialCategory={searchParams.get("category") === "IMAGES" ? "IMAGES" : undefined} />
      ) : tab === "designer" ? (
        <DesignerWorkspace projectId={id!} />
      ) : (
        <PlanMeasurementWorkspace projectId={id!} />
      )}
    </>
  );
}

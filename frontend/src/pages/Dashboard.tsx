import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, money } from "../lib/api";
import type { Client, Dashboard as DashboardData, Page } from "../types";
import { StatusBadge } from "../components/StatusBadge";
import { NavigableRow } from "../components/NavigableRow";
import { estimateDescription } from "../lib/estimateDescription";
import { useAuth } from "../auth";
const amounts = (values: Record<string, string>) =>
  Object.entries(values).length
    ? Object.entries(values).map(([currency, value]) => (
        <span key={currency} className="currency-amount">
          {money(value, currency)}
        </span>
      ))
    : "—";
export function Dashboard() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { session } = useAuth();
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardData>("/dashboard"),
  });
  const clients = useQuery({
    queryKey: ["clients", search, page],
    queryFn: () =>
      api<Page<Client>>(
        `/clients?search=${encodeURIComponent(search)}&page=${page}`,
      ),
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ODAN WORKSPACE</span>
          <h1>Dashboard</h1>
          <p className="muted">Clients, projects and estimates in one place.</p>
        </div>
        {session?.user?.role !== "VIEWER" && (
          <Link className="button primary" to="/clients/new">
            Add New Client
          </Link>
        )}
      </div>
      <section className="summary-grid" aria-label="Workspace summary">
        {dashboard.isPending ? (
          <p>Loading dashboard…</p>
        ) : dashboard.isError ? (
          <p role="alert">
            {dashboard.error.message}{" "}
            <button onClick={() => void dashboard.refetch()}>Retry</button>
          </p>
        ) : (
          <>
            <article className="panel summary-card">
              <div className="summary-card-top">
                <span>Active Projects</span>
                <span className="summary-icon" aria-hidden="true">
                  PR
                </span>
              </div>
              <strong>{dashboard.data.activeProjects}</strong>
            </article>
            <Link
              className="panel summary-card summary-card-link"
              to="/clients"
              aria-label={`Open Clients, ${dashboard.data.activeClients} active`}
            >
              <div className="summary-card-top">
                <span>Active Clients</span>
                <span className="summary-icon" aria-hidden="true">
                  CL
                </span>
              </div>
              <strong>{dashboard.data.activeClients}</strong>
              <span className="summary-card-prompt">View Clients →</span>
            </Link>
            <Link
              className="panel summary-card summary-card-link"
              to="/estimates"
              aria-label={`Open Estimates, ${dashboard.data.totalEstimates} total`}
            >
              <div className="summary-card-top">
                <span>Total Estimates</span>
                <span className="summary-icon" aria-hidden="true">
                  ES
                </span>
              </div>
              <strong>{dashboard.data.totalEstimates}</strong>
              <span className="summary-card-prompt">View Estimates →</span>
            </Link>
            <article className="panel summary-card">
              <div className="summary-card-top">
                <span>Approved Estimate Value</span>
                <span className="summary-icon" aria-hidden="true">
                  Σ
                </span>
              </div>
              <strong className="amount-stack">
                {amounts(dashboard.data.approvedTotalsByCurrency)}
              </strong>
            </article>
          </>
        )}
      </section>
      <section className="panel dashboard-clients">
        <div className="panel-toolbar">
          <h2>All Clients</h2>
          <input
            aria-label="Search clients"
            placeholder="Search clients…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {clients.isPending ? (
          <p className="empty">Loading clients…</p>
        ) : clients.isError ? (
          <p role="alert">
            {clients.error.message}{" "}
            <button onClick={() => void clients.refetch()}>Retry</button>
          </p>
        ) : clients.data.data.length === 0 ? (
          <p className="empty">
            {search ? "No clients match your search." : "No clients yet."}
          </p>
        ) : (
          <div className="dashboard-client-grid">
            {clients.data.data.map((c) => (
              <Link
                key={c.id}
                className="dashboard-client-card"
                to={`/clients/${c.id}`}
                aria-label={`View client ${c.name}`}
              >
                <div className="dashboard-client-heading">
                  <h3>{c.name}</h3>
                  <div className="dashboard-client-meta">
                    <span className="dashboard-client-number">
                      {c.clientCode ?? "Number unavailable"}
                    </span>
                    <StatusBadge status={c.active ? "ACTIVE" : "INACTIVE"} />
                  </div>
                </div>
                <div className="dashboard-client-value">
                  <span>Approved estimate value</span>
                  <strong>{amounts(c.totalsByCurrency)}</strong>
                </div>
                <div className="dashboard-client-footer">
                  <div className="dashboard-client-counts">
                    <span><strong>{c.projectCount}</strong> projects</span>
                    <span><strong>{c.estimateCount}</strong> estimates</span>
                  </div>
                  <span className="dashboard-client-view">
                    View Client <span aria-hidden="true">→</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
        <div className="pagination">
          <span>
            {clients.data?.total ?? 0} clients · Page {page}
          </span>
          <div>
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <button
              disabled={
                !clients.data ||
                page * clients.data.pageSize >= clients.data.total
              }
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
      <section className="panel dashboard-recent-estimates">
        <h2>Recent 10 Estimates</h2>
        {dashboard.isPending ? (
          <p>Loading estimates…</p>
        ) : dashboard.isError ? (
          <p role="alert">
            Unable to load recent estimates.{" "}
            <button onClick={() => void dashboard.refetch()}>Retry</button>
          </p>
        ) : dashboard.data.recentEstimates.length === 0 ? (
          <p className="empty">No estimates yet.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>NUMBER</th>
                  <th>CLIENT</th>
                  <th>PROJECT</th>
                  <th>ESTIMATE DATE</th>
                  <th>CREATED</th>
                  <th>STATUS</th>
                  <th>TOTAL</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {dashboard.data.recentEstimates.map((e) => (
                  <NavigableRow
                    key={e.id}
                    to={`/estimates/${e.id}`}
                    label={`Open estimate ${e.number}`}
                  >
                    <td>
                      {e.number}
                      <small>{estimateDescription(e)}</small>
                    </td>
                    <td>{e.clientName}</td>
                    <td>{e.projectTitle}</td>
                    <td>
                      {e.estimateDate
                        ? new Date(e.estimateDate).toLocaleDateString("en-GB")
                        : "—"}
                    </td>
                    <td>{new Date(e.createdAt).toLocaleDateString("en-GB")}</td>
                    <td>
                      <StatusBadge status={e.status} />
                    </td>
                    <td>{money(e.grandTotal, e.currency)}</td>
                    <td>
                      <Link to={`/estimates/${e.id}`}>View</Link>
                    </td>
                  </NavigableRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

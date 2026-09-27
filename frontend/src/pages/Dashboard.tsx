import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, money } from "../lib/api";
import type { Client, Dashboard as DashboardData, Page } from "../types";
import { StatusBadge } from "../components/StatusBadge";
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
              <span>Active Projects</span>
              <strong>{dashboard.data.activeProjects}</strong>
            </article>
            <article className="panel summary-card">
              <span>Active Clients</span>
              <strong>{dashboard.data.activeClients}</strong>
            </article>
            <article className="panel summary-card">
              <span>Total Estimates</span>
              <strong>{dashboard.data.totalEstimates}</strong>
            </article>
            <article className="panel summary-card">
              <span>Approved Estimate Value</span>
              <strong className="amount-stack">
                {amounts(dashboard.data.approvedTotalsByCurrency)}
              </strong>
            </article>
          </>
        )}
      </section>
      <section className="panel">
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
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>CLIENT</th>
                  <th>CONTACT</th>
                  <th>TELEPHONE</th>
                  <th>EMAIL</th>
                  <th>PROJECTS</th>
                  <th>ESTIMATES</th>
                  <th>TOTALS</th>
                  <th>STATUS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clients.data.data.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.contactPerson || "—"}</td>
                    <td>{c.telephone || "—"}</td>
                    <td>{c.email || "—"}</td>
                    <td>{c.projectCount}</td>
                    <td>{c.estimateCount}</td>
                    <td className="amount-stack">
                      {amounts(c.totalsByCurrency)}
                    </td>
                    <td>{c.active ? "Active" : "Inactive"}</td>
                    <td>
                      <Link to={`/clients/${c.id}`}>View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
      <section className="panel">
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
                  <tr key={e.id}>
                    <td>{e.number}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

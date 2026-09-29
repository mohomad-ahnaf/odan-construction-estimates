import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, money } from "../lib/api";
import { useAuth } from "../auth";
import { StatusBadge } from "../components/StatusBadge";
import type { Client, Page } from "../types";
export function Clients() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ["clients", search, page],
    queryFn: () =>
      api<Page<Client>>(
        `/clients?search=${encodeURIComponent(search)}&page=${page}`,
      ),
  });
  return (
    <>
      <div className="page-heading clients-page-heading">
        <div>
          <h1>All Clients</h1>
          <p className="muted">Manage construction clients and their projects</p>
        </div>
        <div className="clients-page-actions">
          <input
            type="search"
            aria-label="Search clients"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search clients…"
          />
          {session?.user?.role !== "VIEWER" && (
            <Link className="button primary" to="/clients/new">
              Add Client
            </Link>
          )}
        </div>
      </div>
      <section className="clients-directory" aria-label="Client directory">
        {query.isPending ? (
          <p className="empty clients-list-state">Loading clients…</p>
        ) : query.isError ? (
          <p role="alert" className="clients-list-state">
            {query.error.message}{" "}
            <button onClick={() => void query.refetch()}>Retry</button>
          </p>
        ) : query.data.data.length === 0 ? (
          <p className="empty clients-list-state">No clients found.</p>
        ) : (
          <div className="clients-card-grid">
            {query.data.data.map((c) => (
              <Link
                className="client-card"
                key={c.id}
                to={`/clients/${c.id}`}
                aria-label={`View client ${c.name}`}
              >
                <div className="client-card-heading">
                  <h2>{c.name}</h2>
                  <div className="client-card-meta">
                    <span className="client-card-number">
                      {c.clientCode ?? "Number unavailable"}
                    </span>
                    <StatusBadge status={c.active ? "ACTIVE" : "INACTIVE"} />
                  </div>
                </div>
                <div className="client-card-value">
                  <span>Approved estimate value</span>
                  <strong>
                    {Object.entries(c.totalsByCurrency).length ? (
                      Object.entries(c.totalsByCurrency).map(
                        ([currency, value]) => (
                          <span key={currency} className="currency-amount">
                            {money(value, currency)}
                          </span>
                        ),
                      )
                    ) : (
                      <span className="currency-amount">No approved estimates</span>
                    )}
                  </strong>
                </div>
                <div className="client-card-contact">
                  <div>
                    <span>Contact person</span>
                    <strong>{c.contactPerson || "Not provided"}</strong>
                  </div>
                  <div>
                    <span>Telephone</span>
                    <strong>{c.telephone || "Not provided"}</strong>
                  </div>
                  {c.email && (
                    <div>
                      <span>Email</span>
                      <strong>{c.email}</strong>
                    </div>
                  )}
                </div>
                <div className="client-card-footer">
                  <div className="client-card-counts">
                    <span><strong>{c.projectCount}</strong> projects</span>
                    <span><strong>{c.estimateCount}</strong> estimates</span>
                  </div>
                  <span className="client-card-view">View Client <span aria-hidden="true">→</span></span>
                </div>
              </Link>
            ))}
          </div>
        )}
        <div className="pagination clients-pagination">
          <span>
            {query.data?.total ?? 0} clients · Page {page}
          </span>
          <div>
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <button
              disabled={
                !query.data || page * query.data.pageSize >= query.data.total
              }
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, money } from "../lib/api";
import { useAuth } from "../auth";
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
      <div className="page-heading">
        <div>
          <h1>Clients</h1>
          <p className="muted">Manage client relationships and work.</p>
        </div>
        {session?.user?.role !== "VIEWER" && (
          <Link className="button primary" to="/clients/new">
            Add New Client
          </Link>
        )}
      </div>
      <section className="panel">
        <div className="panel-toolbar">
          <h2>Client register</h2>
          <input
            aria-label="Search clients"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search clients…"
          />
        </div>
        {query.isPending ? (
          <p className="empty">Loading clients…</p>
        ) : query.isError ? (
          <p role="alert">
            {query.error.message}{" "}
            <button onClick={() => void query.refetch()}>Retry</button>
          </p>
        ) : query.data.data.length === 0 ? (
          <p className="empty">No clients found.</p>
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
                {query.data.data.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.contactPerson || "—"}</td>
                    <td>{c.telephone || "—"}</td>
                    <td>{c.email || "—"}</td>
                    <td>{c.projectCount}</td>
                    <td>{c.estimateCount}</td>
                    <td>
                      {Object.entries(c.totalsByCurrency).map(
                        ([currency, value]) => (
                          <span key={currency} className="currency-amount">
                            {money(value, currency)}
                          </span>
                        ),
                      )}
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

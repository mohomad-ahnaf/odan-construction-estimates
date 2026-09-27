import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, money } from "../lib/api";
import { useAuth } from "../auth";
import { StatusBadge } from "../components/StatusBadge";
import type { Estimate } from "../types";
export function Estimates() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ["estimates", search, page],
    queryFn: () =>
      api<{ data: Estimate[]; total: number; pageSize: number }>(
        `/estimates?search=${encodeURIComponent(search)}&page=${page}`,
      ),
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PROJECT FINANCIALS</span>
          <h1>Estimates</h1>
          <p className="muted">
            Thoughtful planning. Accurate numbers. Strong foundations.
          </p>
        </div>
        {session?.user?.role !== "VIEWER" && (
          <Link className="button primary" to="/estimates/new">
            ＋ New estimate
          </Link>
        )}
      </div>
      <section className="intro-card">
        <div>
          <span className="eyebrow">EVERY DETAIL ACCOUNTED FOR</span>
          <h2>A clear view of your next build.</h2>
          <p>Prepare, review, and share professional construction estimates.</p>
        </div>
        <div className="intro-number">
          {query.data?.total ?? "—"}
          <small>{search ? "matching estimates" : "total estimates"}</small>
        </div>
      </section>
      <section className="panel">
        <div className="panel-toolbar">
          <h2>Estimate register</h2>
          <input
            aria-label="Search estimates"
            placeholder="Search project, client, or reference…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {query.isPending ? (
          <p className="empty">Loading estimates…</p>
        ) : query.isError ? (
          <p role="alert" className="error">
            {query.error.message}{" "}
            <button onClick={() => void query.refetch()}>Retry</button>
          </p>
        ) : query.data.data.length === 0 ? (
          <div className="empty">
            <h3>
              {search ? "No matches found" : "Your first estimate starts here"}
            </h3>
            <p>
              {search
                ? "Try another project or client name."
                : "Create an estimate and add your scope of work."}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>PROJECT / REFERENCE</th>
                  <th>CLIENT</th>
                  <th>STATUS</th>
                  <th>CREATED</th>
                  <th className="numeric">ESTIMATE TOTAL</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((estimate) => (
                  <tr key={estimate.id}>
                    <td>
                      <Link
                        className="project-link"
                        to={`/estimates/${estimate.id}`}
                      >
                        {estimate.title}
                      </Link>
                      <small>{estimate.number}</small>
                    </td>
                    <td>{estimate.clientName}</td>
                    <td>
                      <StatusBadge status={estimate.status} />
                    </td>
                    <td>
                      {new Date(estimate.createdAt).toLocaleDateString("en-GB")}
                    </td>
                    <td className="numeric amount">
                      {money(estimate.totals.total, estimate.currency)}
                    </td>
                    <td>
                      <Link
                        aria-label={`Open ${estimate.title}`}
                        to={`/estimates/${estimate.id}`}
                      >
                        ↗
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            {query.data?.total ?? 0} estimates · Page {page}
          </span>
          <div>
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <button
              disabled={!query.data || page * 20 >= query.data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
      <div className="page-note">
        <span>✓</span> All changes are recorded in your workspace audit trail.
      </div>
    </>
  );
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, money } from "../lib/api";
import { useAuth } from "../auth";
import type { Client, Project, Estimate, Page } from "../types";
import { StatusBadge } from "../components/StatusBadge";
export function ClientDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "overview";
  const { session } = useAuth();
  const cache = useQueryClient();
  const client = useQuery({
    queryKey: ["client", id],
    queryFn: () => api<Client>(`/clients/${id}`),
  });
  const projects = useQuery({
    queryKey: ["client-projects", id],
    queryFn: () => api<Page<Project>>(`/clients/${id}/projects?pageSize=100`),
    enabled: tab === "projects",
  });
  const estimates = useQuery({
    queryKey: ["client-estimates", id],
    queryFn: () =>
      api<Page<Estimate>>(
        `/clients/${id}/estimates?pageSize=100&sort=createdAt&direction=desc`,
      ),
    enabled: tab === "estimates",
  });
  const activity = useQuery({
    queryKey: ["client-activity", id],
    queryFn: () =>
      api<Page<{ action: string; createdAt: string }>>(
        `/clients/${id}/activity?pageSize=100&sort=createdAt&direction=desc`,
      ),
    enabled: tab === "activity" && session?.user?.role === "ADMIN",
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
      <Link className="back-link" to="/clients">
        ← Clients
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CLIENT WORKSPACE</span>
          <h1>{c.name}</h1>
          <p>{c.active ? "Active" : "Inactive"}</p>
        </div>
        <div className="action-group">
          {canWrite && (
            <>
              <Link className="button" to={`/clients/${id}/edit`}>
                Edit Client
              </Link>
              {c.active && (
                <>
                  <Link className="button" to={`/clients/${id}/projects/new`}>
                    Add Project
                  </Link>
                  <Link
                    className="button primary"
                    to={`/estimates/new?clientId=${id}`}
                  >
                    Create Estimate for This Client
                  </Link>
                </>
              )}
              <button
                onClick={async () => {
                  await api(`/clients/${id}/status`, {
                    method: "PATCH",
                    body: JSON.stringify({ active: !c.active }),
                  });
                  await cache.invalidateQueries({ queryKey: ["client", id] });
                  await cache.invalidateQueries({ queryKey: ["clients"] });
                  await cache.invalidateQueries({ queryKey: ["dashboard"] });
                }}
              >
                {c.active ? "Deactivate" : "Reactivate"}
              </button>
            </>
          )}
        </div>
      </div>
      <nav className="detail-tabs" aria-label="Client sections">
        {[
          "overview",
          "projects",
          "estimates",
          ...(session?.user?.role === "ADMIN" ? ["activity"] : []),
        ].map((name) => (
          <button
            key={name}
            className={tab === name ? "selected" : ""}
            onClick={() => setParams({ tab: name })}
          >
            {name[0].toUpperCase() + name.slice(1)}
          </button>
        ))}
      </nav>
      {tab === "overview" && (
        <section className="panel form-section">
          <h2>Overview</h2>
          <div className="summary-grid">
            <p>
              <strong>Projects</strong>
              <br />
              {c.projectCount}
            </p>
            <p>
              <strong>Estimates</strong>
              <br />
              {c.estimateCount}
            </p>
            <p>
              <strong>Estimate totals</strong>
              <br />
              {Object.entries(c.totalsByCurrency).length
                ? Object.entries(c.totalsByCurrency).map(
                    ([currency, value]) => (
                      <span className="currency-amount" key={currency}>
                        {money(value, currency)}
                      </span>
                    ),
                  )
                : "—"}
            </p>
          </div>
          <div className="form-grid">
            <p>
              <strong>Contact person</strong>
              <br />
              {c.contactPerson || "—"}
            </p>
            <p>
              <strong>Telephone</strong>
              <br />
              {c.telephone || "—"}
            </p>
            <p>
              <strong>Email</strong>
              <br />
              {c.email || "—"}
            </p>
            <p>
              <strong>Registration number</strong>
              <br />
              {c.registrationNumber || "—"}
            </p>
            <p>
              <strong>VAT number</strong>
              <br />
              {c.vatNumber || "—"}
            </p>
            <p>
              <strong>Address</strong>
              <br />
              {c.address || "—"}
            </p>
          </div>
          <p>
            <strong>Notes</strong>
            <br />
            {c.notes || "—"}
          </p>
        </section>
      )}
      {tab === "projects" && (
        <section className="panel form-section">
          <h2>Projects</h2>
          {projects.isPending ? (
            <p>Loading projects…</p>
          ) : projects.isError ? (
            <p role="alert">
              {projects.error.message}{" "}
              <button onClick={() => void projects.refetch()}>Retry</button>
            </p>
          ) : projects.data.data.length === 0 ? (
            <p>No projects yet.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>PROJECT</th>
                    <th>CODE</th>
                    <th>SITE</th>
                    <th>STATUS</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {projects.data.data.map((p) => (
                    <tr key={p.id}>
                      <td>{p.projectName}</td>
                      <td>{p.projectCode || "—"}</td>
                      <td>{p.siteAddress || "—"}</td>
                      <td>{p.status}</td>
                      <td>
                        <Link to={`/projects/${p.id}`}>View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {tab === "estimates" && (
        <section className="panel form-section">
          <h2>Estimates</h2>
          {estimates.isPending ? (
            <p>Loading estimates…</p>
          ) : estimates.isError ? (
            <p role="alert">
              {estimates.error.message}{" "}
              <button onClick={() => void estimates.refetch()}>Retry</button>
            </p>
          ) : estimates.data.data.length === 0 ? (
            <p>No estimates for this client.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>NUMBER</th>
                    <th>PROJECT</th>
                    <th>DATE</th>
                    <th>STATUS</th>
                    <th>TOTAL</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {estimates.data.data.map((e) => (
                    <tr key={e.id}>
                      <td>{e.number}</td>
                      <td>{e.title}</td>
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
                        <Link to={`/estimates/${e.id}`}>View / export</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {tab === "activity" && session?.user?.role === "ADMIN" && (
        <section className="panel form-section">
          <h2>Activity</h2>
          {activity.isPending ? (
            <p>Loading activity…</p>
          ) : activity.isError ? (
            <p role="alert">
              {activity.error.message}{" "}
              <button onClick={() => void activity.refetch()}>Retry</button>
            </p>
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

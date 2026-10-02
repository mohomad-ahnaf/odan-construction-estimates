import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../lib/api";
import type { Client, Page, ProjectDirectoryItem } from "../types";

export function Projects() {
  const [search, setSearch] = useState("");
  const [clientId, setClientId] = useState("");
  const [page, setPage] = useState(1);
  const clients = useQuery({
    queryKey: ["project-directory-clients"],
    queryFn: () => api<Page<Client>>("/clients?pageSize=100&sort=name&direction=asc"),
  });
  const projects = useQuery({
    queryKey: ["projects", search, clientId, page],
    queryFn: () =>
      api<Page<ProjectDirectoryItem>>(
        `/projects?search=${encodeURIComponent(search)}&page=${page}${
          clientId ? `&clientId=${encodeURIComponent(clientId)}` : ""
        }`,
      ),
  });

  return (
    <>
      <div className="page-heading projects-page-heading">
        <div>
          <span className="eyebrow">PROJECT DIRECTORY</span>
          <h1>Projects</h1>
          <p className="muted">Browse construction projects across all clients.</p>
        </div>
        <div className="projects-page-filters">
          <input
            type="search"
            aria-label="Search projects"
            placeholder="Search project or client…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <select
            aria-label="Filter projects by client"
            value={clientId}
            onChange={(event) => {
              setClientId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All clients</option>
            {clients.data?.data.map((client) => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        </div>
      </div>

      <section className="panel projects-directory" aria-labelledby="projects-register-heading">
        <div className="panel-toolbar">
          <div>
            <h2 id="projects-register-heading">Project register</h2>
            <p className="muted">{projects.data?.total ?? 0} accessible projects</p>
          </div>
        </div>
        {clients.isError && (
          <p className="error" role="alert">
            Client filter could not be loaded. <button onClick={() => void clients.refetch()}>Retry</button>
          </p>
        )}
        {projects.isPending ? (
          <p className="empty">Loading projects…</p>
        ) : projects.isError ? (
          <p className="error" role="alert">
            {projects.error.message} <button onClick={() => void projects.refetch()}>Retry</button>
          </p>
        ) : projects.data.data.length === 0 ? (
          <div className="empty">
            <h3>No projects found</h3>
            <p>{search || clientId ? "Try another project or client." : "Projects created from Client workspaces will appear here."}</p>
          </div>
        ) : (
          <div className="projects-list">
            {projects.data.data.map((project) => (
              <Link
                className="project-directory-row"
                key={project.id}
                to={`/projects/${project.id}`}
                aria-label={`Open project ${project.projectName}`}
              >
                <div className="project-directory-primary">
                  <strong title={project.projectName}>{project.projectName}</strong>
                  <span>{project.projectCode ?? "Legacy project"}</span>
                </div>
                <div className="project-directory-client">
                  <span>Client</span>
                  <strong title={project.clientName}>{project.clientName}</strong>
                  {project.clientCode && <small>{project.clientCode}</small>}
                </div>
                <div className="project-directory-date">
                  <span>Start date</span>
                  <strong>
                    {project.startDate
                      ? new Date(`${project.startDate}T00:00:00Z`).toLocaleDateString("en-GB")
                      : "Not set"}
                  </strong>
                </div>
                <div className="project-directory-estimates">
                  <span>Estimates</span>
                  <strong>{project.estimateCount}</strong>
                </div>
                <StatusBadge status={project.status} />
                <span className="project-directory-open" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        )}
        <div className="pagination">
          <span>{projects.data?.total ?? 0} projects · Page {page}</span>
          <div>
            <button disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
            <button
              disabled={!projects.data || page * projects.data.pageSize >= projects.data.total}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

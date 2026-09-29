import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ClientEstimateForm } from "../components/ClientEstimateForm";
import { api } from "../lib/api";
import type { Client, ClientEstimate, Project } from "../types";

export function ClientEstimateEditor() {
  const { id, projectId } = useParams();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const record = useQuery({
    queryKey: ["client-estimate", id],
    queryFn: () => api<ClientEstimate>(`/client-estimates/${id}`),
    enabled: !!id,
  });
  const selectedProjectId = id ? record.data?.projectId : projectId;
  const project = useQuery({
    queryKey: ["project", selectedProjectId],
    queryFn: () => api<Project>(`/projects/${selectedProjectId}`),
    enabled: !!selectedProjectId,
  });
  const client = useQuery({
    queryKey: ["client", project.data?.clientId],
    queryFn: () => api<Client>(`/clients/${project.data?.clientId}`),
    enabled: !!project.data?.clientId,
  });
  if (id && record.isPending) return <p>Loading Client Estimate…</p>;
  if (id && record.isError) return <p role="alert">{record.error.message}</p>;
  if (record.data && record.data.status !== "DRAFT")
    return (
      <p>
        Only Draft Client Estimates can be edited.{" "}
        <Link to={`/client-estimates/${id}`}>Back to Client Estimate</Link>
      </p>
    );
  if (!selectedProjectId)
    return (
      <p>
        Open a Project to create a Client Estimate.{" "}
        <Link to="/clients">Browse Clients</Link>
      </p>
    );
  if (project.isError || client.isError)
    return (
      <p role="alert">{project.error?.message ?? client.error?.message}</p>
    );
  if (project.isPending || client.isPending)
    return <p>Loading Project context…</p>;
  if (
    project.data.clientId !== client.data.id ||
    (record.data && record.data.clientId !== client.data.id)
  )
    return <p role="alert">Client Estimate relationship is inconsistent.</p>;
  if (!id && (!client.data.active || project.data.status !== "ACTIVE"))
    return (
      <p>
        This Project cannot receive new Client Estimates while it or its Client
        is inactive.
      </p>
    );
  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/clients">Clients</Link>
        <span>›</span>
        <Link to={`/clients/${client.data.id}`}>{client.data.name}</Link>
        <span>›</span>
        <Link to={`/projects/${project.data.id}?tab=client-estimates`}>
          {project.data.projectName}
        </Link>
        <span>›</span>
        <span aria-current="page">
          {id ? "Edit Client Estimate" : "New Client Estimate"}
        </span>
      </nav>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CLIENT ESTIMATES</span>
          <h1>{id ? "Edit Client Estimate" : "Create Client Estimate"}</h1>
          <p className="muted">
            Combine existing Project estimates into a saved customer summary.
          </p>
        </div>
      </div>
      <ClientEstimateForm
        client={client.data}
        project={project.data}
        initial={record.data}
        onSave={async (values) => {
          const saved = await api<ClientEstimate>(
            id
              ? `/client-estimates/${id}`
              : `/projects/${project.data.id}/client-estimates`,
            {
              method: id ? "PUT" : "POST",
              body: JSON.stringify(
                id ? { ...values, version: record.data!.version } : values,
              ),
            },
          );
          cache.setQueryData(["client-estimate", saved.id], saved);
          await cache.invalidateQueries({
            queryKey: ["project-client-estimates", project.data.id],
          });
          navigate(`/client-estimates/${saved.id}`);
        }}
      />
    </>
  );
}

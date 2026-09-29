import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EstimateForm } from "../components/EstimateForm";
import { api } from "../lib/api";
import type { Client, Estimate, EstimateFields, Project } from "../types";

export function EstimateEditor() {
  const { id, projectId } = useParams();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const estimate = useQuery({
    queryKey: ["estimate", id],
    queryFn: () => api<Estimate>(`/estimates/${id}`),
    enabled: !!id,
  });
  const existing = estimate.data;
  const selectedProjectId = id ? existing?.projectId : projectId;
  const project = useQuery({
    queryKey: ["project", selectedProjectId],
    queryFn: () => api<Project>(`/projects/${selectedProjectId}`),
    enabled: !!selectedProjectId,
  });
  const clientId = project.data?.clientId;
  const client = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => api<Client>(`/clients/${clientId}`),
    enabled: !!clientId,
  });
  if (id && estimate.isPending) return <p>Loading estimate…</p>;
  if (id && estimate.isError)
    return <p role="alert">{estimate.error.message}</p>;
  if (existing && existing.status !== "DRAFT")
    return (
      <p>
        Only draft estimates can be edited.{" "}
        <Link to={`/estimates/${id}`}>Back to estimate</Link>
      </p>
    );
  if (id && (!existing?.projectId || !existing?.clientId))
    return (
      <p>
        Unlinked historical estimates remain available to view and export from{" "}
        <Link to="/estimates">Estimates</Link>.
      </p>
    );
  if (!selectedProjectId)
    return (
      <p>
        Open a Project to create an estimate.{" "}
        <Link to="/clients">Browse Clients</Link>
      </p>
    );
  if (project.isError || client.isError)
    return (
      <p role="alert">{project.error?.message ?? client.error?.message}</p>
    );
  if (project.isPending || client.isPending)
    return <p>Loading Project context…</p>;
  if (!project.data || !client.data)
    return <p role="alert">Project context unavailable.</p>;
  if (existing && existing.clientId !== project.data.clientId)
    return (
      <p role="alert">
        Estimate relationship is inconsistent. Contact an administrator.
      </p>
    );
  if (!id && (!client.data.active || project.data.status !== "ACTIVE"))
    return (
      <p>
        This Project cannot receive new estimates while it or its Client is
        inactive.
      </p>
    );
  const initial: EstimateFields | undefined = existing
    ? {
        description: existing.description ?? "",
        estimateDate: existing.estimateDate?.slice(0, 10) ?? "",
        currency: existing.currency,
        markupPercent: existing.markupPercent,
        taxPercent: existing.taxPercent,
        notes: existing.notes,
        items: existing.items.map(({ description, unit, quantity, rate }) => ({
          description,
          unit,
          quantity,
          rate,
        })),
      }
    : undefined;
  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/clients">Clients</Link>
        <span>›</span>
        <Link to={`/clients/${client.data.id}`}>{client.data.name}</Link>
        <span>›</span>
        <Link to={`/projects/${project.data.id}`}>
          {project.data.projectName}
        </Link>
        <span>›</span>
        <span aria-current="page">{id ? "Edit estimate" : "New estimate"}</span>
      </nav>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PLAN WITH PRECISION</span>
          <h1>{id ? "Edit estimate" : "New estimate"}</h1>
          <p className="muted">Define the work. Bring every cost into focus.</p>
        </div>
      </div>
      <EstimateForm
        context={{ client: client.data, project: project.data }}
        initial={initial}
        allowItemImport={!id}
        onSave={async (values, copiedFromEstimateId) => {
          const saved = await api<Estimate>(
            id ? `/estimates/${id}` : `/projects/${project.data.id}/estimates`,
            {
              method: id ? "PUT" : "POST",
              body: JSON.stringify(
                id
                  ? {
                      ...values,
                      clientId: existing!.clientId,
                      projectId: existing!.projectId,
                      version: existing!.version,
                    }
                  : {
                      ...values,
                      ...(copiedFromEstimateId ? { copiedFromEstimateId } : {}),
                    },
              ),
            },
          );
          await cache.invalidateQueries({ queryKey: ["estimates"] });
          await cache.invalidateQueries({
            queryKey: ["project-estimates", project.data.id],
          });
          await cache.invalidateQueries({ queryKey: ["dashboard"] });
          cache.setQueryData(["estimate", saved.id], saved);
          navigate(`/estimates/${saved.id}`);
        }}
      />
    </>
  );
}

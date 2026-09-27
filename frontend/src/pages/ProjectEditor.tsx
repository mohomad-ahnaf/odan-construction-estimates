import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { ProjectForm } from "../components/ProjectForm";
import type { Client, Project, ProjectInput } from "../types";
export function ProjectEditor() {
  const { clientId, id } = useParams();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const project = useQuery({
    queryKey: ["project", id],
    queryFn: () => api<Project>(`/projects/${id}`),
    enabled: !!id,
  });
  const owner = clientId ?? project.data?.clientId;
  const client = useQuery({
    queryKey: ["client", owner],
    queryFn: () => api<Client>(`/clients/${owner}`),
    enabled: !!owner,
  });
  if ((id && project.isPending) || client.isPending)
    return <p>Loading project…</p>;
  if (project.isError || client.isError)
    return (
      <p role="alert">{project.error?.message ?? client.error?.message}</p>
    );
  if (!owner || !client.data) return <p role="alert">Client not found</p>;
  const current = project.data;
  const initial: ProjectInput | undefined = current
    ? {
        projectCode: current.projectCode ?? "",
        projectName: current.projectName,
        siteAddress: current.siteAddress ?? "",
        description: current.description ?? "",
        startDate: current.startDate ?? "",
        completionDate: current.completionDate ?? "",
      }
    : undefined;
  return (
    <>
      <Link className="back-link" to={`/clients/${owner}?tab=projects`}>
        ← {client.data.name}
      </Link>
      <div className="page-heading">
        <h1>{id ? "Edit Project" : "Add Project"}</h1>
      </div>
      <ProjectForm
        clientName={client.data.name}
        initial={initial}
        onSave={async (values) => {
          const result = await api<Project>(
            id ? `/projects/${id}` : `/clients/${owner}/projects`,
            { method: id ? "PUT" : "POST", body: JSON.stringify(values) },
          );
          await cache.invalidateQueries({
            queryKey: ["client-projects", owner],
          });
          await cache.invalidateQueries({ queryKey: ["client", owner] });
          await cache.invalidateQueries({ queryKey: ["dashboard"] });
          navigate(`/projects/${result.id}`);
        }}
      />
    </>
  );
}

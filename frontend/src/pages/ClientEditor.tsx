import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { ClientForm } from "../components/ClientForm";
import type { Client, ClientInput } from "../types";
export function ClientEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["client", id],
    queryFn: () => api<Client>(`/clients/${id}`),
    enabled: !!id,
  });
  if (id && query.isPending) return <p>Loading client…</p>;
  if (id && query.isError) return <p role="alert">{query.error.message}</p>;
  const current = query.data;
  const initial: ClientInput | undefined = current
    ? {
        name: current.name,
        address: current.address ?? "",
        contactPerson: current.contactPerson ?? "",
        telephone: current.telephone ?? "",
        email: current.email ?? "",
        notes: current.notes ?? "",
      }
    : undefined;
  return (
    <>
      <Link className="back-link" to={id ? `/clients/${id}` : "/clients"}>
        ← Clients
      </Link>
      <div className="page-heading">
        <h1>{id ? "Edit Client" : "Add Client"}</h1>
      </div>
      <ClientForm
        initial={initial}
        clientCode={current?.clientCode}
        onSave={async (values) => {
          const result = await api<Client>(id ? `/clients/${id}` : "/clients", {
            method: id ? "PUT" : "POST",
            body: JSON.stringify(values),
          });
          await cache.invalidateQueries({ queryKey: ["clients"] });
          await cache.invalidateQueries({ queryKey: ["dashboard"] });
          cache.setQueryData(["client", result.id], result);
          navigate(`/clients/${result.id}`);
        }}
      />
    </>
  );
}

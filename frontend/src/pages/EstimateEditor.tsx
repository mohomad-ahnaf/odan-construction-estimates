import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { EstimateForm } from "../components/EstimateForm";
import { api } from "../lib/api";
import type { Estimate, EstimateInput } from "../types";
export function EstimateEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["estimate", id],
    queryFn: () => api<Estimate>(`/estimates/${id}`),
    enabled: !!id,
  });
  if (id && query.isPending) return <p>Loading estimate…</p>;
  if (id && query.isError) return <p role="alert">{query.error.message}</p>;
  if (query.data && query.data.status !== "DRAFT")
    return (
      <p>
        Only draft estimates can be edited.{" "}
        <Link to={`/estimates/${id}`}>Back to estimate</Link>
      </p>
    );
  const existing = query.data;
  const initial: EstimateInput | undefined = existing
    ? {
        clientId: existing.clientId ?? "",
        projectId: existing.projectId ?? "",
        estimateDate: existing.estimateDate?.slice(0, 10) ?? "",
        currency: existing.currency,
        taxPercent: existing.taxPercent,
        notes: existing.notes,
        items: existing.items.map(({ description, unit, quantity, rate }) => ({
          description,
          unit,
          quantity,
          rate,
        })),
      }
    : {
        clientId: params.get("clientId") ?? "",
        projectId: params.get("projectId") ?? "",
        estimateDate: new Date().toISOString().slice(0, 10),
        currency: "LKR",
        taxPercent: 0,
        notes: "",
        items: [{ description: "", unit: "m²", quantity: 1, rate: 0 }],
      };
  return (
    <>
      <Link className="back-link" to={id ? `/estimates/${id}` : "/estimates"}>
        ← Back to estimates
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PLAN WITH PRECISION</span>
          <h1>{id ? "Edit estimate" : "New estimate"}</h1>
          <p className="muted">Define the work. Bring every cost into focus.</p>
        </div>
      </div>
      <EstimateForm
        initial={initial}
        onSave={async (values) => {
          const estimate = await api<Estimate>(
            id ? `/estimates/${id}` : "/estimates",
            {
              method: id ? "PUT" : "POST",
              body: JSON.stringify(
                id ? { ...values, version: existing!.version } : values,
              ),
            },
          );
          await client.invalidateQueries({ queryKey: ["estimates"] });
          await client.invalidateQueries({ queryKey: ["dashboard"] });
          client.setQueryData(["estimate", estimate.id], estimate);
          navigate(`/estimates/${estimate.id}`);
        }}
      />
    </>
  );
}

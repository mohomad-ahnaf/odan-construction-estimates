import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api, money } from "../lib/api";
import { useAuth } from "../auth";
import { StatusBadge } from "../components/StatusBadge";
import { estimateDescription } from "../lib/estimateDescription";
import type { Client, Estimate, Project } from "../types";
export function EstimateDetail() {
  const { id } = useParams();
  const { session } = useAuth();
  const client = useQueryClient();
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const query = useQuery({
    queryKey: ["estimate", id],
    queryFn: () => api<Estimate>(`/estimates/${id}`),
  });
  const project = useQuery({
    queryKey: ["project", query.data?.projectId],
    queryFn: () => api<Project>(`/projects/${query.data?.projectId}`),
    enabled: !!query.data?.projectId,
  });
  const owner = useQuery({
    queryKey: ["client", query.data?.clientId],
    queryFn: () => api<Client>(`/clients/${query.data?.clientId}`),
    enabled: !!query.data?.clientId,
  });
  const mutation = useMutation({
    mutationFn: (status: string) =>
      api<Estimate>(`/estimates/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, version: query.data?.version }),
      }),
    onSuccess: async (estimate) => {
      client.setQueryData(["estimate", id], estimate);
      await client.invalidateQueries({ queryKey: ["estimates"] });
      if (estimate.projectId)
        await client.invalidateQueries({
          queryKey: ["project-estimates", estimate.projectId],
        });
    },
  });
  async function download(format: string) {
    setExporting(true);
    setExportError("");
    try {
      const response = await fetch(`/api/estimates/${id}/export/${format}`);
      if (!response.ok) throw new Error((await response.json()).message);
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${query.data?.number}.${format}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  if (query.isPending) return <p>Loading estimate…</p>;
  if (query.isError) return <p role="alert">{query.error.message}</p>;
  const estimate = query.data;
  const linked = !!estimate.projectId && !!estimate.clientId;
  const canEdit = session?.user?.role !== "VIEWER" && linked;
  return (
    <>
      {linked ? (
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link to="/clients">Clients</Link>
          <span>›</span>
          <Link to={`/clients/${estimate.clientId}`}>
            {owner.data?.name ?? estimate.clientName}
          </Link>
          <span>›</span>
          <Link to={`/projects/${estimate.projectId}`}>
            {project.data?.projectName ?? estimate.title}
          </Link>
          <span>›</span>
          <span aria-current="page">Estimate {estimate.number}</span>
        </nav>
      ) : (
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link to="/estimates">Estimates</Link>
          <span>›</span>
          <span aria-current="page">{estimate.number}</span>
        </nav>
      )}
      <div className="page-heading">
        <div>
          <span className="eyebrow">{estimate.number}</span>
          <h1>{estimate.title}</h1>
          <p>{estimateDescription(estimate)}</p>
          <StatusBadge status={estimate.status} />
          {!linked && <p className="muted">Unlinked historical estimate</p>}
        </div>
        <div className="action-group">
          <button disabled={exporting} onClick={() => void download("xlsx")}>
            Excel ↓
          </button>
          <button disabled={exporting} onClick={() => void download("pdf")}>
            PDF ↓
          </button>
          {canEdit && estimate.status === "DRAFT" && (
            <Link className="button primary" to={`/estimates/${id}/edit`}>
              Edit estimate
            </Link>
          )}
        </div>
      </div>
      {exportError && (
        <p className="error" role="alert">
          {exportError}
        </p>
      )}
      <section className="panel detail-sheet">
        <div className="document-header">
          <div className="document-brand">
            ODAN<small>CONSTRUCTION</small>
          </div>
          <div>
            <span className="eyebrow">CONSTRUCTION ESTIMATE</span>
            <p>{estimate.number}</p>
            <p>{estimateDescription(estimate)}</p>
          </div>
        </div>
        <div className="document-meta">
          <div>
            <span className="eyebrow">PREPARED FOR</span>
            <h3>{estimate.clientName}</h3>
            {estimate.clientNumber && (
              <p>Client Number: {estimate.clientNumber}</p>
            )}
            {estimate.projectCodeSnapshot && (
              <p>Project code: {estimate.projectCodeSnapshot}</p>
            )}
            <p>{estimate.clientEmail}</p>
            <p>{estimate.siteAddress}</p>
          </div>
          <div>
            <span className="eyebrow">ESTIMATE DATE</span>
            <p>
              {new Date(
                estimate.estimateDate ?? estimate.createdAt,
              ).toLocaleDateString("en-GB")}
            </p>
            <span className="eyebrow">CURRENCY</span>
            <p>{estimate.currency}</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>DESCRIPTION</th>
                <th>UNIT</th>
                <th className="numeric">QUANTITY</th>
                <th className="numeric">RATE</th>
                <th className="numeric">AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {estimate.items.map((item, index) => (
                <tr key={index}>
                  <td>{item.description}</td>
                  <td>{item.unit}</td>
                  <td className="numeric">{item.quantity}</td>
                  <td className="numeric">
                    {money(item.rate, estimate.currency)}
                  </td>
                  <td className="numeric">
                    {money(estimate.totals.lines[index], estimate.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="totals">
          <div>
            <span>Base Subtotal</span>
            <strong>
              {money(estimate.totals.baseSubtotal, estimate.currency)}
            </strong>
          </div>
          <div>
            <span>Markup ({estimate.markupPercent}%)</span>
            <strong>
              {money(estimate.totals.markupAmount, estimate.currency)}
            </strong>
          </div>
          <div>
            <span>Subtotal After Markup</span>
            <strong>
              {money(estimate.totals.subtotalAfterMarkup, estimate.currency)}
            </strong>
          </div>
          <div>
            <span>Tax ({estimate.taxPercent}%)</span>
            <strong>{money(estimate.totals.tax, estimate.currency)}</strong>
          </div>
          <div className="grand-total">
            <span>Final Total</span>
            <strong>{money(estimate.totals.total, estimate.currency)}</strong>
          </div>
        </div>
        {estimate.notes && (
          <div className="document-notes">
            <span className="eyebrow">NOTES & TERMS</span>
            <p>{estimate.notes}</p>
          </div>
        )}
      </section>
      {canEdit && (
        <div className="status-actions">
          <span className="muted">Manage estimate status</span>
          {estimate.status === "DRAFT" && (
            <button
              className="primary"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("SENT")}
            >
              Mark as sent
            </button>
          )}
          {["SENT", "REJECTED"].includes(estimate.status) && (
            <button
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("DRAFT")}
            >
              Return to draft
            </button>
          )}
          {session?.user?.role === "ADMIN" && estimate.status === "SENT" && (
            <>
              <button
                className="primary"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate("APPROVED")}
              >
                Approve estimate
              </button>
              <button
                disabled={mutation.isPending}
                onClick={() => mutation.mutate("REJECTED")}
              >
                Reject estimate
              </button>
            </>
          )}
        </div>
      )}
      {mutation.isError && (
        <p className="error" role="alert">
          {mutation.error.message}
        </p>
      )}
    </>
  );
}

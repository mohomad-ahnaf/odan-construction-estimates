import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth";
import { StatusBadge } from "../components/StatusBadge";
import { api, money } from "../lib/api";
import type { ClientEstimate } from "../types";

export function ClientEstimateDetail() {
  const { id } = useParams();
  const { session } = useAuth();
  const cache = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const query = useQuery({
    queryKey: ["client-estimate", id],
    queryFn: () => api<ClientEstimate>(`/client-estimates/${id}`),
  });
  const mutation = useMutation({
    mutationFn: (status: ClientEstimate["status"]) =>
      api<ClientEstimate>(`/client-estimates/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, version: query.data?.version }),
      }),
    onSuccess: async (record) => {
      cache.setQueryData(["client-estimate", id], record);
      await cache.invalidateQueries({
        queryKey: ["project-client-estimates", record.projectId],
      });
    },
  });
  async function download(format: "pdf" | "excel") {
    setExporting(true);
    setExportError("");
    try {
      const response = await fetch(
        `/api/client-estimates/${id}/export/${format}`,
      );
      if (!response.ok) throw new Error((await response.json()).message);
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${query.data?.clientEstimateNumber}.${format === "excel" ? "xlsx" : "pdf"}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setExportError((error as Error).message);
    } finally {
      setExporting(false);
    }
  }
  if (query.isPending) return <p>Loading Client Estimate…</p>;
  if (query.isError) return <p role="alert">{query.error.message}</p>;
  const record = query.data;
  const canWrite = session?.user?.role !== "VIEWER";
  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/clients">Clients</Link>
        <span>›</span>
        <Link to={`/clients/${record.clientId}`}>
          {record.clientNameSnapshot}
        </Link>
        <span>›</span>
        <Link to={`/projects/${record.projectId}?tab=client-estimates`}>
          {record.projectNameSnapshot}
        </Link>
        <span>›</span>
        <span aria-current="page">
          Client Estimate {record.clientEstimateNumber}
        </span>
      </nav>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            CLIENT ESTIMATE {record.clientEstimateNumber}
          </span>
          <h1>{record.title}</h1>
          <StatusBadge status={record.status} />
        </div>
        <div className="action-group">
          <Link
            className="button"
            to={`/projects/${record.projectId}?tab=client-estimates`}
          >
            Back to Project
          </Link>
          <button disabled={exporting} onClick={() => void download("excel")}>
            Excel ↓
          </button>
          <button disabled={exporting} onClick={() => void download("pdf")}>
            PDF ↓
          </button>
          {canWrite && record.status === "DRAFT" && (
            <Link
              className="button primary"
              to={`/client-estimates/${id}/edit`}
            >
              Edit Client Estimate
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
            <span className="eyebrow">CLIENT ESTIMATE</span>
            <p>{record.clientEstimateNumber}</p>
          </div>
        </div>
        <div className="document-meta">
          <div>
            <span className="eyebrow">PREPARED FOR</span>
            <h3>{record.clientNameSnapshot}</h3>
            <p>
              Client Number: {record.clientNumberSnapshot ?? "Not available"}
            </p>
            <p>Project: {record.projectNameSnapshot}</p>
            <p>Project code: {record.projectCodeSnapshot ?? "Not available"}</p>
          </div>
          <div>
            <span className="eyebrow">CLIENT ESTIMATE DATE</span>
            <p>
              {new Date(record.clientEstimateDate).toLocaleDateString("en-GB")}
            </p>
            <span className="eyebrow">CURRENCY</span>
            <p>{record.currency}</p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="client-estimate-table">
            <thead>
              <tr>
                <th>ITEM</th>
                <th>ESTIMATE</th>
                <th>DESCRIPTION</th>
                <th className="numeric">QUANTITY</th>
                <th className="numeric">RATE</th>
                <th className="numeric">AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {record.items.map((item, index) => (
                <tr key={item.id}>
                  <td>{index + 1}</td>
                  <td>{item.estimateNumberSnapshot}</td>
                  <td>{item.descriptionSnapshot}</td>
                  <td className="numeric">1</td>
                  <td className="numeric">
                    {money(item.rateSnapshot, record.currency)}
                  </td>
                  <td className="numeric">
                    {money(item.amountSnapshot, record.currency)}
                  </td>
                </tr>
              ))}
              <tr className="client-estimate-total-row">
                <td colSpan={5}>Grand Total</td>
                <td className="numeric">
                  {money(record.grandTotal, record.currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {record.notes && (
          <div className="document-notes">
            <span className="eyebrow">NOTES & TERMS</span>
            <p>{record.notes}</p>
          </div>
        )}
      </section>
      {canWrite && (
        <div className="status-actions">
          <span className="muted">Manage Client Estimate status</span>
          {record.status === "DRAFT" && (
            <button
              className="primary"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("SENT")}
            >
              Mark as sent
            </button>
          )}
          {["SENT", "REJECTED"].includes(record.status) && (
            <button
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("DRAFT")}
            >
              Return to draft
            </button>
          )}
          {session?.user?.role === "ADMIN" && record.status === "SENT" && (
            <>
              <button
                className="primary"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate("APPROVED")}
              >
                Approve Client Estimate
              </button>
              <button
                disabled={mutation.isPending}
                onClick={() => mutation.mutate("REJECTED")}
              >
                Reject Client Estimate
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

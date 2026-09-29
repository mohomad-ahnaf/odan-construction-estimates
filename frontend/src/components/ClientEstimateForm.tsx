import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api, money } from "../lib/api";
import { sumClientEstimateAmounts } from "../lib/clientEstimateTotals";
import { estimateDescription } from "../lib/estimateDescription";
import { StatusBadge } from "./StatusBadge";
import type {
  Client,
  ClientEstimate,
  ClientEstimateInput,
  Estimate,
  Page,
  Project,
} from "../types";

const schema = z.object({
  clientEstimateDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
    .refine(
      (value) =>
        !Number.isNaN(Date.parse(value)) &&
        new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value,
      "Enter a valid date",
    ),
  title: z.string().trim().min(1, "Enter a title or description").max(300),
  notes: z.string().max(4000),
});
type Fields = z.infer<typeof schema>;
type Selected = {
  sourceEstimateId: string;
  number: string;
  description: string;
  currency: string;
  amount: string;
  refreshSnapshot?: boolean;
  savedSnapshot: boolean;
};

export function ClientEstimateForm({
  client,
  project,
  initial,
  onSave,
}: {
  client: Client;
  project: Project;
  initial?: ClientEstimate;
  onSave: (input: ClientEstimateInput) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Selected[]>([]);
  const [actionError, setActionError] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientEstimateDate: new Date().toISOString().slice(0, 10),
      title: "",
      notes: "",
    },
  });
  useEffect(() => {
    if (!initial) return;
    reset({
      clientEstimateDate: initial.clientEstimateDate.slice(0, 10),
      title: initial.title,
      notes: initial.notes ?? "",
    });
    setSelected(
      initial.items.map((item) => ({
        sourceEstimateId: item.sourceEstimateId,
        number: item.estimateNumberSnapshot,
        description: item.descriptionSnapshot,
        currency: item.currencySnapshot,
        amount: item.amountSnapshot,
        savedSnapshot: true,
      })),
    );
  }, [initial, reset]);
  const sources = useQuery({
    queryKey: ["client-estimate-source-options", project.id, search, page],
    queryFn: () =>
      api<Page<Estimate>>(
        `/projects/${project.id}/estimates?search=${encodeURIComponent(search)}&page=${page}`,
      ),
  });
  const currency = selected[0]?.currency ?? "LKR";
  const grandTotal = sumClientEstimateAmounts(
    selected.map((item) => item.amount),
  );
  function selectSource(source: Estimate) {
    setActionError("");
    if (source.projectId !== project.id || source.clientId !== client.id) {
      setActionError("Only estimates from this Project may be selected.");
      return;
    }
    if (selected.length && source.currency !== currency) {
      setActionError("Selected estimates must use the same currency.");
      return;
    }
    setSelected((rows) => [
      ...rows,
      {
        sourceEstimateId: source.id,
        number: source.number,
        description: estimateDescription(source),
        currency: source.currency,
        amount: source.totals.total,
        savedSnapshot: false,
      },
    ]);
  }
  async function refreshSnapshot(id: string) {
    setActionError("");
    try {
      const source = await api<Estimate>(`/estimates/${id}`);
      if (source.projectId !== project.id || source.clientId !== client.id)
        throw new Error(
          "This source estimate no longer belongs to the selected Project.",
        );
      if (
        selected.some(
          (row) =>
            row.sourceEstimateId !== id && row.currency !== source.currency,
        )
      )
        throw new Error("The refreshed estimate uses a different currency.");
      setSelected((rows) =>
        rows.map((row) =>
          row.sourceEstimateId === id
            ? {
                ...row,
                number: source.number,
                description: estimateDescription(source),
                currency: source.currency,
                amount: source.totals.total,
                refreshSnapshot: true,
              }
            : row,
        ),
      );
    } catch (error) {
      setActionError((error as Error).message);
    }
  }
  function move(index: number, direction: -1 | 1) {
    setSelected((rows) => {
      const next = [...rows];
      const other = index + direction;
      if (other < 0 || other >= next.length) return rows;
      [next[index], next[other]] = [next[other], next[index]];
      return next;
    });
  }
  return (
    <form
      className="estimate-form"
      onSubmit={handleSubmit(async (values) => {
        setActionError("");
        if (!selected.length) {
          setActionError("Select at least one estimate from this Project.");
          return;
        }
        try {
          await onSave({
            ...values,
            items: selected.map((row) => ({
              sourceEstimateId: row.sourceEstimateId,
              ...(row.refreshSnapshot ? { refreshSnapshot: true } : {}),
            })),
          });
        } catch (error) {
          setActionError((error as Error).message);
        }
      })}
    >
      <section className="panel form-section">
        <h2>Project context</h2>
        <div className="form-grid">
          <div>
            <span className="eyebrow">CLIENT</span>
            <strong>{client.name}</strong>
            <p>{client.clientCode ?? "Client Number unavailable"}</p>
          </div>
          <div>
            <span className="eyebrow">PROJECT</span>
            <strong>{project.projectName}</strong>
            <p>{project.projectCode ?? "Project code unavailable"}</p>
          </div>
        </div>
      </section>
      <section className="panel form-section">
        <h2>Client Estimate details</h2>
        <div className="form-grid">
          <label>
            Client Estimate Date
            <input type="date" {...register("clientEstimateDate")} />
            {errors.clientEstimateDate && (
              <small role="alert">{errors.clientEstimateDate.message}</small>
            )}
          </label>
          <label>
            Title / Description
            <input maxLength={300} {...register("title")} />
            {errors.title && <small role="alert">{errors.title.message}</small>}
          </label>
        </div>
        <label>
          Notes (optional)
          <textarea rows={4} maxLength={4000} {...register("notes")} />
          {errors.notes && <small role="alert">{errors.notes.message}</small>}
        </label>
      </section>
      <section className="panel form-section">
        <div className="panel-toolbar">
          <div>
            <h2>Select existing estimates</h2>
            <p className="muted">
              Only estimates belonging to this Project are listed. Their Final
              Totals become the row rates.
            </p>
          </div>
        </div>
        <input
          aria-label="Search Project estimates"
          placeholder="Search estimate number or title…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        {sources.isPending ? (
          <p>Loading estimates…</p>
        ) : sources.isError ? (
          <p role="alert">{sources.error.message}</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>SELECT</th>
                  <th>ESTIMATE</th>
                  <th>DATE</th>
                  <th>STATUS</th>
                  <th>FINAL TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {sources.data.data.map((source) => (
                  <tr key={source.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${source.number}`}
                        checked={selected.some(
                          (row) => row.sourceEstimateId === source.id,
                        )}
                        onChange={(event) =>
                          event.target.checked
                            ? selectSource(source)
                            : setSelected((rows) =>
                                rows.filter(
                                  (row) => row.sourceEstimateId !== source.id,
                                ),
                              )
                        }
                      />
                    </td>
                    <td>
                      <strong>{source.number}</strong>
                      <small>{estimateDescription(source)}</small>
                    </td>
                    <td>
                      {source.estimateDate
                        ? new Date(source.estimateDate).toLocaleDateString(
                            "en-GB",
                          )
                        : "—"}
                    </td>
                    <td>
                      <StatusBadge status={source.status} />
                    </td>
                    <td className="amount">
                      {money(source.totals.total, source.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            {sources.data?.total ?? 0} estimates · Page {page}
          </span>
          <div>
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!sources.data || page * 20 >= sources.data.total}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
      <section className="panel form-section">
        <h2>Selected-estimate preview</h2>
        {initial && (
          <p className="muted">
            Saved snapshots stay unchanged unless you choose Refresh snapshot
            for a row.
          </p>
        )}
        {selected.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ITEM</th>
                  <th>ESTIMATE</th>
                  <th>DESCRIPTION</th>
                  <th>QUANTITY</th>
                  <th>RATE</th>
                  <th>AMOUNT</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {selected.map((row, index) => (
                  <tr key={row.sourceEstimateId}>
                    <td>{index + 1}</td>
                    <td>{row.number}</td>
                    <td>{row.description}</td>
                    <td className="numeric">1</td>
                    <td className="numeric">
                      {money(row.amount, row.currency)}
                    </td>
                    <td className="numeric">
                      {money(row.amount, row.currency)}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          disabled={index === selected.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSelected((rows) =>
                              rows.filter(
                                (item) =>
                                  item.sourceEstimateId !==
                                  row.sourceEstimateId,
                              ),
                            )
                          }
                        >
                          Remove
                        </button>
                        {row.savedSnapshot && (
                          <button
                            type="button"
                            onClick={() =>
                              void refreshSnapshot(row.sourceEstimateId)
                            }
                          >
                            Refresh snapshot
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">Select at least one Project estimate.</p>
        )}
        <div className="client-estimate-grand-total">
          <span>Grand Total</span>
          <strong>{money(grandTotal, currency)}</strong>
        </div>
      </section>
      {actionError && (
        <p className="error" role="alert">
          {actionError}
        </p>
      )}
      <div className="form-actions">
        <button className="primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save Client Estimate"}
        </button>
      </div>
    </form>
  );
}

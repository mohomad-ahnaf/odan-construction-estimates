import { useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Client, Estimate, EstimateFields, Item, Page, Project } from "../types";
import { constructionUnits, constructionUnitValues } from "../lib/units";
import { previewEstimateTotals } from "../lib/estimateTotals";
import { api, money } from "../lib/api";
import { estimateDescription } from "../lib/estimateDescription";

const decimalValue = (places: number) => ({
  setValueAs: (raw: unknown) => {
    const value = typeof raw === "number" ? String(raw) : raw;
    return typeof value === "string" &&
      new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(value.trim())
      ? Number(value.trim())
      : Number.NaN;
  },
});
const schema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "Enter an Estimate Description")
    .max(150),
  estimateDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter an estimate date"),
  currency: z.enum(["LKR", "USD", "GBP", "EUR"]),
  markupPercent: z.number().min(0).max(100).multipleOf(0.01),
  taxPercent: z.number().min(0).max(100).multipleOf(0.01),
  notes: z.string().max(4000),
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(500),
        unit: z.string().trim().min(1).max(20),
        quantity: z.number().positive().max(1000000).multipleOf(0.001),
        rate: z.number().min(0).max(10000000).multipleOf(0.01),
      }),
    )
    .min(1)
    .max(100),
});
const defaults: EstimateFields = {
  description: "",
  estimateDate: new Date().toISOString().slice(0, 10),
  currency: "LKR",
  markupPercent: 0,
  taxPercent: 0,
  notes: "",
  items: [{ description: "", unit: "m²", quantity: 1, rate: 0 }],
};
function EstimateItemImport({
  context,
  onImport,
}: {
  context: { client: Client; project: Project };
  onImport: (items: Item[], sourceId: string, currency: Estimate["currency"]) => void;
}) {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const sources = useQuery({
    queryKey: ["project-estimate-copy-options", context.project.id, page],
    queryFn: () =>
      api<Page<Estimate>>(`/projects/${context.project.id}/estimates?page=${page}`),
  });
  const selected = sources.data?.data.find((source) => source.id === selectedId);
  function importItems() {
    setError("");
    if (
      !selected ||
      selected.projectId !== context.project.id ||
      selected.clientId !== context.client.id
    ) {
      setError("Select an estimate from this Project.");
      return;
    }
    const items = selected.items.map(({ description, unit, quantity, rate }) => ({
      description,
      unit,
      quantity,
      rate,
    }));
    if (!schema.shape.items.safeParse(items).success) {
      setError("The selected estimate has no valid items to import.");
      return;
    }
    onImport(items, selected.id, selected.currency);
  }
  return (
    <div className="estimate-copy-picker">
      <p className="muted">Choose an estimate from this Project. Importing replaces the current line items and selects the source currency; you can edit the items before saving.</p>
      {sources.isPending ? (
        <p>Loading previous estimates…</p>
      ) : sources.isError ? (
        <p role="alert">{sources.error.message} <button type="button" onClick={() => void sources.refetch()}>Retry</button></p>
      ) : sources.data.data.length === 0 ? (
        <p>No previous estimates in this Project.</p>
      ) : (
        <div className="estimate-copy-options" role="radiogroup" aria-label="Previous estimates">
          {sources.data.data.map((source) => (
            <label className="estimate-copy-option" key={source.id}>
              <input
                type="radio"
                name="copy-source-estimate"
                value={source.id}
                checked={selectedId === source.id}
                onChange={() => { setSelectedId(source.id); setError(""); }}
              />
              <span>
                <strong>{source.number}</strong>
                <small>{estimateDescription(source)}</small>
                <small>{source.estimateDate ? new Date(source.estimateDate).toLocaleDateString("en-GB") : "No estimate date"} · {source.items.length} items · {source.currency}</small>
              </span>
            </label>
          ))}
        </div>
      )}
      {sources.data && sources.data.total > sources.data.pageSize && (
        <div className="estimate-copy-pagination">
          <span>Page {page}</span>
          <button type="button" disabled={page === 1} onClick={() => { setPage((value) => value - 1); setSelectedId(""); }}>Previous</button>
          <button type="button" disabled={page * sources.data.pageSize >= sources.data.total} onClick={() => { setPage((value) => value + 1); setSelectedId(""); }}>Next</button>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="button accent" disabled={!selected} onClick={importItems}>Import Items</button>
    </div>
  );
}
export function EstimateForm({
  initial,
  context,
  onSave,
  allowItemImport = false,
}: {
  initial?: EstimateFields;
  context: { client: Client; project: Project };
  onSave: (values: EstimateFields, copiedFromEstimateId?: string) => Promise<void>;
  allowItemImport?: boolean;
}) {
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"blank" | "copy">("blank");
  const [copiedFromEstimateId, setCopiedFromEstimateId] = useState<string>();
  const [copiedCurrency, setCopiedCurrency] = useState<EstimateFields["currency"]>();
  const blankItems = useRef<Item[]>(defaults.items);
  const blankCurrency = useRef<EstimateFields["currency"]>(defaults.currency);
  const {
    register,
    control,
    watch,
    getValues,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EstimateFields>({
    resolver: zodResolver(schema),
    defaultValues: initial ?? defaults,
  });
  const { fields, append, remove, replace } = useFieldArray({ control, name: "items" });
  const values = watch();
  const preview = previewEstimateTotals(
    values.items ?? [],
    values.markupPercent,
    values.taxPercent,
  );
  return (
    <form
      className="estimate-form"
      onSubmit={handleSubmit(async (values) => {
        setError("");
        if (allowItemImport && mode === "copy" && !copiedFromEstimateId) {
          setError("Import items from a previous estimate before saving.");
          return;
        }
        if (copiedFromEstimateId && values.currency !== copiedCurrency) {
          setError("Copied unit rates must keep the source currency. Import the items again to restore it.");
          return;
        }
        try {
          await onSave(values, copiedFromEstimateId);
        } catch (e) {
          setError((e as Error).message);
        }
      })}
    >
      <section className="panel form-section">
        <h2>
          01 <span>Project details</span>
        </h2>
        <div className="form-grid">
          <label>
            Estimate Description
            <input type="text" maxLength={150} {...register("description")} />
            {errors.description && (
              <small role="alert">{errors.description.message}</small>
            )}
          </label>
          <p>
            <strong>Client</strong>
            <br />
            {context.client.name}
            {context.client.clientCode
              ? ` · Client Number ${context.client.clientCode}`
              : ""}
          </p>
          <p>
            <strong>Project</strong>
            <br />
            {context.project.projectName}
            {context.project.projectCode
              ? ` · ${context.project.projectCode}`
              : ""}
          </p>
          <label>
            Estimate Date
            <input type="date" {...register("estimateDate")} />
            {errors.estimateDate && (
              <small role="alert">{errors.estimateDate.message}</small>
            )}
          </label>
          <label>
            Currency
            <select {...register("currency")}>
              <option>LKR</option>
              <option>USD</option>
              <option>GBP</option>
              <option>EUR</option>
            </select>
          </label>
          <label>
            Markup (%)
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              {...register("markupPercent", decimalValue(2))}
            />
            {errors.markupPercent && (
              <small role="alert">
                Enter markup from 0 to 100 with up to 2 decimal places
              </small>
            )}
          </label>
          <label>
            Tax (%)
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              {...register("taxPercent", { valueAsNumber: true })}
            />
          </label>
        </div>
      </section>
      {allowItemImport && (
        <section className="panel form-section estimate-start-section">
          <h2>Start estimate</h2>
          <fieldset className="estimate-start-options">
            <legend>Choose how to begin</legend>
            <label>
              <input
                type="radio"
                name="estimate-start-mode"
                checked={mode === "blank"}
                onChange={() => {
                  setMode("blank");
                  setCopiedFromEstimateId(undefined);
                  setCopiedCurrency(undefined);
                  replace(blankItems.current);
                  setValue("currency", blankCurrency.current);
                  setError("");
                }}
              />
              Start blank estimate
            </label>
            <label>
              <input
                type="radio"
                name="estimate-start-mode"
                checked={mode === "copy"}
                onChange={() => {
                  blankItems.current = getValues("items");
                  blankCurrency.current = getValues("currency");
                  setMode("copy");
                  setError("");
                }}
              />
              Copy items from previous estimate
            </label>
          </fieldset>
          {mode === "copy" && (
            <EstimateItemImport
              context={context}
              onImport={(items, sourceId, currency) => {
                replace(items);
                setValue("currency", currency, { shouldValidate: true });
                setCopiedFromEstimateId(sourceId);
                setCopiedCurrency(currency);
                setError("");
              }}
            />
          )}
          {copiedFromEstimateId && mode === "copy" && (
            <p className="estimate-copy-confirmation">Items imported in {copiedCurrency}. Review the new estimate before saving.</p>
          )}
        </section>
      )}
      <section className="panel form-section">
        <h2>
          02 <span>Scope & quantities</span>
        </h2>
        <div className="table-scroll">
          <table className="items-editor">
            <thead>
              <tr>
                <th>DESCRIPTION</th>
                <th>UNIT</th>
                <th>QUANTITY</th>
                <th>UNIT RATE</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={field.id}>
                  <td data-label="Description">
                    <input
                      aria-label={`Description ${index + 1}`}
                      {...register(`items.${index}.description`)}
                    />
                  </td>
                  <td data-label="Unit">
                    <select
                      aria-label={`Unit ${index + 1}`}
                      {...register(`items.${index}.unit`)}
                    >
                      {!constructionUnitValues.has(field.unit) && (
                        <option value={field.unit}>
                          {field.unit} (legacy/custom)
                        </option>
                      )}
                      {constructionUnits.map((unit) => (
                        <option key={unit.value} value={unit.value}>
                          {unit.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Quantity">
                    <input
                      aria-label={`Quantity ${index + 1}`}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      {...register(`items.${index}.quantity`, decimalValue(3))}
                    />
                    {errors.items?.[index]?.quantity && (
                      <small role="alert">
                        Enter a positive quantity with up to 3 decimal places
                      </small>
                    )}
                  </td>
                  <td data-label="Unit Rate">
                    <input
                      aria-label={`Rate ${index + 1}`}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      {...register(`items.${index}.rate`, decimalValue(2))}
                    />
                    {errors.items?.[index]?.rate && (
                      <small role="alert">
                        Enter a non-negative rate with up to 2 decimal places
                      </small>
                    )}
                  </td>
                  <td data-label="Remove">
                    <button
                      className="remove-item-button"
                      type="button"
                      aria-label={`Remove item ${index + 1}`}
                      disabled={fields.length === 1}
                      onClick={() => remove(index)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          disabled={fields.length >= 100}
          onClick={() =>
            append({ description: "", unit: "m²", quantity: 1, rate: 0 })
          }
        >
          ＋ Add line item
        </button>
      </section>
      <section
        className="panel form-section calculation-preview"
        aria-label="Live calculation summary"
      >
        <h2>Calculation preview</h2>
        {preview ? (
          <dl>
            <div>
              <dt>Base Subtotal</dt>
              <dd>{money(preview.baseSubtotal, values.currency)}</dd>
            </div>
            <div>
              <dt>Markup ({values.markupPercent}%)</dt>
              <dd>{money(preview.markupAmount, values.currency)}</dd>
            </div>
            <div>
              <dt>Subtotal After Markup</dt>
              <dd>{money(preview.subtotalAfterMarkup, values.currency)}</dd>
            </div>
            <div>
              <dt>Tax ({values.taxPercent}%)</dt>
              <dd>{money(preview.tax, values.currency)}</dd>
            </div>
            <div className="preview-total">
              <dt>Final Total</dt>
              <dd>{money(preview.total, values.currency)}</dd>
            </div>
          </dl>
        ) : (
          <p className="muted">
            Enter valid quantities, rates, markup and tax to preview totals.
          </p>
        )}
      </section>
      <section className="panel form-section">
        <h2>
          03 <span>Notes & terms</span>
        </h2>
        <label>
          Additional information
          <textarea
            rows={4}
            placeholder="Scope exclusions, payment terms, estimate validity…"
            {...register("notes")}
          />
        </label>
      </section>
      {Object.keys(errors).length > 0 && (
        <div className="error" role="alert">
          Check the project details and line items. Each item needs a
          description, unit, positive quantity (up to 3 decimals), and
          non-negative rate (up to 2 decimals). Estimate Description and date
          are required; tax and markup must be between 0 and 100.
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <span className="muted">Saved as a draft for review.</span>
        <button className="primary" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save estimate →"}
        </button>
      </div>
    </form>
  );
}

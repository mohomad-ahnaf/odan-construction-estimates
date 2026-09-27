import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Client, EstimateFields, Project } from "../types";
const schema = z.object({
  estimateDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter an estimate date"),
  currency: z.enum(["LKR", "USD", "GBP", "EUR"]),
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
  estimateDate: new Date().toISOString().slice(0, 10),
  currency: "LKR",
  taxPercent: 0,
  notes: "",
  items: [{ description: "", unit: "m²", quantity: 1, rate: 0 }],
};
export function EstimateForm({
  initial,
  context,
  onSave,
}: {
  initial?: EstimateFields;
  context: { client: Client; project: Project };
  onSave: (values: EstimateFields) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EstimateFields>({
    resolver: zodResolver(schema),
    defaultValues: initial ?? defaults,
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  return (
    <form
      className="estimate-form"
      onSubmit={handleSubmit(async (values) => {
        setError("");
        try {
          await onSave(values);
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
          <p>
            <strong>Client</strong>
            <br />
            {context.client.name}
            {context.client.registrationNumber
              ? ` · ${context.client.registrationNumber}`
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
                  <td>
                    <input
                      aria-label={`Description ${index + 1}`}
                      {...register(`items.${index}.description`)}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Unit ${index + 1}`}
                      {...register(`items.${index}.unit`)}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Quantity ${index + 1}`}
                      type="number"
                      min="0.001"
                      step="0.001"
                      {...register(`items.${index}.quantity`, {
                        valueAsNumber: true,
                      })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Rate ${index + 1}`}
                      type="number"
                      min="0"
                      step="0.01"
                      {...register(`items.${index}.rate`, {
                        valueAsNumber: true,
                      })}
                    />
                  </td>
                  <td>
                    <button
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
          non-negative rate (up to 2 decimals). Estimate date is required; tax
          must be between 0 and 100.
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

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { EstimateInput } from "../types";
import type { Client, Project, Page } from "../types";
import { api } from "../lib/api";
const schema = z.object({
  clientId: z.string().uuid("Select a client"),
  projectId: z.string().uuid("Select a project"),
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
const defaults: EstimateInput = {
  clientId: "",
  projectId: "",
  estimateDate: new Date().toISOString().slice(0, 10),
  currency: "LKR",
  taxPercent: 0,
  notes: "",
  items: [{ description: "", unit: "m²", quantity: 1, rate: 0 }],
};
export function EstimateForm({
  initial,
  onSave,
}: {
  initial?: EstimateInput;
  onSave: (values: EstimateInput) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const {
    register,
    control,
    watch,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EstimateInput>({
    resolver: zodResolver(schema),
    defaultValues: initial ?? defaults,
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const selectedClient = watch("clientId");
  const selectedProject = watch("projectId");
  const clients = useQuery({
    queryKey: ["client-options", clientSearch],
    queryFn: () =>
      api<Page<Client>>(
        `/clients?active=true&pageSize=100&search=${encodeURIComponent(clientSearch)}`,
      ),
  });
  const projects = useQuery({
    queryKey: ["project-options", selectedClient, projectSearch],
    queryFn: () =>
      api<Page<Project>>(
        `/clients/${selectedClient}/projects?active=true&pageSize=100&search=${encodeURIComponent(projectSearch)}`,
      ),
    enabled: !!selectedClient,
  });
  const clientField = register("clientId");
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
          <input
            aria-label="Find clients"
            placeholder="Search active clients"
            value={clientSearch}
            onChange={(event) => setClientSearch(event.target.value)}
          />
          <label>
            Client
            <select
              {...clientField}
              value={selectedClient}
              onChange={(event) => {
                clientField.onChange(event);
                setValue("projectId", "");
                setProjectSearch("");
              }}
            >
              <option value="">Select client</option>
              {selectedClient &&
                !clients.data?.data.some(
                  (client) => client.id === selectedClient,
                ) && <option value={selectedClient}>Selected client</option>}
              {clients.data?.data.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            {errors.clientId && (
              <small role="alert">{errors.clientId.message}</small>
            )}
          </label>
          <input
            aria-label="Find projects"
            placeholder="Search active projects"
            value={projectSearch}
            onChange={(event) => setProjectSearch(event.target.value)}
            disabled={!selectedClient}
          />
          <label>
            Project
            <select
              {...register("projectId")}
              value={selectedProject}
              disabled={!selectedClient || projects.isPending}
            >
              <option value="">Select project</option>
              {selectedProject &&
                !projects.data?.data.some(
                  (project) => project.id === selectedProject,
                ) && <option value={selectedProject}>Selected project</option>}
              {projects.data?.data.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.projectName}
                </option>
              ))}
            </select>
            {errors.projectId && (
              <small role="alert">{errors.projectId.message}</small>
            )}
          </label>
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
          non-negative rate (up to 2 decimals). Client and project are required;
          tax must be between 0 and 100.
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

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { ProjectInput } from "../types";
const schema = z
  .object({
    projectCode: z.string().max(80),
    projectName: z.string().trim().min(1, "Project name is required").max(160),
    siteAddress: z.string().max(500),
    description: z.string().max(4000),
    startDate: z.string(),
    completionDate: z.string(),
  })
  .refine(
    (v) => !v.startDate || !v.completionDate || v.completionDate >= v.startDate,
    {
      path: ["completionDate"],
      message: "Completion date precedes start date",
    },
  );
const empty: ProjectInput = {
  projectCode: "",
  projectName: "",
  siteAddress: "",
  description: "",
  startDate: "",
  completionDate: "",
};
export function ProjectForm({
  clientName,
  initial,
  onSave,
}: {
  clientName: string;
  initial?: ProjectInput;
  onSave: (data: ProjectInput) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProjectInput>({
    resolver: zodResolver(schema),
    defaultValues: initial ?? empty,
  });
  return (
    <form
      noValidate
      className="panel form-section"
      onSubmit={handleSubmit(async (data) => {
        setError("");
        try {
          await onSave(data);
        } catch (e) {
          setError((e as Error).message);
        }
      })}
    >
      <h2>Project information</h2>
      <p>
        Client: <strong>{clientName}</strong>
      </p>
      <div className="form-grid">
        {(
          [
            ["projectName", "Project name"],
            ["projectCode", "Project code"],
            ["siteAddress", "Site address"],
          ] as const
        ).map(([field, label]) => (
          <label key={field}>
            {label}
            <input {...register(field)} />
            {errors[field] && (
              <small role="alert">{errors[field]?.message}</small>
            )}
          </label>
        ))}
        <label>
          Start date
          <input type="date" {...register("startDate")} />
        </label>
        <label>
          Completion date
          <input type="date" {...register("completionDate")} />
          {errors.completionDate && (
            <small role="alert">{errors.completionDate.message}</small>
          )}
        </label>
      </div>
      <label>
        Description
        <textarea rows={4} {...register("description")} />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="primary" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save project"}
        </button>
      </div>
    </form>
  );
}

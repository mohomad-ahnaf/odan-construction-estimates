import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { ProjectInput } from "../types";
const schema = z.object({
  projectName: z.string().trim().min(1, "Project name is required").max(160),
  siteAddress: z.string().max(500),
  description: z.string().max(4000),
  startDate: z.string(),
});
const empty: ProjectInput = {
  projectName: "",
  siteAddress: "",
  description: "",
  startDate: "",
};
export function ProjectForm({
  clientName,
  clientNumber,
  projectCode,
  initial,
  onSave,
}: {
  clientName: string;
  clientNumber?: string | null;
  projectCode?: string | null;
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
        {clientNumber && (
          <>
            {" "}
            · Client Number: <strong>{clientNumber}</strong>
          </>
        )}
      </p>
      <p className="muted">
        Project code:{" "}
        <strong>
          {projectCode ??
            (initial ? "Legacy project (no code)" : "Generated when saved")}
        </strong>
      </p>
      <div className="form-grid">
        {(
          [
            ["projectName", "Project name"],
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

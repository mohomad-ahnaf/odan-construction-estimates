import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { ClientInput } from "../types";
const schema = z.object({
  name: z.string().trim().min(1, "Client name is required").max(160),
  address: z.string().max(500),
  contactPerson: z.string().max(160),
  telephone: z.string().max(40),
  email: z.union([z.string().email(), z.literal("")]),
  notes: z.string().max(4000),
});
const empty: ClientInput = {
  name: "",
  address: "",
  contactPerson: "",
  telephone: "",
  email: "",
  notes: "",
};
export function ClientForm({
  initial,
  clientCode,
  onSave,
}: {
  initial?: ClientInput;
  clientCode?: string | null;
  onSave: (data: ClientInput) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ClientInput>({
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
      <h2>Client information</h2>
      <p className="muted">
        Client Number:{" "}
        <strong>
          {clientCode ??
            (initial ? "Legacy client (no number)" : "Generated when saved")}
        </strong>
      </p>
      <div className="form-grid">
        {(
          [
            ["name", "Client name"],
            ["address", "Address"],
            ["contactPerson", "Contact person"],
            ["telephone", "Telephone"],
            ["email", "Email"],
          ] as const
        ).map(([field, label]) => (
          <label key={field}>
            {label}
            <input
              type={field === "email" ? "email" : "text"}
              {...register(field)}
            />
            {errors[field] && (
              <small role="alert">{errors[field]?.message}</small>
            )}
          </label>
        ))}
      </div>
      <label>
        Notes
        <textarea rows={4} {...register("notes")} />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="primary" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save client"}
        </button>
      </div>
    </form>
  );
}

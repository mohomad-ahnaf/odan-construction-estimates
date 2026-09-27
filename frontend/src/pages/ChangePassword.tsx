import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "../lib/api";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z
      .string()
      .min(16, "Use at least 16 characters")
      .max(128, "Use at most 128 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ["newPassword"],
    message: "Choose a different password",
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
type FormValues = z.infer<typeof schema>;

export function ChangePassword() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });
  return (
    <section className="account-page">
      <span className="eyebrow">ACCOUNT SECURITY</span>
      <h1>Change password</h1>
      <p className="muted">
        Use a unique password of 16 to 128 characters. Other signed-in sessions
        will end after you save it.
      </p>
      <form
        onSubmit={handleSubmit(async ({ currentPassword, newPassword }) => {
          setError("");
          setMessage("");
          try {
            await api<void>("/auth/change-password", {
              method: "POST",
              body: JSON.stringify({ currentPassword, newPassword }),
            });
            reset({
              currentPassword: "",
              newPassword: "",
              confirmPassword: "",
            });
            setMessage(
              "Password changed. Other sessions have been signed out.",
            );
          } catch (cause) {
            setError((cause as Error).message);
          }
        })}
      >
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            {...register("currentPassword")}
          />
          {errors.currentPassword && (
            <small role="alert">{errors.currentPassword.message}</small>
          )}
        </label>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            {...register("newPassword")}
          />
          {errors.newPassword && (
            <small role="alert">{errors.newPassword.message}</small>
          )}
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <small role="alert">{errors.confirmPassword.message}</small>
          )}
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <button className="primary" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Change password"}
        </button>
      </form>
    </section>
  );
}

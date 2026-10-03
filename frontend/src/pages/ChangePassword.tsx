import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api, ApiError } from "../lib/api";
import { WorkspaceIcon } from "../components/WorkspaceIcon";

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

export function ChangePassword({ embedded = false }: { embedded?: boolean }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [visible, setVisible] = useState({ current: false, next: false, confirm: false });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });
  return (
    <section className={`account-page${embedded ? " account-page-embedded" : ""}`}>
      {!embedded && <span className="eyebrow">ACCOUNT SECURITY</span>}
      {embedded ? <h3>Change password</h3> : <h1>Change password</h1>}
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
            setVisible({ current: false, next: false, confirm: false });
            setMessage(
              "Password changed. Other sessions have been signed out.",
            );
          } catch (cause) {
            setError(cause instanceof ApiError && cause.status === 401 ?
              "The current password could not be verified." :
              cause instanceof ApiError && cause.status === 403 ?
                "Your session could not be verified. Refresh and try again." :
                cause instanceof ApiError && cause.status === 429 ?
                  "Too many attempts. Try again later." :
                  "Could not change password. Please try again.");
          }
        })}
      >
        <div className="password-form-field">
          <label htmlFor="current-password">Current password</label>
          <div className="password-input-wrap">
          <input
            id="current-password"
            type={visible.current ? "text" : "password"}
            autoComplete="current-password"
            aria-invalid={!!errors.currentPassword}
            aria-describedby={errors.currentPassword ? "current-password-error" : undefined}
            {...register("currentPassword")}
          />
          <button type="button" className="password-visibility" aria-label={visible.current ? "Hide current password" : "Show current password"}
            title={visible.current ? "Hide current password" : "Show current password"} aria-pressed={visible.current}
            onClick={() => setVisible((value) => ({ ...value, current: !value.current }))}>
            <WorkspaceIcon name={visible.current ? "eyeOff" : "eye"} /></button></div>
          {errors.currentPassword && (
            <small id="current-password-error" role="alert">{errors.currentPassword.message}</small>
          )}
        </div>
        <div className="password-form-field">
          <label htmlFor="new-password">New password</label>
          <div className="password-input-wrap">
          <input
            id="new-password"
            type={visible.next ? "text" : "password"}
            autoComplete="new-password"
            aria-invalid={!!errors.newPassword}
            aria-describedby={errors.newPassword ? "new-password-error" : undefined}
            {...register("newPassword")}
          />
          <button type="button" className="password-visibility" aria-label={visible.next ? "Hide new password" : "Show new password"}
            title={visible.next ? "Hide new password" : "Show new password"} aria-pressed={visible.next}
            onClick={() => setVisible((value) => ({ ...value, next: !value.next }))}>
            <WorkspaceIcon name={visible.next ? "eyeOff" : "eye"} /></button></div>
          {errors.newPassword && (
            <small id="new-password-error" role="alert">{errors.newPassword.message}</small>
          )}
        </div>
        <div className="password-form-field">
          <label htmlFor="confirm-password">Confirm new password</label>
          <div className="password-input-wrap">
          <input
            id="confirm-password"
            type={visible.confirm ? "text" : "password"}
            autoComplete="new-password"
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={errors.confirmPassword ? "confirm-password-error" : undefined}
            {...register("confirmPassword")}
          />
          <button type="button" className="password-visibility" aria-label={visible.confirm ? "Hide confirm new password" : "Show confirm new password"}
            title={visible.confirm ? "Hide confirm new password" : "Show confirm new password"} aria-pressed={visible.confirm}
            onClick={() => setVisible((value) => ({ ...value, confirm: !value.confirm }))}>
            <WorkspaceIcon name={visible.confirm ? "eyeOff" : "eye"} /></button></div>
          {errors.confirmPassword && (
            <small id="confirm-password-error" role="alert">{errors.confirmPassword.message}</small>
          )}
        </div>
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

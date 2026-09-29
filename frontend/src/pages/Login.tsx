import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "../auth";
const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});
export function Login() {
  const { signIn } = useAuth();
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  return (
    <div className="login-screen">
      <section className="login-story">
        <img
          className="login-logo"
          src="/branding/odan-logo-navy.png"
          alt="Odan Construction"
        />
        <div>
          <span className="eyebrow">FROM FIRST MEASURE TO FINAL FIGURE</span>
          <h1>
            Build with
            <br />
            confidence.
          </h1>
          <p>
            A considered space for precise estimates,
            <br />
            clear approvals, and your next great project.
          </p>
        </div>
        <small>ODAN CONSTRUCTION ESTIMATE MANAGEMENT SYSTEM</small>
      </section>
      <section className="login-form">
        <span className="eyebrow">YOUR WORKSPACE</span>
        <h2>Welcome back</h2>
        <p className="muted">Sign in to manage your construction estimates.</p>
        <form
          onSubmit={handleSubmit(async (input) => {
            setError("");
            try {
              await signIn(input.email, input.password);
            } catch (e) {
              setError((e as Error).message);
            }
          })}
        >
          <label>
            Email address
            <input
              type="email"
              autoComplete="username"
              {...register("email")}
            />
            {errors.email && <small role="alert">{errors.email.message}</small>}
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              {...register("password")}
            />
            {errors.password && (
              <small role="alert">{errors.password.message}</small>
            )}
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in →"}
          </button>
        </form>
        <p className="muted small">
          Access is provided by your workspace administrator.
        </p>
      </section>
    </div>
  );
}

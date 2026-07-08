/** Login / signup screen shown when the user is not authenticated. */

import { useState } from "react";
import { useAuthStore } from "../../state/authStore";

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);
  const signup = useAuthStore((s) => s.signup);
  const clearError = useAuthStore((s) => s.clearError);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") await login(email, password);
    else await signup(email, password);
  };

  const switchMode = () => {
    clearError();
    setMode((m) => (m === "login" ? "signup" : "login"));
  };

  return (
    <div className="flex h-full w-full items-center justify-center bg-neutral-950 p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-xl"
      >
        <h1 className="text-xl font-semibold text-white">Journey</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {mode === "login"
            ? "Log in to your journey."
            : "Create an account to save your journey."}
        </p>

        {error && (
          <div className="mt-4 rounded bg-red-500/15 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <label className="mt-4 block text-xs uppercase tracking-wide text-neutral-500">
          Email
        </label>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-1 w-full rounded bg-neutral-800 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-sky-500"
        />

        <label className="mt-4 block text-xs uppercase tracking-wide text-neutral-500">
          Password
        </label>
        <input
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="mt-1 w-full rounded bg-neutral-800 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-sky-500"
        />
        {mode === "signup" && (
          <p className="mt-1 text-xs text-neutral-500">
            At least 8 characters.
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded bg-sky-600 px-3 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
        >
          {busy
            ? "Please wait…"
            : mode === "login"
              ? "Log in"
              : "Create account"}
        </button>

        <button
          type="button"
          onClick={switchMode}
          className="mt-3 w-full text-center text-xs text-neutral-400 hover:text-white"
        >
          {mode === "login"
            ? "No account? Sign up"
            : "Already have an account? Log in"}
        </button>
      </form>
    </div>
  );
}

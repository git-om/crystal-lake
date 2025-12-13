"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error || "Login failed");
      return;
    }

    router.push("/sales");
    router.refresh();
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md">
        <div className="rounded-3xl bg-zinc-900/40 backdrop-blur-2xl border border-zinc-700/50 p-8 shadow-2xl">
          <div className="mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-6 shadow-lg shadow-blue-500/20">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
            <p className="text-zinc-400 mt-2">Sign in to access your sales dashboard</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-2 block">Username</label>
              <input
                className="w-full rounded-2xl bg-zinc-800/50 backdrop-blur-xl border border-zinc-700/50 px-4 py-3.5 outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-zinc-500"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-300 mb-2 block">Password</label>
              <input
                type="password"
                className="w-full rounded-2xl bg-zinc-800/50 backdrop-blur-xl border border-zinc-700/50 px-4 py-3.5 outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-zinc-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Enter your password"
              />
            </div>

            {err && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                {err}
              </div>
            )}

            <button
              className="w-full rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3.5 font-medium hover:from-blue-600 hover:to-blue-700 shadow-lg shadow-blue-500/20 transition-all hover:shadow-blue-500/30 hover:shadow-xl"
              type="submit"
            >
              Sign in
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
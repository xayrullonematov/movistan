"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

export default function GatePage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/gate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError("Wrong password");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b0d0c] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-5">
            <Lock size={24} className="text-emerald-300" />
          </div>
          <h1 className="text-xl font-semibold text-gray-100">AI Engineering Room</h1>
          <p className="text-sm text-gray-400 mt-1">Private demo — enter the access code</p>
          <p className="text-xs text-gray-600 mt-3">Qwen Cloud Global AI Hackathon · Track 3</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Access code"
            autoFocus
            className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-600"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-gray-950 font-semibold rounded-lg transition-colors"
          >
            {loading ? "Verifying..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

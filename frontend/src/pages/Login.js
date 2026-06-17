import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/api";
import BackgroundTexture from "@/components/BackgroundTexture";
import { ArrowRight } from "lucide-react";

const DEMO = (() => {
  try {
    return JSON.parse(process.env.REACT_APP_DEMO_LOGINS || "[]");
  } catch {
    return [];
  }
})();

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(DEMO[0]?.email || "");
  const [password, setPassword] = useState(DEMO[0]?.password || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden bg-white">
      <BackgroundTexture />

      <div className="relative z-10 w-full max-w-md">
        {/* Brand lockup */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-8 h-8 rounded-md bg-zinc-950 flex items-center justify-center">
            <span className="text-white font-heading font-bold text-base leading-none">e</span>
          </div>
          <div className="leading-tight">
            <div className="font-heading font-semibold tracking-tight text-sm text-zinc-950">Upsell CRM</div>
            <div className="label-mono text-[10px] text-zinc-400">Emergent Labs</div>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white border border-zinc-200 rounded-lg shadow-sm p-8">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-zinc-950">
            Sign in to your workspace
          </h1>
          <p className="text-sm text-zinc-500 mt-1.5 leading-relaxed">
            Booked meetings, account context, pipeline and payment links — one place for the team.
          </p>

          <form onSubmit={submit} className="space-y-4 mt-7">
            <div>
              <label className="block text-[11px] font-mono font-medium uppercase tracking-wider text-zinc-500 mb-1.5">Email</label>
              <input
                data-testid="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-zinc-200 rounded-md px-3.5 py-2.5 text-sm focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 outline-none bg-white transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono font-medium uppercase tracking-wider text-zinc-500 mb-1.5">Password</label>
              <input
                data-testid="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-zinc-200 rounded-md px-3.5 py-2.5 text-sm focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 outline-none bg-white transition-colors"
                required
              />
            </div>

            {error && (
              <div
                data-testid="login-error"
                className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3.5 py-2.5"
              >
                {error}
              </div>
            )}

            <button
              data-testid="login-submit"
              type="submit"
              disabled={loading}
              className="w-full bg-zinc-950 text-white hover:bg-zinc-800 rounded-md px-4 py-3 text-sm font-medium transition-colors active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
        </div>

        {/* Demo credentials — click to fill. Populated from REACT_APP_DEMO_LOGINS; absent => hidden (e.g. production). */}
        {DEMO.length > 0 && (
        <div className="mt-5 rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-4">
          <div className="label-mono text-[10px] text-zinc-400 mb-2.5">Demo credentials</div>
          <div className="space-y-1.5">
            {DEMO.map((d) => (
              <button
                key={d.email}
                type="button"
                data-testid={`demo-fill-${d.role.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={() => {
                  setEmail(d.email);
                  setPassword(d.password);
                }}
                className="w-full flex items-center justify-between gap-3 font-mono text-xs text-zinc-600 hover:text-zinc-950 hover:bg-white rounded-md px-2 py-1.5 transition-colors text-left"
              >
                <span><span className="text-zinc-400">{d.role}:</span> {d.email}</span>
                <span className="text-zinc-400">use →</span>
              </button>
            ))}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

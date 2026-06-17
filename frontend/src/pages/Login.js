import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/api";
import BackgroundTexture from "@/components/BackgroundTexture";
import { ArrowRight } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("diyea@emergent.sh");
  const [password, setPassword] = useState("leader123");
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
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">
      <BackgroundTexture />

      <div className="relative z-10 w-full max-w-sm">
        {/* Brand */}
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-9 h-9 rounded-2xl bg-gradient-brand flex items-center justify-center shadow-sm">
            <span className="text-white font-heading font-bold text-lg leading-none">e</span>
          </div>
          <span className="font-heading font-semibold tracking-tight text-slate-900">Upsell CRM</span>
        </div>

        <h1 className="font-heading text-4xl font-semibold tracking-tight text-slate-900 leading-[1.1] mb-2">
          Close more upsells,
          <br />
          <span className="text-gradient">from one workspace.</span>
        </h1>
        <p className="text-sm text-slate-500 mb-8 leading-relaxed">
          Booked meetings, account context, pipeline and payment links — built for the inside sales team.
        </p>

        <form onSubmit={submit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
            <input
              data-testid="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400 outline-none bg-white transition-all"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Password</label>
            <input
              data-testid="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400 outline-none bg-white transition-all"
              required
            />
          </div>

          {error && (
            <div
              data-testid="login-error"
              className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5"
            >
              {error}
            </div>
          )}

          <button
            data-testid="login-submit"
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 text-white hover:bg-slate-800 rounded-full px-4 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white/70 backdrop-blur p-4 text-xs text-slate-500 space-y-1">
          <div className="font-semibold text-slate-700 mb-2">Demo accounts</div>
          <div>Sales Head: diyea@emergent.sh / leader123</div>
          <div>Agent: aryan.f@emergent.sh / agent123</div>
        </div>
      </div>
    </div>
  );
}

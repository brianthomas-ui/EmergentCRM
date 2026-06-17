import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/api";
import { Zap, ArrowRight } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("leader@emergent.com");
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
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex w-1/2 bg-slate-900 text-white flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-sm flex items-center justify-center">
            <Zap className="w-5 h-5 text-slate-900" strokeWidth={2.5} />
          </div>
          <div className="font-heading font-extrabold tracking-tight text-lg">UPSELL CRM</div>
        </div>
        <div>
          <h1 className="font-heading text-5xl font-black tracking-tighter leading-[1.05] mb-6">
            Turn power users
            <br />
            into <span className="text-blue-400">high-value</span>
            <br />
            accounts.
          </h1>
          <p className="text-slate-400 text-base max-w-md leading-relaxed">
            One control room for booked meetings, pipeline, account context, and payment links —
            built for the inside sales team.
          </p>
        </div>
        <div className="text-xs uppercase tracking-widest text-slate-500 font-semibold">
          Emergent Labs · Inside Sales
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-9 h-9 bg-slate-900 rounded-sm flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-heading font-extrabold tracking-tight">UPSELL CRM</span>
          </div>

          <h2 className="font-heading text-2xl font-bold tracking-tight text-slate-900 mb-1">
            Sign in
          </h2>
          <p className="text-sm text-slate-500 mb-8">Access your sales workspace.</p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-widest mb-1.5">
                Email
              </label>
              <input
                data-testid="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-slate-300 rounded-sm px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-widest mb-1.5">
                Password
              </label>
              <input
                data-testid="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-slate-300 rounded-sm px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                required
              />
            </div>

            {error && (
              <div
                data-testid="login-error"
                className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-3 py-2"
              >
                {error}
              </div>
            )}

            <button
              data-testid="login-submit"
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 text-white hover:bg-slate-800 rounded-sm px-4 py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="mt-8 border border-slate-200 rounded-sm bg-white p-4 text-xs text-slate-500 space-y-1">
            <div className="font-semibold text-slate-700 uppercase tracking-widest text-[10px] mb-2">
              Demo accounts
            </div>
            <div>Leader: leader@emergent.com / leader123</div>
            <div>Agent: sofia@emergent.com / agent123</div>
          </div>
        </div>
      </div>
    </div>
  );
}

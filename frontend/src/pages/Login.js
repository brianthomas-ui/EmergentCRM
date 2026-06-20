import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/api";
import { ArrowRight, Play, DollarSign, Target, CalendarCheck, Trophy } from "lucide-react";

// ---- Static "product console peek" shown on the left panel (no API, hard-coded) ----
const PEEK_KPIS = [
  { label: "Revenue Closed", value: "$612k", icon: DollarSign },
  { label: "Win Rate", value: "87%", icon: Target },
  { label: "Meetings", value: "142", icon: CalendarCheck },
];
const PEEK_BOARD = [
  { name: "Diyea", value: "$118k", pct: 100 },
  { name: "Aryan", value: "$109k", pct: 92 },
  { name: "Dipan", value: "$94k", pct: 79 },
  { name: "Vinay", value: "$88k", pct: 74 },
  { name: "Brian", value: "$47k", pct: 40 },
];
const PEEK_CHART = [38, 52, 47, 63, 58, 71, 66, 82, 78, 91, 86, 100];

function ConsolePeek() {
  return (
    <div className="hidden lg:flex lg:w-[56%] relative overflow-hidden p-12 flex-col justify-between
                    bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950/50 text-zinc-100">
      {/* subtle grid texture */}
      <div className="absolute inset-0 opacity-[0.06]"
           style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "32px 32px" }} />
      <div className="relative">
        {/* brand */}
        <div className="flex items-center gap-3 mb-10">
          <img src="/emergent-logo.jpeg" alt="Emergent" className="w-10 h-10 rounded-xl object-cover ring-1 ring-white/15" />
          <div className="leading-tight">
            <div className="font-heading font-semibold tracking-tight text-base text-white">Emergent CRM</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-400/90">Inside-Sales Console</div>
          </div>
        </div>

        <h2 className="font-heading text-3xl font-bold tracking-tight leading-tight max-w-md">
          Close more. <span className="text-emerald-400">Type less.</span>
        </h2>
        <p className="text-sm text-zinc-400 mt-3 max-w-sm leading-relaxed">
          Booked meetings, account context, pipeline and payment links — one console the whole team runs the day from.
        </p>

        {/* KPI tiles */}
        <div className="grid grid-cols-3 gap-3 mt-9 max-w-lg">
          {PEEK_KPIS.map((k) => (
            <div key={k.label} className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur px-4 py-3">
              <k.icon className="w-3.5 h-3.5 text-emerald-400/80" />
              <div className="text-xl font-semibold tracking-tight mt-2 tabular-nums">{k.value}</div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>

        {/* leaderboard */}
        <div className="mt-7 max-w-lg rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-zinc-400 mb-3">
            <Trophy className="w-3 h-3 text-amber-400" /> Rep Leaderboard · This Month
          </div>
          <div className="space-y-2.5">
            {PEEK_BOARD.map((a, i) => (
              <div key={a.name} className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-zinc-500 w-3">{i + 1}</span>
                <span className="text-xs text-zinc-300 w-14 shrink-0">{a.name}</span>
                <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${a.pct}%` }} />
                </div>
                <span className="text-[11px] font-mono text-emerald-300 w-12 text-right">{a.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* mini revenue chart */}
      <div className="relative mt-8 max-w-lg">
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Revenue · last 12 weeks</div>
        <div className="flex items-end gap-1.5 h-20">
          {PEEK_CHART.map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-emerald-600/40 to-emerald-400/90"
                 style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  const { login, demoLogin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

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

  const enterDemo = async () => {
    setError("");
    setDemoLoading(true);
    try {
      await demoLogin();
      navigate("/");
    } catch (err) {
      setError(apiError(err));
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[var(--bg)]">
      <ConsolePeek />

      {/* Right: login */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm">
          {/* compact brand for narrow screens */}
          <div className="flex lg:hidden items-center gap-2.5 mb-8">
            <img src="/emergent-logo.jpeg" alt="Emergent" className="w-9 h-9 rounded-lg object-cover ring-1 ring-zinc-200" />
            <div className="font-heading font-semibold tracking-tight text-sm text-zinc-950">Emergent CRM</div>
          </div>

          <h1 className="font-heading text-2xl font-semibold tracking-tight text-zinc-950">Welcome back</h1>
          <p className="text-sm text-zinc-500 mt-1.5">Sign in to your workspace, or take the guided demo.</p>

          <form onSubmit={submit} className="space-y-4 mt-7">
            <div>
              <label className="block text-[11px] font-mono font-medium uppercase tracking-wider text-zinc-500 mb-1.5">Email</label>
              <input
                data-testid="login-email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@emergent.sh"
                className="w-full border border-zinc-200 rounded-md px-3.5 py-2.5 text-sm focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 outline-none bg-white transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono font-medium uppercase tracking-wider text-zinc-500 mb-1.5">Password</label>
              <input
                data-testid="login-password" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-zinc-200 rounded-md px-3.5 py-2.5 text-sm focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 outline-none bg-white transition-colors"
                required
              />
            </div>

            {error && (
              <div data-testid="login-error" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3.5 py-2.5">
                {error}
              </div>
            )}

            <button
              data-testid="login-submit" type="submit" disabled={loading || demoLoading}
              className="w-full bg-zinc-950 text-white hover:bg-zinc-800 rounded-md px-4 py-3 text-sm font-medium transition-colors active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          {/* divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-zinc-200" />
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">or</span>
            <div className="h-px flex-1 bg-zinc-200" />
          </div>

          <button
            data-testid="demo-view-btn" type="button" onClick={enterDemo} disabled={loading || demoLoading}
            className="w-full bg-emerald-600 text-white hover:bg-emerald-700 rounded-md px-4 py-3 text-sm font-semibold transition-colors active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-60 shadow-sm"
          >
            <Play className="w-4 h-4" />
            {demoLoading ? "Loading demo…" : "Demo View"}
          </button>
          <p className="text-[11px] text-zinc-400 text-center mt-2.5">
            Explore the full manager console with sample data — no sign-up.
          </p>
        </div>
      </div>
    </div>
  );
}

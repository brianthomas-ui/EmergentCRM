import { useEffect, useState } from "react";
import client, { apiError } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  KeyRound, Save, RefreshCw, Upload, DollarSign, ShieldCheck, FileSpreadsheet, CheckCircle2,
} from "lucide-react";

const ORG_FIELDS = [
  { key: "stripe_secret_key", label: "Stripe Secret Key", placeholder: "sk_live_…", secret: true },
  { key: "stripe_publishable_key", label: "Stripe Publishable Key", placeholder: "pk_live_…", secret: false },
  { key: "razorpay_key_id", label: "Razorpay Key ID", placeholder: "rzp_live_…", secret: false },
  { key: "razorpay_key_secret", label: "Razorpay Key Secret", placeholder: "••••••••", secret: true },
  { key: "calendly_token", label: "Calendly API Token", placeholder: "eyJ…", secret: true },
  { key: "circleback_api_key", label: "Circleback API Key", placeholder: "cb_…", secret: true },
  { key: "sendgrid_api_key", label: "SendGrid API Key", placeholder: "SG.…", secret: true },
];
const MY_FIELDS = [
  { key: "calendly_link", label: "Your Calendly Link", placeholder: "https://calendly.com/you/30min", secret: false },
  { key: "calendly_token", label: "Your Calendly Token", placeholder: "personal access token", secret: true },
];

const Card = ({ icon: Icon, title, desc, children, testid }) => (
  <div data-testid={testid} className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
    <div className="flex items-center gap-2.5 mb-1">
      <Icon className="w-4 h-4 text-[var(--accent-text)]" />
      <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
    </div>
    {desc && <p className="text-sm text-[var(--text-muted)] mb-4">{desc}</p>}
    {children}
  </div>
);

function KeyFields({ fields, values, current, onChange }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {fields.map((f) => {
        const meta = current?.[f.key];
        return (
          <div key={f.key}>
            <label className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              <span>{f.label}</span>
              {meta?.configured && (
                <span className="inline-flex items-center gap-1 text-emerald-500 normal-case tracking-normal">
                  <CheckCircle2 className="w-3 h-3" /> set
                </span>
              )}
            </label>
            <input
              data-testid={`setting-${f.key}`}
              type={f.secret ? "password" : "text"}
              value={values[f.key] ?? ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              placeholder={meta?.configured ? (meta.masked || "•••• configured") : f.placeholder}
              className="w-full text-sm rounded-md border border-[var(--border)] bg-[var(--surface-3)] text-[var(--text)] px-3 py-2 outline-none focus:border-emerald-500/40 transition-colors font-mono"
            />
          </div>
        );
      })}
    </div>
  );
}

function HistoricalImport() {
  const [type, setType] = useState("leads");
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [updateExisting, setUpdateExisting] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result || ""));
    reader.readAsText(file);
  };

  const run = async (commit) => {
    if (!csvText.trim()) return toast.error("Choose a CSV file first");
    setBusy(true);
    try {
      const { data } = await client.post("/import/historical", { type, csv_text: csvText, commit, update_existing: updateExisting });
      setResult(data);
      if (commit) toast.success(`Imported ${data.created} ${type}${data.updated ? `, updated ${data.updated}` : ""}`);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card testid="settings-import" icon={FileSpreadsheet} title="Import historical data"
      desc="Backfill from your old tools. Upload a CSV, preview the cleaned result, then import. Leads de-duplicate by email; payments and meetings link to leads by email.">
      <div className="flex flex-wrap items-center gap-3">
        <select data-testid="import-type" value={type} onChange={(e) => { setType(e.target.value); setResult(null); }}
          className="text-sm rounded-md border border-[var(--border)] bg-[var(--surface-3)] text-[var(--text)] px-3 py-2 outline-none">
          <option value="leads">Leads</option>
          <option value="payments">Payments / deals</option>
          <option value="meetings">Meetings</option>
        </select>
        <label className="inline-flex items-center gap-2 text-sm rounded-md border border-[var(--border)] bg-[var(--surface-3)] text-[var(--text)] px-3 py-2 cursor-pointer hover:border-emerald-500/40 transition-colors">
          <Upload className="w-4 h-4" /> {fileName || "Choose CSV…"}
          <input data-testid="import-file" type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
        </label>
        {type === "leads" && (
          <label className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <input type="checkbox" data-testid="import-update-existing" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
            Update existing (match by email)
          </label>
        )}
      </div>

      <div className="flex items-center gap-2 mt-4">
        <button data-testid="import-preview-btn" onClick={() => run(false)} disabled={busy || !csvText}
          className="inline-flex items-center gap-1.5 text-sm rounded-md border border-[var(--border)] text-[var(--text)] px-3.5 py-2 hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50">
          Preview
        </button>
        <button data-testid="import-commit-btn" onClick={() => run(true)} disabled={busy || !result}
          className="inline-flex items-center gap-1.5 text-sm rounded-md bg-emerald-500 text-emerald-950 px-3.5 py-2 font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-50">
          <Upload className="w-4 h-4" /> Import
        </button>
      </div>

      {result && (
        <div data-testid="import-result" className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[var(--text-muted)]">
            <span>Rows: <b className="text-[var(--text)]">{result.total_rows}</b></span>
            <span>{result.committed ? "Created" : "Will create"}: <b className="text-emerald-500">{result.created}</b></span>
            {result.updated > 0 && <span>Updated: <b className="text-[var(--text)]">{result.updated}</b></span>}
            <span>Skipped: <b className="text-amber-500">{result.skipped}</b></span>
            <span>{result.committed ? "✅ Imported" : "Preview only — click Import to commit"}</span>
          </div>
          {result.preview?.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <tbody>
                  {result.preview.map((p, i) => (
                    <tr key={i} className="border-t border-[var(--border)]">
                      {Object.entries(p).map(([k, v]) => (
                        <td key={k} className="py-1.5 pr-4 text-[var(--text-muted)] whitespace-nowrap">{String(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.errors?.length > 0 && (
            <div className="mt-2 text-xs text-rose-400">
              {result.errors.slice(0, 5).map((e, i) => <div key={i}>Row {e.row}: {e.message}</div>)}
              {result.errors.length > 5 && <div>…and {result.errors.length - 5} more</div>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function Settings() {
  const { isAdmin } = useAuth();
  const [org, setOrg] = useState(null);
  const [orgVals, setOrgVals] = useState({});
  const [mine, setMine] = useState(null);
  const [myVals, setMyVals] = useState({});
  const [fx, setFx] = useState("");
  const [saving, setSaving] = useState("");

  useEffect(() => {
    client.get("/settings/my-integrations").then((r) => setMine(r.data.fields)).catch(() => {});
    if (isAdmin) {
      client.get("/settings/integrations").then((r) => setOrg(r.data.fields)).catch(() => {});
      client.get("/settings").then((r) => setFx(String(r.data.inr_per_usd ?? ""))).catch(() => {});
    }
  }, [isAdmin]);

  const saveOrg = async () => {
    setSaving("org");
    try {
      const { data } = await client.put("/settings/integrations", orgVals);
      setOrg(data.fields); setOrgVals({}); toast.success("Org API keys saved");
    } catch (e) { toast.error(apiError(e)); } finally { setSaving(""); }
  };
  const saveMine = async () => {
    setSaving("mine");
    try {
      const { data } = await client.put("/settings/my-integrations", myVals);
      setMine(data.fields); setMyVals({}); toast.success("Your keys saved");
    } catch (e) { toast.error(apiError(e)); } finally { setSaving(""); }
  };
  const saveFx = async () => {
    setSaving("fx");
    try {
      await client.put("/settings", { inr_per_usd: parseFloat(fx) });
      toast.success("FX rate updated");
    } catch (e) { toast.error(apiError(e)); } finally { setSaving(""); }
  };
  const resetDemo = async () => {
    if (!window.confirm("Wipe and reseed the demo dataset? This replaces all leads, deals and meetings.")) return;
    setSaving("reset");
    try {
      const { data } = await client.post("/demo/reset");
      toast.success(`Demo reset · ${data.leads} leads, ${data.payments} payments, ${data.meetings} meetings`);
    } catch (e) { toast.error(apiError(e)); } finally { setSaving(""); }
  };

  const SaveBtn = ({ onClick, busy, testid, children }) => (
    <button data-testid={testid} onClick={onClick} disabled={!!saving}
      className="inline-flex items-center gap-1.5 text-sm rounded-md bg-emerald-500 text-emerald-950 px-3.5 py-2 font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-50">
      <Save className="w-4 h-4" /> {busy ? "Saving…" : children}
    </button>
  );

  return (
    <div className="space-y-6 max-w-4xl" data-testid="settings-page">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-[var(--text)]">Settings</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">Integrations, API keys and workspace configuration.</p>
      </div>

      {isAdmin && org && (
        <Card testid="settings-org-keys" icon={ShieldCheck} title="Organization API keys"
          desc="Stored encrypted and shown masked. Leave a field blank to keep the current value.">
          <KeyFields fields={ORG_FIELDS} values={orgVals} current={org} onChange={(k, v) => setOrgVals((s) => ({ ...s, [k]: v }))} />
          <div className="mt-4"><SaveBtn onClick={saveOrg} busy={saving === "org"} testid="save-org-keys">Save org keys</SaveBtn></div>
        </Card>
      )}

      {mine && (
        <Card testid="settings-my-keys" icon={KeyRound} title="My integrations"
          desc="Personal keys used for your own bookings and follow-ups.">
          <KeyFields fields={MY_FIELDS} values={myVals} current={mine} onChange={(k, v) => setMyVals((s) => ({ ...s, [k]: v }))} />
          <div className="mt-4"><SaveBtn onClick={saveMine} busy={saving === "mine"} testid="save-my-keys">Save my keys</SaveBtn></div>
        </Card>
      )}

      {isAdmin && <HistoricalImport />}

      {isAdmin && (
        <Card testid="settings-fx" icon={DollarSign} title="Currency & data"
          desc="USD is the reporting default. Set the INR conversion rate and manage demo data.">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1.5">INR per 1 USD</label>
              <input data-testid="setting-fx" type="number" value={fx} onChange={(e) => setFx(e.target.value)}
                className="w-40 text-sm rounded-md border border-[var(--border)] bg-[var(--surface-3)] text-[var(--text)] px-3 py-2 outline-none focus:border-emerald-500/40" />
            </div>
            <SaveBtn onClick={saveFx} busy={saving === "fx"} testid="save-fx">Save rate</SaveBtn>
            <button data-testid="reset-demo-btn" onClick={resetDemo} disabled={!!saving}
              className="inline-flex items-center gap-1.5 text-sm rounded-md border border-amber-500/40 text-amber-500 px-3.5 py-2 hover:bg-amber-500/10 transition-colors disabled:opacity-50">
              <RefreshCw className="w-4 h-4" /> Reset demo data
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}

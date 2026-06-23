import { useEffect, useState } from "react";
import client, { apiError } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  KeyRound, Save, RefreshCw, Upload, DollarSign, ShieldCheck, FileSpreadsheet,
  CheckCircle2, Circle, Download, CreditCard, Wallet, CalendarClock, FileText,
  Mail, Video, Database, Zap, MessageSquare,
} from "lucide-react";

// Each group maps to the backend ORG_INTEGRATION_FIELDS + the /settings/integrations/test/{name}
// probe. `primary` is the field that flips a feature from simulated -> live.
const ORG_GROUPS = [
  {
    id: "stripe", title: "Stripe — card payments", test: "stripe", primary: "stripe_secret_key", icon: CreditCard,
    powers: "Live card checkout links + payment status webhooks.",
    help: "Get keys at dashboard.stripe.com → Developers → API keys & Webhooks.",
    fields: [
      { key: "stripe_secret_key", label: "Secret Key", placeholder: "sk_live_… / sk_test_…", secret: true },
      { key: "stripe_publishable_key", label: "Publishable Key", placeholder: "pk_live_…" },
      { key: "stripe_webhook_secret", label: "Webhook Signing Secret", placeholder: "whsec_…", secret: true },
    ],
  },
  {
    id: "razorpay", title: "Razorpay — UPI / INR payments", test: "razorpay", primary: "razorpay_key_id", icon: Wallet,
    powers: "Razorpay payment links + webhooks for INR collections.",
    help: "Get keys at dashboard.razorpay.com → Settings → API Keys & Webhooks.",
    fields: [
      { key: "razorpay_key_id", label: "Key ID", placeholder: "rzp_live_…" },
      { key: "razorpay_key_secret", label: "Key Secret", placeholder: "••••••••", secret: true },
      { key: "razorpay_webhook_secret", label: "Webhook Secret", placeholder: "••••••••", secret: true },
    ],
  },
  {
    id: "calendly", title: "Calendly — meeting bookings", test: "calendly", primary: "calendly_token", icon: CalendarClock,
    powers: "Auto-creates leads + routes meetings from Calendly bookings.",
    help: "Calendly → Integrations → API & Webhooks (personal token + webhook signing key).",
    fields: [
      { key: "calendly_token", label: "API Token", placeholder: "eyJ…", secret: true },
      { key: "calendly_webhook_signing_key", label: "Webhook Signing Key", placeholder: "••••••••", secret: true },
    ],
  },
  {
    id: "circleback", title: "Circleback — meeting notes", test: "circleback", primary: "circleback_api_key", icon: FileText,
    powers: "Pulls AI meeting summaries onto each meeting record.",
    help: "Circleback → Settings → API. URL is optional (defaults to the public API).",
    fields: [
      { key: "circleback_api_key", label: "API Key", placeholder: "cb_…", secret: true },
      { key: "circleback_api_url", label: "API URL (optional)", placeholder: "https://api.circleback.ai/v1/meetings" },
    ],
  },
  {
    id: "sendgrid", title: "SendGrid — campaign email", test: "sendgrid", primary: "sendgrid_api_key", icon: Mail,
    powers: "Sends campaign mail-merges + follow-up emails.",
    help: "SendGrid → Settings → API Keys. Use a verified From address.",
    fields: [
      { key: "sendgrid_api_key", label: "API Key", placeholder: "SG.…", secret: true },
      { key: "from_email", label: "From Email", placeholder: "sales@yourco.com" },
    ],
  },
  {
    id: "google", title: "Google Meet / Calendar", test: "google", primary: "google_service_account_json", icon: Video,
    powers: "Generates Google Meet links + calendar invites for booked meetings.",
    help: "Google Cloud → IAM → Service Accounts → create a JSON key (Calendar API enabled).",
    fields: [
      { key: "google_service_account_json", label: "Service Account JSON", placeholder: '{ "type": "service_account", … }', secret: true, textarea: true },
      { key: "google_organiser_fallback_email", label: "Organiser Fallback Email", placeholder: "calendar@yourco.com" },
    ],
  },
  {
    id: "emergent_users", title: "Emergent Users API — enrichment", test: "emergent_users", primary: "emergent_users_api_url", icon: Database,
    powers: "Enriches leads with product usage & spend from Emergent.",
    help: "Internal Emergent users API base URL + access key.",
    fields: [
      { key: "emergent_users_api_url", label: "API URL", placeholder: "https://…" },
      { key: "emergent_users_api_key", label: "API Key", placeholder: "••••••••", secret: true },
    ],
  },
  {
    id: "slack", title: "Slack — payment alerts", test: "slack", primary: "slack_webhook_url", icon: MessageSquare,
    powers: "Posts an alert to your Slack channel when a REAL payment is received. Demo payments are never sent.",
    help: "Slack → Apps → 'Incoming Webhooks' → Add to a channel → copy the Webhook URL. Click Test to post a sample.",
    fields: [
      { key: "slack_webhook_url", label: "Incoming Webhook URL", placeholder: "https://hooks.slack.com/services/T…/B…/…", secret: true },
    ],
  },
];

const MY_FIELDS = [
  { key: "calendly_link", label: "Your Calendly Link", placeholder: "https://calendly.com/you/30min", secret: false },
  { key: "calendly_token", label: "Your Calendly Token", placeholder: "personal access token", secret: true },
];

const Card = ({ icon: Icon, title, desc, children, testid, action }) => (
  <div data-testid={testid} className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
    <div className="flex items-start justify-between gap-3 mb-1">
      <div className="flex items-center gap-2.5">
        <Icon className="w-4 h-4 text-[var(--accent-text)]" />
        <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
      </div>
      {action}
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
        const common = {
          "data-testid": `setting-${f.key}`,
          value: values[f.key] ?? "",
          onChange: (e) => onChange(f.key, e.target.value),
          placeholder: meta?.configured ? (meta.masked || "•••• configured") : f.placeholder,
          className:
            "w-full text-sm rounded-md border border-[var(--border)] bg-[var(--surface-3)] text-[var(--text)] px-3 py-2 outline-none focus:border-emerald-500/40 transition-colors font-mono",
        };
        return (
          <div key={f.key} className={f.textarea ? "md:col-span-2" : ""}>
            <label className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              <span>{f.label}</span>
              {meta?.configured && (
                <span className="inline-flex items-center gap-1 text-emerald-500 normal-case tracking-normal">
                  <CheckCircle2 className="w-3 h-3" /> set
                </span>
              )}
            </label>
            {f.textarea ? (
              <textarea rows={4} {...common} />
            ) : (
              <input type={f.secret ? "password" : "text"} {...common} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Expected columns per import type - mirrors the backend _IMPORT_TEMPLATES headers
// so users see the format before downloading the template.
const TEMPLATE_COLUMNS = {
  leads: "name, email, company, phone, plan, monthly_spend, lifetime_value, region, status, owner, product_line, source, created_at",
  payments: "customer_email, amount, currency, status, provider, product_line, description, created_at",
  meetings: "email, scheduled_at, status, duration, driver, notes",
};

function HistoricalImport() {
  const [type, setType] = useState("leads");
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [updateExisting, setUpdateExisting] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const downloadTemplate = async () => {
    try {
      const res = await client.get(`/import/template/${type}`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `emergentcrm_${type}_template.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

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
        <button
          type="button"
          data-tour="import-template"
          data-testid="download-template-btn"
          onClick={downloadTemplate}
          className="inline-flex items-center gap-1.5 text-sm rounded-md border border-emerald-500/40 text-emerald-400 px-3 py-2 hover:bg-emerald-500/10 transition-colors ml-auto"
        >
          <Download className="w-4 h-4" /> Download {type} template
        </button>
      </div>

      <p className="mt-2 text-[11px] text-[var(--text-faint)]">
        Expected columns: <span className="font-mono text-[var(--text-muted)]">{TEMPLATE_COLUMNS[type]}</span>.
        Extra columns are ignored; only the rows you fill in are imported.
      </p>

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
            <span>{result.committed ? "✅ Imported" : "Preview only - click Import to commit"}</span>
          </div>
          {result.preview?.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <tbody>
                  {result.preview.map((p) => (
                    <tr key={Object.values(p).join("|")} className="border-t border-[var(--border)]">
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
              {result.errors.slice(0, 5).map((e) => <div key={`${e.row}-${e.message}`}>Row {e.row}: {e.message}</div>)}
              {result.errors.length > 5 && <div>…and {result.errors.length - 5} more</div>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function GoLiveChecklist({ org }) {
  return (
    <Card testid="settings-checklist" icon={Zap} title="Go-live checklist"
      desc="Everything this CRM can connect to. Add a key below to switch a feature from simulated to live.">
      <div className="space-y-1">
        {ORG_GROUPS.map((g) => {
          const done = !!org?.[g.primary]?.configured;
          const Icon = g.icon;
          return (
            <div key={g.id} data-testid={`checklist-${g.id}`}
              className="flex items-center gap-3 py-2 border-b border-[var(--border)] last:border-0">
              {done
                ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                : <Circle className="w-4 h-4 text-[var(--text-faint)] shrink-0" />}
              <Icon className="w-4 h-4 text-[var(--text-faint)] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[var(--text)]">{g.title}</div>
                <div className="text-xs text-[var(--text-muted)]">{g.powers}</div>
              </div>
              <span className={`text-[11px] font-mono uppercase tracking-wider shrink-0 ${done ? "text-emerald-500" : "text-amber-500"}`}
                data-testid={`checklist-status-${g.id}`}>
                {done ? "Configured" : "Not set"}
              </span>
            </div>
          );
        })}
      </div>
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
  const [testing, setTesting] = useState("");

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
  const testInt = async (name) => {
    setTesting(name);
    try {
      const { data } = await client.post(`/settings/integrations/test/${name}`);
      if (data.ok) toast.success(data.detail || "Reachable");
      else toast.error(data.detail || "Not configured");
    } catch (e) { toast.error(apiError(e)); } finally { setTesting(""); }
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

      {isAdmin && org && <GoLiveChecklist org={org} />}

      {isAdmin && org && ORG_GROUPS.map((g) => (
        <Card
          key={g.id}
          testid={`settings-${g.id}`}
          icon={g.icon}
          title={g.title}
          desc={g.powers}
          action={
            <button
              type="button"
              data-testid={`test-${g.id}`}
              onClick={() => testInt(g.test)}
              disabled={!!testing}
              className="inline-flex items-center gap-1.5 text-xs rounded-md border border-[var(--border)] text-[var(--text-muted)] px-2.5 py-1.5 hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors disabled:opacity-50"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> {testing === g.test ? "Testing…" : "Test"}
            </button>
          }
        >
          <p className="-mt-2 mb-3 text-[11px] text-[var(--text-faint)]">{g.help}</p>
          <KeyFields fields={g.fields} values={orgVals} current={org} onChange={(k, v) => setOrgVals((s) => ({ ...s, [k]: v }))} />
        </Card>
      ))}

      {isAdmin && org && (
        <div className="flex items-center gap-3">
          <SaveBtn onClick={saveOrg} busy={saving === "org"} testid="save-org-keys">Save all org keys</SaveBtn>
          <span className="text-xs text-[var(--text-faint)]">Stored encrypted &amp; shown masked. Blank fields keep their current value.</span>
        </div>
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

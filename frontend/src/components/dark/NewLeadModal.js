import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { X, Search, Loader2 } from "lucide-react";
import client, { apiError } from "@/api";
import { REGIONS, PRODUCT_LINES } from "@/components/helpers";
import { darkInput, Select, btnEmerald, btnGhost } from "@/components/dark/Primitives";

const empty = {
  name: "",
  email: "",
  company: "",
  phone: "",
  region: "Other",
  product_line: "",
  package_id: "",
};

export default function NewLeadModal({ open, onClose, meta, onCreated }) {
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [refSearch, setRefSearch] = useState("");
  const [referrer, setReferrer] = useState(null);

  const products = meta?.product_lines || PRODUCT_LINES;
  const packages = meta?.packages || {};

  useEffect(() => {
    if (open) {
      setForm(empty);
      setReferrer(null);
      setRefSearch("");
      client.get("/customers").then((r) => setCustomers(r.data || [])).catch(() => {});
    }
  }, [open]);

  const pkgOptions = useMemo(() => {
    if (!form.product_line) return [];
    return (meta?.product_catalog || {})[form.product_line]?.items || [];
  }, [form.product_line, meta]);

  const refMatches = useMemo(() => {
    const q = refSearch.trim().toLowerCase();
    if (!q) return [];
    return customers
      .filter((c) => `${c.name} ${c.company} ${c.email}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [refSearch, customers]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name || !form.email) {
      toast.error("Name and email are required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: form.name,
        email: form.email,
        company: form.company,
        phone: form.phone,
        region: form.region,
        product_line: form.product_line || "",
        package_id: form.package_id || null,
        referred_by_lead_id: referrer?.id || null,
        referred_by_name: referrer?.name || "",
      };
      await client.post("/leads", payload);
      toast.success(`${form.name} added`);
      onCreated?.();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div
        data-testid="new-lead-modal"
        className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-lg mt-12 animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h3 className="font-heading text-base font-semibold text-[var(--text)] tracking-tight">New Lead</h3>
          <button onClick={onClose} className="text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] rounded-md p-1 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3.5">
          <LeadFields form={form} set={set} products={products} meta={meta} packages={packages} pkgOptions={pkgOptions} />
          <ReferralPicker
            referrer={referrer}
            setReferrer={setReferrer}
            refSearch={refSearch}
            setRefSearch={setRefSearch}
            refMatches={refMatches}
          />
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--border)]">
          <button className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnEmerald} onClick={submit} disabled={busy} data-testid="create-lead-submit">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Create Lead
          </button>
        </div>
      </div>
    </div>
  );
}

function LeadFields({ form, set, products, meta, packages, pkgOptions }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <input className={darkInput} value={form.name} onChange={(e) => set("name", e.target.value)} data-testid="lead-name" />
        </Field>
        <Field label="Email">
          <input className={darkInput} value={form.email} onChange={(e) => set("email", e.target.value)} data-testid="lead-email" />
        </Field>
        <Field label="Company">
          <input className={darkInput} value={form.company} onChange={(e) => set("company", e.target.value)} />
        </Field>
        <Field label="Phone">
          <input className={darkInput} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Region">
          <Select value={form.region} onChange={(e) => set("region", e.target.value)}>
            {(meta?.regions || REGIONS).map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Field label="Product Line">
          <Select value={form.product_line} onChange={(e) => { set("product_line", e.target.value); set("package_id", ""); }}>
            <option value="">—</option>
            {products.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </Field>
      </div>

      {pkgOptions.length > 0 && (
        <Field label="Package">
          <Select value={form.package_id} onChange={(e) => set("package_id", e.target.value)}>
            <option value="">—</option>
            {pkgOptions.map((id) => (
              <option key={id} value={id}>{packages[id]?.name || id}</option>
            ))}
          </Select>
        </Field>
      )}
    </>
  );
}

function ReferralPicker({ referrer, setReferrer, refSearch, setRefSearch, refMatches }) {
  return (
    <Field label="Referred by (optional)">
      {referrer ? (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
          <div className="text-sm text-[var(--text)]">
            {referrer.name} <span className="text-[var(--text-faint)]">· {referrer.company}</span>
          </div>
          <button onClick={() => setReferrer(null)} className="text-[var(--text-faint)] hover:text-rose-400">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
          <input
            className={`${darkInput} pl-9`}
            value={refSearch}
            onChange={(e) => setRefSearch(e.target.value)}
            placeholder="Search existing customers…"
            data-testid="referral-search"
          />
          {refMatches.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] shadow-xl overflow-hidden">
              {refMatches.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setReferrer(c); setRefSearch(""); }}
                  className="w-full text-left px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-3)] transition-colors"
                >
                  {c.name} <span className="text-[var(--text-faint)] text-xs">· {c.company}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Field>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[10px] font-mono font-medium uppercase tracking-wider text-[var(--text-faint)] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

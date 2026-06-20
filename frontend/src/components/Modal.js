import { X } from "lucide-react";

export default function Modal({ open, onClose, title, children, testid, wide }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-950/40 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        data-testid={testid}
        className={`bg-white border border-zinc-200 rounded-lg shadow-xl w-full ${
          wide ? "max-w-2xl" : "max-w-md"
        } mt-12 animate-fade-up`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <h3 className="font-heading text-base font-semibold text-zinc-950 tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            data-testid="modal-close"
            className="text-zinc-400 hover:text-zinc-950 hover:bg-zinc-100 rounded-md p-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div className="mb-3.5">
      <label className="block text-[11px] font-mono font-medium uppercase tracking-wider text-zinc-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export const inputCls =
  "w-full border border-zinc-200 rounded-md px-3.5 py-2.5 text-sm focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 outline-none bg-white transition-colors";

export const btnPrimary =
  "bg-zinc-950 text-white hover:bg-zinc-800 rounded-md px-5 py-2.5 text-sm font-medium transition-colors active:scale-[0.98] disabled:opacity-60";
export const btnSecondary =
  "bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-950 rounded-md px-5 py-2.5 text-sm font-medium transition-colors active:scale-[0.98]";

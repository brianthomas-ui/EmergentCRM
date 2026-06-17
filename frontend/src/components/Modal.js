import { X } from "lucide-react";

export default function Modal({ open, onClose, title, children, testid, wide }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/30 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        data-testid={testid}
        className={`bg-white border border-slate-200 rounded-2xl shadow-2xl w-full ${
          wide ? "max-w-2xl" : "max-w-md"
        } mt-12 animate-fade-up`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-heading text-base font-semibold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            data-testid="modal-close"
            className="text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg p-1 transition-colors"
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
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export const inputCls =
  "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400 outline-none bg-white transition-all";

export const btnPrimary =
  "bg-slate-900 text-white hover:bg-slate-800 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60";
export const btnSecondary =
  "bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors";

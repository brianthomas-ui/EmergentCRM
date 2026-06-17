import { X } from "lucide-react";

export default function Modal({ open, onClose, title, children, testid, wide }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        data-testid={testid}
        className={`bg-white border border-slate-200 rounded-sm shadow-xl w-full ${
          wide ? "max-w-2xl" : "max-w-md"
        } mt-12 animate-fade-up`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-heading text-base font-bold tracking-tight text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            data-testid="modal-close"
            className="text-slate-400 hover:text-slate-900 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-widest mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

export const inputCls =
  "w-full border border-slate-300 rounded-sm px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white";

export const btnPrimary =
  "bg-slate-900 text-white hover:bg-slate-800 rounded-sm px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60";
export const btnSecondary =
  "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-sm px-4 py-2 text-sm font-semibold transition-colors";

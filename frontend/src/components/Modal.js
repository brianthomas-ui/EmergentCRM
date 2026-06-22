import { X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-is-mobile";

export default function Modal({ open, onClose, title, children, testid, wide }) {
  const isMobile = useIsMobile();
  if (!open) return null;
  // Mobile: a bottom sheet pinned to the bottom edge (rounded top, drag handle,
  // slides up, safe-area padded). Desktop: the original centered card. Same DOM.
  return (
    <div
      className="fixed inset-0 z-50 flex justify-center items-end p-0 lg:items-start lg:p-4 bg-zinc-950/40 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        data-testid={testid}
        className={`bg-white border border-zinc-200 shadow-xl w-full ${
          wide ? "lg:max-w-2xl" : "lg:max-w-md"
        } rounded-t-2xl max-h-[90vh] overflow-y-auto pb-safe lg:rounded-lg lg:mt-12 lg:max-h-none lg:overflow-visible lg:pb-0 ${
          isMobile ? "animate-sheet-up" : "animate-fade-up"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* mobile drag handle */}
        <div className="lg:hidden flex justify-center pt-2.5 pb-1">
          <span className="h-1.5 w-10 rounded-full bg-zinc-300" />
        </div>
        <div className="flex items-center justify-between px-5 lg:px-6 py-3.5 lg:py-4 border-b border-zinc-100 sticky top-0 bg-white z-10">
          <h3 className="font-heading text-base font-semibold text-zinc-950 tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            data-testid="modal-close"
            className="tap-target text-zinc-400 hover:text-zinc-950 hover:bg-zinc-100 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 lg:p-6">{children}</div>
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

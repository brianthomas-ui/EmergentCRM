import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bookmark, Plus, Trash2, Check, ChevronDown } from "lucide-react";
import client, { apiError } from "@/api";
import { btnGhost } from "@/components/dark/Primitives";

// Save / apply / delete named filter presets for the Leads page (per-user),
// backed by GET/POST/DELETE /api/views.
export default function SavedViews({ currentFilters, onApply }) {
  const [views, setViews] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const boxRef = useRef(null);

  useEffect(() => {
    client
      .get("/views")
      .then((r) => setViews(r.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const save = async () => {
    const name = window.prompt("Name this view");
    if (!name || !name.trim()) return;
    try {
      const { data } = await client.post("/views", { name: name.trim(), filters: currentFilters });
      setViews((v) => [...v, data]);
      setActiveId(data.id);
      toast.success(`Saved "${data.name}"`);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const apply = (v) => {
    setActiveId(v.id);
    onApply(v.filters || {});
    setOpen(false);
  };

  const remove = async (e, v) => {
    e.stopPropagation();
    try {
      await client.delete(`/views/${v.id}`);
      setViews((list) => list.filter((x) => x.id !== v.id));
      if (activeId === v.id) setActiveId(null);
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  return (
    <div ref={boxRef} className="relative" data-testid="saved-views">
      <button onClick={() => setOpen((o) => !o)} className={btnGhost} data-testid="saved-views-btn">
        <Bookmark className="w-4 h-4" /> Views
        {views.length > 0 && <span className="text-[var(--text-faint)]">({views.length})</span>}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-2xl z-50 py-1"
          data-testid="saved-views-menu"
        >
          <button
            type="button"
            onClick={save}
            data-testid="save-view-btn"
            className="w-full text-left px-4 py-2 flex items-center gap-2 text-sm text-emerald-400 hover:bg-[var(--surface-2)] transition-colors"
          >
            <Plus className="w-4 h-4" /> Save current filters
          </button>
          <div className="my-1 border-t border-[var(--border)]" />
          {views.length === 0 ? (
            <div className="px-4 py-3 text-xs text-[var(--text-faint)]">No saved views yet.</div>
          ) : (
            views.map((v) => (
              <div
                key={v.id}
                onClick={() => apply(v)}
                data-testid={`saved-view-${v.id}`}
                className="group w-full px-4 py-2 flex items-center gap-2 text-sm text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
              >
                <span className="w-4 shrink-0 text-emerald-400">
                  {activeId === v.id && <Check className="w-4 h-4" />}
                </span>
                <span className="flex-1 min-w-0 truncate">{v.name}</span>
                <button
                  type="button"
                  onClick={(e) => remove(e, v)}
                  data-testid={`delete-view-${v.id}`}
                  className="text-[var(--text-faint)] hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Delete view"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

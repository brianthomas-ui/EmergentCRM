import { useMemo } from "react";

const CHARS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789+-=*.<>/{}[]()#$%&";

export default function BackgroundTexture() {
  const rows = useMemo(() => {
    const r = [];
    for (let i = 0; i < 46; i++) {
      let line = "";
      for (let j = 0; j < 150; j++) {
        line += Math.random() > 0.45 ? CHARS[Math.floor(Math.random() * CHARS.length)] : "  ";
      }
      r.push(line);
    }
    return r;
  }, []);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none select-none overflow-hidden" aria-hidden="true">
      <div className="font-mono text-[12px] leading-[20px] whitespace-pre tracking-[0.35em] p-3 text-zinc-900/[0.028]">
        {rows.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
}

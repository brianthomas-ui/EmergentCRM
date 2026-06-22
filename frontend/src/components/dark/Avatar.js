// Avatar - shows the user's avatar_url image if present, else INITIALS on a
// dark circle. Sizes: sm / md / lg.
//
// AvatarUpload - click-to-pick an image file, read it as a base64 data URL,
// and hand it to onUpload(dataUrl). Includes a Remove option that calls
// onUpload(null).
import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";

const SIZES = {
  sm: { box: "w-7 h-7", text: "text-[10px]" },
  md: { box: "w-9 h-9", text: "text-xs" },
  lg: { box: "w-14 h-14", text: "text-base" },
};

// Derive up-to-2-letter initials from a name (falls back to email local-part).
export function initialsFromName(name) {
  const src = (name || "").trim();
  if (!src) return "?";
  const base = src.includes("@") ? src.split("@")[0].replace(/[._-]+/g, " ") : src;
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({ src, name, size = "md", className = "" }) {
  const [errored, setErrored] = useState(false);
  const s = SIZES[size] || SIZES.md;
  const showImg = src && !errored;

  if (showImg) {
    return (
      <img
        src={src}
        alt={name || "Avatar"}
        onError={() => setErrored(true)}
        className={`${s.box} rounded-lg object-cover border border-[var(--border)] bg-[var(--surface-3)] ${className}`}
        data-testid="avatar-image"
      />
    );
  }

  return (
    <div
      title={name || ""}
      className={`${s.box} ${s.text} rounded-lg flex items-center justify-center font-semibold text-emerald-300 bg-[var(--surface-3)] border border-[var(--border)] select-none ${className}`}
      data-testid="avatar-initials"
    >
      {initialsFromName(name)}
    </div>
  );
}

// Read a File into a base64 data URL.
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// AvatarUpload - wraps an Avatar with a click-to-pick control + Remove.
// onUpload(dataUrl) is called with the base64 string, or null on Remove.
export function AvatarUpload({
  src,
  name,
  size = "lg",
  onUpload,
  disabled = false,
  className = "",
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const pick = () => {
    if (disabled || busy) return;
    inputRef.current?.click();
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      await onUpload?.(dataUrl);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (e) => {
    e.stopPropagation();
    if (disabled || busy) return;
    setBusy(true);
    try {
      await onUpload?.(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`inline-flex items-center gap-3 ${className}`} data-testid="avatar-upload">
      <button
        type="button"
        onClick={pick}
        disabled={disabled || busy}
        title="Change picture"
        data-testid="avatar-upload-pick"
        className="relative group rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60 disabled:opacity-60"
      >
        <Avatar src={src} name={name} size={size} />
        <span className="absolute inset-0 rounded-lg flex items-center justify-center bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity">
          <Camera className="w-4 h-4 text-white" strokeWidth={2} />
        </span>
      </button>

      {src && (
        <button
          type="button"
          onClick={remove}
          disabled={disabled || busy}
          data-testid="avatar-upload-remove"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-faint)] hover:text-rose-400 transition-colors disabled:opacity-60"
        >
          <Trash2 className="w-3 h-3" />
          Remove
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onFile}
        className="hidden"
        data-testid="avatar-upload-input"
      />
    </div>
  );
}

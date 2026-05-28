import { invoke } from "@tauri-apps/api/core";
import { useNavigate, useLocation } from "react-router-dom";

export default function TitleBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between h-10 px-4 bg-zinc-950/80 border-b border-white/5 shrink-0"
    >
      <div className="flex items-center gap-3">
        {!isHome && (
          <button
            onClick={() => navigate("/")}
            className="text-zinc-500 hover:text-white transition-colors text-sm mr-1"
          >
            ←
          </button>
        )}
        <img src="/assets/logo.png" alt="Recto" className="w-5 h-5 object-contain" />
        <span className="text-sm font-semibold tracking-wide text-white/80">Recto</span>
      </div>

      <div className="flex items-center gap-1">
        <WinBtn
          label="─"
          onClick={() => invoke("minimize_window")}
          className="hover:bg-white/10"
        />
        <WinBtn
          label="□"
          onClick={() => invoke("maximize_window")}
          className="hover:bg-white/10"
        />
        <WinBtn
          label="✕"
          onClick={() => invoke("close_window")}
          className="hover:bg-red-600"
        />
      </div>
    </div>
  );
}

function WinBtn({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-8 h-7 flex items-center justify-center text-xs text-zinc-400 hover:text-white transition-colors rounded ${className}`}
    >
      {label}
    </button>
  );
}

import { useTheme } from "../context/ThemeContext";

export default function ThemeToggle({ style }: { style?: React.CSSProperties }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Thème clair" : "Thème sombre"}
      style={{
        width: 30, height: 30, borderRadius: 8,
        border: "1px solid var(--border-2)", background: "transparent",
        cursor: "pointer", color: "var(--tx-3)", fontSize: 13,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 180ms ease, color 180ms ease",
        ...style,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)"; e.currentTarget.style.color = "var(--tx)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--tx-3)"; }}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}

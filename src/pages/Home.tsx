import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center h-full gap-12 p-8 animate-fade-in">
      <div className="flex flex-col items-center gap-3">
        <img src="/assets/logo.png" alt="Recto" className="w-16 h-16 object-contain" />
        <h1 className="text-4xl font-bold tracking-tight">Recto</h1>
        <p className="text-zinc-500 text-sm">Partage d&apos;écran P2P — sans serveur</p>
      </div>

      <div className="flex gap-6">
        <ModeCard
          title="Recto"
          subtitle="Partager mon écran"
          description="Tu es l'hôte. Les autres se connectent à toi."
          icon="🖥"
          accent="brand"
          onClick={() => navigate("/recto")}
        />
        <ModeCard
          title="Verso"
          subtitle="Se connecter"
          description="Entre le code de l'hôte pour voir son écran."
          icon="📺"
          accent="emerald"
          onClick={() => navigate("/verso")}
        />
      </div>

      <p className="text-xs text-zinc-700">
        Connexion directe chiffrée via WebRTC · Signaling via Supabase
      </p>
    </div>
  );
}

function ModeCard({
  title,
  subtitle,
  description,
  icon,
  accent,
  onClick,
}: {
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  accent: "brand" | "emerald";
  onClick: () => void;
}) {
  const accentClasses = {
    brand: {
      border: "hover:border-brand-500/50 hover:shadow-brand-500/10",
      badge: "bg-brand-500/20 text-brand-300",
      btn: "bg-brand-600 hover:bg-brand-500",
    },
    emerald: {
      border: "hover:border-emerald-500/50 hover:shadow-emerald-500/10",
      badge: "bg-emerald-500/20 text-emerald-300",
      btn: "bg-emerald-600 hover:bg-emerald-500",
    },
  }[accent];

  return (
    <button
      onClick={onClick}
      className={`
        group flex flex-col gap-5 p-7 w-64 text-left
        glass rounded-2xl border border-white/8
        hover:shadow-xl transition-all duration-300
        ${accentClasses.border}
      `}
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-widest ${accentClasses.badge}`}
        >
          {title}
        </span>
        <span className="text-2xl">{icon}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-semibold">{subtitle}</h2>
        <p className="text-sm text-zinc-500 leading-relaxed">{description}</p>
      </div>

      <div
        className={`mt-auto px-4 py-2.5 rounded-lg text-sm font-medium text-white text-center transition-colors ${accentClasses.btn}`}
      >
        Continuer →
      </div>
    </button>
  );
}

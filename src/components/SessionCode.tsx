import { useState } from "react";

interface SessionCodeProps {
  code: string;
}

export default function SessionCode({ code }: SessionCodeProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-zinc-400 text-sm uppercase tracking-widest">Code de session</p>
      <div
        onClick={copy}
        className="flex gap-2 cursor-pointer group"
        title="Cliquer pour copier"
      >
        {code.split("").map((char, i) => (
          <span
            key={i}
            className="code-char w-12 h-14 flex items-center justify-center text-2xl font-bold
                       bg-white/5 border border-white/10 rounded-lg group-hover:border-brand-400/50
                       group-hover:bg-white/8 transition-all"
          >
            {char}
          </span>
        ))}
      </div>
      <p className="text-xs text-zinc-600 h-4 transition-opacity">
        {copied ? "✓ Copié !" : "Cliquer pour copier"}
      </p>
    </div>
  );
}

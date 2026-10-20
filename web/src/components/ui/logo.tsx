import Image from "next/image";

type Props = {
  variant?: "horizontal" | "vertical" | "icon";
  size?: number; // altura do mascote em px
  className?: string;
};

// Logo MindFocus: mascote + "Mind" (azul) "Focus" (verde) em Nunito 800.
// horizontal: cabeçalhos; vertical: espaços estreitos; icon: avatar/favicon.
export function Logo({ variant = "horizontal", size = 40, className = "" }: Props) {
  const mascot = (
    <Image
      src="/brand/mascote.png"
      alt={variant === "icon" ? "MindFocus" : ""}
      width={size}
      height={size}
      style={{ width: size, height: "auto" }}
      priority
    />
  );
  if (variant === "icon") return <span className={className}>{mascot}</span>;

  const word = (
    <span className="font-heading font-extrabold tracking-tight" style={{ fontSize: size * 0.62 }}>
      <span className="text-brand-blue">Mind</span>
      <span className="text-brand-green">Focus</span>
    </span>
  );

  return (
    <span
      className={`inline-flex items-center ${variant === "vertical" ? "flex-col gap-1" : "gap-3"} ${className}`}
      aria-label="MindFocus"
    >
      {mascot}
      {word}
    </span>
  );
}

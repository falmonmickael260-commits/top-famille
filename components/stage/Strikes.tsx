"use client";

/**
 * Les fautes de l'equipe. Elles appartiennent a l'EQUIPE, pas au joueur :
 * trois croix et la manche peut etre volee.
 */
export default function Strikes({
  count,
  size = "md",
}: {
  count: number;
  size?: "sm" | "md";
}) {
  return (
    <div
      className="flex items-center gap-1.5"
      role="img"
      aria-label={`${count} faute${count > 1 ? "s" : ""} sur 3`}
    >
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className="strike"
          data-on={count >= n ? "true" : "false"}
          style={size === "sm" ? { width: "1.9rem", fontSize: "1.1rem" } : undefined}
          aria-hidden
        >
          ✕
        </span>
      ))}
    </div>
  );
}

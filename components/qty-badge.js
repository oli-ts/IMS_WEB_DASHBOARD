"use client";

export function QtyBadge({ label, value, unit, tone = "neutral" }) {
  const stylesByTone = {
    green: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    neutral:
      "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300",
  };
  const cls = stylesByTone[tone] || stylesByTone.neutral;
  const hasNumber = typeof value === "number" && !Number.isNaN(value);
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium inline-flex items-center gap-1 ${cls}`}>
      <span>{label}:</span>
      <span>{hasNumber ? value : "-"}</span>
      {unit ? <span className="opacity-80">{unit}</span> : null}
    </span>
  );
}


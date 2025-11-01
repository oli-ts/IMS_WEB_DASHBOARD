"use client";

export function LiveStatusBadge({ status }) {
  const s = (status || "in_warehouse").trim();
  const styles = {
    in_warehouse:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    on_job:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    in_transit:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    checked_out:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  };
  const cls =
    styles[s] ||
    "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300";
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium inline-block ${cls}`}>
      {s}
    </span>
  );
}


// lib/conditions.js

export const CONDITION_OPTIONS = [
  { value: "good", label: "Good" },
  { value: "needs_service", label: "Needs Maintenance" },
  { value: "broken", label: "Needs Repair" },
];

export const CONDITION_DB_CONST = {
  good: "good",
  needs_service: "needs_service",
  broken: "broken",
};

const CONDITION_META = {
  good: {
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    cardClass: "",
  },
  needs_service: {
    badgeClass: "bg-amber-50 text-amber-800 border-amber-300",
    cardClass: "border-amber-300 dark:border-amber-500",
  },
  broken: {
    badgeClass: "bg-red-50 text-red-700 border-red-300",
    cardClass: "border-red-300 dark:border-red-500",
  },
};

const CONDITION_ALIASES = {
  needs_maintenance: "needs_service",
  needs_service: "needs_service",
  needs_repair: "broken",
  repair: "broken",
  broken: "broken",
  good: "good",
};

function normalizeConditionValue(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;
  const slug = str.toLowerCase().replace(/[\s-]+/g, "_");
  if (CONDITION_ALIASES[slug]) return CONDITION_ALIASES[slug];
  const upper = str.toUpperCase();
  const match = Object.entries(CONDITION_DB_CONST).find(([, dbVal]) => dbVal.toUpperCase() === upper);
  return match ? match[0] : null;
}

export function getConditionOption(value) {
  const key = normalizeConditionValue(value);
  if (!key) return null;
  return CONDITION_OPTIONS.find((opt) => opt.value === key) || null;
}

export function getConditionMeta(value) {
  const option = getConditionOption(value);
  if (!option) return null;
  const meta = CONDITION_META[option.value] || {};
  return {
    label: option.label,
    badgeClass: meta.badgeClass || "bg-neutral-100 text-neutral-700 border-neutral-200",
    cardClass: meta.cardClass || "",
    value: option.value,
  };
}

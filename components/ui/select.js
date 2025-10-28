// components/ui/select.js
"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";

export function Select({ items = [], onSelect, triggerLabel = "Select", align = "start" }) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger className="h-10 px-4 rounded-xl border border-neutral-300 bg-white dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100">
        {triggerLabel}
      </Dropdown.Trigger>
      <Dropdown.Content align={align} className="bg-white dark:bg-neutral-900 dark:border-neutral-700 rounded-xl shadow border p-1">
        {items.map((i) => (
          <Dropdown.Item
            key={i.value}
            className="px-3 py-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
            onClick={() => onSelect?.(i)}
          >
            {i.label}
          </Dropdown.Item>
        ))}
      </Dropdown.Content>
    </Dropdown.Root>
  );
}

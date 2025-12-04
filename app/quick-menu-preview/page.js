"use client";
import ItemGroupQuickMenu from "@/components/item-group-quick-menu";

export default function QuickMenuPreviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Item Group Quick Menu</h1>
        <p className="text-sm text-neutral-500">
          Preview the item group quick menu in isolation. Select a group on the left to view its items.
        </p>
      </div>
      <ItemGroupQuickMenu />
    </div>
  );
}

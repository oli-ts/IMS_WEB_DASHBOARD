"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useLiveStatuses } from "@/lib/hooks/useLiveStatuses";
import { LiveStatusBadge } from "@/components/live-status-badge";
import { QtyBadge } from "@/components/qty-badge";

// Accordion-style list of item groups with their items, showing live status and quantities
export default function ItemGroupQuickMenu({
  className = "",
  onItemClick,
  onAddItem,
  showGroups = true,
}) {
  const sb = supabaseBrowser();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [itemsByGroup, setItemsByGroup] = useState({});
  const [expandedGroupId, setExpandedGroupId] = useState(null);
  const [error, setError] = useState("");
  const [imagePreview, setImagePreview] = useState(null); // { src, alt }
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const allItemUids = useMemo(() => {
    const uids = [];
    Object.values(itemsByGroup).forEach((rows) => {
      rows.forEach((r) => {
        if (r.uid) uids.push(r.uid);
      });
    });
    (searchResults || []).forEach((r) => {
      if (r.uid) uids.push(r.uid);
    });
    return Array.from(new Set(uids));
  }, [itemsByGroup, searchResults]);

  const { liveMap } = useLiveStatuses(allItemUids);

  useEffect(() => {
    loadGroupsAndItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb]);

  async function loadGroupsAndItems() {
    setLoading(true);
    setError("");
    try {
      const { data: groupRows, error: groupErr } = await sb
        .from("item_groups")
        .select("id,name,description")
        .order("name");
      if (groupErr) throw groupErr;

      const ids = (groupRows || []).map((g) => g.id);
      setGroups(groupRows || []);
      if (!ids.length) {
        setExpandedGroupId(null);
        setItemsByGroup({});
        return;
      }

      const { data: memberRows, error: memberErr } = await sb
        .from("item_group_members")
        .select("group_id,item_uid")
        .in("group_id", ids)
        .order("group_id")
        .order("item_uid");
      if (memberErr) throw memberErr;

      const uids = Array.from(
        new Set((memberRows || []).map((r) => r.item_uid).filter(Boolean))
      );
      let metaMap = {};
      if (uids.length) {
        const { data: invRows, error: invErr } = await sb
          .from("inventory_union")
          .select(
            "uid,name,classification,brand,model,status,quantity_total,unit,photo_url"
          )
          .in("uid", uids);
        if (invErr) throw invErr;
        metaMap = {};
        (invRows || []).forEach((row) => {
          metaMap[row.uid] = row;
        });
      }

      const grouped = {};
      (memberRows || []).forEach((row) => {
        const meta = metaMap[row.item_uid] || null;
        const entry = {
          uid: row.item_uid,
          name: meta?.name || row.item_uid,
          classification: meta?.classification || null,
          brand: meta?.brand || null,
          model: meta?.model || null,
          status: meta?.status || null,
          quantity_total: meta?.quantity_total ?? null,
          unit: meta?.unit || null,
          photo_url: meta?.photo_url || null,
        };
        if (!grouped[row.group_id]) grouped[row.group_id] = [];
        grouped[row.group_id].push(entry);
      });

      Object.keys(grouped).forEach((key) => {
        grouped[key].sort((a, b) => a.name.localeCompare(b.name));
      });

      setItemsByGroup(grouped);
      setExpandedGroupId((prev) =>
        prev && ids.includes(prev) ? prev : null
      );
    } catch (err) {
      console.error("Quick menu load failed", err);
      setError(err?.message || "Failed to load item groups");
      setGroups([]);
      setItemsByGroup({});
      setExpandedGroupId(null);
    } finally {
      setLoading(false);
    }
  }

  function renderItemRow(item) {
    const detail =
      item.brand ? [item.brand].filter(Boolean).join(" ") : item.classification || "";
    const onJob = Number(liveMap[item.uid]?.total_on_jobs || 0);
    const total =
      typeof item.quantity_total === "number" ? item.quantity_total : null;
    const inWarehouse =
      total !== null ? Math.max(total - onJob, 0) : null;
    const statusValue =
      liveMap[item.uid]?.status || item.status || "in_warehouse";
    const content = (
      <div className="flex items-center gap-3">
        {item.photo_url ? (
          <button
            onClick={() =>
              setImagePreview({
                src: item.photo_url,
                alt: item.name || item.uid,
              })
            }
            className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900"
            title="Click to enlarge"
          >
            <img
              src={item.photo_url}
              alt={item.name || item.uid}
              className="h-full w-full object-cover"
            />
          </button>
        ) : (
          <div className="h-12 w-12 flex-shrink-0 rounded-md border border-dashed border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60" />
        )}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{item.name}</span>
            <LiveStatusBadge status={statusValue.toString().toLowerCase()} />
          </div>
          <div className="text-xs text-neutral-500">
            {item.uid}
            {detail ? ` · ${detail}` : ""}
          </div>
        </div>
      </div>
    );
    return (
      <div
        key={item.uid}
        className="px-3 py-3 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors border-b border-neutral-200 dark:border-neutral-800 last:border-b-0"
      >
        <div className="flex items-center justify-between gap-3">
          {content}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <QtyBadge
              label="In warehouse"
              value={inWarehouse}
              unit={item.unit}
              tone="green"
            />
            <QtyBadge label="On job" value={onJob} unit={item.unit} tone="amber" />
            {typeof onAddItem === "function" ? (
              <button
                className="text-xs font-medium px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => onAddItem(item)}
              >
                Add Item
              </button>
            ) : null}
            <button
              className="text-xs font-medium px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={() =>
                window.open(`/inventory/${encodeURIComponent(item.uid)}`, "_blank")
              }
            >
              View
            </button>
          </div>
        </div>
      </div>
    );
  }

  useEffect(() => {
    const q = searchTerm.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const query = sb
          .from("inventory_union")
          .select(
            "uid,name,classification,brand,model,status,quantity_total,unit,photo_url"
          )
          .or(`name.ilike.%${q}%,uid.ilike.%${q}%`)
          .limit(25);
        const { data, error } = await query;
        if (error) throw error;
        setSearchResults(data || []);
      } catch (err) {
        console.error("Search failed", err);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [searchTerm, sb]);

  return (
    <div className={`w-full ${className}`}>
      {error ? (
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      ) : null}
      <div className="mb-3">
        <input
          className="w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
          placeholder="Search all inventory..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      {searchTerm.trim() ? (
        <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden mb-4">
          <div className="px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <span className="text-sm font-medium">
              Search results ({searchResults.length})
            </span>
            {searchLoading ? (
              <span className="text-xs text-neutral-500">Loading...</span>
            ) : null}
          </div>
          <div className="max-h-[400px] overflow-auto divide-y divide-neutral-200 dark:divide-neutral-800">
            {searchResults.length ? (
              searchResults.map((item) => renderItemRow(item))
            ) : (
              <div className="px-4 py-3 text-sm text-neutral-500">
                {searchLoading ? "Searching..." : "No matches found."}
              </div>
            )}
          </div>
        </div>
      ) : null}
      {showGroups ? (
        loading ? (
          <div className="text-sm text-neutral-500">Loading item groups...</div>
        ) : !groups.length ? (
          <div className="text-sm text-neutral-500">
            No item groups found yet.
          </div>
        ) : (
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
            <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {groups.map((group) => {
                const items = itemsByGroup[group.id] || [];
                const isOpen = expandedGroupId === group.id;
                return (
                  <div key={group.id} className="bg-white dark:bg-neutral-900">
                    <button
                      className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${
                        isOpen ? "bg-neutral-50 dark:bg-neutral-800/70" : ""
                      }`}
                      onClick={() => setExpandedGroupId(isOpen ? null : group.id)}
                      aria-expanded={isOpen}
                    >
                      <div>
                        <div className="font-medium">{group.name}</div>
                        <div className="text-xs text-neutral-500">
                          {items.length} item{items.length === 1 ? "" : "s"}
                        </div>
                      </div>
                      <span className="text-xs text-neutral-500">
                        {isOpen ? "Hide" : "Show"}
                      </span>
                    </button>
                    <div
                      className={`transition-all duration-200 ease-out ${
                        isOpen
                          ? "max-h-[2000px] opacity-100 overflow-y-auto"
                          : "max-h-0 opacity-0 overflow-hidden"
                      }`}
                    >
                      <div className="px-4 pb-3 space-y-2 pt-1">
                        {items.length ? (
                          items.map((item) => renderItemRow(item))
                        ) : (
                          <div className="text-sm text-neutral-500">
                            No items in this group.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      ) : null}
      {imagePreview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setImagePreview(null)}
          />
          <div className="relative z-10 bg-white dark:bg-neutral-900 rounded-2xl shadow-xl p-4 max-w-4xl w-[90vw]">
            <button
              className="absolute top-2 right-2 text-sm px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800"
              onClick={() => setImagePreview(null)}
            >
              Close
            </button>
            <div className="w-full">
              <img
                src={imagePreview.src}
                alt={imagePreview.alt || "Preview"}
                className="w-full h-auto object-contain max-h-[80vh] rounded-xl"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

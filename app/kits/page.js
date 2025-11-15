"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function KitsPage() {
  const sb = supabaseBrowser();
  const [kits, setKits] = useState([]);
  const [loadingKits, setLoadingKits] = useState(true);
  const [selectedKitId, setSelectedKitId] = useState(null);
  const [kitItems, setKitItems] = useState([]);
  const [kitItemNames, setKitItemNames] = useState({});
  const [kitForm, setKitForm] = useState({ name: "", description: "" });
  const [newKitForm, setNewKitForm] = useState({ name: "", description: "" });
  const [creatingKit, setCreatingKit] = useState(false);
  const [savingKit, setSavingKit] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    loadKits();
  }, [sb]);

  async function loadKits() {
    setLoadingKits(true);
    try {
      const { data, error } = await sb
        .from("kit_details")
        .select("*")
        .order("name");
      if (error) throw error;
      setKits(data || []);
      if (data?.length && !selectedKitId) {
        setSelectedKitId(data[0].id);
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to load kits");
    } finally {
      setLoadingKits(false);
    }
  }

  useEffect(() => {
    if (!selectedKitId) {
      setKitItems([]);
      setKitForm({ name: "", description: "" });
      return;
    }
      const selectedKit = kits.find((k) => k.id === selectedKitId) || null;
    setKitForm({
      name: selectedKit?.name || "",
      description: selectedKit?.description || "",
    });
    (async () => {
      try {
        const { data, error } = await sb
          .from("kit_items")
          .select("id,item_uid,quantity")
          .eq("kit_id", selectedKitId);
        if (error) throw error;
        const rows = data || [];
        setKitItems(rows);
        const uids = Array.from(new Set(rows.map((r) => r.item_uid)));
        if (uids.length) {
          const { data: names } = await sb
            .from("inventory_union")
            .select("uid,name")
            .in("uid", uids);
          const map = {};
          (names || []).forEach((i) => {
            map[i.uid] = i.name;
          });
          setKitItemNames(map);
        } else {
          setKitItemNames({});
        }
      } catch (err) {
        console.error(err);
        toast.error(err.message || "Failed to load kit items");
      }
    })();
  }, [selectedKitId, kits, sb]);

  useEffect(() => {
    if (!search?.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        let query = sb
          .from("inventory_union")
          .select("uid,name,classification,brand,model,photo_url")
          .ilike("name", `%${search}%`)
          .limit(20);
        if (/^[A-Z]{2,5}-/.test(search.trim().toUpperCase())) {
          query = sb
            .from("inventory_union")
            .select("uid,name,classification,brand,model,photo_url")
            .or(`uid.ilike.%${search}%,name.ilike.%${search}%`)
            .limit(20);
        }
        const { data, error } = await query;
        if (error) throw error;
        setSearchResults(data || []);
      } catch (err) {
        console.error(err);
        setSearchResults([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [search, sb]);

  async function createKit() {
    const name = (newKitForm.name || "").trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    setCreatingKit(true);
    try {
      const { data, error } = await sb
        .from("kits")
        .insert({ name, description: newKitForm.description || null })
        .select()
        .single();
      if (error) throw error;
      toast.success("Kit created");
      await loadKits();
      setSelectedKitId(data.id);
      setNewKitForm({ name: "", description: "" });
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to create kit");
    } finally {
      setCreatingKit(false);
    }
  }

  async function saveKitMeta() {
    if (!selectedKitId) return;
    setSavingKit(true);
    try {
      const payload = {
        name: kitForm.name?.trim() || null,
        description: kitForm.description?.trim() || null,
      };
      const { error } = await sb
        .from("kits")
        .update(payload)
        .eq("id", selectedKitId);
      if (error) throw error;
      toast.success("Kit updated");
      setKits((prev) =>
        prev.map((k) =>
          k.id === selectedKitId ? { ...k, ...payload } : k
        )
      );
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to update kit");
    } finally {
      setSavingKit(false);
    }
  }

  async function addItemToKit(uid, quantity = 1) {
    if (!selectedKitId) return;
    const qty = Math.max(1, Number(quantity) || 1);
    try {
      const payload = {
        kit_id: selectedKitId,
        item_uid: uid,
        quantity: qty,
      };
      const { data, error } = await sb
        .from("kit_items")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      toast.success("Item added");
      setKitItems((prev) => [...prev, data]);
      const { data: inv } = await sb
        .from("inventory_union")
        .select("uid,name")
        .eq("uid", uid)
        .maybeSingle();
      if (inv?.uid) {
        setKitItemNames((prev) => ({ ...prev, [inv.uid]: inv.name }));
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to add item");
    }
  }

  async function updateKitItem(id, quantity) {
    try {
      const qty = Math.max(1, Number(quantity) || 1);
      const { error } = await sb
        .from("kit_items")
        .update({ quantity: qty })
        .eq("id", id);
      if (error) throw error;
      setKitItems((prev) =>
        prev.map((row) => (row.id === id ? { ...row, quantity: qty } : row))
      );
    } catch (err) {
      console.error(err);
      toast.error("Failed to update quantity");
    }
  }

  async function removeKitItem(id) {
    try {
      const { error } = await sb.from("kit_items").delete().eq("id", id);
      if (error) throw error;
      setKitItems((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove item");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Kits</h1>
        <p className="text-sm text-neutral-500">
          Group existing inventory items into reusable kits.
        </p>
      </div>
      <div className="grid md:grid-cols-[280px_1fr] gap-4">
        <Card className="h-fit">
          <CardHeader>Existing Kits</CardHeader>
          <CardContent className="space-y-3">
            {loadingKits ? (
              <div className="text-sm text-neutral-500">Loading…</div>
            ) : kits.length ? (
              <div className="space-y-2">
                {kits.map((k) => (
                  <button
                    key={k.id}
                    className={`w-full text-left px-3 py-2 rounded-md border ${
                      selectedKitId === k.id
                        ? "bg-neutral-100 dark:bg-neutral-800 border-primary"
                        : "bg-white dark:bg-neutral-900"
                    }`}
                    onClick={() => setSelectedKitId(k.id)}
                  >
                    <div className="font-medium">{k.name}</div>
                    <div className="text-xs text-neutral-500 truncate">
                      {k.description || "—"}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-neutral-500">No kits yet.</div>
            )}
            <div className="space-y-2 border-t pt-3">
              <div className="text-sm font-medium">Create Kit</div>
              <Input
                placeholder="Kit name"
                value={newKitForm.name}
                onChange={(e) =>
                  setNewKitForm((f) => ({ ...f, name: e.target.value }))
                }
              />
              <Input
                placeholder="Description"
                value={newKitForm.description}
                onChange={(e) =>
                  setNewKitForm((f) => ({ ...f, description: e.target.value }))
                }
              />
              <Button
                onClick={createKit}
                disabled={creatingKit || !newKitForm.name?.trim()}
              >
                {creatingKit ? "Creating…" : "Create Kit"}
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>Kit Details</CardHeader>
          <CardContent className="space-y-4">
            {selectedKitId ? (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <div className="text-sm text-neutral-500">Kit name</div>
                    <Input
                      value={kitForm.name}
                      onChange={(e) =>
                        setKitForm((f) => ({ ...f, name: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-neutral-500">Description</div>
                    <Input
                      value={kitForm.description}
                      onChange={(e) =>
                        setKitForm((f) => ({ ...f, description: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={saveKitMeta} disabled={savingKit}>
                    {savingKit ? "Saving…" : "Save"}
                  </Button>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Items</div>
                  <Input
                    placeholder="Search items to add"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <div className="max-h-48 overflow-auto border rounded-md divide-y">
                    {searchResults.map((i) => (
                      <div
                        key={i.uid}
                        className="flex items-center justify-between px-3 py-2 text-sm"
                      >
                        <div>
                          <div className="font-medium">{i.name || i.uid}</div>
                          <div className="text-xs text-neutral-500">
                            {i.uid}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => addItemToKit(i.uid)}
                        >
                          Add
                        </Button>
                      </div>
                    ))}
                    {!searchResults.length && (
                      <div className="text-xs text-neutral-500 px-3 py-2">
                        Search by name or UID to add items.
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  {kitItems.length ? (
                    kitItems.map((row) => (
                      <div
                        key={row.id}
                        className="flex items-center justify-between border rounded-md px-3 py-2"
                      >
                        <div>
                          <div className="font-medium">
                            {kitItemNames[row.item_uid] || row.item_uid}
                          </div>
                          <div className="text-xs text-neutral-500">
                            UID: {row.item_uid}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="1"
                            value={row.quantity || 1}
                            onChange={(e) =>
                              updateKitItem(row.id, e.target.value)
                            }
                            className="w-20"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeKitItem(row.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-neutral-500">
                      No items in this kit yet.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-sm text-neutral-500">
                Select or create a kit to begin.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

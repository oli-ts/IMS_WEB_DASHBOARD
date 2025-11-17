"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase-browser";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { toast } from "sonner";

export default function Settings() {
  const sb = supabaseBrowser();

  // Users
  const [users, setUsers] = useState([]);
  const [me, setMe] = useState(null);
  const [meLoading, setMeLoading] = useState(true);
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [memberMeta, setMemberMeta] = useState({});
  const [newMemberUid, setNewMemberUid] = useState("");
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState([]);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupDesc, setEditGroupDesc] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);

  async function loadUsers() {
    try {
      const { data, error } = await sb.from("staff").select("id,name,role");
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error("Failed to load staff", err);
    }
  }
  async function loadGroups(targetId) {
    try {
      setGroupsLoading(true);
      const { data, error } = await sb
        .from("item_groups")
        .select("id,name,description,created_at")
        .order("name");
      if (error) throw error;
      setGroups(data || []);
      if (!data?.length) {
        setSelectedGroup(null);
      } else if (targetId) {
        const found = data.find((g) => g.id === targetId);
        setSelectedGroup(found || data[0]);
      } else if (selectedGroup?.id) {
        const match = data.find((g) => g.id === selectedGroup.id);
        if (match) setSelectedGroup(match);
        else setSelectedGroup(data[0]);
      } else if (!selectedGroup) {
        setSelectedGroup(data[0]);
      }
    } catch (err) {
      console.error("Failed to load groups", err);
      toast.error("Failed to load groups");
    } finally {
      setGroupsLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const {
          data: { user },
        } = await sb.auth.getUser();
        if (!user?.id) {
          setMe(null);
          return;
        }
        const { data } = await sb
          .from("staff")
          .select("id,name,role")
          .eq("id", user.id)
          .maybeSingle();
        setMe(data || null);
      } catch (err) {
        console.error("Current user lookup failed", err);
        setMe(null);
      } finally {
        setMeLoading(false);
      }
    })();
  }, []);

  const isAdmin = ["admin", "sysadmin"].includes((me?.role || "").toLowerCase());
  const selectedGroupId = selectedGroup?.id || null;
  const memberUids = useMemo(() => members.map((m) => m.item_uid), [members]);

  async function handleCreateAdmin(event) {
    event.preventDefault();
    if (!isAdmin || creatingAdmin) return;
    const name = newAdminName.trim();
    const email = newAdminEmail.trim().toLowerCase();
    if (!name || !email) {
      toast.error("Name and email are required");
      return;
    }
    setCreatingAdmin(true);
    try {
      const res = await fetch("/api/admin/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to create admin");
      }
      toast.success("Admin account created");
      setNewAdminName("");
      setNewAdminEmail("");
      await loadUsers();
    } catch (err) {
      toast.error(err?.message || "Failed to create admin");
    } finally {
      setCreatingAdmin(false);
    }
  }

  async function createGroup(e) {
    e.preventDefault();
    if (!isAdmin) return toast.error("Admins only");
    const name = newGroupName.trim();
    if (!name) return toast.error("Group name is required");
    try {
      const payload = {
        name,
        description: newGroupDesc.trim() || null,
      };
      const { data, error } = await sb
        .from("item_groups")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Group created");
      setNewGroupName("");
      setNewGroupDesc("");
      await loadGroups(data?.id);
    } catch (err) {
      console.error("Create group failed", err);
      toast.error(err?.message || "Failed to create group");
    }
  }

  async function loadGroupMembers(groupId) {
    if (!groupId) {
      setMembers([]);
      setMemberMeta({});
      return;
    }
    try {
      setMemberLoading(true);
      const { data, error } = await sb
        .from("item_group_members")
        .select("item_uid,added_at")
        .eq("group_id", groupId)
        .order("item_uid");
      if (error) throw error;
      const rows = data || [];
      setMembers(rows);
      const uids = rows.map((r) => r.item_uid).filter(Boolean);
      if (!uids.length) {
        setMemberMeta({});
        return;
      }
      const meta = {};
      const { data: inv } = await sb
        .from("inventory_union")
        .select("uid,name,classification,photo_url,status")
        .in("uid", uids);
      for (const row of inv || []) {
        meta[row.uid] = row;
      }
      const missing = uids.filter((u) => !meta[u]);
      if (missing.length) {
        const { data: metal } = await sb
          .from("metal_diamonds")
          .select("uid,name,classification,photo_url,status")
          .in("uid", missing);
        for (const row of metal || []) {
          meta[row.uid] = row;
        }
      }
      setMemberMeta(meta);
    } catch (err) {
      console.error("Load members failed", err);
      toast.error(err?.message || "Failed to load members");
      setMembers([]);
      setMemberMeta({});
    } finally {
      setMemberLoading(false);
    }
  }

  useEffect(() => {
    loadGroupMembers(selectedGroupId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupId]);

  useEffect(() => {
    setEditGroupName(selectedGroup?.name || "");
    setEditGroupDesc(selectedGroup?.description || "");
  }, [selectedGroup]);

  async function addMemberByUid(rawUid) {
    const uid = (rawUid || "").trim().toUpperCase();
    if (!uid) {
      toast.error("Enter a UID");
      return false;
    }
    if (memberUids.includes(uid)) {
      toast.error("Item already in group");
      return false;
    }
    if (!selectedGroupId) {
      toast.error("Select a group");
      return false;
    }
    try {
      const { error } = await sb
        .from("item_group_members")
        .insert({ group_id: selectedGroupId, item_uid: uid });
      if (error) throw error;
      toast.success("Item added");
      await loadGroupMembers(selectedGroupId);
      return true;
    } catch (err) {
      console.error("Add member failed", err);
      toast.error(err?.message || "Failed to add member");
      return false;
    }
  }

  async function addMember(e) {
    e.preventDefault();
    if (!isAdmin) return toast.error("Admins only");
    const ok = await addMemberByUid(newMemberUid);
    if (ok) {
      setNewMemberUid("");
      setMemberSearch("");
      setMemberResults([]);
    }
  }

  async function saveGroupDetails(e) {
    e.preventDefault();
    if (!isAdmin) return toast.error("Admins only");
    if (!selectedGroupId) return;
    const name = editGroupName.trim();
    if (!name) return toast.error("Group name required");
    try {
      setSavingGroup(true);
      const patch = {
        name,
        description: editGroupDesc.trim() || null,
      };
      const { error } = await sb.from("item_groups").update(patch).eq("id", selectedGroupId);
      if (error) throw error;
      toast.success("Group updated");
      await loadGroups(selectedGroupId);
    } catch (err) {
      console.error("Update group failed", err);
      toast.error(err?.message || "Failed to update group");
    } finally {
      setSavingGroup(false);
    }
  }

  async function removeMember(uid) {
    if (!isAdmin) return toast.error("Admins only");
    try {
      const { error } = await sb
        .from("item_group_members")
        .delete()
        .eq("group_id", selectedGroupId)
        .eq("item_uid", uid);
      if (error) throw error;
      toast.success("Removed from group");
      await loadGroupMembers(selectedGroupId);
    } catch (err) {
      console.error("Remove member failed", err);
      toast.error(err?.message || "Failed to remove member");
    }
  }

  const memberDropdownRef = useRef(null);
  useEffect(() => {
    const onClick = (event) => {
      if (memberDropdownRef.current && !memberDropdownRef.current.contains(event.target)) {
        setMemberSearch("");
      }
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    let active = true;
    if (!memberSearch?.trim()) {
      setMemberResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const q = memberSearch.trim();
        let itemQuery = sb
          .from("inventory_union")
          .select("uid,name,classification,status,photo_url")
          .ilike("name", `%${q}%`)
          .limit(15);
        let metalQuery = sb
          .from("metal_diamonds")
          .select("uid,name,classification,status,photo_url")
          .ilike("name", `%${q}%`)
          .limit(15);
        if (/^[A-Z0-9-]+$/.test(q.toUpperCase())) {
          itemQuery = sb
            .from("inventory_union")
            .select("uid,name,classification,status,photo_url")
            .or(`uid.ilike.%${q}%,name.ilike.%${q}%`)
            .limit(15);
          metalQuery = sb
            .from("metal_diamonds")
            .select("uid,name,classification,status,photo_url")
            .or(`uid.ilike.%${q}%,name.ilike.%${q}%`)
            .limit(15);
        }
        const [itemRes, metalRes] = await Promise.all([itemQuery, metalQuery]);
        if (!active) return;
        if (itemRes.error) throw itemRes.error;
        if (metalRes.error) throw metalRes.error;
        const merged = [...(itemRes.data || [])];
        for (const row of metalRes.data || []) {
          if (!row?.uid) continue;
          const idx = merged.findIndex((r) => r.uid === row.uid);
          if (idx >= 0) merged[idx] = { ...merged[idx], ...row };
          else merged.push(row);
        }
        setMemberResults(merged);
      } catch (err) {
        console.error("Member search failed", err);
        if (active) setMemberResults([]);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [memberSearch, sb]);

  // Warehouse layout state
  const [warehouses, setWarehouses] = useState([]);
  const [zones, setZones] = useState([]);
  const [bays, setBays] = useState([]);
  const [shelfs, setShelfs] = useState([]);

  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedBay, setSelectedBay] = useState(null);

  // Create/edit inputs
  const [newWhNumber, setNewWhNumber] = useState("");
  const [newWhName, setNewWhName] = useState("");
  const [editingWarehouseId, setEditingWarehouseId] = useState(null);
  const [editWhNumber, setEditWhNumber] = useState("");
  const [editWhName, setEditWhName] = useState("");

  const [newZoneName, setNewZoneName] = useState("");
  const [editingZoneId, setEditingZoneId] = useState(null);
  const [editZoneName, setEditZoneName] = useState("");

  const [newBayLabel, setNewBayLabel] = useState("");
  const [editingBayId, setEditingBayId] = useState(null);
  const [editBayLabel, setEditBayLabel] = useState("");

  const [newShelfLabel, setNewShelfLabel] = useState("");
  const [editingShelfId, setEditingShelfId] = useState(null);
  const [editShelfLabel, setEditShelfLabel] = useState("");

  // Pagination state
  const [whPage, setWhPage] = useState(1);
  const whPageSize = 10;
  const [whTotal, setWhTotal] = useState(0);

  const [zPage, setZPage] = useState(1);
  const zPageSize = 10;
  const [zTotal, setZTotal] = useState(0);

  const [bPage, setBPage] = useState(1);
  const bPageSize = 10;
  const [bTotal, setBTotal] = useState(0);

  const [sPage, setSPage] = useState(1);
  const sPageSize = 10;
  const [sTotal, setSTotal] = useState(0);

  // Loaders
  async function loadWarehouses() {
    const from = (whPage - 1) * whPageSize;
    const to = from + whPageSize - 1;
    const { data, count } = await sb
      .from("warehouse")
      .select("id, wh_number, name", { count: "exact" })
      .order("wh_number")
      .range(from, to);
    setWarehouses(data || []);
    setWhTotal(count || 0);
  }
  async function loadZones(warehouseId) {
    const from = (zPage - 1) * zPageSize;
    const to = from + zPageSize - 1;
    const { data, count } = await sb
      .from("zones")
      .select("id,name", { count: "exact" })
      .eq("warehouse_id", warehouseId)
      .order("name")
      .range(from, to);
    setZones(data || []);
    setZTotal(count || 0);
  }
  async function loadBays(zoneId) {
    const from = (bPage - 1) * bPageSize;
    const to = from + bPageSize - 1;
    const { data, count } = await sb
      .from("bays")
      .select("id,label", { count: "exact" })
      .eq("zone_id", zoneId)
      .order("label")
      .range(from, to);
    setBays(data || []);
    setBTotal(count || 0);
  }
  async function loadShelfs(bayId) {
    const from = (sPage - 1) * sPageSize;
    const to = from + sPageSize - 1;
    const { data, count } = await sb
      .from("shelfs")
      .select("id,label", { count: "exact" })
      .eq("bay_id", bayId)
      .order("label")
      .range(from, to);
    setShelfs(data || []);
    setSTotal(count || 0);
  }

  useEffect(() => {
    loadWarehouses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Selection cascade
  useEffect(() => {
    if (selectedWarehouse?.id) {
      loadZones(selectedWarehouse.id);
    } else {
      setZones([]);
    }
    setSelectedZone(null);
    setBays([]);
    setSelectedBay(null);
    setShelfs([]);
    setZPage(1);
    setBPage(1);
    setSPage(1);
  }, [selectedWarehouse]);

  useEffect(() => {
    if (selectedZone?.id) {
      loadBays(selectedZone.id);
    } else {
      setBays([]);
    }
    setSelectedBay(null);
    setShelfs([]);
    setBPage(1);
    setSPage(1);
  }, [selectedZone]);

  useEffect(() => {
    if (selectedBay?.id) {
      loadShelfs(selectedBay.id);
    } else {
      setShelfs([]);
    }
    setSPage(1);
  }, [selectedBay]);

  // Reload on page changes
  useEffect(() => { loadWarehouses(); }, [whPage]);
  useEffect(() => { if (selectedWarehouse?.id) loadZones(selectedWarehouse.id); }, [zPage]);
  useEffect(() => { if (selectedZone?.id) loadBays(selectedZone.id); }, [bPage]);
  useEffect(() => { if (selectedBay?.id) loadShelfs(selectedBay.id); }, [sPage]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="text-xl font-semsibold">Users</div>
        <button
          onClick={async ()=>{ await sb.auth.signOut(); window.location.href='/signin'; }}
          className="text-sm underline"
        >
          Sign out
        </button>
        {isAdmin && !meLoading && (
          <Card>
            <CardHeader>Create New Admin</CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={handleCreateAdmin}>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    placeholder="Full name"
                    value={newAdminName}
                    onChange={(e) => setNewAdminName(e.target.value)}
                  />
                  <Input
                    placeholder="Work email"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    type="email"
                  />
                </div>
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <p className="text-xs text-neutral-500">
                    We generate a temporary password automatically; ask the new admin to run "Forgot password" on first login.
                  </p>
                  <Button type="submit" disabled={creatingAdmin}>
                    {creatingAdmin ? "Creating..." : "Create admin"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
        <div className="grid gap-2">
          {users.map((u) => (
            <div key={u.id} className="p-3 rounded-xl border dark:border-neutral-800 bg-white dark:bg-neutral-900">
              {u.name} · {u.role}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-xl font-semibold">Item Groups</div>
        <Card>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-[260px_1fr]">
              <div className="space-y-4">
                <form className="space-y-2" onSubmit={createGroup}>
                  <div className="font-medium">Create Group</div>
                  <Input
                    placeholder="Group name"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    disabled={!isAdmin}
                  />
                  <Input
                    placeholder="Description (optional)"
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                    disabled={!isAdmin}
                  />
                  <Button type="submit" disabled={!isAdmin}>
                    Create Group
                  </Button>
                </form>
                <div className="space-y-2">
                  <div className="font-medium">Groups</div>
                  <div className="max-h-64 overflow-auto rounded-xl border dark:border-neutral-800 bg-white dark:bg-neutral-900">
                    {groupsLoading ? (
                      <div className="p-3 text-sm text-neutral-500">Loading…</div>
                    ) : groups.length ? (
                      groups.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          className={`w-full text-left p-3 border-b last:border-0 dark:border-neutral-800 ${
                            selectedGroupId === g.id ? "bg-blue-50 dark:bg-blue-900/30" : ""
                          }`}
                          onClick={() => setSelectedGroup(g)}
                        >
                          <div className="font-medium">{g.name}</div>
                          <div className="text-xs text-neutral-500">{g.description || "—"}</div>
                        </button>
                      ))
                    ) : (
                      <div className="p-3 text-sm text-neutral-500">No groups yet.</div>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                {selectedGroup ? (
                  <>
                    <form className="space-y-2" onSubmit={saveGroupDetails}>
                      <div className="text-lg font-semibold">Edit Group</div>
                      <Input
                        placeholder="Group name"
                        value={editGroupName}
                        onChange={(e) => setEditGroupName(e.target.value)}
                        disabled={!isAdmin}
                      />
                      <Input
                        placeholder="Description (optional)"
                        value={editGroupDesc}
                        onChange={(e) => setEditGroupDesc(e.target.value)}
                        disabled={!isAdmin}
                      />
                      <Button type="submit" disabled={!isAdmin || savingGroup}>
                        {savingGroup ? "Saving…" : "Save Changes"}
                      </Button>
                    </form>
                    <form className="flex flex-col gap-2" onSubmit={addMember} ref={memberDropdownRef}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input
                          placeholder="Search UID or name"
                          value={memberSearch}
                          onChange={(e) => {
                            setMemberSearch(e.target.value);
                            setNewMemberUid(e.target.value);
                          }}
                          className="flex-1"
                          disabled={!isAdmin}
                        />
                        <Button type="submit" disabled={!isAdmin}>
                          Add
                        </Button>
                      </div>
                      {memberSearch?.trim() && (
                        <div className="max-h-48 overflow-auto rounded-xl border dark:border-neutral-800 bg-white dark:bg-neutral-900">
                          {memberResults.length ? (
                            memberResults.map((result) => {
                              const isBroken = (result.status || "").toLowerCase() === "broken";
                              const already = memberUids.includes(result.uid);
                              return (
                                <div
                                  key={result.uid}
                                  className="flex items-center justify-between gap-3 p-2 border-b last:border-0 dark:border-neutral-800"
                                >
                                  <div>
                                    <div className="font-medium">{result.name || result.uid}</div>
                                    <div className="text-xs text-neutral-500">{result.uid}{result.classification ? ` · ${result.classification}` : ""}</div>
                                    {isBroken && (
                                      <span className="inline-block rounded-full bg-red-100 text-red-700 text-xs px-2 py-0.5 mt-1">
                                        Broken
                                      </span>
                                    )}
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={!isAdmin || already}
                                    onClick={() => addMemberByUid(result.uid)}
                                  >
                                    {already ? "Added" : "Add"}
                                  </Button>
                                </div>
                              );
                            })
                          ) : (
                            <div className="p-2 text-sm text-neutral-500">No matches.</div>
                          )}
                        </div>
                      )}
                    </form>
                    <div className="space-y-2">
                      <div className="text-sm text-neutral-500">
                        Members ({members.length})
                      </div>
                      <div className="grid gap-2 max-h-64 overflow-auto">
                        {memberLoading ? (
                          <div className="text-sm text-neutral-500">Loading…</div>
                        ) : members.length ? (
                          members.map((m) => {
                            const meta = memberMeta[m.item_uid];
                            return (
                              <div
                                key={m.item_uid}
                                className="p-3 rounded-xl border dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between gap-3"
                              >
                                <div>
                                  <div className="font-medium truncate flex items-center gap-2">
                                    {meta?.name || m.item_uid}
                                    {meta?.status && meta.status.toLowerCase() === "broken" && (
                                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Broken</span>
                                    )}
                                  </div>
                                  <div className="text-xs text-neutral-500">{m.item_uid}{meta?.classification ? ` · ${meta.classification}` : ""}</div>
                                </div>
                                {isAdmin && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => removeMember(m.item_uid)}
                                  >
                                    Remove
                                  </Button>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-sm text-neutral-500">No members yet.</div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-neutral-500">Select a group to manage members.</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <div className="text-xl font-semibold">Warehouse Layout</div>

        <Card>
          <CardContent>
            <div className="py-3 space-y-3">
              <div className="font-medium">Warehouses</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <Input placeholder="WH Number" value={newWhNumber} onChange={(e)=>setNewWhNumber(e.target.value)} />
                <Input placeholder="Name" value={newWhName} onChange={(e)=>setNewWhName(e.target.value)} />
                <Button onClick={async ()=>{
                  const wh_number = (newWhNumber||"").trim();
                  const name = (newWhName||"").trim();
                  if (!wh_number || !name) return;
                  await sb.from("warehouse").insert({ wh_number, name });
                  setNewWhNumber(""); setNewWhName("");
                  loadWarehouses();
                }}>Create</Button>
              </div>
              <div className="grid gap-2">
                {warehouses.map((w)=>(
                  <div key={w.id} className={`p-3 rounded-xl border dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between ${selectedWarehouse?.id===w.id? 'ring-1 ring-blue-500/30':''}`}>
                    <div className="flex-1 min-w-0">
                      {editingWarehouseId===w.id ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <Input value={editWhNumber} onChange={(e)=>setEditWhNumber(e.target.value)} placeholder="WH Number" />
                          <Input value={editWhName} onChange={(e)=>setEditWhName(e.target.value)} placeholder="Name" />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={async ()=>{ await sb.from("warehouse").update({ wh_number: (editWhNumber||"").trim(), name: (editWhName||"").trim() }).eq("id", w.id); setEditingWarehouseId(null); setEditWhNumber(""); setEditWhName(""); loadWarehouses(); }}>Save</Button>
                            <Button size="sm" variant="outline" onClick={()=>{ setEditingWarehouseId(null); setEditWhNumber(""); setEditWhName(""); }}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="font-medium truncate">{w.wh_number} · {w.name}</div>
                          <Button size="sm" variant="outline" onClick={()=>{ setSelectedWarehouse(w); }}>Select</Button>
                          <Button size="sm" variant="outline" onClick={()=>{ setEditingWarehouseId(w.id); setEditWhNumber(w.wh_number||""); setEditWhName(w.name||""); }}>Edit</Button>
                          <Button size="sm" variant="destructive" onClick={async ()=>{
                            const { count: zoneCount } = await sb.from("zones").select("id", { count: "exact" }).eq("warehouse_id", w.id);
                            if ((zoneCount||0) > 0) { alert('Cannot delete warehouse with existing zones. Delete zones first.'); return; }
                            if (!confirm('Delete this warehouse?')) return;
                            await sb.from("warehouse").delete().eq("id", w.id);
                            if (selectedWarehouse?.id===w.id) setSelectedWarehouse(null);
                            loadWarehouses();
                          }}>Delete</Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-neutral-500">Page {whPage} of {Math.max(1, Math.ceil((whTotal||0)/whPageSize))}</div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={()=>setWhPage(p=>Math.max(1,p-1))} disabled={whPage<=1}>Previous</Button>
                    <Button size="sm" variant="outline" onClick={()=>setWhPage(p=>p+1)} disabled={whPage>=Math.max(1, Math.ceil((whTotal||0)/whPageSize))}>Next</Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {selectedWarehouse?.id && (
          <Card>
            <CardContent>
              <div className="py-3 space-y-3">
                <div className="font-medium">Zones in {selectedWarehouse.name}</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <Input placeholder="Zone name" value={newZoneName} onChange={(e)=>setNewZoneName(e.target.value)} />
                  <Button onClick={async ()=>{ const name=(newZoneName||"").trim(); if(!name) return; await sb.from("zones").insert({ name, warehouse_id: selectedWarehouse.id }); setNewZoneName(""); loadZones(selectedWarehouse.id); }}>Add Zone</Button>
                </div>
                <div className="grid gap-2">
                  {zones.map((z)=>(
                    <div key={z.id} className={`p-3 rounded-xl border dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between ${selectedZone?.id===z.id? 'ring-1 ring-blue-500/30':''}`}>
                      {editingZoneId===z.id ? (
                        <div className="flex items-center gap-2">
                          <Input value={editZoneName} onChange={(e)=>setEditZoneName(e.target.value)} className="h-9" />
                          <Button size="sm" onClick={async ()=>{ await sb.from("zones").update({ name: (editZoneName||"").trim() }).eq("id", z.id); setEditingZoneId(null); setEditZoneName(""); loadZones(selectedWarehouse.id); }}>Save</Button>
                          <Button size="sm" variant="outline" onClick={()=>{ setEditingZoneId(null); setEditZoneName(""); }}>Cancel</Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="font-medium truncate">{z.name}</div>
                          <Button size="sm" variant="outline" onClick={()=>setSelectedZone(z)}>Select</Button>
                          <Button size="sm" variant="outline" onClick={()=>{ setEditingZoneId(z.id); setEditZoneName(z.name||""); }}>Edit</Button>
                          <Button size="sm" variant="destructive" onClick={async ()=>{
                            const { count: bayCount } = await sb.from("bays").select("id", { count: "exact" }).eq("zone_id", z.id);
                            if ((bayCount||0) > 0) { alert('Cannot delete zone with existing bays. Delete bays first.'); return; }
                            if (!confirm('Delete this zone?')) return;
                            await sb.from("zones").delete().eq("id", z.id);
                            if (selectedZone?.id===z.id) setSelectedZone(null);
                            loadZones(selectedWarehouse.id);
                          }}>Delete</Button>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2">
                    <div className="text-xs text-neutral-500">Page {zPage} of {Math.max(1, Math.ceil((zTotal||0)/zPageSize))}</div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={()=>setZPage(p=>Math.max(1,p-1))} disabled={zPage<=1}>Previous</Button>
                      <Button size="sm" variant="outline" onClick={()=>setZPage(p=>p+1)} disabled={zPage>=Math.max(1, Math.ceil((zTotal||0)/zPageSize))}>Next</Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {selectedZone?.id && (
          <Card>
            <CardContent>
              <div className="py-3 space-y-3">
                <div className="font-medium">Bays in {selectedZone.name}</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <Input placeholder="Bay label" value={newBayLabel} onChange={(e)=>setNewBayLabel(e.target.value)} />
                  <Button onClick={async ()=>{ const label=(newBayLabel||"").trim(); if(!label) return; await sb.from("bays").insert({ label, zone_id: selectedZone.id }); setNewBayLabel(""); loadBays(selectedZone.id); }}>Add Bay</Button>
                </div>
                <div className="grid gap-2">
                  {bays.map((b)=>(
                    <div key={b.id} className={`p-3 rounded-xl border dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between ${selectedBay?.id===b.id? 'ring-1 ring-blue-500/30':''}`}>
                      {editingBayId===b.id ? (
                        <div className="flex items-center gap-2">
                          <Input value={editBayLabel} onChange={(e)=>setEditBayLabel(e.target.value)} className="h-9" />
                          <Button size="sm" onClick={async ()=>{ await sb.from("bays").update({ label: (editBayLabel||"").trim() }).eq("id", b.id); setEditingBayId(null); setEditBayLabel(""); loadBays(selectedZone.id); }}>Save</Button>
                          <Button size="sm" variant="outline" onClick={()=>{ setEditingBayId(null); setEditBayLabel(""); }}>Cancel</Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="font-medium truncate">{b.label}</div>
                          <Button size="sm" variant="outline" onClick={()=>setSelectedBay(b)}>Select</Button>
                          <Button size="sm" variant="outline" onClick={()=>{ setEditingBayId(b.id); setEditBayLabel(b.label||""); }}>Edit</Button>
                          <Button size="sm" variant="destructive" onClick={async ()=>{
                            const { count: shelfCount } = await sb.from("shelfs").select("id", { count: "exact" }).eq("bay_id", b.id);
                            if ((shelfCount||0) > 0) { alert('Cannot delete bay with existing shelfs. Delete shelfs first.'); return; }
                            if (!confirm('Delete this bay?')) return;
                            await sb.from("bays").delete().eq("id", b.id);
                            if (selectedBay?.id===b.id) setSelectedBay(null);
                            loadBays(selectedZone.id);
                          }}>Delete</Button>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2">
                    <div className="text-xs text-neutral-500">Page {bPage} of {Math.max(1, Math.ceil((bTotal||0)/bPageSize))}</div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={()=>setBPage(p=>Math.max(1,p-1))} disabled={bPage<=1}>Previous</Button>
                      <Button size="sm" variant="outline" onClick={()=>setBPage(p=>p+1)} disabled={bPage>=Math.max(1, Math.ceil((bTotal||0)/bPageSize))}>Next</Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {selectedBay?.id && (
          <Card>
            <CardContent>
              <div className="py-3 space-y-3">
                <div className="font-medium">Shelfs in {selectedBay.label}</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <Input placeholder="Shelf label" value={newShelfLabel} onChange={(e)=>setNewShelfLabel(e.target.value)} />
                  <Button onClick={async ()=>{ const label=(newShelfLabel||"").trim(); if(!label) return; await sb.from("shelfs").insert({ label, bay_id: selectedBay.id }); setNewShelfLabel(""); loadShelfs(selectedBay.id); }}>Add Shelf</Button>
                </div>
                <div className="grid gap-2">
                  {shelfs.map((s)=>(
                    <div key={s.id} className="p-3 rounded-xl border dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between">
                      {editingShelfId===s.id ? (
                        <div className="flex items-center gap-2">
                          <Input value={editShelfLabel} onChange={(e)=>setEditShelfLabel(e.target.value)} className="h-9" />
                          <Button size="sm" onClick={async ()=>{ await sb.from("shelfs").update({ label: (editShelfLabel||"").trim() }).eq("id", s.id); setEditingShelfId(null); setEditShelfLabel(""); loadShelfs(selectedBay.id); }}>Save</Button>
                          <Button size="sm" variant="outline" onClick={()=>{ setEditingShelfId(null); setEditShelfLabel(""); }}>Cancel</Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="font-medium truncate">{s.label}</div>
                          <Button size="sm" variant="outline" onClick={()=>{ setEditingShelfId(s.id); setEditShelfLabel(s.label||""); }}>Edit</Button>
                          <Button size="sm" variant="destructive" onClick={async ()=>{ if (!confirm('Delete this shelf?')) return; await sb.from("shelfs").delete().eq("id", s.id); loadShelfs(selectedBay.id); }}>Delete</Button>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2">
                    <div className="text-xs text-neutral-500">Page {sPage} of {Math.max(1, Math.ceil((sTotal||0)/sPageSize))}</div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={()=>setSPage(p=>Math.max(1,p-1))} disabled={sPage<=1}>Previous</Button>
                      <Button size="sm" variant="outline" onClick={()=>setSPage(p=>p+1)} disabled={sPage>=Math.max(1, Math.ceil((sTotal||0)/sPageSize))}>Next</Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

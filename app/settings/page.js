"use client";
import { useEffect, useState } from "react";
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

  async function loadUsers() {
    try {
      const { data, error } = await sb.from("staff").select("id,name,role");
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error("Failed to load staff", err);
    }
  }
  useEffect(() => {
    loadUsers();
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

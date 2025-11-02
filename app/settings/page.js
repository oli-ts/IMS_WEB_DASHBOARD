"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase-browser";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";

export default function Settings() {
  const sb = supabaseBrowser();

  // Users
  const [users, setUsers] = useState([]);
  useEffect(() => {
    (async () => {
      const { data } = await sb.from("staff").select("id,name,role");
      setUsers(data || []);
    })();
  }, []);

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

  // Loaders
  async function loadWarehouses() {
    const { data } = await sb.from("warehouse").select("id, wh_number, name").order("wh_number");
    setWarehouses(data || []);
  }
  async function loadZones(warehouseId) {
    const { data } = await sb.from("zones").select("id,name").eq("warehouse_id", warehouseId).order("name");
    setZones(data || []);
  }
  async function loadBays(zoneId) {
    const { data } = await sb.from("bays").select("id,label").eq("zone_id", zoneId).order("label");
    setBays(data || []);
  }
  async function loadShelfs(bayId) {
    const { data } = await sb.from("shelfs").select("id,label").eq("bay_id", bayId).order("label");
    setShelfs(data || []);
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
  }, [selectedWarehouse]);

  useEffect(() => {
    if (selectedZone?.id) {
      loadBays(selectedZone.id);
    } else {
      setBays([]);
    }
    setSelectedBay(null);
    setShelfs([]);
  }, [selectedZone]);

  useEffect(() => {
    if (selectedBay?.id) {
      loadShelfs(selectedBay.id);
    } else {
      setShelfs([]);
    }
  }, [selectedBay]);

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
                          <Button size="sm" variant="destructive" onClick={async ()=>{ if (!confirm('Delete this warehouse and its contents?')) return; await sb.from("warehouse").delete().eq("id", w.id); if (selectedWarehouse?.id===w.id) setSelectedWarehouse(null); loadWarehouses(); }}>Delete</Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
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
                          <Button size="sm" variant="destructive" onClick={async ()=>{ if (!confirm('Delete this zone and its contents?')) return; await sb.from("zones").delete().eq("id", z.id); if (selectedZone?.id===z.id) setSelectedZone(null); loadZones(selectedWarehouse.id); }}>Delete</Button>
                        </div>
                      )}
                    </div>
                  ))}
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
                          <Button size="sm" variant="destructive" onClick={async ()=>{ if (!confirm('Delete this bay and its contents?')) return; await sb.from("bays").delete().eq("id", b.id); if (selectedBay?.id===b.id) setSelectedBay(null); loadBays(selectedZone.id); }}>Delete</Button>
                        </div>
                      )}
                    </div>
                  ))}
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
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}


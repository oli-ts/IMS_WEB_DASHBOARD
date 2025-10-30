"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../../../lib/supabase-browser";
import { Card, CardContent, CardHeader } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Select } from "../../../components/ui/select";
import { toast } from "sonner";

export default function VanNewClient() {
  const sb = supabaseBrowser();
  const router = useRouter();

  const [teams, setTeams] = useState([]);
  const [team, setTeam] = useState(null);
  const [reg, setReg] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [make, setMake] = useState("");
  const [vmodel, setVmodel] = useState(""); // 'model' name collides with import sometimes, so vmodel
  const [mot, setMot] = useState("");       // yyyy-mm-dd
  const [service, setService] = useState(""); // free text for now
  const [photoFile, setPhotoFile] = useState(null);
  const [preview, setPreview] = useState(null);



  useEffect(() => {
    (async () => {
      const { data } = await sb.from("teams").select("id,name").order("name");
      setTeams((data || []).map(t => ({ value: t.id, label: t.name })));
    })();
  }, [sb]);

  function validate() {
    const e = {};
    if (!reg.trim()) e.reg = "Registration is required";
    if (mot && isNaN(Date.parse(mot))) e.mot = "MOT date must be valid (YYYY-MM-DD)";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!validate()) { toast.error("Please fix the highlighted fields"); return; }
    try {
      setSubmitting(true);
         // Upload photo first (optional)
      let photo_url = null;
      if (photoFile) {
        const regSafe = reg.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
        const ext = (photoFile.name.split(".").pop() || "jpg").toLowerCase();
        const path = `items/${regSafe}/${Date.now()}.${ext}`;
        const { error: upErr } = await sb.storage.from("item-photos").upload(path, photoFile, {
          cacheControl: "3600",
          upsert: true,
          contentType: photoFile.type || "image/jpeg",
        });
        if (upErr) {
          console.warn(upErr);
          toast.warning("Photo upload failed — creating van without photo");
        } else {
          const { data: pub } = sb.storage.from("item-photos").getPublicUrl(path);
          photo_url = pub?.publicUrl || null;
        }
      }

      const payload = {
        reg_number: reg.trim().toUpperCase(),
        assigned_team_id: team?.value || null,
        notes: notes || null, // if your vans table has notes; remove if not
        make: make || null,
        model: vmodel || null,
        mot_date: mot ? mot : null,
        service_history: service || null,
        photo_url,
      };
      const { data, error } = await sb.from("vans").insert(payload).select("id").single();
      if (error) throw error;
      if (photo_url) {
        const { error: updErr } = await sb.from("vans").update({ photo_url }).eq("id", data.id);
        if (updErr) {
          console.warn(updErr);
          toast.warning("Van created but photo URL not saved");
        }
      }
      toast.success("Van created");
      router.replace(`/vans/${data.id}`);
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to create van");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Add New Van</h1>
      <Card>
        <CardHeader>Details</CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1 md:col-span-1">
              <div className="text-sm text-neutral-500">Registration*</div>
              <Input placeholder="e.g. CPG-TRK-03" value={reg} onChange={e => setReg(e.target.value)} />
              {errors.reg && <p className="text-xs text-red-600 mt-1">{errors.reg}</p>}
            </div>
             <div className="space-y-1 md:col-span-1">
              <div className="text-sm text-neutral-500">Make</div>
              <Input placeholder="e.g. Ford" value={make} onChange={e => setMake(e.target.value)} />
            </div>
            <div className="space-y-1 md:col-span-1">
              <div className="text-sm text-neutral-500">Model</div>
              <Input placeholder="e.g. Transit" value={vmodel} onChange={e => setVmodel(e.target.value)} />
            </div>
           <div className="space-y-1 md:col-span-1">
              <div className="text-sm text-neutral-500">MOT Date</div>
              <Input type="date" value={mot} onChange={e => setMot(e.target.value)} />
              {errors.mot && <p className="text-xs text-red-600 mt-1">{errors.mot}</p>}
            </div>
            <div className="space-y-1 md:col-span-1">
              <div className="text-sm text-neutral-500">Assigned Team</div>
              <Select items={teams} triggerLabel={team?.label || "Select team"} onSelect={setTeam} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <div className="text-sm text-neutral-500">Notes</div>
              <Input placeholder="(optional)" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
             <div className="space-y-1 md:col-span-2">
              <div className="text-sm text-neutral-500">Service History (free text)</div>
              <Input placeholder="e.g. 2025-01-14: Oil + filter; 2025-06-02: Brake pads" value={service} onChange={e => setService(e.target.value)} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <div className="text-sm text-neutral-500">Photo</div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setPhotoFile(f);
                  setPreview(f ? URL.createObjectURL(f) : null);
                }}
                className="block w-full text-sm"
              />
              <div className="mt-2 aspect-square rounded-xl overflow-hidden bg-neutral-100 border max-w-xs">
               {preview ? (
                  <img src={preview} alt="van preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full grid place-items-center text-xs text-neutral-400">No image</div>
                )}
              </div>
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => history.back()}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create Van"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '../../../lib/supabase-server.js';
import { Card, CardContent } from '../../../components/ui/card.js';

export default function VanDetail({ params }){
  const sb = supabaseBrowser();
  const [van, setVan] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [items, setItems] = useState([]);
  const [itemMap, setItemMap] = useState({});
  const [exceptions, setExceptions] = useState([]);
  const channelRef = useRef(null);

  // Initial load: van -> manifest -> items + exceptions (+ inventory enrichment)
  useEffect(()=>{(async()=>{
    const { data:vs } = await sb
      .from('vans')
      .select('id, reg_number, assigned_team_id, current_job_id, teams(name)')
      .eq('id', params.id)
      .single();
    setVan(vs||null);

    const { data:mans } = await sb
      .from('active_manifests')
      .select('id,status,created_at,job_id, jobs(name,address)')
      .eq('van_id', params.id)
      .in('status', ['pending','active'])
      .order('created_at', { ascending: false })
      .limit(1);
    const m = mans?.[0] || null;
    setManifest(m);

    if(!m){ setItems([]); setItemMap({}); setExceptions([]); return; }

    await reloadItemsAndEnrichment(sb, m.id, setItems, setItemMap);
    await reloadExceptions(sb, m.id, setExceptions);
  })()},[params.id]);

  // Realtime: manifest_items + exceptions for this manifest
  useEffect(()=>{
    if(!manifest?.id) return;

    if(channelRef.current){ sb.removeChannel(channelRef.current); channelRef.current = null; }
    const channel = sb
      .channel(`van-${params.id}-manifest-${manifest.id}`)
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'manifest_items', filter: `manifest_id=eq.${manifest.id}` },
          async () => { await reloadItemsAndEnrichment(sb, manifest.id, setItems, setItemMap); })
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'exceptions', filter: `manifest_id=eq.${manifest.id}` },
          async () => { await reloadExceptions(sb, manifest.id, setExceptions); })
      .subscribe();

    channelRef.current = channel;
    return () => { if(channelRef.current){ sb.removeChannel(channelRef.current); channelRef.current = null; } };
  }, [manifest?.id]);

  const onboard = useMemo(()=> items.filter(i =>
    (Number(i.qty_checked_out||0) - Number(i.qty_checked_in||0)) > 0
  ), [items]);

  // Per-van KPIs from manifest_items + exceptions
  const kpi = useMemo(()=>{
    const totals = items.reduce((acc,i)=>{
      acc.req += Number(i.qty_required||0);
      acc.out += Number(i.qty_checked_out||0);
      acc.in += Number(i.qty_checked_in||0);
      return acc;
    }, { req:0, out:0, in:0 });

    const onboardQty = Math.max(totals.out - totals.in, 0);
    const exTotal = exceptions.length;
    const exMissing = exceptions.filter(e => e.type === 'missing').length;
    const exDamaged = exceptions.filter(e => e.type === 'damaged').length;

    return {
      onboardQty,
      required: totals.req,
      checkedOut: totals.out,
      checkedIn: totals.in,
      exTotal,
      exMissing,
      exDamaged
    };
  }, [items, exceptions]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-neutral-500">Van</div>
          <div className="text-2xl font-semibold">{van?.reg_number || '—'}</div>
          <div className="text-sm">Team: {van?.teams?.name || '—'}</div>
        </div>
        {manifest && <Link href={`/manifests/${manifest.id}`} className="underline">Open manifest</Link>}
      </div>

      {/* KPI Row */}
      <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Onboard (qty)" value={kpi.onboardQty} />
        <Stat label="Required" value={kpi.required} />
        <Stat label="Checked Out" value={kpi.checkedOut} />
        <Stat label="Checked In" value={kpi.checkedIn} />
        <Stat label="Exceptions" value={kpi.exTotal} />
        <Stat label="Missing / Damaged" value={`${kpi.exMissing} / ${kpi.exDamaged}`} />
      </div>

      <Card>
        <CardContent>
          <div className="p-3">
            <div className="font-semibold mb-2">Assignment</div>
            <div className="text-sm">Job: {manifest?.jobs?.name || '—'}</div>
            <div className="text-sm">Status: {manifest?.status || 'idle'}</div>
            <div className="text-sm">Created: {manifest ? new Date(manifest.created_at).toLocaleString() : '—'}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="p-3">
            <div className="font-semibold mb-3">What's onboard</div>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {onboard.map(i => {
                const info = itemMap[i.item_uid];
                const out = Number(i.qty_checked_out||0);
                const inq = Number(i.qty_checked_in||0);
                return (
                  <div key={i.id} className="p-3 rounded-xl border dark:border-neutral-800 bg-white dark:bg-neutral-900">
                    <div className="text-sm text-neutral-500">{info?.classification || '—'}</div>
                    <div className="font-medium">{info?.name || i.item_uid}</div>
                    <div className="text-sm">UID: {i.item_uid}</div>
                    <div className="text-sm">Qty on van: {out - inq}</div>
                    <div className="text-xs text-neutral-500">Last seen: {info?.location_last_seen || '—'}</div>
                  </div>
                );
              })}
              {onboard.length === 0 && (
                <div className="text-sm text-neutral-500">No outstanding items on this van.</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }){
  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl border dark:border-neutral-800 p-3">
      <div className="text-sm text-neutral-500">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

async function reloadItemsAndEnrichment(sb, manifestId, setItems, setItemMap){
  const { data:mis } = await sb
    .from('manifest_items')
    .select('id,item_uid,qty_required,qty_checked_out,qty_checked_in,status')
    .eq('manifest_id', manifestId);
  setItems(mis||[]);
  const uids = Array.from(new Set((mis||[]).map(i => i.item_uid)));
  if(uids.length){
    const { data:inv } = await sb
      .from('inventory_union')
      .select('uid,name,classification,location_last_seen,status')
      .in('uid', uids);
    const map = Object.fromEntries((inv||[]).map(i => [i.uid, i]));
    setItemMap(map);
  } else {
    setItemMap({});
  }
}

async function reloadExceptions(sb, manifestId, setExceptions){
  const { data:ex } = await sb
    .from('exceptions')
    .select('id,type,item_uid,created_at')
    .eq('manifest_id', manifestId)
    .order('created_at', { ascending:false });
  setExceptions(ex||[]);
}

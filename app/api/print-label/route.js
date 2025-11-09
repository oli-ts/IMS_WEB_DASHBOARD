// app/api/print-label/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

function buildZpl(uid, name = '') {
  // simple, safe fallback ZPL
  return `^XA
^PW480
^LH10,10
^CF0,30
^FO10,10^FD${(name || '').slice(0,28)}^FS
^CF0,28
^FO10,50^FDUID: ${uid}^FS
^FO10,90^BQN,2,6^FDQA,CPG1|${uid}^FS
^XZ`;
}

async function supabaseService() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // REQUIRED
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req) {
  try {
    const { uid, zpl } = await req.json();
    if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 });

    const sb = await supabaseService();

    // Build ZPL: if none provided, try to fetch name with service role (bypasses RLS)
    let zplToPrint = (zpl || '').trim();
    if (!zplToPrint) {
      const { data, error } = await sb
        .from('inventory_union')
        .select('uid,name')
        .eq('uid', uid)
        .limit(1);
      // even if it errors / returns empty, we still print a generic label
      if (error) {
        console.error('[print-label] inventory_union select failed:', error.message);
      }
      const name = data?.[0]?.name || '';
      zplToPrint = buildZpl(uid, name);
    }

    // Queue the job (service role bypasses RLS)
    const { error: insErr } = await sb.from('label_print_jobs').insert({
      uid,
      zpl: zplToPrint,
      status: 'queued',
      source: 'web-dashboard',
    });
    if (insErr) {
      console.error('[print-label] insert failed:', insErr.message);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, via: 'queue' }, { status: 200 });
  } catch (e) {
    console.error('[print-label] fatal:', e?.message || e);
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}

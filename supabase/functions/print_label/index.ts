// supabase/functions/print_label/index.ts
// Deno runtime
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL  = Deno.env.get("SB_URL")  || Deno.env.get("SUPABASE_URL")!;
const SB_SVC  = Deno.env.get("SB_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PRINTER_HOST = Deno.env.get("PRINTER_HOST") || "";
const PRINTER_PORT = Number(Deno.env.get("PRINTER_PORT") || "9100");


// Optional: if you want to build ZPL here (instead of in Next.js), you can fetch item by uid:
async function fetchItem(uid: string) {
  const admin = createClient(SB_URL, SB_SVC, { auth: { persistSession: false } });
  const { data, error } = await admin.from("inventory_union").select("*").eq("uid", uid).limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

// Sends ZPL directly to a networked Zebra (RAW 9100)
async function sendToPrinterTcp(zpl: string) {
  if (!PRINTER_HOST) throw new Error("PRINTER_HOST not set");
  const conn = await Deno.connect({ hostname: PRINTER_HOST, port: PRINTER_PORT });
  const enc = new TextEncoder();
  try {
    await conn.write(enc.encode(zpl));
  } finally {
    try { conn.close(); } catch {}
  }
}

function safe(v) {
  try {
    return String(v ?? "").replace(/\^/g, " ").replace(/~/g, "-");
  } catch {
    return "";
  }
}

function fd(v) {
  // Sanitize for ^FD payloads
  return safe(v);
}

function formatAuditDate(d) {
  try {
    const date = typeof d === "string" || typeof d === "number" ? new Date(d) : d;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  } catch {
    return "";
  }};

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }
    const { uid, zpl, dpmm = "12dpmm", size = "2x1.25" } = await req.json();

    let finalZpl = zpl as string | undefined;

    // If ZPL not provided but uid is provided, you could build ZPL here by querying item.
    if (!finalZpl) {
      if (!uid) {
        return new Response(JSON.stringify({ error: "Provide uid or zpl" }), { status: 400 });
      }
      // Example: you could fetch item and construct ZPL here (left as a stub).
      const item = await fetchItem(uid);
      if (!item) return new Response(JSON.stringify({ error: "Item not found" }), { status: 404 });

    const qrPayload = `CPG1|${uid}|${item.classification}`;
    const auditDate = formatAuditDate(new Date());

      // Minimal fallback ZPL (replace with your real template if desired)
      finalZpl = 
    `^XA,
    ^CI28,
    ^PW608,
    ^LH0,0,
    ^FO10,10^BQN,2,6^FDLA,${fd(qrPayload)}^FS,
    ^FO190,25^A0N,28,28^FD${item.name}^FS,
    ^FO190,60^A0N,26,26^FD${uid}^FS,
    ^FO190,95^A0N,24,24^FD${item.classification}^FS,
    ^FO190,130^A0N,24,24^FDAudit: ${safe(auditDate)}^FS,
    "^XZ`;}


    // Option A) Direct to printer via TCP 9100
    await sendToPrinterTcp(finalZpl);

    // Option B) Instead of TCP, post to a print service API here (PrintNode, etc.)

    return new Response(JSON.stringify({ ok: true, job: { transport: "tcp9100", dpmm, size } }), { status: 200 });
  } catch (e) {
    console.error("print_label error:", e);
    return new Response(JSON.stringify({ error: e.message || "Print failed" }), { status: 500 });
  }
});

// app/api/label-preview/route.js
// Proxies ZPL to Labelary for PNG preview
export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { zpl, dpmm = "8dpmm", size = "2x1", index = "0" } = await req.json();
    if (!zpl) {
      return new Response(JSON.stringify({ ok: false, error: "Missing zpl" }), {
        status: 400,
      });
    }

    const url = `https://api.labelary.com/v1/printers/${dpmm}/labels/${size}/${index}/{zpl}`;
    // Use multipart/form-data upload (Labelary `file` field)
    const fd = new FormData();
    fd.append("file", new Blob([zpl], { type: "text/plain" }), "label.zpl");
    const res = await fetch(url, {
      method: "POST",
      headers: { Accept: "image/png" },
      body: fd,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // Bubble up Labelary's status if available for easier debugging
      return new Response(
        JSON.stringify({ ok: false, status: res.status, error: text }),
        { status: res.status || 502 }
      );
    }

    const ab = await res.arrayBuffer();
    return new Response(Buffer.from(ab), {
      status: 200,
      headers: { "Content-Type": "image/png" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err?.message || err) }),
      { status: 500 }
    );
  }
}

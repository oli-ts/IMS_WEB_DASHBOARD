// lib/zpl.js
// ZPL builder for 2in x 1.25in labels at 300dpi (~12dpmm)

export function buildZplForItem(item) {
  if (!item) return "";

  const uid = safe(item.uid || item.id || "");
  const name = safe(item.name || "");
  const cls = safe(item.classification || "");

  // Do NOT use internal warehouse_id. Prefer explicit codes; allow env default; otherwise blank.
  const warehouse = safe(
    item.wh_number ||
      item.warehouse_code ||
      (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_LABEL_WAREHOUSE_CODE) ||
      ""
  );

  // Build QR payload: CPG1|UID|WAREHOUSE|CLASS
  const qrPayload = `CPG1|${uid}|${cls}`;

  // Always use current date for audit line (yyyy-mm-dd)
  const auditDate = formatAuditDate(new Date());

  return [
    "^XA",
    "^CI28",
    "^PW608", // 2in at 300dpi ≈ 600 dots
    "^LH0,0",
    `^FO10,10^BQN,2,6^FDLA,${fd(qrPayload)}^FS`,
    `^FO190,25^A0N,28,28^FD${name}^FS`,
    `^FO190,60^A0N,26,26^FD${uid}^FS`,
    `^FO190,95^A0N,24,24^FD${cls}^FS`,
    `^FO190,130^A0N,24,24^FDAudit: ${safe(auditDate)}^FS`,
    "^XZ",
  ].join("\n");
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
  }
}

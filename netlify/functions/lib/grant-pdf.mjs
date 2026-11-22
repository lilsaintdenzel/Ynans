// Builds an A4 PDF of an Outreach Grant application with pdf-lib.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const GREEN = rgb(0, 0.42, 0.16);
const DARK = rgb(0.13, 0.15, 0.17);
const MUTED = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.85, 0.87, 0.9);
const A4 = [595.28, 841.89];
const M = 50; // page margin

// Section layout mirrors the form on grant.html.
const SECTIONS = [
  ["1. Event details", [["Event name", "event_name"], ["Date", "event_date"], ["Location", "location"], ["Mode", "mode"], ["Type of activity", "activity_type"]]],
  ["2. Chapter information", [["Chapter", "chapter"], ["YNAN chapter leadership", "chapter_leadership"], ["Ex-officio leadership", "ex_officio_leadership"], ["Previous outreaches", "previous_outreaches"]]],
  ["3. Purpose, strategy and abstract", [["Purpose", "purpose"], ["Event strategy", "event_strategy"], ["Abstract", "abstract"]]],
  ["4. Need, justification and attendance", [["Need / justification", "need_justification"], ["Target audience", "target_audience"], ["Expected attendance", "expected_attendance"]]],
  ["5. Agenda and geographical representation", [["Agenda", "agenda"], ["Geographical representation", "geographical_representation"]]],
  ["6. Expected outcomes", [["Expected outcome", "expected_outcome"]]],
  ["7. Itemised budget", "BUDGET"],
  ["8. Follow-up and documentation", [["Agreed to follow-up requirements", "follow_up_agreement"]]],
  ["9. Contact information", [["Full name", "contact_name"], ["Position in chapter", "contact_role"], ["Email", "contact_email"], ["Phone number", "contact_phone"], ["Supporting document", "attachment"]]],
];

export async function buildGrantPdf(payload, { logo } = {}) {
  const d = payload.data || {};
  const doc = await PDFDocument.create();
  doc.setTitle(`YNAN Outreach Grant Application - ${text(d.chapter)}`);
  doc.setAuthor("Youth Neuroscience Association of Nigeria");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const safe = (s, f = font) => [...String(s)].map((ch) => { try { f.encodeText(ch); return ch; } catch { return ch === "₦" ? "NGN " : "?"; } }).join("");

  let page, y;
  const newPage = () => { page = doc.addPage(A4); y = A4[1] - M; };
  const ensure = (h) => { if (y - h < M + 20) newPage(); };
  const write = (s, { f = font, size = 10.5, color = DARK, x = M, width = A4[0] - 2 * M, gap = 4 } = {}) => {
    for (const line of wrap(safe(s, f), f, size, width)) {
      ensure(size + gap);
      page.drawText(line, { x, y: y - size, size, font: f, color });
      y -= size + gap;
    }
  };

  // Header
  newPage();
  let logoImg = null;
  if (logo) { try { logoImg = await doc.embedPng(logo); } catch { logoImg = null; } }
  if (logoImg) {
    const h = 52, w = (logoImg.width / logoImg.height) * h;
    page.drawImage(logoImg, { x: M, y: y - h, width: w, height: h });
  }
  const tx = logoImg ? M + 70 : M;
  page.drawText("Youth Neuroscience Association of Nigeria (YNAN)", { x: tx, y: y - 16, size: 12, font: bold, color: GREEN });
  page.drawText("Outreach Grant Application", { x: tx, y: y - 38, size: 20, font: bold, color: DARK });
  y -= 66;
  const submitted = payload.created_at ? new Date(payload.created_at) : new Date();
  write(`Theme: Neuroclimate and Brain Health for the Youth: Understanding How Climate Change Affects the Brain. Grant: NGN 50,000 per successful chapter.`, { size: 9.5, color: MUTED });
  write(`Submitted: ${submitted.toUTCString()}${payload.id ? `   |   Reference: ${payload.id}` : ""}`, { size: 9.5, color: MUTED });
  y -= 6;
  page.drawRectangle({ x: M, y, width: A4[0] - 2 * M, height: 2, color: GREEN });
  y -= 14;

  for (const [title, fields] of SECTIONS) {
    ensure(60);
    y -= 8;
    write(title, { f: bold, size: 13, color: GREEN, gap: 6 });
    page.drawRectangle({ x: M, y: y + 2, width: A4[0] - 2 * M, height: 0.75, color: LINE });
    y -= 8;
    if (fields === "BUDGET") { budget(); continue; }
    for (const [label, key] of fields) {
      ensure(34);
      write(label, { f: bold, size: 10, color: MUTED, gap: 3 });
      for (const para of text(d[key] ?? d[`${key}[]`], key).split(/\r?\n/)) write(para || " ");
      y -= 6;
    }
  }

  function budget() {
    const cols = [M, M + 250, M + 320, M + 410]; // item, qty, unit cost, amount
    const right = A4[0] - M;
    const head = ["Costs and supplies", "Qty", "Unit cost", "Amount"];
    ensure(20);
    head.forEach((h, i) => page.drawText(h, { x: i === 3 ? right - bold.widthOfTextAtSize(h, 9.5) : cols[i], y: y - 9.5, size: 9.5, font: bold, color: MUTED }));
    y -= 18;
    let total = 0, rows = 0;
    for (let i = 1; i <= 20; i++) {
      const item = text(d[`budget_item_${i}`]);
      const qty = Number(d[`budget_qty_${i}`]) || 0, cost = Number(d[`budget_unit_cost_${i}`]) || 0;
      if (!item && !qty && !cost) continue;
      const amount = qty * cost; total += amount; rows++;
      const lines = wrap(safe(item || "-"), font, 10, 240);
      ensure(lines.length * 14 + 4);
      lines.forEach((l, k) => page.drawText(l, { x: cols[0], y: y - 10 - k * 14, size: 10, font, color: DARK }));
      page.drawText(String(qty), { x: cols[1], y: y - 10, size: 10, font, color: DARK });
      page.drawText(naira(cost), { x: cols[2], y: y - 10, size: 10, font, color: DARK });
      const a = naira(amount);
      page.drawText(a, { x: right - font.widthOfTextAtSize(a, 10), y: y - 10, size: 10, font, color: DARK });
      y -= lines.length * 14 + 6;
    }
    if (!rows) write("No budget items entered.", { color: MUTED });
    ensure(26);
    page.drawRectangle({ x: M, y, width: right - M, height: 1.2, color: DARK });
    y -= 6;
    const t = naira(total);
    page.drawText("TOTAL", { x: M, y: y - 12, size: 12, font: bold, color: DARK });
    page.drawText(t, { x: right - bold.widthOfTextAtSize(t, 12), y: y - 12, size: 12, font: bold, color: total > 50000 ? rgb(0.75, 0.22, 0.17) : DARK });
    y -= 24;
  }

  // Footer with page numbers
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const s = `YNAN Outreach Grant Application  |  ${safe(text(d.chapter))}  |  Page ${i + 1} of ${pages.length}`;
    p.drawText(s, { x: M, y: 26, size: 8, font, color: MUTED });
  });
  return doc.save();
}

function text(v, key) {
  if (v == null || v === "") return key ? "-" : "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return v.filename ? `${v.filename} (attached to the email)` : JSON.stringify(v);
  if (key === "follow_up_agreement") return v ? "Yes - the chapter agrees to complete all follow-up and documentation requirements." : "No";
  return String(v).trim() || (key ? "-" : "");
}
function naira(n) {
  return "NGN " + Math.round(n).toLocaleString("en-NG");
}
function wrap(s, font, size, width) {
  const out = [];
  for (const word of s.split(/\s+/).filter(Boolean)) {
    const last = out[out.length - 1];
    const tryLine = last ? `${last} ${word}` : word;
    if (last != null && font.widthOfTextAtSize(tryLine, size) <= width) { out[out.length - 1] = tryLine; continue; }
    // break very long words
    let w = word;
    while (font.widthOfTextAtSize(w, size) > width) {
      let k = w.length;
      while (k > 1 && font.widthOfTextAtSize(w.slice(0, k), size) > width) k--;
      out.push(w.slice(0, k)); w = w.slice(k);
    }
    out.push(w);
  }
  return out.length ? out : [""];
}

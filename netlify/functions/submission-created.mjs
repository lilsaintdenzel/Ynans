// Runs automatically after every Netlify Forms submission.
// For the "outreach-grant" form it builds a PDF of the application and
// emails it to YNAN.
//
// Netlify environment variables (Site configuration > Environment variables):
//   GMAIL_USER          Gmail address that sends the email (e.g. nationalynanneuroscience@gmail.com)
//   GMAIL_APP_PASSWORD  16-character Google app password for that account
//   GRANT_NOTIFY_EMAIL  (optional) where to send applications; defaults to GMAIL_USER

import nodemailer from "nodemailer";
import { buildGrantPdf } from "./lib/grant-pdf.mjs";

const FORM_NAME = "outreach-grant";

export const handler = async (event) => {
  let payload;
  try {
    payload = JSON.parse(event.body || "{}").payload;
  } catch {
    return { statusCode: 400, body: "Bad request" };
  }
  if (!payload || payload.form_name !== FORM_NAME || !payload.data) {
    return { statusCode: 200, body: "Ignored" };
  }

  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  const to = process.env.GRANT_NOTIFY_EMAIL || GMAIL_USER;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error("GMAIL_USER / GMAIL_APP_PASSWORD are not set; grant application PDF not emailed.");
    return { statusCode: 200, body: "Email not configured" };
  }

  const d = payload.data;
  const siteUrl = process.env.URL || payload.site_url || "";
  const logo = await fetchBytes(siteUrl && `${siteUrl}/image/png/ynan.png`, 2 * 1024 * 1024);
  const pdf = await buildGrantPdf(payload, { logo });

  const chapter = clean(d.chapter) || "Unknown chapter";
  const eventName = clean(d.event_name) || "Outreach";
  const fileName = `YNAN-Outreach-Grant-${slug(chapter)}-${(payload.created_at || new Date().toISOString()).slice(0, 10)}.pdf`;

  const attachments = [{ filename: fileName, content: Buffer.from(pdf), contentType: "application/pdf" }];
  const upload = d.attachment && typeof d.attachment === "object" ? d.attachment : null;
  if (upload && upload.url) {
    const bytes = await fetchBytes(upload.url, 8 * 1024 * 1024);
    if (bytes) attachments.push({ filename: upload.filename || "supporting-document", content: Buffer.from(bytes), contentType: upload.type });
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  await transporter.sendMail({
    from: `"YNAN Website" <${GMAIL_USER}>`,
    to,
    replyTo: isEmail(d.contact_email) ? d.contact_email : undefined,
    subject: `Outreach Grant Application: ${chapter} – ${eventName}`,
    text: [
      "A new YNAN Outreach Grant application has been submitted. The full application is attached as a PDF.",
      "",
      `Chapter: ${chapter}`,
      `Event: ${eventName}`,
      `Date: ${clean(d.event_date) || "-"}`,
      `Budget total: NGN ${Number(d.budget_total || 0).toLocaleString("en-NG")}`,
      `Contact: ${clean(d.contact_name) || "-"} (${clean(d.contact_email) || "-"}, ${clean(d.contact_phone) || "-"})`,
      "",
      "Reply to this email to contact the applicant.",
    ].join("\n"),
    attachments,
  });

  return { statusCode: 200, body: "Sent" };
};

function clean(v) {
  return String(Array.isArray(v) ? v.join(", ") : v ?? "").trim();
}
function slug(s) {
  return s.replace(/\([^)]*\)/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "chapter";
}
function isEmail(s) {
  return typeof s === "string" && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s);
}
async function fetchBytes(url, maxBytes) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.length <= maxBytes ? buf : null;
  } catch {
    return null;
  }
}

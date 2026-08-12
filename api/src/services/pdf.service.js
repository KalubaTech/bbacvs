// Generates a PDF certificate with the credential details and an embedded signed QR.
import PDFDocument from "pdfkit";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const BLUE = "#1f4e79";
const TEAL = "#14a098";
// ZAQA brand colours, matched to the official certificate sample + logo.
const ZAQA_BLUE = "#1C75BC";
const ZAQA_ORANGE = "#F58220";

// Bundled brand assets (drop the real files here to override the drawn fallbacks).
const ASSETS = fileURLToPath(new URL("../assets/", import.meta.url));
const ZAQA_LOGO = ASSETS + "zaqa-logo.png";
const COAT_GREY = ASSETS + "coat-of-arms-grey.png";
const asset = (p) => { try { return fs.existsSync(p) ? p : null; } catch { return null; } };

const CRED_TYPE_LABEL = {
  secondary: "Secondary School Certificate", diploma: "Diploma", degree: "Degree",
  masters: "Master's Degree", phd: "Doctor of Philosophy (PhD)", other: "Qualification",
};

/**
 * ZAQA "Certificate of Verification and Evaluation of Qualification" — the national
 * verification report. Mirrors the official layout; the QR carries a ZAQA-signed payload
 * (the raw signature is not printed, only encoded in the QR).
 * @param {object} data { holder, nationalId, zaqaRef, validatedAt, recognisedAs, title,
 *                         awardedOn, institution, zqfLevel, qrDataUrl, credentialHash }
 */
export function buildVerificationCertificatePDF(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;

    // --- Background watermark: Zambia coat of arms in grey (behind content) --
    drawCoatOfArmsWatermark(doc);

    // --- Border frame (blue outer + thin orange inner) --------------------
    const bm = 22;
    doc.save();
    doc.lineWidth(1.4).strokeColor(ZAQA_BLUE).rect(bm, bm, doc.page.width - 2 * bm, doc.page.height - 2 * bm).stroke();
    doc.lineWidth(0.5).strokeColor(ZAQA_ORANGE).rect(bm + 4, bm + 4, doc.page.width - 2 * (bm + 4), doc.page.height - 2 * (bm + 4)).stroke();
    doc.restore();

    // --- Header: ZAQA logo (or drawn fallback) + certificate title ---------
    const logo = asset(ZAQA_LOGO);
    if (logo) {
      // Preserve aspect ratio to a fixed height; the official logo already carries the wordmark.
      doc.image(logo, left, 46, { height: 46 });
    } else {
      drawLogoMark(doc, left, 46);
      doc.fillColor(ZAQA_BLUE).fontSize(22).font("Helvetica-Bold").text("ZQ", left + 44, 48);
      doc.fillColor(ZAQA_BLUE).fontSize(9).font("Helvetica").text("Zambia Qualifications Authority", left + 44, 74, { width: 150 });
    }
    doc.fillColor(ZAQA_BLUE).fontSize(14).font("Helvetica-Bold")
      .text("CERTIFICATE OF VERIFICATION", left, 50, { align: "right", width: right - left });
    doc.text("AND EVALUATION OF QUALIFICATION", left, 67, { align: "right", width: right - left });
    doc.moveTo(left, 105).lineTo(right, 105).strokeColor(ZAQA_ORANGE).lineWidth(1).stroke();

    doc.fillColor("#111").fontSize(11).font("Helvetica-Bold")
      .text("The Zambia Qualifications Authority Act, No. 8 of 2024", left, 120, { align: "center", width: right - left });

    // --- Key/value block --------------------------------------------------
    // Content sits inside a comfortable left indent from the border, matching the sample.
    const pad = left + 12;      // body left indent
    const valIndent = pad + 14; // values sit slightly indented under their bold label
    let y = 160;
    const row = (label, value) => {
      doc.font("Helvetica-Bold").fillColor("#111").fontSize(11).text(label, pad, y, { width: 190 });
      doc.font("Helvetica").fillColor("#222").fontSize(11).text(value || "—", pad + 195, y, { width: right - (pad + 195) });
      y += 22;
    };
    row("Qualification Holder:", data.holder);
    row("NRC/Passport ID:", data.nationalId);
    row("ZAQA Reference Number:", data.zaqaRef);
    row("Date of Validation:", data.validatedAt);
    y += 6;

    // Bold label flush at the body indent; its value on the next line, further indented.
    const para = (bold, normal, opts = {}) => {
      doc.font("Helvetica-Bold").fillColor("#111").fontSize(11).text(bold, pad, y, { width: right - pad });
      y = doc.y + 2;
      if (normal) {
        doc.font("Helvetica").fillColor("#222").fontSize(opts.big ? 13 : 11).text(normal, valIndent, y, { width: right - valIndent });
        y = doc.y + 8;
      }
    };
    para("Recognised Zambian Qualification:", data.recognisedAs, { big: true });
    para("This qualification bearing title of:", data.title, { big: true });
    para("has been validated as genuinely awarded to:", data.holder, { big: true });
    para("on:", data.awardedOn);
    para("by:", data.institution, { big: true });
    y += 6;

    para("A registered and recognised institution:",
      "By the Higher Education Authority established by the Higher Education Act No. 4 of 2013 of the Republic of Zambia.");
    para("This qualification is recognised in Zambia as:", data.recognisedAs);
    doc.font("Helvetica-Bold").fillColor("#111").fontSize(11)
      .text(`At Level ${data.zqfLevel ?? "—"} of the Zambia Qualifications Framework.`, pad, y, { width: right - pad });
    y = doc.y + 16;

    doc.fillColor(ZAQA_ORANGE).fontSize(10).font("Helvetica-Bold")
      .text("Issued by The Zambia Qualifications Authority", left, y, { align: "center", width: right - left });
    y = doc.y + 24;
    doc.fillColor(ZAQA_BLUE).fontSize(12).font("Helvetica-Bold").text("MERCY M. NGOMA", left, y, { align: "center", width: right - left });
    doc.fillColor(ZAQA_BLUE).fontSize(10).font("Helvetica-Oblique").text("Director General", left, doc.y, { align: "center", width: right - left });

    // --- Signed QR (bottom, centred) --------------------------------------
    if (data.qrDataUrl) {
      const img = Buffer.from(data.qrDataUrl.split(",")[1], "base64");
      const size = 110;
      const x = (doc.page.width - size) / 2;
      const qy = doc.page.height - 200;
      doc.image(img, x, qy, { width: size, height: size });
      doc.fillColor("#888").fontSize(8).font("Helvetica")
        .text("Digitally signed by ZAQA · scan to verify authenticity", left, qy + size + 4, { align: "center", width: right - left });
      // NOTE: the credential hash, IPFS CID, wallet and signature are deliberately NOT printed.
      // They live only inside the signed QR payload and the backend verification record.
    }

    doc.end();
  });
}

// Faint grey Zambia coat-of-arms watermark centred on the page (drawn before content).
// Falls back to a faint circular ZAQA seal if the coat-of-arms asset isn't present.
function drawCoatOfArmsWatermark(doc) {
  const coat = asset(COAT_GREY);
  if (coat) {
    // Large, faint, centred — spans nearly the full page like the official sample.
    const w = doc.page.width - 70;          // ~end-to-end within a small side gutter
    const h = w * (1112 / 960);             // preserve the coat-of-arms aspect ratio
    doc.save();
    doc.opacity(0.07);
    doc.image(coat, (doc.page.width - w) / 2, (doc.page.height - h) / 2, { width: w });
    doc.opacity(1).restore();
    return;
  }
  const cx = doc.page.width / 2, cy = doc.page.height / 2 + 30;
  doc.save().opacity(0.06);
  doc.lineWidth(3).strokeColor(BLUE).circle(cx, cy, 150).stroke();
  doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(46).text("ZAQA", cx - 150, cy - 24, { width: 300, align: "center" });
  doc.opacity(1).restore();
}

// Small teal rounded-square logo mark with "ZQ".
function drawLogoMark(doc, x, y) {
  doc.save();
  doc.roundedRect(x, y, 36, 36, 8).fill(TEAL);
  doc.fillColor("white").font("Helvetica-Bold").fontSize(16).text("ZQ", x, y + 9, { width: 36, align: "center" });
  doc.restore();
}

// Regulator identities stamped on the institutional accreditation certificate.
export const ACCREDITING_AUTHORITIES = {
  HEA: {
    abbr: "HEA",
    name: "HIGHER EDUCATION AUTHORITY",
    statement:
      "is a recognised higher-education institution accredited by the Higher Education Authority, established under the Higher Education Act No. 4 of 2013 of the Republic of Zambia, and is authorised to award qualifications on the national credential platform.",
    signatory: "Director — Higher Education Authority",
  },
  TEVETA: {
    abbr: "TEVETA",
    name: "TECHNICAL EDUCATION, VOCATIONAL AND\nENTREPRENEURSHIP TRAINING AUTHORITY",
    statement:
      "is a recognised technical education, vocational and entrepreneurship training institution accredited by the Technical Education, Vocational and Entrepreneurship Training Authority, established under the TEVET Act No. 13 of 1998 of the Republic of Zambia, and is authorised to award qualifications on the national credential platform.",
    signatory: "Director General — TEVETA",
  },
};

/**
 * Regulator institutional accreditation certificate (issued once the regulator approves an
 * institution). Defaults to the HEA identity for backwards compatibility.
 * @param {object} data { institution, approvedDate, programs: string[], ref, authority? }
 */
export function buildAccreditationCertificatePDF(data) {
  const authority = data.authority || ACCREDITING_AUTHORITIES.HEA;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    // Faint seal watermark
    const cx = doc.page.width / 2, cy = doc.page.height / 2 + 20;
    doc.save().opacity(0.06);
    doc.lineWidth(3).strokeColor(BLUE).circle(cx, cy, 150).stroke();
    doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(authority.abbr.length > 4 ? 28 : 40)
      .text(authority.abbr, cx - 150, cy - 20, { width: 300, align: "center" });
    doc.opacity(1).restore();

    doc.fillColor(BLUE).fontSize(20).font("Helvetica-Bold").text(authority.name, { align: "center" });
    doc.fillColor("#333").fontSize(12).font("Helvetica").text("Certificate of Institutional Accreditation", { align: "center" });
    doc.moveDown(0.4);
    doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor(TEAL).lineWidth(1).stroke();
    doc.moveDown(1.4);

    doc.fillColor("#111").fontSize(12).font("Helvetica").text("This certifies that", { align: "center" });
    doc.moveDown(0.5);
    doc.fillColor(BLUE).fontSize(22).font("Helvetica-Bold").text(data.institution || "—", { align: "center" });
    doc.moveDown(0.6);
    doc.fillColor("#111").fontSize(12).font("Helvetica").text(
      authority.statement,
      left, doc.y, { width, align: "center" }
    );
    doc.moveDown(1);

    if (data.programs?.length) {
      doc.fillColor("#111").font("Helvetica-Bold").fontSize(12).text("Accredited programmes:", left, doc.y, { width });
      doc.font("Helvetica").fontSize(11).fillColor("#222");
      for (const p of data.programs) doc.text(`•  ${p}`, left + 14, doc.y + 2, { width: width - 14 });
      doc.moveDown(0.6);
    }

    doc.font("Helvetica").fontSize(11).fillColor("#333");
    if (data.ref) doc.text(`Accreditation reference: ${data.ref}`, { align: "center" });
    if (data.approvedDate) doc.text(`Date of accreditation: ${data.approvedDate}`, { align: "center" });

    doc.moveDown(3);
    doc.fillColor(BLUE).fontSize(12).font("Helvetica-Bold").text(authority.signatory, { align: "center" });
    doc.fillColor("#555").fontSize(10).font("Helvetica-Oblique").text("Authorised signatory", { align: "center" });

    // Digitally signed QR (bottom, centred) — technical data lives only inside the QR.
    if (data.qrDataUrl) {
      const img = Buffer.from(data.qrDataUrl.split(",")[1], "base64");
      const size = 100;
      const qy = doc.page.height - 185;
      doc.image(img, (doc.page.width - size) / 2, qy, { width: size, height: size });
      doc.fillColor("#888").fontSize(8).font("Helvetica")
        .text(`Digitally signed by the ${authority.abbr} · scan to verify accreditation`, left, qy + size + 4, { align: "center", width });
    }

    doc.end();
  });
}

/**
 * Official payment receipt (billing module).
 * @param {object} r lean Receipt with populated invoice
 * @returns {Promise<Buffer>}
 */
export function buildReceiptPDF(r) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A5", layout: "landscape", margin: 42 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;

    doc.fillColor(BLUE).fontSize(18).font("Helvetica-Bold").text(r.issuedByOrg || "BBACVS", { align: "center" });
    doc.fillColor("#333").fontSize(11).font("Helvetica").text("Official Payment Receipt", { align: "center" });
    doc.moveDown(0.3);
    doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor(TEAL).lineWidth(1.5).stroke();
    doc.moveDown(0.8);

    const row = (label, value) => {
      const y = doc.y;
      doc.font("Helvetica").fontSize(10).fillColor("#555").text(label, left, y, { width: 130 });
      doc.font("Helvetica-Bold").fillColor("#111").text(value || "—", left + 140, y, { width: right - left - 140 });
      doc.moveDown(0.45);
    };
    row("Receipt number", r.number);
    row("Date", new Date(r.createdAt).toLocaleDateString("en-GB"));
    row("Received from", `${r.paidByName || ""} ${r.paidByEmail ? `<${r.paidByEmail}>` : ""}`.trim());
    row("For invoice", r.invoiceNumber);
    row("In respect of", r.description);
    row("Payment method", (r.method || "").replace(/_/g, " "));
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(15).fillColor(BLUE)
      .text(`Amount received: K${Number(r.amount).toLocaleString()} ${r.currency !== "ZMW" ? r.currency : ""}`.trim(), left);

    doc.font("Helvetica").fontSize(8).fillColor("#888").text(
      `Issued electronically by BBACVS on behalf of ${r.issuedByOrg || "ZAQA"} — no signature required. ` +
      "Validation fees are collected on behalf of the Zambia Qualifications Authority.",
      left, doc.page.height - 64, { width: right - left, align: "center" }
    );
    doc.end();
  });
}

/**
 * Simple academic transcript for a graduate at one institution.
 * @param {object} data { institution, cred, rows }
 */
export function buildTranscriptPDF({ institution, cred, rows }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;

    doc.fillColor(BLUE).fontSize(20).font("Helvetica-Bold").text(institution || "Institution", { align: "center" });
    doc.fillColor("#333").fontSize(12).font("Helvetica").text("Academic Transcript", { align: "center" });
    doc.moveDown(1.2);

    doc.fillColor("#111").fontSize(12).font("Helvetica-Bold").text(`Student: ${cred.subjectName || "—"}`);
    if (cred.holderNationalId) doc.font("Helvetica").fontSize(11).text(`NRC/Passport: ${cred.holderNationalId}`);
    doc.font("Helvetica").fontSize(10).fillColor("#555").text(`Holder DID: ${cred.holderDID || "—"}`);
    doc.moveDown(1);

    // Table header
    let y = doc.y;
    doc.font("Helvetica-Bold").fillColor("#111").fontSize(10);
    doc.text("Year", left, y, { width: 60 });
    doc.text("Qualification", left + 60, y, { width: 250 });
    doc.text("Type", left + 310, y, { width: 90 });
    doc.text("ZQF", left + 400, y, { width: 40 });
    doc.text("Status", left + 440, y, { width: right - left - 440 });
    y += 16;
    doc.moveTo(left, y).lineTo(right, y).strokeColor("#ccc").lineWidth(0.5).stroke();
    y += 6;

    doc.font("Helvetica").fillColor("#222").fontSize(10);
    for (const r of rows) {
      doc.text(String(r.graduationYear || "—"), left, y, { width: 60 });
      doc.text(r.qualification || "—", left + 60, y, { width: 250 });
      doc.text(CRED_TYPE_LABEL[r.credentialType] || r.credentialType || "—", left + 310, y, { width: 90 });
      doc.text(r.zqfLevel != null ? String(r.zqfLevel) : "—", left + 400, y, { width: 40 });
      doc.text((r.status || "active").toUpperCase(), left + 440, y, { width: right - left - 440 });
      y += 18;
      if (y > doc.page.height - 90) { doc.addPage(); y = doc.page.margins.top; }
    }

    doc.fillColor("#888").fontSize(8).text(
      "This transcript is generated from blockchain-anchored credentials. Verify each entry at bbacvs.kalootech.com/verify.",
      left, doc.page.height - 80, { align: "center", width: right - left }
    );
    doc.end();
  });
}

/**
 * @param {object} cred index record (subjectName, qualification, institution, etc.)
 * @param {string} qrDataUrl PNG data URL of the signed QR
 * @returns {Promise<Buffer>}
 */
export function buildCertificatePDF(cred, qrDataUrl) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const blue = "#1f4e79";

    // Header
    doc.fillColor(blue).fontSize(22).text(cred.institution || "Accredited Institution", { align: "center" });
    doc.moveDown(0.2);
    doc.fillColor("#333").fontSize(12).text("Verifiable Academic Credential", { align: "center" });
    doc.moveDown(1.5);

    // Body
    doc.fillColor("#111").fontSize(13);
    doc.text("This certifies that", { align: "center" });
    doc.moveDown(0.4);
    doc.fillColor(blue).fontSize(24).text(cred.subjectName || "—", { align: "center" });
    doc.moveDown(0.6);
    doc.fillColor("#111").fontSize(13).text("has been awarded the qualification of", { align: "center" });
    doc.moveDown(0.4);
    doc.fillColor(blue).fontSize(18).text(cred.qualification || "—", { align: "center" });
    if (cred.graduationYear) {
      doc.moveDown(0.4);
      doc.fillColor("#111").fontSize(13).text(`Graduation year: ${cred.graduationYear}`, { align: "center" });
    }
    doc.moveDown(2);

    // QR
    if (qrDataUrl) {
      const b64 = qrDataUrl.split(",")[1];
      const img = Buffer.from(b64, "base64");
      const size = 140;
      const x = (doc.page.width - size) / 2;
      doc.image(img, x, doc.y, { width: size, height: size });
      doc.moveDown(0.5);
      doc.y += size + 8;
    }
    doc.fillColor("#555").fontSize(9);
    doc.text("Scan the QR to verify online or offline. Blockchain-anchored (Ethereum Sepolia).", { align: "center" });
    doc.moveDown(0.6);
    doc.fillColor("#888").fontSize(7);
    doc.text(`Credential hash: ${cred.credentialHash}`, { align: "center" });
    doc.text(`IPFS CID: ${cred.cid}`, { align: "center" });
    doc.text(`Status: ${(cred.status || "active").toUpperCase()}`, { align: "center" });

    doc.end();
  });
}

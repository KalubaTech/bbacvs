// Billing — invoices & quotations, payments and receipts for graduates (individuals) and
// learning institutions. Manual workflow throughout:
//   • ZAQA/admin raises invoices/quotations for institutions (fee remittance) or graduates.
//   • An institution raises invoices for its graduates — validation fees collected on behalf
//     of ZAQA per the published fee schedule.
//   • The billed party declares a payment (method + reference); the biller confirms it, which
//     marks the invoice paid and issues the sequential receipt; or rejects it with a note.
import { Router } from "express";
import Joi from "joi";
import { validate } from "../middleware/security.js";
import { requireAuth, requireRole, ROLES } from "../middleware/auth.js";
import { Invoice, Payment, Receipt, Issuer, User, nextNumber } from "../models/index.js";
import { notifyEmail, notifyRole } from "../services/notify.service.js";
import { logActivity } from "../services/activity.service.js";
import { buildReceiptPDF } from "../services/pdf.service.js";

const router = Router();

// Published validation fee schedule (Instructions & fees page). Kept here as the single
// server-side source so invoice forms can pre-fill line items.
const FEE_SCHEDULE = [
  { code: "degree", qualification: "Degree (Bachelor's, Master's, PhD)", amount: 500 },
  { code: "diploma", qualification: "Diploma", amount: 200 },
  { code: "secondary", qualification: "G12 / G7 / G9, Form 4 and Form 6", amount: 50 },
];

// Roles that may raise bills: ZAQA/admin (national), institutions (on behalf of ZAQA).
const BILLER_ROLES = [ROLES.ZAQA, ROLES.ADMIN, ROLES.ISSUER];

function invoiceView(i) {
  return {
    id: i._id, number: i.number, kind: i.kind, status: i.status,
    billedToEmail: i.billedToEmail, billedToName: i.billedToName, billedToRole: i.billedToRole,
    issuedByOrg: i.issuedByOrg, issuedByEmail: i.issuedByEmail,
    lines: (i.lines || []).map((l) => ({ description: l.description, qty: l.qty, unitAmount: l.unitAmount })),
    total: i.total, currency: i.currency, dueDate: i.dueDate, note: i.note,
    relatedCredentialHash: i.relatedCredentialHash, createdAt: i.createdAt,
  };
}
function paymentView(p) {
  return {
    id: p._id, number: p.number, invoiceNumber: p.invoiceNumber, amount: p.amount,
    currency: p.currency, method: p.method, reference: p.reference, status: p.status,
    declaredByEmail: p.declaredByEmail, decisionNote: p.decisionNote, decidedAt: p.decidedAt,
    createdAt: p.createdAt,
  };
}
function receiptView(r) {
  return {
    id: r._id, number: r.number, invoiceNumber: r.invoiceNumber, amount: r.amount,
    currency: r.currency, method: r.method, paidByEmail: r.paidByEmail, paidByName: r.paidByName,
    issuedByOrg: r.issuedByOrg, description: r.description, createdAt: r.createdAt,
  };
}

/** The organisation name a biller acts for (ZAQA, or their institution). */
async function billerOrg(user) {
  if (user.role === ROLES.ISSUER) {
    const issuer = await Issuer.findById(user.issuerId).select("institution").lean();
    return issuer?.institution || "Institution";
  }
  return "ZAQA";
}

/** Whether this user is the biller side of an invoice (may confirm payments / cancel). */
function isBiller(user, invoice) {
  if (user.role === ROLES.ADMIN) return true;
  if (user.role === ROLES.ZAQA) return invoice.issuedByRole !== ROLES.ISSUER || invoice.issuedByEmail === user.email;
  if (user.role === ROLES.ISSUER) return String(invoice.issuerRef || "") === String(user.issuerId || "");
  return false;
}

// GET /api/billing/fees — the published validation fee schedule (public).
router.get("/fees", (_req, res) => res.json({ fees: FEE_SCHEDULE, currency: "ZMW" }));

// ---- invoices & quotations --------------------------------------------------

// POST /api/billing/invoices — raise an invoice or quotation.
const lineSchema = Joi.object({
  description: Joi.string().min(2).max(200).required(),
  qty: Joi.number().integer().min(1).max(1000).default(1),
  unitAmount: Joi.number().min(0).max(1_000_000).required(),
});
const createSchema = Joi.object({
  kind: Joi.string().valid("invoice", "quotation").default("invoice"),
  billedToEmail: Joi.string().email().required(),
  lines: Joi.array().items(lineSchema).min(1).max(20).required(),
  dueDate: Joi.date().optional(),
  note: Joi.string().max(400).allow("").optional(),
  relatedCredentialHash: Joi.string().max(80).allow("").optional(),
});
router.post("/invoices", requireAuth, requireRole(...BILLER_ROLES), validate(createSchema), async (req, res, next) => {
  try {
    const target = await User.findOne({ email: req.body.billedToEmail.toLowerCase() }).lean();
    if (!target) return res.status(404).json({ error: "No account with that email." });
    if (![ROLES.HOLDER, ROLES.ISSUER].includes(target.role)) {
      return res.status(400).json({ error: "Invoices can only be billed to graduates or institutions." });
    }
    // Institutions collect from graduates on behalf of ZAQA; they do not bill other institutions.
    if (req.user.role === ROLES.ISSUER && target.role !== ROLES.HOLDER) {
      return res.status(403).json({ error: "Institutions can only bill graduates (fees collected on behalf of ZAQA)." });
    }
    const total = req.body.lines.reduce((s, l) => s + (l.qty || 1) * l.unitAmount, 0);
    const inv = await Invoice.create({
      number: await nextNumber(req.body.kind === "quotation" ? "QTN" : "INV"),
      kind: req.body.kind,
      billedToEmail: target.email,
      billedToName: target.name,
      billedToRole: target.role,
      billedToIssuer: target.issuer || undefined,
      issuedByEmail: req.user.email,
      issuedByRole: req.user.role,
      issuedByOrg: await billerOrg(req.user),
      issuerRef: req.user.role === ROLES.ISSUER ? req.user.issuerId : undefined,
      lines: req.body.lines,
      total,
      dueDate: req.body.dueDate,
      note: req.body.note,
      relatedCredentialHash: req.body.relatedCredentialHash || undefined,
    });
    await notifyEmail(target.email, `New ${inv.kind} ${inv.number} for K${total} from ${inv.issuedByOrg}.`);
    await logActivity(req, { action: "billing.invoice.create", entity: "invoice", entityId: inv.number, summary: `Raised ${inv.kind} ${inv.number} (K${total}) to ${target.email}` });
    res.status(201).json({ invoice: invoiceView(inv) });
  } catch (err) { next(err); }
});

// GET /api/billing/invoices/mine — invoices & quotations billed to me.
router.get("/invoices/mine", requireAuth, async (req, res, next) => {
  try {
    const rows = await Invoice.find({ billedToEmail: req.user.email }).sort({ createdAt: -1 }).lean();
    res.json({ invoices: rows.map(invoiceView) });
  } catch (err) { next(err); }
});

// GET /api/billing/invoices/issued — invoices & quotations my side raised.
router.get("/invoices/issued", requireAuth, requireRole(...BILLER_ROLES), async (req, res, next) => {
  try {
    const filter = req.user.role === ROLES.ISSUER
      ? { issuerRef: req.user.issuerId }
      : { issuedByRole: { $ne: ROLES.ISSUER } }; // ZAQA/admin see national invoices
    const rows = await Invoice.find(filter).sort({ createdAt: -1 }).limit(300).lean();
    res.json({ invoices: rows.map(invoiceView) });
  } catch (err) { next(err); }
});

// POST /api/billing/invoices/:id/convert — quotation → invoice (biller side).
router.post("/invoices/:id/convert", requireAuth, requireRole(...BILLER_ROLES), async (req, res, next) => {
  try {
    const q = await Invoice.findById(req.params.id);
    if (!q) return res.status(404).json({ error: "Quotation not found" });
    if (!isBiller(req.user, q)) return res.status(403).json({ error: "This document was raised by another biller." });
    if (q.kind !== "quotation" || q.status !== "issued") {
      return res.status(400).json({ error: "Only an open quotation can be converted." });
    }
    const inv = await Invoice.create({
      ...q.toObject(), _id: undefined, createdAt: undefined, updatedAt: undefined,
      number: await nextNumber("INV"), kind: "invoice", status: "issued", convertedTo: undefined,
    });
    q.status = "converted";
    q.convertedTo = inv._id;
    await q.save();
    await notifyEmail(inv.billedToEmail, `Quotation ${q.number} is now invoice ${inv.number} (K${inv.total}).`);
    await logActivity(req, { action: "billing.invoice.convert", entity: "invoice", entityId: inv.number, summary: `Converted ${q.number} to ${inv.number}` });
    res.json({ invoice: invoiceView(inv) });
  } catch (err) { next(err); }
});

// POST /api/billing/invoices/:id/cancel — cancel an unpaid document (biller side).
router.post("/invoices/:id/cancel", requireAuth, requireRole(...BILLER_ROLES), async (req, res, next) => {
  try {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    if (!isBiller(req.user, inv)) return res.status(403).json({ error: "This document was raised by another biller." });
    if (inv.status !== "issued") return res.status(400).json({ error: `Cannot cancel a ${inv.status} document.` });
    inv.status = "cancelled";
    await inv.save();
    await notifyEmail(inv.billedToEmail, `${inv.kind === "quotation" ? "Quotation" : "Invoice"} ${inv.number} was cancelled.`);
    await logActivity(req, { action: "billing.invoice.cancel", entity: "invoice", entityId: inv.number, summary: `Cancelled ${inv.number}` });
    res.json({ invoice: invoiceView(inv) });
  } catch (err) { next(err); }
});

// ---- payments ---------------------------------------------------------------

// POST /api/billing/invoices/:id/pay — the billed party declares a payment.
const paySchema = Joi.object({
  method: Joi.string().valid("cash", "mobile_money", "bank_transfer", "card", "other").required(),
  reference: Joi.string().max(120).allow("").optional(),
});
router.post("/invoices/:id/pay", requireAuth, validate(paySchema), async (req, res, next) => {
  try {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    if (inv.billedToEmail !== req.user.email) return res.status(403).json({ error: "This invoice is not billed to you." });
    if (inv.kind !== "invoice") return res.status(400).json({ error: "A quotation cannot be paid — ask the biller to convert it to an invoice." });
    if (inv.status !== "issued") return res.status(400).json({ error: `Invoice is ${inv.status}.` });
    if (await Payment.findOne({ invoice: inv._id, status: "pending" })) {
      return res.status(409).json({ error: "A declared payment for this invoice is already awaiting confirmation." });
    }
    const p = await Payment.create({
      number: await nextNumber("PAY"),
      invoice: inv._id, invoiceNumber: inv.number,
      amount: inv.total, currency: inv.currency,
      method: req.body.method, reference: req.body.reference,
      declaredByEmail: req.user.email,
    });
    if (inv.issuedByEmail) await notifyEmail(inv.issuedByEmail, `Payment ${p.number} declared for invoice ${inv.number} (K${p.amount}) — please confirm.`);
    if (inv.issuedByRole !== ROLES.ISSUER) await notifyRole("zaqa", `Payment ${p.number} declared for invoice ${inv.number} (K${p.amount}).`);
    await logActivity(req, { action: "billing.payment.declare", entity: "payment", entityId: p.number, summary: `Declared payment ${p.number} for ${inv.number}` });
    res.status(201).json({ payment: paymentView(p) });
  } catch (err) { next(err); }
});

// GET /api/billing/payments/mine — payments I declared.
router.get("/payments/mine", requireAuth, async (req, res, next) => {
  try {
    const rows = await Payment.find({ declaredByEmail: req.user.email }).sort({ createdAt: -1 }).lean();
    res.json({ payments: rows.map(paymentView) });
  } catch (err) { next(err); }
});

// GET /api/billing/payments/received — payments on invoices my side raised.
router.get("/payments/received", requireAuth, requireRole(...BILLER_ROLES), async (req, res, next) => {
  try {
    const filter = req.user.role === ROLES.ISSUER
      ? { issuerRef: req.user.issuerId }
      : { issuedByRole: { $ne: ROLES.ISSUER } };
    const invoices = await Invoice.find(filter).select("_id").lean();
    const rows = await Payment.find({ invoice: { $in: invoices.map((i) => i._id) } })
      .sort({ createdAt: -1 }).limit(300).lean();
    res.json({ payments: rows.map(paymentView) });
  } catch (err) { next(err); }
});

// POST /api/billing/payments/:id/confirm — biller confirms; invoice → paid; receipt issued.
router.post("/payments/:id/confirm", requireAuth, requireRole(...BILLER_ROLES), async (req, res, next) => {
  try {
    const p = await Payment.findById(req.params.id).populate("invoice");
    if (!p) return res.status(404).json({ error: "Payment not found" });
    if (!isBiller(req.user, p.invoice)) return res.status(403).json({ error: "This payment belongs to another biller." });
    if (p.status !== "pending") return res.status(400).json({ error: `Payment already ${p.status}.` });

    p.status = "confirmed";
    p.decidedByEmail = req.user.email;
    p.decidedAt = new Date();
    await p.save();
    p.invoice.status = "paid";
    await p.invoice.save();

    const receipt = await Receipt.create({
      number: await nextNumber("RCT"),
      payment: p._id, invoice: p.invoice._id, invoiceNumber: p.invoice.number,
      amount: p.amount, currency: p.currency, method: p.method,
      paidByEmail: p.invoice.billedToEmail, paidByName: p.invoice.billedToName,
      issuedByOrg: p.invoice.issuedByOrg,
      description: (p.invoice.lines || []).map((l) => l.description).join("; "),
    });
    await notifyEmail(p.invoice.billedToEmail, `Payment confirmed — receipt ${receipt.number} issued for invoice ${p.invoice.number}.`);
    await logActivity(req, { action: "billing.payment.confirm", entity: "payment", entityId: p.number, summary: `Confirmed ${p.number}; issued receipt ${receipt.number}` });
    res.json({ payment: paymentView(p), receipt: receiptView(receipt) });
  } catch (err) { next(err); }
});

// POST /api/billing/payments/:id/reject — biller rejects a declared payment.
const rejectSchema = Joi.object({ note: Joi.string().max(300).allow("").optional() });
router.post("/payments/:id/reject", requireAuth, requireRole(...BILLER_ROLES), validate(rejectSchema), async (req, res, next) => {
  try {
    const p = await Payment.findById(req.params.id).populate("invoice");
    if (!p) return res.status(404).json({ error: "Payment not found" });
    if (!isBiller(req.user, p.invoice)) return res.status(403).json({ error: "This payment belongs to another biller." });
    if (p.status !== "pending") return res.status(400).json({ error: `Payment already ${p.status}.` });
    p.status = "rejected";
    p.decisionNote = req.body.note || "";
    p.decidedByEmail = req.user.email;
    p.decidedAt = new Date();
    await p.save();
    await notifyEmail(p.invoice.billedToEmail, `Payment ${p.number} for invoice ${p.invoice.number} was not confirmed${p.decisionNote ? `: ${p.decisionNote}` : "."}`);
    await logActivity(req, { action: "billing.payment.reject", entity: "payment", entityId: p.number, summary: `Rejected payment ${p.number}` });
    res.json({ payment: paymentView(p) });
  } catch (err) { next(err); }
});

// ---- receipts ---------------------------------------------------------------

// GET /api/billing/receipts/mine — receipts for payments I made.
router.get("/receipts/mine", requireAuth, async (req, res, next) => {
  try {
    const rows = await Receipt.find({ paidByEmail: req.user.email }).sort({ createdAt: -1 }).lean();
    res.json({ receipts: rows.map(receiptView) });
  } catch (err) { next(err); }
});

// GET /api/billing/receipts/issued — receipts my side issued.
router.get("/receipts/issued", requireAuth, requireRole(...BILLER_ROLES), async (req, res, next) => {
  try {
    const filter = req.user.role === ROLES.ISSUER
      ? { issuerRef: req.user.issuerId }
      : { issuedByRole: { $ne: ROLES.ISSUER } };
    const invoices = await Invoice.find(filter).select("_id").lean();
    const rows = await Receipt.find({ invoice: { $in: invoices.map((i) => i._id) } })
      .sort({ createdAt: -1 }).limit(300).lean();
    res.json({ receipts: rows.map(receiptView) });
  } catch (err) { next(err); }
});

// GET /api/billing/receipts/:id/pdf — printable official receipt (payer or biller side).
router.get("/receipts/:id/pdf", requireAuth, async (req, res, next) => {
  try {
    const r = await Receipt.findById(req.params.id).populate("invoice").lean();
    if (!r) return res.status(404).json({ error: "Receipt not found" });
    const allowed = r.paidByEmail === req.user.email
      || [ROLES.ZAQA, ROLES.ADMIN].includes(req.user.role)
      || (req.user.role === ROLES.ISSUER && String(r.invoice?.issuerRef || "") === String(req.user.issuerId || ""));
    if (!allowed) return res.status(403).json({ error: "Not your receipt" });
    const pdf = await buildReceiptPDF(r);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${r.number}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
});

export default router;

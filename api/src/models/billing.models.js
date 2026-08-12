// Billing (invoices & quotations, payments, receipts) — Tier-3 auxiliary records, like the rest
// of Mongo. Fees follow the published schedule (Instructions & fees): institutions collect
// validation fees from graduates on behalf of ZAQA and remit them under their ZAQA billing
// arrangement; ZAQA bills institutions directly. Everything is a MANUAL operation — a person
// raises the invoice, the payer declares payment, and the biller confirms it, which issues the
// receipt. Documents are never deleted: cancellation is a status, and numbers are sequential.
import mongoose from "mongoose";

// --- counters: sequential document numbers (INV-2026-0001, RCT-2026-0001, …) --
const counterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // e.g. "invoice-2026"
  seq: { type: Number, default: 0 },
});
export const Counter = mongoose.model("Counter", counterSchema);

/** Next sequential number for a prefix, scoped per year: PREFIX-YYYY-0001. */
export async function nextNumber(prefix) {
  const year = new Date().getFullYear();
  const c = await Counter.findOneAndUpdate(
    { key: `${prefix}-${year}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `${prefix}-${year}-${String(c.seq).padStart(4, "0")}`;
}

// --- invoices & quotations ---------------------------------------------------
// A quotation is a non-binding fee estimate; the biller converts it to an invoice.
const invoiceSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true, index: true },
    kind: { type: String, enum: ["invoice", "quotation"], default: "invoice" },

    // Who is billed (an account on the platform — graduate or institution officer).
    billedToEmail: { type: String, required: true, lowercase: true, index: true },
    billedToName: { type: String },
    billedToRole: { type: String, enum: ["holder", "issuer"], required: true },
    // For institution payers: which institution the bill is addressed to.
    billedToIssuer: { type: mongoose.Schema.Types.ObjectId, ref: "Issuer" },

    // Who raised it: ZAQA/admin, or an institution collecting on behalf of ZAQA.
    issuedByEmail: { type: String, lowercase: true },
    issuedByRole: { type: String },
    issuedByOrg: { type: String }, // "ZAQA" or the institution name
    issuerRef: { type: mongoose.Schema.Types.ObjectId, ref: "Issuer" }, // institution biller

    lines: [
      {
        description: { type: String, required: true },
        qty: { type: Number, default: 1, min: 1 },
        unitAmount: { type: Number, required: true, min: 0 }, // ZMW
      },
    ],
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "ZMW" },
    dueDate: { type: Date },
    note: { type: String },
    relatedCredentialHash: { type: String }, // optional link to the credential being validated

    // invoice: issued → paid | cancelled.  quotation: issued → converted | cancelled.
    status: { type: String, enum: ["issued", "paid", "cancelled", "converted"], default: "issued", index: true },
    convertedTo: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" }, // quotation → invoice
  },
  { timestamps: true }
);

// --- payments: payer-declared, biller-confirmed ------------------------------
const paymentSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true, index: true },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", required: true, index: true },
    invoiceNumber: { type: String },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "ZMW" },
    method: { type: String, enum: ["cash", "mobile_money", "bank_transfer", "card", "other"], required: true },
    reference: { type: String }, // payer's transaction / deposit reference
    declaredByEmail: { type: String, lowercase: true, index: true },
    // pending → the biller confirms (issues the receipt) or rejects (with a note).
    status: { type: String, enum: ["pending", "confirmed", "rejected"], default: "pending", index: true },
    decisionNote: { type: String },
    decidedByEmail: { type: String },
    decidedAt: { type: Date },
  },
  { timestamps: true }
);

// --- receipts: created only when the biller confirms a payment ---------------
const receiptSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true, index: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", required: true },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", required: true },
    invoiceNumber: { type: String },
    amount: { type: Number, required: true },
    currency: { type: String, default: "ZMW" },
    method: { type: String },
    paidByEmail: { type: String, lowercase: true, index: true },
    paidByName: { type: String },
    issuedByOrg: { type: String },
    description: { type: String },
  },
  { timestamps: true }
);

export const Invoice = mongoose.model("Invoice", invoiceSchema);
export const Payment = mongoose.model("Payment", paymentSchema);
export const Receipt = mongoose.model("Receipt", receiptSchema);

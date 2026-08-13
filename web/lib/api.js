// Client for the BBACVS API.
const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function request(path, { token, ...options } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    // Expired/invalid session on an authenticated call: sign out and return to login.
    if (res.status === 401 && token && typeof window !== "undefined") {
      const { clearAuth } = await import("./auth");
      clearAuth();
      window.location.assign("/login");
    }
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

export const api = {
  // auth
  register: (body) => request(`/api/auth/register`, { method: "POST", body: JSON.stringify(body) }),
  login: (email, password) =>
    request(`/api/auth/login`, { method: "POST", body: JSON.stringify({ email, password }) }),

  // account / profile (all roles)
  myProfile: (token) => request(`/api/auth/profile`, { token }),
  updateProfile: (token, body) =>
    request(`/api/auth/profile`, { token, method: "PATCH", body: JSON.stringify(body) }),
  changePassword: (token, currentPassword, newPassword) =>
    request(`/api/auth/change-password`, {
      token, method: "POST", body: JSON.stringify({ currentPassword, newPassword }),
    }),
  updateInstitutionProfile: (token, body) =>
    request(`/api/auth/institution-profile`, { token, method: "PATCH", body: JSON.stringify(body) }),

  // billing — invoices & quotations, payments, receipts
  feeSchedule: () => request(`/api/billing/fees`),
  createInvoice: (token, body) =>
    request(`/api/billing/invoices`, { token, method: "POST", body: JSON.stringify(body) }),
  myInvoices: (token) => request(`/api/billing/invoices/mine`, { token }),
  issuedInvoices: (token) => request(`/api/billing/invoices/issued`, { token }),
  convertQuotation: (token, id) =>
    request(`/api/billing/invoices/${id}/convert`, { token, method: "POST", body: "{}" }),
  cancelInvoice: (token, id) =>
    request(`/api/billing/invoices/${id}/cancel`, { token, method: "POST", body: "{}" }),
  payInvoice: (token, id, method, reference) =>
    request(`/api/billing/invoices/${id}/pay`, { token, method: "POST", body: JSON.stringify({ method, reference }) }),
  myPayments: (token) => request(`/api/billing/payments/mine`, { token }),
  receivedPayments: (token) => request(`/api/billing/payments/received`, { token }),
  confirmPayment: (token, id) =>
    request(`/api/billing/payments/${id}/confirm`, { token, method: "POST", body: "{}" }),
  rejectPayment: (token, id, note) =>
    request(`/api/billing/payments/${id}/reject`, { token, method: "POST", body: JSON.stringify({ note }) }),
  myReceipts: (token) => request(`/api/billing/receipts/mine`, { token }),
  issuedReceipts: (token) => request(`/api/billing/receipts/issued`, { token }),
  async receiptPDF(token, id) {
    const res = await fetch(`${BASE}/api/billing/receipts/${id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Could not load the receipt");
    return res.blob();
  },

  // NQF qualification registration workflow
  proposeQualification: (token, body) =>
    request(`/api/qualifications/propose`, { token, method: "POST", body: JSON.stringify(body) }),
  myQualifications: (token) => request(`/api/qualifications/workflow/mine`, { token }),
  qualificationInbox: (token) => request(`/api/qualifications/workflow/inbox`, { token }),
  recommendQualification: (token, id, note) =>
    request(`/api/qualifications/${id}/recommend`, { token, method: "POST", body: JSON.stringify({ note }) }),
  rejectQualification: (token, id, reason) =>
    request(`/api/qualifications/${id}/reject`, { token, method: "POST", body: JSON.stringify({ reason }) }),
  registerQualification: (token, id, body = {}) =>
    request(`/api/qualifications/${id}/register`, { token, method: "POST", body: JSON.stringify(body) }),
  searchQualifications: (params = "") => request(`/api/qualifications${params}`),
  qualificationHistory: (referenceId, token) =>
    request(`/api/qualifications/${encodeURIComponent(referenceId)}/history`, token ? { token } : {}),
  amendQualification: (token, id, changes, note) =>
    request(`/api/qualifications/${id}/amend`, { token, method: "POST", body: JSON.stringify({ changes, note }) }),
  qualificationLifecycle: (token, id, action, note) =>
    request(`/api/qualifications/${id}/lifecycle`, { token, method: "POST", body: JSON.stringify({ action, note }) }),

  // admin
  createIssuer: (token, body) =>
    request(`/api/admin/issuers`, { token, method: "POST", body: JSON.stringify(body) }),
  listIssuers: (token) => request(`/api/admin/issuers`, { token }),

  // issuer
  issuerProfile: (token) => request(`/api/credentials/issuer-profile`, { token }),
  issue: (token, body) =>
    request(`/api/credentials/issue`, { token, method: "POST", body: JSON.stringify(body) }),
  prepare: (token, body) =>
    request(`/api/credentials/prepare`, { token, method: "POST", body: JSON.stringify(body) }),
  finalize: (token, credentialHash, txHash) =>
    request(`/api/credentials/finalize`, {
      token, method: "POST", body: JSON.stringify({ credentialHash, txHash }),
    }),
  issuerProfileFull: (token) => request(`/api/credentials/issuer-profile`, { token }),
  myIssued: (token) => request(`/api/credentials/mine`, { token }),
  submitToZaqa: (token, hash) =>
    request(`/api/credentials/${hash}/submit`, { token, method: "POST", body: "{}" }),

  // programmes (institution)
  createProgramme: (token, body) =>
    request(`/api/programmes`, { token, method: "POST", body: JSON.stringify(body) }),
  myProgrammes: (token) => request(`/api/programmes/mine`, { token }),
  submitProgramme: (token, id) =>
    request(`/api/programmes/${id}/submit`, { token, method: "POST", body: "{}" }),
  // programmes (HEA)
  pendingProgrammes: (token) => request(`/api/programmes/pending`, { token }),
  approveProgramme: (token, id) =>
    request(`/api/programmes/${id}/approve`, { token, method: "POST", body: "{}" }),
  rejectProgramme: (token, id, reason) =>
    request(`/api/programmes/${id}/reject`, { token, method: "POST", body: JSON.stringify({ reason }) }),
  revoke: (token, credentialHash, reasonCode) =>
    request(`/api/credentials/revoke`, {
      token, method: "POST", body: JSON.stringify({ credentialHash, reasonCode }),
    }),

  // institution self-registration (public)
  registerInstitution: (body) =>
    request(`/api/institutions/register`, { method: "POST", body: JSON.stringify(body) }),

  // HEA — higher-education regulator
  heaInstitutions: (token) => request(`/api/hea/institutions`, { token }),
  heaPending: (token) => request(`/api/hea/pending`, { token }),
  heaRegister: (token, body) =>
    request(`/api/hea/institutions`, { token, method: "POST", body: JSON.stringify(body) }),
  heaApprove: (token, id) =>
    request(`/api/hea/institutions/${id}/approve`, { token, method: "POST", body: "{}" }),
  heaReject: (token, id, reason) =>
    request(`/api/hea/institutions/${id}/reject`, { token, method: "POST", body: JSON.stringify({ reason }) }),
  heaSetStatus: (token, id, heaStatus, note) =>
    request(`/api/hea/institutions/${id}/status`, {
      token, method: "PATCH", body: JSON.stringify({ heaStatus, note }),
    }),
  heaSetPrograms: (token, id, accreditedPrograms) =>
    request(`/api/hea/institutions/${id}/programs`, {
      token, method: "PATCH", body: JSON.stringify({ accreditedPrograms }),
    }),
  heaMonitoring: (token) => request(`/api/hea/monitoring`, { token }),

  // TEVETA — TEVET (technical/vocational) regulator
  tevetaInstitutions: (token) => request(`/api/teveta/institutions`, { token }),
  tevetaPending: (token) => request(`/api/teveta/pending`, { token }),
  tevetaRegister: (token, body) =>
    request(`/api/teveta/institutions`, { token, method: "POST", body: JSON.stringify(body) }),
  tevetaApprove: (token, id) =>
    request(`/api/teveta/institutions/${id}/approve`, { token, method: "POST", body: "{}" }),
  tevetaReject: (token, id, reason) =>
    request(`/api/teveta/institutions/${id}/reject`, { token, method: "POST", body: JSON.stringify({ reason }) }),
  tevetaSetStatus: (token, id, heaStatus, note) =>
    request(`/api/teveta/institutions/${id}/status`, {
      token, method: "PATCH", body: JSON.stringify({ heaStatus, note }),
    }),
  tevetaSetPrograms: (token, id, accreditedPrograms) =>
    request(`/api/teveta/institutions/${id}/programs`, {
      token, method: "PATCH", body: JSON.stringify({ accreditedPrograms }),
    }),
  tevetaMonitoring: (token) => request(`/api/teveta/monitoring`, { token }),
  async tevetaAccreditationCertificate(token, id) {
    const res = await fetch(`${BASE}/api/teveta/institutions/${id}/accreditation-certificate`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Could not generate accreditation certificate");
    return res.blob();
  },

  // ECZ — secondary regulator (approval side)
  eczInstitutions: (token) => request(`/api/ecz/institutions`, { token }),
  eczPending: (token) => request(`/api/ecz/pending`, { token }),
  eczApprove: (token, id) =>
    request(`/api/ecz/institutions/${id}/approve`, { token, method: "POST", body: "{}" }),
  eczReject: (token, id, reason) =>
    request(`/api/ecz/institutions/${id}/reject`, { token, method: "POST", body: JSON.stringify({ reason }) }),

  // ZAQA — national oversight & final validation
  zaqaRegistry: (token) => request(`/api/zaqa/registry`, { token }),
  zaqaSetTrust: (token, id, zaqaTrusted, note) =>
    request(`/api/zaqa/registry/${id}`, {
      token, method: "PATCH", body: JSON.stringify({ zaqaTrusted, note }),
    }),
  zaqaValidationList: (token, status) =>
    request(`/api/zaqa/validation${status ? `?status=${status}` : ""}`, { token }),
  zaqaSetValidation: (token, hash, body) =>
    request(`/api/zaqa/validation/${hash}`, { token, method: "PATCH", body: JSON.stringify(body) }),
  zaqaRevoke: (token, hash, reasonCode = 4) =>
    request(`/api/zaqa/validation/${hash}/revoke`, { token, method: "POST", body: JSON.stringify({ reasonCode }) }),
  zaqaSuspend: (token, hash, reason) =>
    request(`/api/zaqa/validation/${hash}/suspend`, { token, method: "POST", body: JSON.stringify({ reason }) }),
  zaqaReinstate: (token, hash, note) =>
    request(`/api/zaqa/validation/${hash}/reinstate`, { token, method: "POST", body: JSON.stringify({ note }) }),
  zaqaDisputes: (token) => request(`/api/zaqa/disputes`, { token }),
  zaqaResolveDispute: (token, hash) =>
    request(`/api/zaqa/disputes/${hash}`, { token, method: "PATCH", body: JSON.stringify({}) }),
  zaqaOverview: (token) => request(`/api/zaqa/overview`, { token }),

  // audit trail (governance)
  audit: (token) => request(`/api/audit`, { token }),

  // activity / accountability trail (governance)
  activity: (token, prefix) => request(`/api/activity${prefix ? `?prefix=${prefix}` : ""}`, { token }),

  // disputes (category-routed)
  openDispute: (token, body) => request(`/api/disputes`, { token, method: "POST", body: JSON.stringify(body) }),
  myDisputes: (token) => request(`/api/disputes/mine`, { token }),
  disputeQueue: (token) => request(`/api/disputes/queue`, { token }),
  resolveDispute: (token, id, resolution) =>
    request(`/api/disputes/${id}/resolve`, { token, method: "PATCH", body: JSON.stringify({ resolution }) }),
  setDisputeStatus: (token, id, status, note) =>
    request(`/api/disputes/${id}/status`, { token, method: "PATCH", body: JSON.stringify({ status, note }) }),
  decideDispute: (token, id, outcome, resolution) =>
    request(`/api/disputes/${id}/decide`, { token, method: "POST", body: JSON.stringify({ outcome, resolution }) }),
  appealDispute: (token, id, reason) =>
    request(`/api/disputes/${id}/appeal`, { token, method: "POST", body: JSON.stringify({ reason }) }),
  decideDisputeAppeal: (token, id, outcome, resolution) =>
    request(`/api/disputes/${id}/appeal/decide`, { token, method: "POST", body: JSON.stringify({ outcome, resolution }) }),

  // notifications
  myNotifications: (token) => request(`/api/notifications`, { token }),
  markNotificationsRead: (token) => request(`/api/notifications/read`, { token, method: "POST", body: "{}" }),

  // user management (governance)
  listUsers: (token) => request(`/api/users`, { token }),
  createUser: (token, body) => request(`/api/users`, { token, method: "POST", body: JSON.stringify(body) }),
  deleteUser: (token, id) => request(`/api/users/${id}`, { token, method: "DELETE" }),

  // holder
  myCredentials: (token) => request(`/api/credentials/holder`, { token }),
  requestCorrection: (token, hash, message) =>
    request(`/api/credentials/${hash}/request-correction`, {
      token, method: "POST", body: JSON.stringify({ message }),
    }),
  myVerificationActivity: (token) => request(`/api/credentials/verifications/mine`, { token }),

  // credential lifecycle (suspension / reinstatement / supersession)
  suspendCredential: (token, hash, reason) =>
    request(`/api/credentials/${hash}/suspend`, { token, method: "POST", body: JSON.stringify({ reason }) }),
  reinstateCredential: (token, hash, note) =>
    request(`/api/credentials/${hash}/reinstate`, { token, method: "POST", body: JSON.stringify({ note }) }),
  supersedeCredential: (token, hash, corrections) =>
    request(`/api/credentials/${hash}/supersede`, { token, method: "POST", body: JSON.stringify(corrections) }),

  // recognition workflows (RPL / credit transfer / progression / foreign / micro-credential)
  createRecognitionCase: (token, body) =>
    request(`/api/recognition`, { token, method: "POST", body: JSON.stringify(body) }),
  myRecognitionCases: (token) => request(`/api/recognition/mine`, { token }),
  recognitionQueue: (token, params = "") => request(`/api/recognition/queue${params}`, { token }),
  recognitionCase: (token, id) => request(`/api/recognition/${id}`, { token }),
  setRecognitionStatus: (token, id, status, note) =>
    request(`/api/recognition/${id}/status`, { token, method: "PATCH", body: JSON.stringify({ status, note }) }),
  addRecognitionEvidence: (token, id, body) =>
    request(`/api/recognition/${id}/evidence`, { token, method: "POST", body: JSON.stringify(body) }),
  decideRecognitionCase: (token, id, body) =>
    request(`/api/recognition/${id}/decide`, { token, method: "POST", body: JSON.stringify(body) }),
  withdrawRecognitionCase: (token, id) =>
    request(`/api/recognition/${id}/withdraw`, { token, method: "POST", body: "{}" }),

  // NQF knowledge base (public reads)
  nqfFrameworks: () => request(`/api/nqf/frameworks`),
  nqfCurrentFramework: () => request(`/api/nqf/frameworks/current`),
  nqfLevel: (level) => request(`/api/nqf/levels/${level}`),
  nqfProgression: () => request(`/api/nqf/progression`),

  // credential digitization applications
  approvedInstitutions: () => request(`/api/institutions`),
  applyDigitization: (token, body) =>
    request(`/api/applications`, { token, method: "POST", body: JSON.stringify(body) }),
  myApplications: (token) => request(`/api/applications/mine`, { token }),
  incomingApplications: (token) => request(`/api/applications/incoming`, { token }),
  verifyIssueApplication: (token, id) =>
    request(`/api/applications/${id}/verify-issue`, { token, method: "POST", body: "{}" }),
  rejectApplication: (token, id, reason) =>
    request(`/api/applications/${id}/reject`, { token, method: "POST", body: JSON.stringify({ reason }) }),
  setApplicationStatus: (token, id, status, note) =>
    request(`/api/applications/${id}/status`, { token, method: "PATCH", body: JSON.stringify({ status, note }) }),
  withdrawApplication: (token, id) =>
    request(`/api/applications/${id}/withdraw`, { token, method: "POST", body: "{}" }),
  addApplicationEvidence: (token, id, body) =>
    request(`/api/applications/${id}/evidence`, { token, method: "POST", body: JSON.stringify(body) }),
  async applicationDocument(token, id) {
    const res = await fetch(`${BASE}/api/applications/${id}/document`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Could not load the uploaded document");
    return res.blob();
  },

  // verify (public)
  verifyOnline: (hash) => request(`/api/verify/${hash}`),
  verifyOffline: (payload, issuerPubKey) =>
    request(`/api/verify/offline`, { method: "POST", body: JSON.stringify({ payload, issuerPubKey }) }),
  issuerKeys: () => request(`/api/verify/issuer-keys`),

  // qr
  getQR: (token, hash) => request(`/api/credentials/${hash}/qr`, { token }),

  // pdf — returns a Blob (auth header can't ride on a plain <a href>)
  async downloadPDF(token, hash) {
    const res = await fetch(`${BASE}/api/credentials/${hash}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("PDF download failed");
    return res.blob();
  },

  // academic transcript PDF (issuer/ECZ) — Blob
  async downloadTranscript(token, hash) {
    const res = await fetch(`${BASE}/api/credentials/${hash}/transcript`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Transcript download failed");
    return res.blob();
  },

  // ZAQA verification certificate PDF (public) — Blob; 403 until ZAQA-validated
  async downloadVerificationCertificate(hash) {
    const res = await fetch(`${BASE}/api/verify/${hash}/certificate`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Certificate not available" }));
      throw new Error(err.error || "Certificate not available");
    }
    return res.blob();
  },

  // accreditation document view (regulator reviewer) — Blob; portal = "hea" | "teveta" | "ecz"
  async accreditationDoc(token, portal, id) {
    const res = await fetch(`${BASE}/api/${portal}/institutions/${id}/accreditation`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Could not load accreditation document");
    return res.blob();
  },

  // HEA accreditation certificate — institution downloads its own
  async myAccreditationCertificate(token) {
    const res = await fetch(`${BASE}/api/credentials/accreditation-certificate`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Not available" }));
      throw new Error(err.error || "Not available");
    }
    return res.blob();
  },
  // HEA accreditation certificate — HEA/admin for a given institution
  async heaAccreditationCertificate(token, id) {
    const res = await fetch(`${BASE}/api/hea/institutions/${id}/accreditation-certificate`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Could not generate accreditation certificate");
    return res.blob();
  },
};

// Helper: trigger a browser download / open for a Blob.
export function openBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  if (filename) {
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
  } else {
    window.open(url, "_blank");
  }
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

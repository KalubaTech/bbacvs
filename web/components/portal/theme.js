// Per-portal theme + navigation config for the BBACVS portal suite.
// Navigation is grouped into the five regulatory areas:
// Governance · Qualifications · Recognition · Credential Trust · Administration.
// Every href must point at a real page — no "#" placeholders.

export const PORTALS = {
  zaqa: {
    id: "zaqa",
    brand: "BBACVS",
    brandSub: "ZAQA PORTAL",
    subClass: "text-emerald-400",
    sidebar: "bg-[#0d1b3a]",
    active: "bg-white/10 text-white",
    accentBtn: "bg-[#12275c] hover:bg-[#1b3576] text-white",
    chip: { label: "ZAQA Admin", cls: "border-blue-200 bg-blue-50 text-blue-700" },
    search: "Search applications, institutions, users...",
    bellHref: "/zaqa/notifications",
    org: {
      title: "Zambia Qualifications Authority (ZAQA)",
      tagline: "Building Trust in Qualifications",
    },
    nav: [
      {
        heading: "Governance",
        items: [
          { label: "Dashboard", icon: "dashboard", href: "/zaqa/dashboard", id: "dashboard" },
          { label: "Case Management", icon: "apps", href: "/zaqa/applications", id: "applications" },
          { label: "Audit & History", icon: "audit", href: "/zaqa/audit", id: "audit" },
        ],
      },
      {
        heading: "Qualifications",
        items: [
          { label: "National Register", icon: "registry", href: "/zaqa/register", id: "register" },
          { label: "Registration Applications", icon: "clipboardCheck", href: "/zaqa/qualifications", id: "qualifications" },
          { label: "NQF Framework", icon: "scale", href: "/zaqa/nqf", id: "nqf" },
        ],
      },
      {
        heading: "Recognition",
        items: [
          { label: "RPL & Credit Transfer", icon: "award", href: "/zaqa/recognition", id: "recognition" },
        ],
      },
      {
        heading: "Credential Trust",
        items: [
          { label: "Validation Queue", icon: "queue", href: "/zaqa/validation", id: "validation" },
          { label: "Disputes & Appeals", icon: "clock", href: "/zaqa/disputes", id: "disputes" },
          { label: "Suspensions", icon: "user", href: "/zaqa/suspensions", id: "suspensions" },
          { label: "Revocations", icon: "revoke", href: "/zaqa/revocations", id: "revocations" },
        ],
      },
      {
        heading: "Administration",
        items: [
          { label: "User Management", icon: "users", href: "/zaqa/users", id: "users" },
          { label: "Notifications", icon: "bell", href: "/zaqa/notifications", id: "notifications" },
          { label: "Settings", icon: "settings", href: "/account", id: "settings" },
        ],
      },
    ],
  },

  hea: {
    id: "hea",
    brand: "BBACVS",
    brandSub: "HEA PORTAL",
    subClass: "text-teal-300",
    sidebar: "bg-[#101a38]",
    active: "bg-white/10 text-white",
    accentBtn: "bg-[#101a38] hover:bg-[#1a2a54] text-white",
    chip: { label: "HEA Admin", cls: "border-blue-200 bg-blue-50 text-blue-700" },
    search: "Search institutions, programmes, officers, cases...",
    bellHref: "/hea/notifications",
    org: {
      title: "Higher Education Authority",
      sub: "Republic of Zambia",
      tagline: "Regulating Quality, Advancing Excellence.",
    },
    nav: [
      {
        heading: "Governance",
        items: [
          { label: "Dashboard", icon: "dashboard", href: "/hea/dashboard", id: "dashboard" },
          { label: "Regulatory Cases", icon: "scale", href: "/hea/cases", id: "cases" },
          { label: "Compliance", icon: "clipboardCheck", href: "/hea/compliance", id: "compliance" },
          { label: "Enforcement & Sanctions", icon: "bell", href: "/hea/enforcement", id: "enforcement" },
        ],
      },
      {
        heading: "Qualifications",
        items: [
          { label: "Registration Applications", icon: "clipboard", href: "/hea/qualifications", id: "qualifications" },
          { label: "Programme Accreditation", icon: "registry", href: "/hea/programmes", id: "programmes" },
        ],
      },
      {
        heading: "Credential Trust",
        items: [
          { label: "Evidence for ZAQA", icon: "fileText", href: "/hea/evidence", id: "evidence" },
          { label: "Disputes", icon: "clock", href: "/hea/disputes", id: "disputes" },
        ],
      },
      {
        heading: "Administration",
        items: [
          { label: "Institutions & Accreditation", icon: "bank", href: "/hea/institutions", id: "institutions" },
          { label: "Users & Officers", icon: "users", href: "/hea/users", id: "users" },
          { label: "Settings", icon: "settings", href: "/account", id: "settings" },
        ],
      },
    ],
  },

  ecz: {
    id: "ecz",
    brand: "BBACVS",
    brandSub: "ECZ PORTAL",
    subClass: "text-emerald-300",
    sidebar: "bg-[#0a3d2c]",
    active: "bg-emerald-600 text-white",
    accentBtn: "bg-emerald-600 hover:bg-emerald-700 text-white",
    chip: { label: "ECZ Admin", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    search: "Search learners, NRC, certificates, ZAQA requests...",
    bellHref: "/ecz/notifications",
    org: {
      title: "Examinations Council of Zambia",
      tagline: "Quality Assessments. Trusted Credentials.",
    },
    nav: [
      {
        heading: "Governance",
        items: [
          { label: "Dashboard", icon: "dashboard", href: "/ecz/dashboard", id: "dashboard" },
          { label: "Audit & Reports", icon: "chart", href: "/ecz/audit", id: "audit" },
        ],
      },
      {
        heading: "Qualifications",
        items: [
          { label: "Certificate Register", icon: "registry", href: "/ecz/certificates", id: "certificates" },
          { label: "Registration Applications", icon: "clipboard", href: "/ecz/qualifications", id: "qualifications" },
        ],
      },
      {
        heading: "Credential Trust",
        items: [
          { label: "ZAQA Verification Requests", icon: "shieldCheck", href: "/ecz/requests", id: "requests" },
          { label: "Disputes & Corrections", icon: "clock", href: "/ecz/disputes", id: "disputes" },
        ],
      },
      {
        heading: "Administration",
        items: [
          { label: "Learner Records", icon: "users", href: "/ecz/learners", id: "learners" },
          { label: "User Roles", icon: "user", href: "/ecz/users", id: "users" },
          { label: "Settings", icon: "settings", href: "/account", id: "settings" },
        ],
      },
    ],
  },

  teveta: {
    id: "teveta",
    brand: "BBACVS",
    brandSub: "TEVETA PORTAL",
    subClass: "text-orange-400",
    sidebar: "bg-[#131c3a]",
    active: "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow",
    accentBtn: "bg-orange-500 hover:bg-orange-600 text-white",
    chip: { label: "TEVETA Admin", cls: "border-blue-200 bg-blue-50 text-blue-700" },
    search: "Search institutions, programmes, qualifications...",
    bellHref: "/teveta/notifications",
    org: {
      title: "Technical Education, Vocational and Entrepreneurship Training Authority",
      sub: "Republic of Zambia",
      tagline: "Skilling Zambia, Enabling Prosperity.",
    },
    nav: [
      {
        heading: "Governance",
        items: [
          { label: "Dashboard", icon: "dashboard", href: "/teveta/dashboard", id: "dashboard" },
        ],
      },
      {
        heading: "Qualifications",
        items: [
          { label: "Qualifications Registry", icon: "registry", href: "/teveta/qualifications", id: "qualifications" },
          { label: "Programme Accreditation", icon: "award", href: "/teveta/programmes", id: "programmes" },
        ],
      },
      {
        heading: "Recognition",
        items: [
          { label: "RPL Applications", icon: "checkCircle", href: "/teveta/rpl", id: "rpl" },
        ],
      },
      {
        heading: "Credential Trust",
        items: [
          { label: "Certification Records", icon: "file", href: "/teveta/certification", id: "certification" },
          { label: "Disputes", icon: "clock", href: "/teveta/disputes", id: "disputes" },
        ],
      },
      {
        heading: "Administration",
        items: [
          { label: "Users & Officers", icon: "users", href: "/teveta/users", id: "users" },
          { label: "Settings", icon: "settings", href: "/account", id: "settings" },
        ],
      },
    ],
  },

  institution: {
    id: "institution",
    brand: "BBACVS",
    brandSub: "INSTITUTION PORTAL",
    subClass: "text-emerald-300",
    sidebar: "bg-[#0c2b4a]",
    active: "bg-blue-600 text-white",
    accentBtn: "bg-blue-600 hover:bg-blue-700 text-white",
    chip: { label: "Institution", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    search: "Search credentials, applications, programmes...",
    bellHref: "/institution/notifications",
    org: {
      title: "Accredited Institution",
      tagline: "Issue trusted, blockchain-anchored credentials.",
    },
    nav: [
      {
        heading: "Overview",
        items: [
          { label: "Dashboard", icon: "dashboard", href: "/institution", id: "dashboard" },
        ],
      },
      {
        heading: "Qualifications",
        items: [
          { label: "Qualification Proposals", icon: "clipboard", href: "/institution/qualifications", id: "qualifications" },
          { label: "Programmes", icon: "registry", href: "/institution/programmes", id: "programmes" },
        ],
      },
      {
        heading: "Credential Trust",
        items: [
          { label: "Credential Issuance", icon: "award", href: "/issuer/classic", id: "issuance" },
          { label: "Graduate Applications", icon: "apps", href: "/institution/applications", id: "applications" },
          { label: "Evidence & ZAQA Requests", icon: "fileText", href: "/institution/evidence", id: "evidence" },
          { label: "Disputes & Corrections", icon: "edit", href: "/institution/disputes", id: "disputes" },
        ],
      },
      {
        heading: "Administration",
        items: [
          { label: "Billing & Invoices", icon: "file", href: "/billing", id: "billing" },
          { label: "Settings", icon: "settings", href: "/account", id: "settings" },
        ],
      },
    ],
  },

  graduate: {
    id: "graduate",
    brand: "BBACVS",
    brandSub: "GRADUATE PORTAL",
    subClass: "text-emerald-300",
    sidebar: "bg-[#0a3d2c]",
    active: "bg-emerald-600 text-white",
    accentBtn: "bg-emerald-600 hover:bg-emerald-700 text-white",
    chip: null,
    search: "Search credentials, issuers, or requests...",
    bellHref: "/graduate/notifications",
    org: {
      title: "Trusted. Secure. Verified.",
      tagline: "BBACVS credentials are securely issued and verifiable anytime, anywhere.",
    },
    nav: [
      {
        heading: "Overview",
        items: [
          { label: "My Credentials", icon: "registry", href: "/graduate", id: "dashboard" },
        ],
      },
      {
        heading: "Recognition",
        items: [
          { label: "Apply for Credential", icon: "clipboard", href: "/graduate/apply", id: "apply" },
        ],
      },
      {
        heading: "Credential Trust",
        items: [
          { label: "Verification Activity", icon: "shieldCheck", href: "/graduate/verification", id: "verification" },
          { label: "Corrections & Disputes", icon: "scale", href: "/graduate/disputes", id: "disputes" },
        ],
      },
      {
        heading: "Administration",
        items: [
          { label: "Billing & Receipts", icon: "file", href: "/billing", id: "billing" },
          { label: "Notifications", icon: "bell", href: "/graduate/notifications", id: "notifications" },
          { label: "Settings", icon: "settings", href: "/account", id: "settings" },
        ],
      },
    ],
  },
};

// Flat list of nav destinations for a portal — used by the topbar quick-search.
export function navIndex(portalId) {
  const p = PORTALS[portalId];
  if (!p) return [];
  return p.nav.flatMap((group) =>
    group.items.map((item) => ({ ...item, heading: group.heading }))
  );
}

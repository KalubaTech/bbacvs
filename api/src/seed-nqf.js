// Seeds the NQF knowledge base: the ZM-NQF 2025 framework version, its ten levels with
// Knowledge / Skills / Autonomy-and-Responsibility descriptors, the three sub-frameworks and
// their appropriate authorities, official progression rules, configurable RPL/CATS/
// micro-credential policies, and a small set of demonstration register entries.
//
// Descriptor and rule text here is a working summary of the Revised National Qualifications
// Framework (2025); ZAQA's official wording should replace it via the policy/framework admin
// tools without code changes — that is the point of storing it as data.
// Idempotent: safe to run repeatedly. Usage: node src/seed-nqf.js
import mongoose from "mongoose";
import {
  connectDB, Issuer,
  NQFVersion, NQFLevel, SubFramework, RegisteredQualification, NQFPolicy, ProgressionRule,
} from "./models/index.js";
import { qualificationFingerprint } from "./services/nqf.service.js";

const VERSION = {
  code: "ZM-NQF-2025",
  title: "Revised Zambia National Qualifications Framework, 2025",
  gazetteRef: "Gazette Notice No. 1429 of 2025 (31 October 2025)",
  effectiveFrom: new Date("2025-10-31"),
  effectiveTo: null,
  status: "active",
  notes: "Ten-level framework administered by ZAQA under the ZAQA Act No. 8 of 2024.",
};

const LEVELS = [
  [1, "Level 1 — Foundational", {
    knowledge: "Basic general knowledge of a field of work or study; recall of simple facts and procedures in familiar, routine contexts.",
    skills: "Basic practical and communication skills to carry out simple, repetitive tasks under direct instruction.",
    autonomyResponsibility: "Works under close supervision in structured contexts with no responsibility for the work of others.",
  }, ["Basic Education Certificate", "Entry-level trade test"]],
  [2, "Level 2 — Ordinary Secondary", {
    knowledge: "General knowledge of a field with basic understanding of key concepts, facts and processes and their everyday application.",
    skills: "Practical, communication and elementary problem-solving skills applied to defined tasks using given procedures.",
    autonomyResponsibility: "Works under supervision with limited discretion; takes responsibility for completing own defined tasks.",
  }, ["School Certificate (Ordinary Level, Grade 12)", "Trade Test Certificate"]],
  [3, "Level 3 — Advanced Secondary", {
    knowledge: "Broader factual and some theoretical knowledge of a field, with awareness of how ideas connect across topics.",
    skills: "A range of cognitive and practical skills to complete tasks and solve routine problems by selecting basic methods and tools.",
    autonomyResponsibility: "Takes responsibility for completing tasks with some independence within guided, quality-checked contexts.",
  }, ["Advanced Secondary School Certificate", "Advanced Trade Test"]],
  [4, "Level 4 — Certificate", {
    knowledge: "Factual and theoretical knowledge in broad contexts within a field of work or study, including applicable regulations and standards.",
    skills: "Specialised cognitive and practical skills to generate solutions to defined problems, using relevant tools, materials and information.",
    autonomyResponsibility: "Exercises self-management within predictable contexts; may supervise routine work of others and take some responsibility for evaluation and improvement.",
  }, ["Craft Certificate", "Vocational / occupational certificate"]],
  [5, "Level 5 — Diploma", {
    knowledge: "Comprehensive, specialised factual and theoretical knowledge within a field and an awareness of the boundaries of that knowledge.",
    skills: "A comprehensive range of cognitive and practical skills to develop creative solutions to abstract as well as concrete problems.",
    autonomyResponsibility: "Manages and supervises in contexts subject to unpredictable change; reviews and develops performance of self and others.",
  }, ["Diploma", "Technician Certificate"]],
  [6, "Level 6 — Advanced Diploma", {
    knowledge: "Advanced knowledge of a field involving critical understanding of theories and principles and their application in specialised contexts.",
    skills: "Advanced cognitive, technical and communication skills demonstrating mastery and innovation in solving complex, semi-structured problems.",
    autonomyResponsibility: "Manages complex technical or professional activities, taking responsibility for decision-making and for the development of individuals and groups.",
  }, ["Advanced Diploma", "Associate Degree"]],
  [7, "Level 7 — Bachelor's Degree", {
    knowledge: "In-depth, systematic knowledge of a discipline including its theories, research methods and principles, integrated with practice.",
    skills: "Advanced cognitive, analytical, digital and problem-solving skills to identify, analyse and address complex problems, including in unfamiliar contexts.",
    autonomyResponsibility: "Full accountability for own work and significant responsibility for the work of others; manages resources, projects and professional development independently.",
  }, ["Bachelor's Degree"]],
  [8, "Level 8 — Bachelor Honours / Postgraduate Diploma", {
    knowledge: "Highly specialised knowledge at the forefront of a discipline, providing a basis for original thinking and applied research.",
    skills: "Specialised research, analytical and innovation skills to synthesise knowledge from different fields and evaluate complex issues with incomplete information.",
    autonomyResponsibility: "Substantial autonomy and professional integrity in complex, unpredictable settings; leads and reviews the strategic performance of teams.",
  }, ["Bachelor Honours Degree", "Postgraduate Diploma"]],
  [9, "Level 9 — Master's Degree", {
    knowledge: "Critical mastery of an advanced and specialised body of knowledge, including current research problems, methodologies and debates.",
    skills: "Advanced research and specialised problem-solving skills to develop new knowledge and procedures and to integrate knowledge across fields.",
    autonomyResponsibility: "Independently manages complex professional or research activities with full accountability; contributes to professional knowledge and supervises others' development.",
  }, ["Master's Degree"]],
  [10, "Level 10 — Doctoral Degree", {
    knowledge: "Knowledge at the most advanced frontier of a field, generated through original research that extends the discipline.",
    skills: "The most advanced research, synthesis, critique and communication skills, producing original contributions that satisfy peer review.",
    autonomyResponsibility: "Sustained authority, scholarly integrity and autonomous commitment to the development of new ideas, people and processes at the forefront of the field.",
  }, ["Doctoral Degree (PhD / professional doctorate)"]],
];

const SUB_FRAMEWORKS = [
  {
    code: "general", name: "General Education Sub-Framework",
    authority: "Examinations Council of Zambia (ECZ) and Ministry of Education structures",
    authorityRole: "ecz", levelRange: { min: 1, max: 3 },
    typicalQualifications: ["Ordinary Level", "Advanced Level", "Authorised ECZ awards"],
  },
  {
    code: "tevet", name: "Trades and Occupations (TEVET) Sub-Framework",
    authority: "Technical Education, Vocational and Entrepreneurship Training Authority (TEVETA)",
    authorityRole: "teveta",
    levelRange: { min: 1, max: 6 },
    typicalQualifications: ["Skills awards", "Trade tests", "Occupational certificates and diplomas"],
  },
  {
    code: "higher_ed", name: "Higher Education Sub-Framework",
    authority: "Higher Education Authority (HEA)",
    authorityRole: "hea", levelRange: { min: 5, max: 10 },
    typicalQualifications: ["Diploma", "Bachelor's", "Honours", "Master's", "Doctorate"],
  },
];

// Official progression pathways (spec §10). Only pairs listed here support DIRECT entry;
// everything else is answered with composed alternative pathways.
const PROGRESSION_RULES = [
  { from: 1, to: 2, req: "Completion of Level 1 gives access to Level 2 programmes." },
  { from: 2, to: 3, req: "Ordinary Level gives access to Advanced Secondary per the approved progression chart." },
  { from: 2, to: 4, req: "Ordinary Level gives access to approved Level 4 certificate programmes." },
  { from: 3, to: 4, req: "Advanced Secondary gives access to Level 4 certificate programmes." },
  { from: 3, to: 7, req: "Advanced Level provides direct access to eligible Level 7 higher-education qualifications." },
  { from: 4, to: 5, req: "A Level 4 certificate gives access to Level 5 diploma programmes." },
  { from: 5, to: 6, req: "A diploma gives access to Level 6 advanced-diploma programmes." },
  { from: 5, to: 7, req: "A relevant diploma gives access to eligible bachelor's degree programmes." },
  { from: 6, to: 7, req: "An advanced diploma gives access to eligible bachelor's degree programmes." },
  { from: 7, to: 8, req: "A bachelor's degree gives access to honours and postgraduate-diploma study." },
  { from: 7, to: 9, req: "A bachelor's degree gives access to coursework master's programmes where prescribed." },
  { from: 8, to: 9, req: "Research-based master's entry requires the applicable bachelor honours qualification where prescribed." },
  { from: 9, to: 10, req: "A master's degree gives access to doctoral study; doctoral qualifications must include the required research component." },
];

// Configurable policy controls (spec §12, §13). Values are effective-dated; updating one
// appends a new record rather than editing this seed.
const POLICIES = [
  { key: "rpl.maxCertificationLevel", value: 6, description: "Maximum NQF level at which a qualification may be CERTIFIED through RPL from informal/non-formal learning." },
  { key: "rpl.entryAllowedAtHigherLevels", value: true, description: "RPL may be used for ENTRY (access) to programmes above the certification limit where policy authorises it." },
  { key: "cats.maxTransferPercent", value: 50, description: "Maximum share of a target award's credits that may come from credit transfer." },
  { key: "microCredential.autoNqfMapping", value: false, description: "Short courses are never automatically NQF-mapped; level mapping requires QA and an authorised decision." },
];

// Demonstration register entries so the register and Phase-2 issuance gate have real data.
const DEMO_QUALIFICATIONS = [
  {
    referenceId: "ZAQA-Q-2025-0001",
    title: "School Certificate (Ordinary Level)",
    qualificationType: "full", nqfLevel: 2, subFramework: "general",
    fieldOfEducation: "General Education",
    purpose: "Certifies completion of ordinary-level secondary education and readiness for further learning or entry-level work.",
    learningOutcomes: ["Demonstrate literacy, numeracy and scientific reasoning at ordinary secondary level."],
    creditValue: 120, notionalHours: 1200,
    minEntryRequirements: ["Junior Secondary School Certificate"],
    progressionRoutes: ["Level 3 Advanced Secondary", "Approved Level 4 certificate programmes"],
    rplAvailable: false,
    awardingBody: "Examinations Council of Zambia (ECZ)",
    qaAuthority: "ECZ",
  },
  {
    referenceId: "ZAQA-Q-2025-0002",
    title: "Craft Certificate in Automotive Engineering",
    qualificationType: "full", nqfLevel: 4, subFramework: "tevet",
    fieldOfEducation: "Engineering and Engineering Trades",
    relatedOccupation: "Automotive mechanic",
    purpose: "Prepares learners for skilled trade practice in automotive maintenance and repair.",
    learningOutcomes: [
      "Diagnose and repair engine, transmission and braking systems to occupational standards.",
      "Apply workshop safety, quality and customer-service procedures.",
    ],
    creditValue: 120, notionalHours: 1200,
    minEntryRequirements: ["School Certificate (Ordinary Level) or Trade Test equivalent"],
    progressionRoutes: ["Level 5 Technician Certificate / Diploma"],
    rplAvailable: true,
    awardingBody: "TEVETA",
    qaAuthority: "TEVETA",
  },
  {
    referenceId: "ZAQA-Q-2025-0003",
    title: "Bachelor of Information and Communication Technology",
    qualificationType: "full", nqfLevel: 7, subFramework: "higher_ed",
    fieldOfEducation: "Information and Communication Technologies",
    relatedOccupation: "ICT professional",
    purpose: "Develops graduate-level competence in computing theory, software development and ICT systems practice.",
    learningOutcomes: [
      "Design, implement and evaluate software and network systems for complex requirements.",
      "Apply research methods and professional, legal and ethical standards to ICT practice.",
      "Work independently and lead teams in delivering ICT projects.",
    ],
    creditValue: 480, notionalHours: 4800,
    minEntryRequirements: ["School Certificate with five O-Level credits including Mathematics and English, or approved Level 5/6 pathway"],
    progressionRoutes: ["Level 8 Bachelor Honours / Postgraduate Diploma", "Coursework master's where prescribed"],
    rplAvailable: true,
    awardingBody: "University of Zambia",
    matchIssuer: /UNZA|University of Zambia/i, // link to the seeded issuer if present
    qaAuthority: "HEA",
  },
];

async function main() {
  await connectDB();

  // 1. framework version
  let version = await NQFVersion.findOne({ code: VERSION.code });
  if (!version) {
    version = await NQFVersion.create(VERSION);
    console.log("seeded framework version:", version.code);
  } else console.log("framework version exists:", version.code);

  // 2. levels + descriptors
  for (const [level, title, descriptors, typicalQualifications] of LEVELS) {
    const exists = await NQFLevel.findOne({ version: version._id, level });
    if (exists) continue;
    await NQFLevel.create({ version: version._id, versionCode: version.code, level, title, descriptors, typicalQualifications });
    console.log("seeded level", level);
  }

  // 3. sub-frameworks (authorityRole is kept in sync — e.g. the TEVETA portal going live)
  for (const sf of SUB_FRAMEWORKS) {
    const exists = await SubFramework.findOne({ version: version._id, code: sf.code });
    if (exists) {
      if (exists.authorityRole !== sf.authorityRole) {
        exists.authorityRole = sf.authorityRole;
        await exists.save();
        console.log("updated sub-framework authorityRole:", sf.code, "→", sf.authorityRole);
      }
      continue;
    }
    await SubFramework.create({ ...sf, version: version._id, versionCode: version.code });
    console.log("seeded sub-framework:", sf.code);
  }

  // 4. progression rules
  for (const r of PROGRESSION_RULES) {
    const exists = await ProgressionRule.findOne({ version: version._id, fromLevel: r.from, toLevel: r.to });
    if (exists) continue;
    await ProgressionRule.create({
      version: version._id, versionCode: version.code,
      fromLevel: r.from, toLevel: r.to, direct: true, requirement: r.req,
    });
  }
  console.log("progression rules in place:", await ProgressionRule.countDocuments({ version: version._id }));

  // 5. policies — seed only keys that have never been set (never override a ZAQA-set value)
  for (const p of POLICIES) {
    const exists = await NQFPolicy.findOne({ key: p.key });
    if (exists) continue;
    await NQFPolicy.create({ ...p, effectiveFrom: VERSION.effectiveFrom, setBy: "seed" });
    console.log("seeded policy:", p.key, "=", JSON.stringify(p.value));
  }

  // 6. demonstration register entries
  for (const { matchIssuer, ...q } of DEMO_QUALIFICATIONS) {
    if (await RegisteredQualification.findOne({ referenceId: q.referenceId })) continue;
    const doc = {
      ...q,
      frameworkVersion: version.code,
      registrationDate: VERSION.effectiveFrom,
      effectiveDate: VERSION.effectiveFrom,
      expiryDate: new Date("2030-10-31"), // registration period; renewal creates a new version
      status: "registered",
      qualificationVersion: 1,
      events: [{ at: new Date(), actor: "seed", action: "qualification.registered", note: "Seeded demonstration register entry" }],
    };
    if (matchIssuer) {
      const issuer = await Issuer.findOne({ institution: matchIssuer }).lean();
      if (issuer) { doc.awardingBodyIssuer = issuer._id; doc.approvedProviders = [issuer._id]; }
    }
    doc.fingerprint = qualificationFingerprint(doc);
    await RegisteredQualification.create(doc);
    console.log("seeded register entry:", q.referenceId, "—", q.title);
  }

  await mongoose.disconnect();
  console.log("NQF seed complete.");
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * scripts/generate_demo_export.js
 * Generates an extensive, production-grade mock data export JSON file for AutoAnki.
 * Populates all 10 IndexedDB stores + 27 localStorage sync keys with realistic,
 * high-yield medical student data across all 19 subjects, FSRS-6 analytics,
 * study velocity metrics, circadian telemetry, CAMP habits, flashcards, and PYTs.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function computeChecksum(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

// -------------------------------------------------------------
// 1. DATES & TIME HELPERS
// -------------------------------------------------------------
const TODAY_STR = '2026-08-16';

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function formatDateISO(dateStr, hours = 10, minutes = 0) {
  const d = new Date(dateStr);
  d.setUTCHours(hours, minutes, 0, 0);
  return d.toISOString();
}

console.log('Generating comprehensive AutoAnki mock export vault...');

// -------------------------------------------------------------
// 2. EXAM PROFILES
// -------------------------------------------------------------
const examProfiles = [
  {
    id: 'exam_neet_pg_2026',
    name: 'NEET PG 2026',
    title: 'NEET PG 2026 (National Eligibility cum Entrance Test)',
    date: '2026-08-30',
    examDate: '2026-08-30',
    isTentative: false,
    targetScore: 680,
    maxScore: 800
  },
  {
    id: 'exam_inicet_nov_2026',
    name: 'INI-CET Nov 2026',
    title: 'INI-CET November 2026 (AIIMS / JIPMER / PGIMER / NIMHANS)',
    date: '2026-11-15',
    examDate: '2026-11-15',
    isTentative: false,
    targetScore: 165,
    maxScore: 200
  },
  {
    id: 'exam_usmle_step2_2027',
    name: 'USMLE Step 2 CK',
    title: 'USMLE Step 2 CK',
    date: '2027-01-20',
    examDate: '2027-01-20',
    isTentative: true,
    targetScore: 265,
    maxScore: 300
  }
];

// -------------------------------------------------------------
// 3. FSRS CONFIG (FSRS-6 with 21 weights)
// -------------------------------------------------------------
const fsrsConfig = {
  enabled: true,
  weights: [
    0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0589,
    1.5330, 0.1544, 1.0071, 1.9395, 0.1100, 0.2900, 2.2700, 0.1500,
    2.9898, 0.5100, 0.3400, 0.0000, 0.2345
  ],
  retentionMode: 'global',
  globalDesiredRetention: 0.90,
  perSubjectRetention: {
    'Anatomy': 0.92,
    'Physiology': 0.90,
    'Biochemistry': 0.91,
    'Pathology': 0.93,
    'Microbiology': 0.90,
    'Pharmacology': 0.94,
    'Forensic Medicine': 0.88,
    'Social and Preventive Medicine': 0.89,
    'Ophthalmology': 0.90,
    'ENT': 0.91,
    'General Medicine': 0.92,
    'General Surgery': 0.90,
    'Obstetrics and Gynecology': 0.92,
    'Pediatrics': 0.90,
    'Psychiatry': 0.88,
    'Dermatology': 0.89,
    'Anesthesia': 0.88,
    'Radiology': 0.91,
    'Orthopedics': 0.89
  },
  dailyLimits: {
    newPagesPerDay: 25,
    maxReviewPagesPerDay: 60,
    newIgnoreReviewLimit: false,
    limitsStartFromTop: false
  },
  newTopics: {
    learningSteps: '1d',
    insertionOrder: 'sequential'
  },
  lapses: {
    relearningSteps: '1d',
    leechThreshold: 8,
    leechAction: 'tag'
  },
  displayOrder: {
    gatherOrder: 'curriculum',
    sortOrder: 'subject',
    newReviewOrder: 'reviewsFirst',
    interdayOrder: 'mix',
    reviewSortOrder: 'urgency'
  },
  easyDays: {
    mon: 'normal',
    tue: 'normal',
    wed: 'normal',
    thu: 'normal',
    fri: 'normal',
    sat: 'light',
    sun: 'heavy'
  },
  advancedRules: {
    maxInterval: 365,
    historicalRetention: 0.91,
    ignoreReviewsBefore: null,
    customRules: ''
  }
};

// -------------------------------------------------------------
// 4. SUBJECT TRACKER DATA & TOPICS
// -------------------------------------------------------------
const subjectsDefinitions = [
  {
    id: 'anatomy',
    subject: 'Anatomy',
    primarySource: 'BD Chaurasia / BTR High-Yield',
    topics: [
      { name: 'Brachial Plexus & Branches', page: '1', endPage: '8', revCount: 4, lapses: 0, stab: 78.4, diff: 4.8, interval: 26, lastRev: '2026-08-10', nextDue: '2026-09-05', dates: ['2026-06-10', '2026-06-25', '2026-07-15', '2026-08-10'] },
      { name: 'Upper Limb Nerve Injuries (Erb, Klumpke, Wrist Drop)', page: '9', endPage: '16', revCount: 3, lapses: 0, stab: 54.2, diff: 5.1, interval: 18, lastRev: '2026-08-12', nextDue: '2026-08-30', dates: ['2026-06-18', '2026-07-08', '2026-08-12'] },
      { name: 'Femoral Triangle & Femoral Canal', page: '17', endPage: '24', revCount: 3, lapses: 0, stab: 62.0, diff: 4.2, interval: 21, lastRev: '2026-08-14', nextDue: '2026-09-04', dates: ['2026-06-20', '2026-07-12', '2026-08-14'] },
      { name: 'Cavernous Sinus & Cranial Nerves', page: '25', endPage: '32', revCount: 2, lapses: 0, stab: 38.5, diff: 5.8, interval: 14, lastRev: '2026-08-02', nextDue: '2026-08-16', dates: ['2026-07-18', '2026-08-02'] },
      { name: 'Circle of Willis & Aneurysm Sites', page: '33', endPage: '40', revCount: 1, lapses: 0, stab: 22.0, diff: 5.4, interval: 8, lastRev: '2026-08-06', nextDue: '2026-08-14', dates: ['2026-08-06'] },
      { name: 'Pharyngeal Arches, Pouches & Clefts Derivatives', page: '41', endPage: '50', revCount: 5, lapses: 1, stab: 95.0, diff: 6.2, interval: 35, lastRev: '2026-08-15', nextDue: '2026-09-19', dates: ['2026-06-05', '2026-06-20', '2026-07-05', '2026-07-25', '2026-08-15'] },
      { name: 'Perineal Spaces & Ischiorectal Fossa', page: '51', endPage: '58', revCount: 0, lapses: 0, stab: null, diff: null, interval: null, lastRev: null, nextDue: null, dates: [] },
      { name: 'Larynx Anatomy & Vocal Cord Innervation', page: '59', endPage: '66', revCount: 0, lapses: 0, stab: null, diff: null, interval: null, lastRev: null, nextDue: null, dates: [] }
    ]
  },
  {
    id: 'pharmacology',
    subject: 'Pharmacology',
    primarySource: 'KD Tripathi / PrepLadder Rapid',
    topics: [
      { name: 'Autonomic Nervous System - Cholinergic Drugs & Organophosphate Poisoning', page: '1', endPage: '12', revCount: 4, lapses: 0, stab: 84.5, diff: 3.9, interval: 28, lastRev: '2026-08-11', nextDue: '2026-09-08', dates: ['2026-06-12', '2026-06-28', '2026-07-16', '2026-08-11'] },
      { name: 'Adrenergic Agonists & Receptor Subtypes', page: '13', endPage: '24', revCount: 3, lapses: 0, stab: 66.8, diff: 4.5, interval: 22, lastRev: '2026-08-13', nextDue: '2026-09-04', dates: ['2026-06-22', '2026-07-14', '2026-08-13'] },
      { name: 'Anti-Hypertensives (RAAS Inhibitors & CCBs)', page: '25', endPage: '36', revCount: 3, lapses: 0, stab: 58.0, diff: 4.1, interval: 20, lastRev: '2026-07-27', nextDue: '2026-08-16', dates: ['2026-06-15', '2026-07-05', '2026-07-27'] },
      { name: 'Anti-Arrhythmic Drugs (Vaughan Williams Classification)', page: '37', endPage: '48', revCount: 4, lapses: 9, isLeech: true, stab: 18.2, diff: 8.4, interval: 4, lastRev: '2026-08-12', nextDue: '2026-08-16', dates: ['2026-06-10', '2026-06-24', '2026-07-15', '2026-08-12'] },
      { name: 'Anti-Tubercular Drugs (HRZE Side Effects & Regimens)', page: '49', endPage: '60', revCount: 5, lapses: 0, stab: 110.0, diff: 3.5, interval: 42, lastRev: '2026-08-08', nextDue: '2026-09-19', dates: ['2026-06-02', '2026-06-18', '2026-07-04', '2026-07-20', '2026-08-08'] },
      { name: 'Chemotherapy - Alkylating Agents & Antimetabolites', page: '61', endPage: '72', revCount: 2, lapses: 0, stab: 42.0, diff: 6.1, interval: 15, lastRev: '2026-07-29', nextDue: '2026-08-13', dates: ['2026-07-12', '2026-07-29'] },
      { name: 'Anti-Epileptics & Narrow Therapeutic Index Drugs', page: '73', endPage: '84', revCount: 0, lapses: 0, stab: null, diff: null, interval: null, lastRev: null, nextDue: null, dates: [] },
      { name: 'General & Local Anesthetics Pharmacokinetics', page: '85', endPage: '94', revCount: 0, lapses: 0, stab: null, diff: null, interval: null, lastRev: null, nextDue: null, dates: [] }
    ]
  },
  {
    id: 'pathology',
    subject: 'Pathology',
    primarySource: 'Robbins & Cotran / Pathoma',
    topics: [
      { name: 'Cell Injury, Necrosis & Apoptosis Pathways', page: '1', endPage: '14', revCount: 5, lapses: 0, stab: 115.0, diff: 3.2, interval: 45, lastRev: '2026-08-15', nextDue: '2026-09-29', dates: ['2026-06-01', '2026-06-16', '2026-07-02', '2026-07-22', '2026-08-15'] },
      { name: 'Acute & Chronic Inflammation, Granulomas', page: '15', endPage: '28', revCount: 4, lapses: 0, stab: 88.0, diff: 3.8, interval: 30, lastRev: '2026-08-09', nextDue: '2026-09-08', dates: ['2026-06-14', '2026-06-30', '2026-07-18', '2026-08-09'] },
      { name: 'Neoplasia - Oncogenes, Tumor Suppressors & Hallmarks', page: '29', endPage: '44', revCount: 3, lapses: 0, stab: 64.0, diff: 4.8, interval: 22, lastRev: '2026-07-25', nextDue: '2026-08-16', dates: ['2026-06-20', '2026-07-08', '2026-07-25'] },
      { name: 'Hematology - Anemias (Microcytic, Macrocytic, Hemolytic)', page: '45', endPage: '60', revCount: 4, lapses: 0, stab: 76.5, diff: 4.4, interval: 25, lastRev: '2026-08-05', nextDue: '2026-08-30', dates: ['2026-06-08', '2026-06-26', '2026-07-14', '2026-08-05'] },
      { name: 'Leukemias & Lymphomas (Translocations & Stains)', page: '61', endPage: '76', revCount: 4, lapses: 8, isLeech: true, stab: 22.4, diff: 7.9, interval: 6, lastRev: '2026-08-10', nextDue: '2026-08-16', dates: ['2026-06-11', '2026-06-29', '2026-07-20', '2026-08-10'] },
      { name: 'Glomerulonephritis & Renal Pathology', page: '77', endPage: '90', revCount: 2, lapses: 0, stab: 45.0, diff: 5.5, interval: 16, lastRev: '2026-08-01', nextDue: '2026-08-17', dates: ['2026-07-15', '2026-08-01'] },
      { name: 'Thyroid Tumors & Histopathology', page: '91', endPage: '100', revCount: 0, lapses: 0, stab: null, diff: null, interval: null, lastRev: null, nextDue: null, dates: [] },
      { name: 'Vasculitis & Collagen Vascular Diseases', page: '101', endPage: '112', revCount: 0, lapses: 0, stab: null, diff: null, interval: null, lastRev: null, nextDue: null, dates: [] }
    ]
  },
  {
    id: 'microbiology',
    subject: 'Microbiology',
    primarySource: 'Apoorva Sastry / Marrow',
    topics: [
      { name: 'Gram Positive Cocci (Staph & Strep)', page: '1', endPage: '12', revCount: 4, lapses: 0, stab: 82.0, diff: 3.7, interval: 27, lastRev: '2026-08-14', nextDue: '2026-09-10', dates: ['2026-06-16', '2026-07-02', '2026-07-22', '2026-08-14'] },
      { name: 'Gram Negative Bacilli & Enterobacteriaceae', page: '13', endPage: '26', revCount: 3, lapses: 0, stab: 56.0, diff: 4.6, interval: 19, lastRev: '2026-07-28', nextDue: '2026-08-16', dates: ['2026-06-25', '2026-07-10', '2026-07-28'] },
      { name: 'Mycobacteria & Hansen Disease', page: '27', endPage: '38', revCount: 4, lapses: 0, stab: 90.0, diff: 3.9, interval: 30, lastRev: '2026-08-07', nextDue: '2026-09-06', dates: ['2026-06-08', '2026-06-24', '2026-07-12', '2026-08-07'] },
      { name: 'Virology - Hepatitis Viruses (HBV Serology & Markers)', page: '39', endPage: '52', revCount: 4, lapses: 0, stab: 96.0, diff: 4.2, interval: 32, lastRev: '2026-08-12', nextDue: '2026-09-13', dates: ['2026-06-04', '2026-06-21', '2026-07-15', '2026-08-12'] },
      { name: 'Parasitology - Malaria, Leishmania & Amoebiasis', page: '53', endPage: '66', revCount: 2, lapses: 0, stab: 36.0, diff: 5.2, interval: 12, lastRev: '2026-08-03', nextDue: '2026-08-15', dates: ['2026-07-20', '2026-08-03'] },
      { name: 'Mycology - Opportunistic Fungal Infections', page: '67', endPage: '78', revCount: 0, lapses: 0, stab: null, diff: null, interval: null, lastRev: null, nextDue: null, dates: [] }
    ]
  },
  {
    id: 'ent',
    subject: 'ENT',
    primarySource: 'Dhingra / Marrow Ed8',
    topics: [
      { name: 'Ear : Part 1 - Anatomy of External & Middle Ear', page: '1', endPage: '7', revCount: 3, lapses: 0, stab: 60.0, diff: 4.0, interval: 20, lastRev: '2026-08-06', nextDue: '2026-08-26', dates: ['2026-06-18', '2026-07-09', '2026-08-06'] },
      { name: 'Ear : Part 2 - CSOM, Cholesteatoma & Tympanoplasty', page: '8', endPage: '16', revCount: 4, lapses: 0, stab: 75.0, diff: 4.3, interval: 25, lastRev: '2026-08-11', nextDue: '2026-09-05', dates: ['2026-06-12', '2026-06-29', '2026-07-19', '2026-08-11'] },
      { name: 'Ear : Part 4 - Audiometry & Hearing Loss Interpretation', page: '23', endPage: '29', revCount: 3, lapses: 0, stab: 52.0, diff: 4.7, interval: 18, lastRev: '2026-07-29', nextDue: '2026-08-16', dates: ['2026-06-22', '2026-07-11', '2026-07-29'] },
      { name: 'Ear : Part 6 - Vertigo, BPPV & Meniere Disease', page: '42', endPage: '46', revCount: 2, lapses: 0, stab: 40.0, diff: 5.0, interval: 14, lastRev: '2026-08-02', nextDue: '2026-08-16', dates: ['2026-07-16', '2026-08-02'] },
      { name: 'Nose : Part 1 - Epistaxis & Sinusitis (Osteomeatal Complex)', page: '60', endPage: '73', revCount: 3, lapses: 0, stab: 68.0, diff: 3.8, interval: 23, lastRev: '2026-08-13', nextDue: '2026-09-05', dates: ['2026-06-20', '2026-07-12', '2026-08-13'] },
      { name: 'Pharynx : Part 1 - Tonsillitis, Quinsy & Diphtheria', page: '86', endPage: '93', revCount: 3, lapses: 0, stab: 58.0, diff: 4.2, interval: 20, lastRev: '2026-08-14', nextDue: '2026-09-03', dates: ['2026-06-24', '2026-07-16', '2026-08-14'] },
      { name: 'Pharynx : Part 2 - Adenoids, JNA & Nasopharyngeal Carcinoma', page: '94', endPage: '101', revCount: 2, lapses: 0, stab: 34.0, diff: 5.6, interval: 12, lastRev: '2026-08-04', nextDue: '2026-08-16', dates: ['2026-07-22', '2026-08-04'] },
      { name: 'Larynx : Part 1 - Vocal Cords, Stridor & Laryngeal Carcinoma', page: '102', endPage: '109', revCount: 3, lapses: 0, stab: 64.0, diff: 4.5, interval: 22, lastRev: '2026-08-15', nextDue: '2026-09-06', dates: ['2026-06-25', '2026-07-18', '2026-08-15'] },
      { name: 'Larynx : Part 2 - Tracheostomy & Foreign Body Airway', page: '110', endPage: '118', revCount: 0, lapses: 0, stab: null, diff: null, interval: null, lastRev: null, nextDue: null, dates: [] }
    ]
  },
  {
    id: 'ophthalmology',
    subject: 'Ophthalmology',
    primarySource: 'Khurana / PrepLadder',
    topics: [
      { name: 'Cataract Types, IOL Power Calculation & Complications', page: '1', endPage: '14', revCount: 4, lapses: 0, stab: 86.0, diff: 3.6, interval: 28, lastRev: '2026-08-10', nextDue: '2026-09-07', dates: ['2026-06-11', '2026-06-27', '2026-07-16', '2026-08-10'] },
      { name: 'Glaucoma - Open vs Closed Angle & Medical Management', page: '15', endPage: '28', revCount: 4, lapses: 0, stab: 80.0, diff: 4.4, interval: 26, lastRev: '2026-08-12', nextDue: '2026-09-07', dates: ['2026-06-15', '2026-07-03', '2026-07-21', '2026-08-12'] },
      { name: 'Cornea - Keratitis (Bacterial, Viral, Fungal, Acanthamoeba)', page: '29', endPage: '42', revCount: 3, lapses: 0, stab: 55.0, diff: 4.8, interval: 18, lastRev: '2026-07-29', nextDue: '2026-08-16', dates: ['2026-06-22', '2026-07-10', '2026-07-29'] },
      { name: 'Retina - Diabetic Retinopathy, CRVO, CRAO & RD', page: '43', endPage: '58', revCount: 4, lapses: 0, stab: 92.0, diff: 4.2, interval: 30, lastRev: '2026-08-14', nextDue: '2026-09-13', dates: ['2026-06-08', '2026-06-26', '2026-07-16', '2026-08-14'] },
      { name: 'Neuro-ophthalmology & Visual Field Defects', page: '59', endPage: '70', revCount: 0, lapses: 0, stab: null, diff: null, interval: null, lastRev: null, nextDue: null, dates: [] }
    ]
  },
  {
    id: 'general_medicine',
    subject: 'General Medicine',
    primarySource: 'Harrison / Marrow Ed8',
    topics: [
      { name: 'Cardiology - Valvular Heart Diseases & Murmurs', page: '1', endPage: '18', revCount: 4, lapses: 0, stab: 90.0, diff: 4.1, interval: 30, lastRev: '2026-08-13', nextDue: '2026-09-12', dates: ['2026-06-10', '2026-06-28', '2026-07-17', '2026-08-13'] },
      { name: 'Cardiology - Acute Coronary Syndrome & ECG Localization', page: '19', endPage: '36', revCount: 4, lapses: 0, stab: 84.0, diff: 4.5, interval: 28, lastRev: '2026-08-11', nextDue: '2026-09-08', dates: ['2026-06-14', '2026-07-02', '2026-07-20', '2026-08-11'] },
      { name: 'Endocrinology - Diabetes Mellitus Diagnostics & Complications', page: '37', endPage: '54', revCount: 5, lapses: 0, stab: 120.0, diff: 3.1, interval: 48, lastRev: '2026-08-15', nextDue: '2026-10-02', dates: ['2026-06-01', '2026-06-16', '2026-07-01', '2026-07-20', '2026-08-15'] },
      { name: 'Endocrinology - Thyroid & Adrenal Disorders (Cushing, Addison)', page: '55', endPage: '72', revCount: 3, lapses: 0, stab: 62.0, diff: 4.3, interval: 21, lastRev: '2026-07-26', nextDue: '2026-08-16', dates: ['2026-06-20', '2026-07-08', '2026-07-26'] },
      { name: 'Neurology - Stroke Syndromes & Localization', page: '73', endPage: '92', revCount: 4, lapses: 0, stab: 88.0, diff: 4.6, interval: 29, lastRev: '2026-08-09', nextDue: '2026-09-07', dates: ['2026-06-06', '2026-06-24', '2026-07-14', '2026-08-09'] },
      { name: 'Nephrology - Acute Kidney Injury & Electrolyte Disorders', page: '93', endPage: '110', revCount: 3, lapses: 0, stab: 56.0, diff: 5.0, interval: 19, lastRev: '2026-07-28', nextDue: '2026-08-16', dates: ['2026-06-22', '2026-07-10', '2026-07-28'] },
      { name: 'Rheumatology - SLE, Rheumatoid Arthritis & Scleroderma', page: '111', endPage: '128', revCount: 0, lapses: 0, stab: null, diff: null, interval: null, lastRev: null, nextDue: null, dates: [] }
    ]
  },
  {
    id: 'general_surgery',
    subject: 'General Surgery',
    primarySource: 'Bailey & Love / PrepLadder',
    topics: [
      { name: 'Trauma - ATLS Guidelines, Primary & Secondary Survey', page: '1', endPage: '16', revCount: 4, lapses: 0, stab: 94.0, diff: 3.4, interval: 32, lastRev: '2026-08-12', nextDue: '2026-09-13', dates: ['2026-06-08', '2026-06-26', '2026-07-16', '2026-08-12'] },
      { name: 'Breast Diseases - Carcinoma Staging, Triple Assessment', page: '17', endPage: '34', revCount: 4, lapses: 0, stab: 82.0, diff: 4.0, interval: 27, lastRev: '2026-08-08', nextDue: '2026-09-04', dates: ['2026-06-12', '2026-06-30', '2026-07-18', '2026-08-08'] },
      { name: 'Thyroid Surgery & Complications (RLN Injury, Hypocalcemia)', page: '35', endPage: '50', revCount: 3, lapses: 0, stab: 64.0, diff: 4.2, interval: 22, lastRev: '2026-08-14', nextDue: '2026-09-05', dates: ['2026-06-22', '2026-07-12', '2026-08-14'] },
      { name: 'Hernias - Inguinal (Direct vs Indirect), Femoral, Ventral', page: '51', endPage: '66', revCount: 3, lapses: 0, stab: 58.0, diff: 4.5, interval: 20, lastRev: '2026-07-27', nextDue: '2026-08-16', dates: ['2026-06-18', '2026-07-07', '2026-07-27'] },
      { name: 'Colorectal Carcinoma & Polyposis Syndromes', page: '67', endPage: '84', revCount: 0, lapses: 0, stab: null, diff: null, interval: null, lastRev: null, nextDue: null, dates: [] }
    ]
  },
  {
    id: 'obstetrics_and_gynecology',
    subject: 'Obstetrics and Gynecology',
    primarySource: 'DC Dutta / Shaw',
    topics: [
      { name: 'Maternal Physiology & Antenatal Care Protocols', page: '1', endPage: '14', revCount: 4, lapses: 0, stab: 88.0, diff: 3.5, interval: 29, lastRev: '2026-08-10', nextDue: '2026-09-08', dates: ['2026-06-09', '2026-06-27', '2026-07-15', '2026-08-10'] },
      { name: 'Hypertensive Disorders of Pregnancy (Preeclampsia & Eclampsia)', page: '15', endPage: '30', revCount: 4, lapses: 0, stab: 92.0, diff: 3.8, interval: 30, lastRev: '2026-08-13', nextDue: '2026-09-12', dates: ['2026-06-14', '2026-07-02', '2026-07-20', '2026-08-13'] },
      { name: 'Antepartum Hemorrhage (Placenta Previa vs Abruptio)', page: '31', endPage: '44', revCount: 3, lapses: 0, stab: 60.0, diff: 4.2, interval: 20, lastRev: '2026-07-27', nextDue: '2026-08-16', dates: ['2026-06-20', '2026-07-08', '2026-07-27'] },
      { name: 'Cervical Cancer Screening (Bethesda System & HPV)', page: '45', endPage: '58', revCount: 3, lapses: 0, stab: 65.0, diff: 4.0, interval: 22, lastRev: '2026-08-14', nextDue: '2026-09-05', dates: ['2026-06-24', '2026-07-14', '2026-08-14'] },
      { name: 'Ovarian Tumors & FIGO Staging', page: '59', endPage: '74', revCount: 0, lapses: 0, stab: null, diff: null, interval: null, lastRev: null, nextDue: null, dates: [] }
    ]
  },
  {
    id: 'pediatrics',
    subject: 'Pediatrics',
    primarySource: 'OP Ghai / Marrow',
    topics: [
      { name: 'Growth & Development Milestones (Motor, Social, Language)', page: '1', endPage: '14', revCount: 4, lapses: 0, stab: 95.0, diff: 3.3, interval: 32, lastRev: '2026-08-15', nextDue: '2026-09-16', dates: ['2026-06-03', '2026-06-20', '2026-07-10', '2026-07-30', '2026-08-15'] },
      { name: 'Neonatal Resuscitation & APGAR Scoring', page: '15', endPage: '26', revCount: 4, lapses: 0, stab: 85.0, diff: 3.6, interval: 28, lastRev: '2026-08-09', nextDue: '2026-09-06', dates: ['2026-06-12', '2026-06-30', '2026-07-18', '2026-08-09'] },
      { name: 'Congenital Heart Diseases (Cyanotic vs Acyanotic)', page: '27', endPage: '42', revCount: 3, lapses: 0, stab: 56.0, diff: 4.8, interval: 19, lastRev: '2026-07-28', nextDue: '2026-08-16', dates: ['2026-06-21', '2026-07-09', '2026-07-28'] },
      { name: 'Immunization Schedule (National Immunization Schedule NIS)', page: '43', endPage: '56', revCount: 4, lapses: 0, stab: 98.0, diff: 3.0, interval: 35, lastRev: '2026-08-12', nextDue: '2026-09-16', dates: ['2026-06-05', '2026-06-22', '2026-07-12', '2026-08-12'] }
    ]
  },
  {
    id: 'forensic_medicine',
    subject: 'Forensic Medicine',
    primarySource: 'Reddy / PrepLadder',
    topics: [
      { name: 'Thanatology - Postmortem Changes (Rigor, Algor, Livor Mortis)', page: '1', endPage: '14', revCount: 4, lapses: 0, stab: 88.0, diff: 3.2, interval: 29, lastRev: '2026-08-11', nextDue: '2026-09-09', dates: ['2026-06-15', '2026-07-02', '2026-07-20', '2026-08-11'] },
      { name: 'Mechanical Injuries - Firearms & Ballistics', page: '15', endPage: '28', revCount: 3, lapses: 0, stab: 62.0, diff: 4.0, interval: 21, lastRev: '2026-08-14', nextDue: '2026-09-04', dates: ['2026-06-22', '2026-07-12', '2026-08-14'] },
      { name: 'Toxicology - Plant Poisons & Heavy Metals', page: '29', endPage: '44', revCount: 2, lapses: 0, stab: 38.0, diff: 5.2, interval: 13, lastRev: '2026-08-03', nextDue: '2026-08-16', dates: ['2026-07-21', '2026-08-03'] }
    ]
  },
  {
    id: 'spm',
    subject: 'Social and Preventive Medicine',
    primarySource: 'Park / Marrow',
    topics: [
      { name: 'Epidemiology - Study Designs (Cohort, Case-Control, RCT)', page: '1', endPage: '18', revCount: 4, lapses: 0, stab: 90.0, diff: 3.6, interval: 30, lastRev: '2026-08-13', nextDue: '2026-09-12', dates: ['2026-06-10', '2026-06-28', '2026-07-16', '2026-08-13'] },
      { name: 'Biostatistics - Tests of Significance, Sensitivity, Specificity', page: '19', endPage: '36', revCount: 4, lapses: 0, stab: 82.0, diff: 4.3, interval: 27, lastRev: '2026-08-10', nextDue: '2026-09-06', dates: ['2026-06-14', '2026-07-01', '2026-07-19', '2026-08-10'] },
      { name: 'National Health Programs & Health Indices in India', page: '37', endPage: '54', revCount: 2, lapses: 0, stab: 36.0, diff: 5.4, interval: 12, lastRev: '2026-08-04', nextDue: '2026-08-16', dates: ['2026-07-23', '2026-08-04'] }
    ]
  },
  {
    id: 'biochemistry',
    subject: 'Biochemistry',
    primarySource: 'Satyanarayana / First Aid',
    topics: [
      { name: 'Inborn Errors of Metabolism (Amino Acid & Carbohydrate)', page: '1', endPage: '16', revCount: 4, lapses: 0, stab: 78.0, diff: 4.6, interval: 26, lastRev: '2026-08-08', nextDue: '2026-09-03', dates: ['2026-06-11', '2026-06-29', '2026-07-18', '2026-08-08'] },
      { name: 'Vitamins & Mineral Deficiencies Clinical Syndromes', page: '17', endPage: '30', revCount: 4, lapses: 0, stab: 96.0, diff: 3.1, interval: 34, lastRev: '2026-08-14', nextDue: '2026-09-17', dates: ['2026-06-05', '2026-06-22', '2026-07-12', '2026-08-14'] }
    ]
  },
  {
    id: 'physiology',
    subject: 'Physiology',
    primarySource: 'Guyton & Hall / Ganong',
    topics: [
      { name: 'Cardiac Electrophysiology & Action Potentials', page: '1', endPage: '14', revCount: 4, lapses: 0, stab: 88.0, diff: 3.8, interval: 29, lastRev: '2026-08-12', nextDue: '2026-09-10', dates: ['2026-06-08', '2026-06-26', '2026-07-15', '2026-08-12'] },
      { name: 'Renal Clearance, Countercurrent Mechanism & GFR', page: '15', endPage: '28', revCount: 3, lapses: 0, stab: 60.0, diff: 4.4, interval: 20, lastRev: '2026-07-27', nextDue: '2026-08-16', dates: ['2026-06-19', '2026-07-08', '2026-07-27'] }
    ]
  },
  {
    id: 'dermatology',
    subject: 'Dermatology',
    primarySource: 'Neena Khanna / PrepLadder',
    topics: [
      { name: 'Papulosquamous Disorders (Psoriasis, Lichen Planus, Pityriasis)', page: '1', endPage: '14', revCount: 4, lapses: 0, stab: 85.0, diff: 3.6, interval: 28, lastRev: '2026-08-11', nextDue: '2026-09-08', dates: ['2026-06-14', '2026-07-01', '2026-07-20', '2026-08-11'] },
      { name: 'Vesiculobullous Disorders (Pemphigus vs Pemphigoid)', page: '15', endPage: '26', revCount: 3, lapses: 0, stab: 58.0, diff: 4.5, interval: 19, lastRev: '2026-07-28', nextDue: '2026-08-16', dates: ['2026-06-21', '2026-07-09', '2026-07-28'] }
    ]
  },
  {
    id: 'psychiatry',
    subject: 'Psychiatry',
    primarySource: 'Niraj Ahuja',
    topics: [
      { name: 'Mood Disorders - Depression & Bipolar Classification', page: '1', endPage: '12', revCount: 4, lapses: 0, stab: 90.0, diff: 3.2, interval: 30, lastRev: '2026-08-13', nextDue: '2026-09-12', dates: ['2026-06-09', '2026-06-27', '2026-07-16', '2026-08-13'] },
      { name: 'Schizophrenia & Antipsychotic Side Effect Profiles', page: '13', endPage: '24', revCount: 3, lapses: 0, stab: 64.0, diff: 4.1, interval: 21, lastRev: '2026-08-14', nextDue: '2026-09-04', dates: ['2026-06-22', '2026-07-12', '2026-08-14'] }
    ]
  },
  {
    id: 'radiology',
    subject: 'Radiology',
    primarySource: 'Sumer Sethi / BTR',
    topics: [
      { name: 'Chest X-Ray Patterns & Classic Signs (Silhouette, Air Bronchogram)', page: '1', endPage: '16', revCount: 4, lapses: 0, stab: 88.0, diff: 3.5, interval: 29, lastRev: '2026-08-10', nextDue: '2026-09-08', dates: ['2026-06-12', '2026-06-30', '2026-07-18', '2026-08-10'] },
      { name: 'Emergency CT Head (EDH, SDH, SAH, Infarct)', page: '17', endPage: '32', revCount: 4, lapses: 0, stab: 94.0, diff: 3.8, interval: 31, lastRev: '2026-08-15', nextDue: '2026-09-15', dates: ['2026-06-04', '2026-06-22', '2026-07-13', '2026-08-15'] }
    ]
  },
  {
    id: 'orthopedics',
    subject: 'Orthopedics',
    primarySource: 'Maheshwari / Marrow',
    topics: [
      { name: 'Upper Limb Fractures (Colles, Smith, Monteggia, Galeazzi)', page: '1', endPage: '14', revCount: 4, lapses: 0, stab: 86.0, diff: 3.7, interval: 28, lastRev: '2026-08-12', nextDue: '2026-09-09', dates: ['2026-06-10', '2026-06-28', '2026-07-17', '2026-08-12'] },
      { name: 'Bone Tumors - Radiologic Signs (Sunburst, Onion Skin, Soap Bubble)', page: '15', endPage: '28', revCount: 3, lapses: 0, stab: 60.0, diff: 4.4, interval: 20, lastRev: '2026-07-27', nextDue: '2026-08-16', dates: ['2026-06-19', '2026-07-08', '2026-07-27'] }
    ]
  },
  {
    id: 'anesthesia',
    subject: 'Anesthesia',
    primarySource: 'Ajay Yadav / PrepLadder',
    topics: [
      { name: 'Inhalational & Intravenous Anesthetic Agents (MAC Values)', page: '1', endPage: '12', revCount: 4, lapses: 0, stab: 84.0, diff: 3.9, interval: 28, lastRev: '2026-08-11', nextDue: '2026-09-08', dates: ['2026-06-14', '2026-07-02', '2026-07-21', '2026-08-11'] },
      { name: 'Neuromuscular Blockers & Reversal Agents (Sugammadex, Neostigmine)', page: '13', endPage: '24', revCount: 3, lapses: 0, stab: 62.0, diff: 4.2, interval: 21, lastRev: '2026-08-14', nextDue: '2026-09-04', dates: ['2026-06-23', '2026-07-13', '2026-08-14'] }
    ]
  }
];

// Build subject_tracker_data KV and topics array
const subjectTrackerData = [];
const topicsStore = [];

subjectsDefinitions.forEach(sub => {
  const topicsObj = {};

  sub.topics.forEach((t, idx) => {
    const topicId = `${sub.subject}_${t.name}`;
    const cleanNotes = `<h3>Key High-Yield Concepts for ${t.name}</h3>
<ul>
  <li><strong>Core Clinical Pearl:</strong> Pathognomonic signs, diagnostic criterion, and standard first-line therapies.</li>
  <li><strong>Exam Trap:</strong> Avoid confusing differential diagnoses; note classical age groups and imaging hallmarks.</li>
  <li><strong>Recall Benchmark:</strong> Retrievability index calibrated to FSRS-6 algorithm.</li>
</ul>`;

    topicsObj[t.name] = {
      name: t.name,
      page: t.page,
      endPage: t.endPage,
      studyDates: t.dates || [],
      reviewCount: t.revCount,
      lapses: t.lapses || 0,
      isLeech: t.isLeech || false,
      notes: cleanNotes,
      difficulty: t.diff,
      stability: t.stab,
      retrievability: t.stab ? Number((Math.exp(Math.log(0.9) * ((t.interval || 7) / t.stab))).toFixed(2)) : null,
      interval: t.interval,
      nextReviewDue: t.nextDue,
      lastReviewDate: t.lastRev
    };

    topicsStore.push({
      id: topicId,
      name: t.name,
      subject: sub.subject,
      subdeck: sub.subject,
      path: `DoctorKishor::NEET_PG_Vault::${sub.subject}::${t.name}`,
      cardCount: 15 + (idx * 3),
      pageCount: Number(t.endPage) - Number(t.page) + 1,
      createdAt: '2026-05-15T08:00:00.000Z',
      updatedAt: '2026-08-16T12:00:00.000Z'
    });
  });

  subjectTrackerData.push({
    id: sub.id,
    subject: sub.subject,
    primarySource: sub.primarySource,
    topics: topicsObj,
    updatedAt: '2026-08-16T12:00:00.000Z'
  });
});

// -------------------------------------------------------------
// 5. FLASHCARDS (Comprehensive High-Yield Deck)
// -------------------------------------------------------------
const rawCardsData = [
  // Anatomy
  { type: 'Cloze', text: 'Erb palsy results from injury to the {{c1::upper trunk (C5-C6)}} of the brachial plexus, presenting with the classic {{c2::waiter\'s tip}} deformity (adducted, internally rotated arm and pronated forearm).', deck: 'DoctorKishor::NEET_PG_Vault::Anatomy', subject: 'Anatomy', tags: ['brachial-plexus', 'pyt-high-yield', 'nerve-injury'] },
  { type: 'Cloze', text: 'Klumpke palsy results from injury to the {{c1::lower trunk (C8-T1)}} of the brachial plexus, leading to {{c2::claw hand}} due to intrinsic hand muscle paralysis and concomitant {{c3::Horner syndrome}} if sympathetic fibers are involved.', deck: 'DoctorKishor::NEET_PG_Vault::Anatomy', subject: 'Anatomy', tags: ['brachial-plexus', 'claw-hand', 'horner-syndrome'] },
  { type: 'Basic', front: 'Which structure passes through the foramen spinosum and what is its clinical significance?', back: '<strong>Middle Meningeal Artery</strong> (branch of maxillary artery).<br>Laceration by pterion fracture leads to an <strong>Epidural Hematoma (biconvex/lenticular shape on CT)</strong> with a classic <em>lucid interval</em>.', deck: 'DoctorKishor::NEET_PG_Vault::Anatomy', subject: 'Anatomy', tags: ['skull-base', 'radiology', 'neurosurgery'] },
  { type: 'Basic', front: 'What are the boundaries and contents of the Femoral Ring?', back: '<strong>Boundaries:</strong><br>• Anterior: Inguinal ligament<br>• Medial: Lacunar ligament (Gimbernat)<br>• Lateral: Femoral vein septum<br>• Posterior: Pectineal ligament (Cooper)<br><strong>Content:</strong> Cloquet lymph node / fat. Site of Femoral Hernia.', deck: 'DoctorKishor::NEET_PG_Vault::Anatomy', subject: 'Anatomy', tags: ['lower-limb', 'surgery-anatomy', 'hernia'] },
  { type: 'Cloze', text: 'The {{c1::Abducens nerve (CN VI)}} is the only cranial nerve that runs freely <em>inside</em> the cavernous sinus next to the {{c2::internal carotid artery}}, making it the earliest nerve affected in cavernous sinus thrombosis or ICA aneurysm.', deck: 'DoctorKishor::NEET_PG_Vault::Anatomy', subject: 'Anatomy', tags: ['cranial-nerves', 'cavernous-sinus'] },
  { type: 'Basic', front: 'What are the derivatives of the 3rd and 4th Pharyngeal Pouches?', back: '• <strong>3rd Pouch:</strong> Inferior parathyroid glands + Thymus (mnemonic: 3 letters in SIT)<br>• <strong>4th Pouch:</strong> Superior parathyroid glands + Ultimobranchial body (Parafollicular C-cells of thyroid).', deck: 'DoctorKishor::NEET_PG_Vault::Anatomy', subject: 'Anatomy', tags: ['embryology', 'pharyngeal-pouches'] },

  // Physiology
  { type: 'Cloze', text: 'Phase 0 of the ventricular cardiac action potential is caused by rapid {{c1::Na+ influx via fast voltage-gated Na+ channels}}, while Phase 2 (plateau) is sustained by {{c2::Ca2+ influx via L-type calcium channels}} balancing K+ efflux.', deck: 'DoctorKishor::NEET_PG_Vault::Physiology', subject: 'Physiology', tags: ['cardiac-physiology', 'electrophysiology'] },
  { type: 'Basic', front: 'How does Inulin clearance differ from PAH clearance in renal physiology?', back: '• <strong>Inulin:</strong> Freely filtered, neither reabsorbed nor secreted -> used to calculate <strong>Glomerular Filtration Rate (GFR)</strong>.<br>• <strong>PAH (Para-aminohippuric acid):</strong> Freely filtered and actively secreted -> used to calculate <strong>Effective Renal Plasma Flow (eRPF)</strong>.', deck: 'DoctorKishor::NEET_PG_Vault::Physiology', subject: 'Physiology', tags: ['renal-clearance', 'gfr'] },

  // Biochemistry
  { type: 'Cloze', text: 'Phenylketonuria (PKU) is caused by a deficiency of {{c1::Phenylalanine Hydroxylase (PAH)}} or its cofactor {{c2::Tetrahydrobiopterin (BH4)}}, leading to musty/mousy body odor and elevated phenylketones.', deck: 'DoctorKishor::NEET_PG_Vault::Biochemistry', subject: 'Biochemistry', tags: ['inborn-errors', 'amino-acids'] },
  { type: 'Basic', front: 'What is the biochemical hallmark and clinical manifestation of Wernicke-Korsakoff Syndrome?', back: 'Deficiency of <strong>Thiamine (Vitamin B1)</strong>, which impairs pyruvate dehydrogenase and alpha-ketoglutarate dehydrogenase.<br><strong>Classic Triad:</strong> Encephalopathy + Oculomotor dysfunction (nystagmus, ophthalmoplegia) + Ataxia. Korsakoff adds confabulation and anterograde amnesia (mammillary body necrosis).', deck: 'DoctorKishor::NEET_PG_Vault::Biochemistry', subject: 'Biochemistry', tags: ['vitamins', 'neurology'] },

  // Pharmacology
  { type: 'Cloze', text: 'The drug of choice for acute organophosphate poisoning is {{c1::Atropine}} (competitive muscarinic antagonist to reverse SLUDGE symptoms) combined with {{c2::Pralidoxime (2-PAM)}} to reactivate phosphorylated acetylcholinesterase before aging occurs.', deck: 'DoctorKishor::NEET_PG_Vault::Pharmacology', subject: 'Pharmacology', tags: ['autonomic', 'antidotes', 'toxicology'] },
  { type: 'Basic', front: 'Why are ACE Inhibitors (e.g. Enalapril) contraindicated in Bilateral Renal Artery Stenosis?', back: 'ACE inhibitors inhibit Angiotensin II-mediated constriction of the <strong>efferent arteriole</strong>. In bilateral renal artery stenosis, GFR is highly dependent on efferent vasoconstriction; blocking this causes a precipitous drop in intraglomerular pressure and <strong>acute renal failure</strong>.', deck: 'DoctorKishor::NEET_PG_Vault::Pharmacology', subject: 'Pharmacology', tags: ['cardiology', 'nephrology', 'mechanism'] },
  { type: 'Cloze', text: '{{c1::Adenosine}} is the drug of choice for terminating Paroxysmal Supraventricular Tachycardia (PSVT), acting on {{c2::A1 receptors}} to activate potassium channels and hyperpolarize the AV node. Its ultra-short half-life is < {{c3::10 seconds}}.', deck: 'DoctorKishor::NEET_PG_Vault::Pharmacology', subject: 'Pharmacology', tags: ['cardiology', 'antiarrhythmic', 'high-yield'] },
  { type: 'Basic', front: 'Classify First-Line Anti-Tubercular Drugs (HRZE) with their hallmark adverse effects:', back: '<ul><li><strong>Isoniazid (H):</strong> Peripheral neuropathy (prevent with Pyridoxine/Vit B6), Hepatotoxicity, Sideroblastic anemia</li><li><strong>Rifampicin (R):</strong> Orange/red urine & secretions, CYP450 inducer, Hepatotoxicity</li><li><strong>Pyrazinamide (Z):</strong> Hyperuricemia (Gout), Hepatotoxicity (most hepatotoxic)</li><li><strong>Ethambutol (E):</strong> Optic neuritis (red-green color blindness), hyperuricemia</li></ul>', deck: 'DoctorKishor::NEET_PG_Vault::Pharmacology', subject: 'Pharmacology', tags: ['infectious-disease', 'pulmonology', 'mnemonics'] },
  { type: 'Cloze', text: '{{c1::Sugammadex}} is a modified gamma-cyclodextrin that selectively binds and encapsulates {{c2::Rocuronium and Vecuronium}}, providing rapid reversal of neuromuscular blockade without cholinergic side effects.', deck: 'DoctorKishor::NEET_PG_Vault::Pharmacology', subject: 'Pharmacology', tags: ['anesthesia', 'reversal-agents'] },

  // Pathology
  { type: 'Cloze', text: 'In Burkitt Lymphoma, the characteristic cytogenetic translocation is {{c1::t(8;14)}}, causing overexpression of the {{c2::c-MYC}} oncogene, producing a pathognomonic {{c3::starry sky appearance}} on histology.', deck: 'DoctorKishor::NEET_PG_Vault::Pathology', subject: 'Pathology', tags: ['hematology', 'cytogenetics', 'histology'] },
  { type: 'Basic', front: 'Contrast the histopathologic findings of Crohn Disease vs Ulcerative Colitis:', back: '<table border="1" style="border-collapse:collapse;width:100%"><tr><th>Feature</th><th>Crohn Disease</th><th>Ulcerative Colitis</th></tr><tr><td>Location</td><td>Anywhere (terminal ileum most common), Skip lesions</td><td>Rectum extending proximally, continuous</td></tr><tr><td>Depth</td><td>Transmural (fistulae, creeping fat)</td><td>Mucosa and submucosa only</td></tr><tr><td>Granulomas</td><td>Non-caseating granulomas (50%)</td><td>Crypt abscesses, NO granulomas</td></tr><tr><td>Lead-pipe sign</td><td>Cobblestone mucosa, string sign of Kantor</td><td>Lead-pipe colon on barium</td></tr></table>', deck: 'DoctorKishor::NEET_PG_Vault::Pathology', subject: 'Pathology', tags: ['gastroenterology', 'high-yield-table', 'biopsy'] },
  { type: 'Cloze', text: '{{c1::Reed-Sternberg cells}} (binucleated "owl-eye" appearance with prominent eosinophilic nucleoli) are diagnostic of {{c2::Hodgkin Lymphoma}} and typically express surface markers {{c3::CD15 and CD30}}.', deck: 'DoctorKishor::NEET_PG_Vault::Pathology', subject: 'Pathology', tags: ['hematopathology', 'immunohistochemistry'] },
  { type: 'Basic', front: 'What is the characteristic histological finding in Papillary Thyroid Carcinoma?', back: '• <strong>Orphan Annie eye nuclei</strong> (ground-glass empty-appearing nuclei)<br>• <strong>Nuclear pseudo-inclusions and grooves</strong> ("coffee bean" nuclei)<br>• <strong>Psammoma bodies</strong> (concentric lamellated calcifications).', deck: 'DoctorKishor::NEET_PG_Vault::Pathology', subject: 'Pathology', tags: ['endocrine-pathology', 'histology'] },

  // Microbiology
  { type: 'Basic', front: 'Interpret the Serological Markers of Hepatitis B Virus Infection:', back: '<ul><li><strong>HBsAg (+):</strong> Active infection (acute or chronic if > 6 months)</li><li><strong>Anti-HBs (+):</strong> Immunity (via vaccination if isolated, or recovery if Anti-HBc IgG also +)</li><li><strong>Anti-HBc IgM (+):</strong> Acute / recent infection (sole marker in "Window Period")</li><li><strong>HBeAg (+):</strong> High viral replication, high infectivity</li><li><strong>Anti-HBe (+):</strong> Low viral replication, low infectivity</li></ul>', deck: 'DoctorKishor::NEET_PG_Vault::Microbiology', subject: 'Microbiology', tags: ['virology', 'serology-pearl', 'hepatology'] },
  { type: 'Cloze', text: 'The causative organism of Syphilis is {{c1::Treponema pallidum}} (spirochete), best visualized using {{c2::Dark-field microscopy}} in primary chancre. Screening is done with {{c3::VDRL / RPR}} and confirmed via {{c4::FTA-ABS / TPHA}}.', deck: 'DoctorKishor::NEET_PG_Vault::Microbiology', subject: 'Microbiology', tags: ['bacteriology', 'std', 'diagnostics'] },
  { type: 'Cloze', text: '{{c1::Streptococcus pneumoniae}} is catalase negative, alpha-hemolytic, {{c2::optochin sensitive}}, and {{c3::bile soluble}}, with a polysaccharide capsule producing a positive Neufeld Quellung reaction.', deck: 'DoctorKishor::NEET_PG_Vault::Microbiology', subject: 'Microbiology', tags: ['bacteriology', 'gram-positive'] },

  // Forensic Medicine
  { type: 'Cloze', text: '{{c1::Chipping (powder tattooing)}} around a firearm entry wound occurs in {{c2::close range (up to 1-2 feet)}} firing, caused by unburnt gunpowder particles embedded into the dermis.', deck: 'DoctorKishor::NEET_PG_Vault::Forensic Medicine', subject: 'Forensic Medicine', tags: ['ballistics', 'trauma-forensics'] },
  { type: 'Basic', front: 'What is Casper Dictum regarding the rate of postmortem putrefaction?', back: 'Rate of putrefaction: <strong>1 week in Air = 2 weeks in Water = 8 weeks in Earth (Buried)</strong> (Ratio 1 : 2 : 8).', deck: 'DoctorKishor::NEET_PG_Vault::Forensic Medicine', subject: 'Forensic Medicine', tags: ['thanatology', 'forensic-pearls'] },

  // SPM / Community Medicine
  { type: 'Cloze', text: 'The epidemiological study design that is best suited for rare diseases is the {{c1::Case-Control study}} (measure of association: {{c2::Odds Ratio}}), whereas the {{c3::Cohort study}} is best for rare exposures (measure: {{c4::Relative Risk}}).', deck: 'DoctorKishor::NEET_PG_Vault::Social and Preventive Medicine', subject: 'Social and Preventive Medicine', tags: ['epidemiology', 'study-designs', 'biostatistics'] },
  { type: 'Basic', front: 'Define Sensitivity, Specificity, Positive Predictive Value (PPV) and Negative Predictive Value (NPV):', back: '• <strong>Sensitivity:</strong> TP / (TP + FN) — true positive rate, rules OUT disease (SnOUT)<br>• <strong>Specificity:</strong> TN / (TN + FP) — true negative rate, rules IN disease (SpIN)<br>• <strong>PPV:</strong> TP / (TP + FP) — directly proportional to disease prevalence<br>• <strong>NPV:</strong> TN / (TN + FN) — inversely proportional to disease prevalence.', deck: 'DoctorKishor::NEET_PG_Vault::Social and Preventive Medicine', subject: 'Social and Preventive Medicine', tags: ['biostatistics', 'screening'] },

  // ENT
  { type: 'Basic', front: 'Differentiate Rinne and Weber Tuning Fork Tests in Conductive vs Sensorineural Hearing Loss:', back: '<ul><li><strong>Rinne Test (512 Hz):</strong><br>• Normal / SNHL: Air Conduction > Bone Conduction (Positive)<br>• Conductive Hearing Loss: Bone Conduction > Air Conduction (Negative)</li><li><strong>Weber Test:</strong><br>• Conductive Loss: Lateralizes to the <em>affected (bad) ear</em><br>• Sensorineural Loss: Lateralizes to the <em>unaffected (normal/better) ear</em></li></ul>', deck: 'DoctorKishor::NEET_PG_Vault::ENT', subject: 'ENT', tags: ['audiology', 'clinical-skills', 'exam-favorite'] },
  { type: 'Cloze', text: 'Meniere disease is caused by {{c1::endolymphatic hydrops}} and is characterized by the classic tetrad of: {{c2::episodic rotational vertigo}}, {{c3::fluctuating low-frequency sensorineural hearing loss}}, {{c4::tinnitus}}, and {{c5::aural fullness}}.', deck: 'DoctorKishor::NEET_PG_Vault::ENT', subject: 'ENT', tags: ['inner-ear', 'vertigo', 'audio-pearl'] },
  { type: 'Basic', front: 'What is Trotter Triad in Nasopharyngeal Carcinoma?', back: '1. Conductive deafness (due to Eustachian tube obstruction)<br>2. Ipsilateral facial pain / numbness (involving CN V3)<br>3. Palatal paralysis (involving CN X)', deck: 'DoctorKishor::NEET_PG_Vault::ENT', subject: 'ENT', tags: ['head-neck', 'triads', 'oncology'] },

  // Ophthalmology
  { type: 'Cloze', text: 'In Acute Angle-Closure Glaucoma, the definitive surgical treatment of choice is {{c1::Laser Peripheral Iridotomy (LPI)}} in both the affected and fellow prophylactic eye.', deck: 'DoctorKishor::NEET_PG_Vault::Ophthalmology', subject: 'Ophthalmology', tags: ['glaucoma', 'surgical-pearl', 'emergency'] },
  { type: 'Basic', front: 'What are the classic fundus findings of Central Retinal Artery Occlusion (CRAO)?', back: '• <strong>Cherry-red spot</strong> at the fovea (due to choroidal circulation shining through thin foveal retina)<br>• Diffuse retinal pallor / milky white edema<br>• Boxcarring (cattle-trucking) of retinal vessels<br>• Sudden, painless, severe monocular vision loss.', deck: 'DoctorKishor::NEET_PG_Vault::Ophthalmology', subject: 'Ophthalmology', tags: ['retina', 'fundoscopy', 'emergency'] },

  // General Medicine
  { type: 'Cloze', text: 'In ST-Elevation Myocardial Infarction (STEMI), ST elevations in leads V1-V4 indicate an {{c1::Anterior wall}} infarction supplied by the {{c2::Left Anterior Descending (LAD)}} artery.', deck: 'DoctorKishor::NEET_PG_Vault::General Medicine', subject: 'General Medicine', tags: ['cardiology', 'ecg', 'coronary-anatomy'] },
  { type: 'Basic', front: 'What is the diagnostic criteria and treatment of choice for Diabetic Ketoacidosis (DKA)?', back: '<strong>Triad:</strong> Hyperglycemia (> 250 mg/dL), High Anion Gap Metabolic Acidosis (pH < 7.3, HCO3 < 18), Ketonemia / Ketonuria.<br><strong>Management:</strong><br>1. IV 0.9% Normal Saline hydration (most crucial initial step)<br>2. Regular IV Insulin infusion (0.1 U/kg/hr) — check Potassium FIRST (do not start if K+ < 3.3)<br>3. Potassium replacement to prevent hypokalemia.', deck: 'DoctorKishor::NEET_PG_Vault::General Medicine', subject: 'General Medicine', tags: ['endocrinology', 'emergency', 'guidelines'] },

  // General Surgery
  { type: 'Cloze', text: 'In trauma evaluation, the FAST exam (Focused Assessment with Sonography for Trauma) evaluates 4 acoustic windows: {{c1::Morison pouch (hepatorenal)}}, {{c2::splenorenal recess}}, {{c3::suprapubic (pouch of Douglas)}}, and {{c4::subxiphoid pericardial window}}.', deck: 'DoctorKishor::NEET_PG_Vault::General Surgery', subject: 'General Surgery', tags: ['trauma', 'ultrasound', 'atls'] },
  { type: 'Basic', front: 'What is the most common cause of early vs late Post-Thyroidectomy Hemorrhage?', back: '• <strong>Reactionary Hemorrhage (first 24 hours):</strong> Slipped ligature on superior thyroid artery; causes rapid tracheal compression & airway compromise. Immediate bedside wound reopening is mandatory!<br>• <strong>Secondary Hemorrhage (7-10 days):</strong> Wound infection eroding a vessel.', deck: 'DoctorKishor::NEET_PG_Vault::General Surgery', subject: 'General Surgery', tags: ['endocrine-surgery', 'complications'] },

  // OBG
  { type: 'Cloze', text: 'The drug of choice for the prevention and treatment of seizures in severe preeclampsia and eclampsia is {{c1::Magnesium Sulfate (MgSO4)}} using the {{c2::Pritchard regimen}} (loading + maintenance). Toxicity is monitored via {{c3::patellar tendon reflex}}, respiratory rate (> 12/min), and urine output (> 30 mL/hr). Antidote is {{c4::Calcium Gluconate}}.', deck: 'DoctorKishor::NEET_PG_Vault::Obstetrics and Gynecology', subject: 'Obstetrics and Gynecology', tags: ['obstetrics', 'eclampsia', 'pharmacology'] },

  // Pediatrics
  { type: 'Basic', front: 'What is the single most common cyanotic congenital heart disease manifesting in the neonatal period vs infancy?', back: '• <strong>Neonatal Period (Day 1-2):</strong> Transposition of Great Arteries (TGA) - "Egg on string" appearance on X-ray.<br>• <strong>After 1 Month / Infancy:</strong> Tetralogy of Fallot (TOF) - "Boot-shaped heart" on X-ray, presenting with cyanotic "tet spells".', deck: 'DoctorKishor::NEET_PG_Vault::Pediatrics', subject: 'Pediatrics', tags: ['cardiology', 'neonatology', 'radiology-xray'] },

  // Dermatology
  { type: 'Cloze', text: '{{c1::Auspitz sign}} (pinpoint bleeding upon scraping silvery scales) and {{c2::Koebner phenomenon}} (isomorphic response at sites of trauma) are classic clinical features of {{c3::Psoriasis vulgaris}}.', deck: 'DoctorKishor::NEET_PG_Vault::Dermatology', subject: 'Dermatology', tags: ['papulosquamous', 'signs'] },
  { type: 'Basic', front: 'Differentiate Pemphigus Vulgaris vs Bullous Pemphigoid on Direct Immunofluorescence (DIF):', back: '• <strong>Pemphigus Vulgaris:</strong> Antibodies against Desmoglein 3/1; Intraepidermal flaccid bullae, Nikolsky (+); DIF shows <em>intercellular fishnet/lace-like IgG/C3 pattern</em>.<br>• <strong>Bullous Pemphigoid:</strong> Antibodies against Hemidesmosomes (BP180/BP230); Subepidermal tense bullae, Nikolsky (-); DIF shows <em>linear basement membrane IgG/C3 band</em>.', deck: 'DoctorKishor::NEET_PG_Vault::Dermatology', subject: 'Dermatology', tags: ['immunodermatology', 'vesiculobullous'] },

  // Psychiatry
  { type: 'Cloze', text: 'The first-line mood stabilizer for classic acute mania and bipolar maintenance is {{c1::Lithium}} (therapeutic range: {{c2::0.6 - 1.2 mEq/L}}). Toxicity requires hemodialysis if levels exceed {{c3::4.0 mEq/L}} or severe neurotoxicity.', deck: 'DoctorKishor::NEET_PG_Vault::Psychiatry', subject: 'Psychiatry', tags: ['mood-disorders', 'psychopharmacology'] },

  // Radiology
  { type: 'Basic', front: 'Identify the classic radiographic signs associated with these chest conditions:', back: '• <strong>Hampton Hump:</strong> Wedge-shaped peripheral opacity pointing to hilum -> Pulmonary Embolism / Infarct.<br>• <strong>Westermark Sign:</strong> Focal oligemia distal to occluded vessel -> Pulmonary Embolism.<br>• <strong>Gloved Finger Sign:</strong> Bronchial impaction -> Allergic Bronchopulmonary Aspergillosis (ABPA).<br>• <strong>Continuous Diaphragm Sign:</strong> Pneumomediastinum.', deck: 'DoctorKishor::NEET_PG_Vault::Radiology', subject: 'Radiology', tags: ['chest-imaging', 'xray-signs'] },

  // Orthopedics
  { type: 'Cloze', text: 'A fracture of the proximal third of the ulna with dislocation of the radial head is known as {{c1::Monteggia fracture-dislocation}} (nerve injured: {{c2::Posterior Interosseous Nerve / PIN}}), whereas a fracture of distal third of radius with DRUJ dislocation is {{c3::Galeazzi fracture}}.', deck: 'DoctorKishor::NEET_PG_Vault::Orthopedics', subject: 'Orthopedics', tags: ['fractures', 'eponyms', 'upper-limb'] }
];

// Expand cards with realistic FSRS state data
const flashcards = rawCardsData.map((c, i) => {
  const cardId = `card_${1786500000000 + i}`;
  const revCount = 2 + (i % 5);
  const stab = 15.0 + (i * 3.8);
  const diff = 3.0 + ((i % 7) * 0.7);
  const intv = Math.min(65, Math.round(stab * 0.35));

  return {
    id: cardId,
    type: c.type,
    front: c.front || '',
    back: c.back || '',
    text: c.text || '',
    deck: c.deck,
    subject: c.subject,
    subdeck: c.deck.split('::').pop(),
    tags: c.tags || ['neet-pg', 'high-yield'],
    stability: Number(stab.toFixed(2)),
    difficulty: Number(diff.toFixed(2)),
    interval: intv,
    reps: revCount,
    lapses: i === 4 ? 2 : 0,
    state: 2,
    due: addDays(TODAY_STR, (i % 14) - 2),
    last_review: addDays(TODAY_STR, -((i % 10) + 1)),
    rating: 3,
    has_image: false,
    include_image: false,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-08-16T12:00:00.000Z'
  };
});

// -------------------------------------------------------------
// 6. STUDY LOGS & MULTI-MONTH TELEMETRY (75 Days of History)
// -------------------------------------------------------------
const studyLogs = {};
let totalCalculatedHours = 0;
let totalCardsReviewed = 0;

for (let d = 75; d >= 0; d--) {
  const curDateStr = addDays(TODAY_STR, -d);
  const curDateObj = new Date(curDateStr);
  const dayOfWeek = curDateObj.getDay();

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const questionsCount = 30 + Math.floor(Math.sin(d) * 15) + (isWeekend ? 35 : 0);
  const cardsCount = 40 + Math.floor(Math.cos(d) * 20) + (isWeekend ? 25 : 0);
  const pagesCount = 18 + Math.floor(Math.sin(d * 1.5) * 10) + (isWeekend ? 15 : 0);
  const studyHours = Number((4.5 + Math.sin(d * 0.8) * 1.5 + (isWeekend ? 2.5 : 0)).toFixed(1));

  totalCalculatedHours += studyHours;
  totalCardsReviewed += cardsCount;

  const dayFsrsLogs = [];
  const logSubjects = ['Anatomy', 'Pharmacology', 'Pathology', 'Microbiology', 'ENT', 'General Medicine', 'General Surgery', 'Pediatrics', 'Ophthalmology'];
  
  const sessionsCount = 2 + (d % 3);
  for (let s = 0; s < sessionsCount; s++) {
    const pickedSubName = logSubjects[(d + s) % logSubjects.length];
    const subDoc = subjectTrackerData.find(sub => sub.subject === pickedSubName);
    const topicKeys = subDoc ? Object.keys(subDoc.topics) : [];
    const topicName = topicKeys.length > 0 ? topicKeys[(d * 2 + s) % topicKeys.length] : 'High Yield Review';
    const topicObj = subDoc?.topics[topicName];

    if (topicObj && Array.isArray(topicObj.studyDates) && !topicObj.studyDates.includes(curDateStr)) {
      topicObj.studyDates.push(curDateStr);
      topicObj.studyDates.sort();
      if (!topicObj.lastReviewDate || topicObj.lastReviewDate < curDateStr) {
        topicObj.lastReviewDate = curDateStr;
      }
      topicObj.reviewCount = (topicObj.reviewCount || 0) + 1;
    }

    const pageWeight = topicObj ? Math.max(2, (Number(topicObj.endPage) - Number(topicObj.page) + 1) || 5) : 6;
    const minsPerPage = Number((2.2 + ((d + s) % 4) * 0.4).toFixed(2));
    const durationMins = Math.round(pageWeight * minsPerPage);
    const rating = ((d + s) % 11 === 0) ? 2 : (((d + s) % 17 === 0) ? 1 : (((d + s) % 5 === 0) ? 4 : 3));
    const revTier = (d > 50) ? 'NEW' : (d > 25 ? 'R1' : (d > 10 ? 'R2' : 'RN'));
    const hourOfDay = s === 0 ? 9 : (s === 1 ? 15 : 21);

    dayFsrsLogs.push({
      id: `log_${curDateStr.replace(/-/g, '')}_${s}_${Math.random().toString(36).slice(2, 7)}`,
      subject: pickedSubName,
      topicName: topicName,
      pageWeight: pageWeight,
      dateStr: curDateStr,
      rating: rating,
      stability: Number((35.0 + (75 - d) * 0.9).toFixed(2)),
      difficulty: Number((4.5 + Math.sin(d) * 0.8).toFixed(2)),
      nextReviewDue: addDays(curDateStr, 7 + (s * 4)),
      actualDurationMins: durationMins,
      durationMins: durationMins,
      minsPerPage: minsPerPage,
      revisionTier: rating === 1 ? 'AGAIN' : revTier,
      continuousSessionMins: s === 0 ? 45 : (s === 1 ? 60 : 75),
      hourOfDay: hourOfDay,
      timestamp: formatDateISO(curDateStr, hourOfDay, 15)
    });
  }

  const gts = [];
  if (dayOfWeek === 0 && d <= 60 && d % 14 === 0) {
    const gtNumber = 15 - Math.floor(d / 14);
    const score = 142 + (gtNumber * 3);
    gts.push({
      id: `gt_${gtNumber}`,
      name: `Grand Test ${gtNumber} (Full 200 MCQ Mock)`,
      score: score,
      total: 200,
      correct: score,
      incorrect: 200 - score - 8,
      unattempted: 8,
      percentile: Number((92.5 + (gtNumber * 0.4)).toFixed(1)),
      date: curDateStr
    });
  }

  studyLogs[curDateStr] = {
    questions: questionsCount,
    cards: cardsCount,
    hours: studyHours,
    pages: pagesCount,
    gts: gts,
    fsrsLogs: dayFsrsLogs,
    sessions: [
      { id: `ses_${curDateStr}_1`, type: 'notes', hours: Number((studyHours * 0.5).toFixed(1)), concentration: 8 },
      { id: `ses_${curDateStr}_2`, type: 'cards', hours: Number((studyHours * 0.3).toFixed(1)), concentration: 9 },
      { id: `ses_${curDateStr}_3`, type: 'questions', hours: Number((studyHours * 0.2).toFixed(1)), concentration: 8 }
    ]
  };
}

// -------------------------------------------------------------
// 7. CAMP DATA & CAMP DAILY LOGS (Telemetry & Habits)
// -------------------------------------------------------------
const campHistory = [];
const campTimerHistory = [];
const campDailyLogs = [];

for (let d = 30; d >= 0; d--) {
  const curDateStr = addDays(TODAY_STR, -d);
  const score = Number((68.0 + (30 - d) * 0.75 + Math.sin(d) * 4).toFixed(1));
  const monthDay = new Date(curDateStr).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });

  campHistory.push({
    date: monthDay,
    score: score,
    fullDate: curDateStr,
    timestamp: new Date(curDateStr).getTime()
  });

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[new Date(curDateStr).getDay()];

  campTimerHistory.push({
    date: curDateStr,
    dayOfWeek: dayName,
    period: 'preLunch',
    hours: 2.5,
    concentration: 8,
    type: 'notes',
    pagesRead: 14,
    questionsSolved: 25,
    cardsReviewed: 35,
    gtDetails: null
  });

  campDailyLogs.push({
    dateStr: curDateStr,
    bedToBook: d % 4 === 0 ? 'Less than 30 mins' : 'Less than 45 mins',
    sessions: {
      preLunch: [
        { id: `camp_${curDateStr}_m1`, hours: '2.5', concentration: 8, type: 'notes', isManual: true }
      ],
      midDay: [
        { id: `camp_${curDateStr}_a1`, hours: '2.0', concentration: 9, type: 'cards', isManual: true }
      ],
      postDinner: [
        { id: `camp_${curDateStr}_n1`, hours: '1.5', concentration: 8, type: 'questions', isManual: true },
        { id: `camp_${curDateStr}_n2`, hours: '1.0', concentration: 9, type: 'revision', isManual: true }
      ]
    },
    updatedAt: formatDateISO(curDateStr, 23, 0)
  });
}

const campData = [
  {
    key: 'history',
    data: campHistory,
    updatedAt: '2026-08-16T12:00:00.000Z'
  },
  {
    key: 'student_info',
    data: {
      name: 'Dr. Arjun Sharma',
      phone: '+919876543210',
      email: 'arjun.sharma.med@autoanki.vault',
      college: 'AIIMS New Delhi',
      targetRank: 'Top 50 All India',
      examYear: 'NEET PG 2026 / INI-CET Nov 2026'
    },
    updatedAt: '2026-08-16T12:00:00.000Z'
  },
  {
    key: 'timer_history',
    data: campTimerHistory,
    updatedAt: '2026-08-16T12:00:00.000Z'
  }
];

// -------------------------------------------------------------
// 8. PYT DATA & PROGRESS (Past Year Topics across 6 core subjects)
// -------------------------------------------------------------
const pytData = [
  {
    key: 'ent',
    id: 'ent',
    subject: 'ENT',
    topics: `Anatomy of external auditory canal\nTympanic membrane quadrants\nBlood supply of tympanic membrane\nEustachian tube anatomy and function\nOtitis externa\nAcute otitis media\nComplications of otitis media\nChronic suppurative otitis media (CSOM)\nSafe vs unsafe CSOM\nCholesteatoma\nOssicular chain erosion\nTympanoplasty types\nMastoid air cell system\nMastoiditis\nAnatomy of cochlea\nOrgan of Corti\nPhysiology of hearing\nTypes of hearing loss\nRinne and Weber tests\nAudiometry interpretation\nOtoacoustic emissions\nAuditory brainstem response\nPresbycusis\nNoise-induced hearing loss\nBenign paroxysmal positional vertigo (BPPV)\nDix–Hallpike test\nMeniere disease\nVestibular neuritis\nLittle’s area (Kiesselbach plexus)\nEpistaxis management\nDeviated nasal septum\nOsteomeatal complex\nAntrochoanal polyp\nAdenoid hypertrophy\nNasopharyngeal carcinoma\nAcute tonsillitis\nPeritonsillar abscess (quinsy)\nVocal cord nodules and polyps\nLaryngeal carcinoma\nRecurrent laryngeal nerve palsy\nTracheostomy indications`,
    updatedAt: '2026-08-16T12:00:00.000Z'
  },
  {
    key: 'pharmacology',
    id: 'pharmacology',
    subject: 'Pharmacology',
    topics: `Cholinergic agonists and antagonists\nOrganophosphate poisoning and management\nAdrenergic receptors and agonists\nBeta blockers in heart failure and hypertension\nACE inhibitors and ARBs mechanism\nCalcium channel blockers\nAnti-arrhythmic drugs Vaughan Williams classification\nDigoxin toxicity and treatment\nDiuretics classification and site of action\nAnti-tubercular drugs HRZE side effects\nSecond line anti-tubercular drugs\nPenicillins and Cephalosporins classification\nMacrolides and Aminoglycosides toxicity\nFluoroquinolones adverse effects\nAntiretroviral therapy (HAART regimens)\nAntifungal agents (Amphotericin B, Azoles)\nAntimalarial drugs (Artemisinin combination therapy)\nChemotherapy alkylating agents and antimetabolites\nMonoclonal antibodies in oncology\nAnti-epileptics narrow therapeutic index\nGeneral and local anesthetics\nOpioid analgesics and Naloxone\nNSAIDs COX-1 vs COX-2 selectivity\nInsulin preparations and oral hypoglycemics\nThyroid drugs and anti-thyroid agents`,
    updatedAt: '2026-08-16T12:00:00.000Z'
  },
  {
    key: 'pathology',
    id: 'pathology',
    subject: 'Pathology',
    topics: `Reversible vs irreversible cell injury\nApoptosis intrinsic and extrinsic pathways\nTypes of necrosis (Coagulative, Liquefactive, Caseous)\nFree radical injury and scavengers\nCellular adaptations (Hyperplasia, Metaplasia, Dysplasia)\nAcute inflammation cellular and vascular events\nChemical mediators of inflammation\nGranulomatous inflammation causes and morphology\nWound healing by primary and secondary intention\nOncogenes and tumor suppressor genes (p53, RB)\nHallmarks of cancer\nParaneoplastic syndromes\nStaging vs grading of tumors\nIron deficiency anemia vs Anemia of chronic disease\nMegaloblastic anemia and peripheral smear\nHemolytic anemias (G6PD, Hereditary Spherocytosis)\nAcute leukemias (AML vs ALL cytochemistry)\nChronic leukemias (CML Philadelphia chromosome, CLL)\nHodgkin vs Non-Hodgkin lymphoma\nMultiple myeloma diagnostic criteria\nGlomerulonephritis pathology\nMembranous nephropathy vs FSGS`,
    updatedAt: '2026-08-16T12:00:00.000Z'
  },
  {
    key: 'general_medicine',
    id: 'general_medicine',
    subject: 'General Medicine',
    topics: `Acute Coronary Syndrome STEMI vs NSTEMI\nECG localization of myocardial infarction\nHeart failure with preserved vs reduced ejection fraction\nInfective endocarditis Duke criteria\nHypertension JNC 8 and ACC/AHA guidelines\nCommunity-acquired pneumonia CURB-65 score\nCOPD management and GOLD staging\nAsthma GINA guidelines\nDiabetic Ketoacidosis management algorithm\nHyperosmolar Hyperglycemic State\nThyroid storm vs Myxedema coma\nCushing syndrome workup and high-dose dexamethasone test\nAcute Kidney Injury KDIGO classification\nHyponatremia correction and Osmotic Demyelination Syndrome\nHyperkalemia ECG changes and emergent stabilization\nIschemic stroke tPA indications and contraindications\nSubarachnoid hemorrhage Hunt & Hess scale\nBacterial meningitis CSF analysis and empiric antibiotics\nEpilepsy and Status Epilepticus management\nSystemic Lupus Erythematosus SLICC criteria`,
    updatedAt: '2026-08-16T12:00:00.000Z'
  },
  {
    key: 'general_surgery',
    id: 'general_surgery',
    subject: 'General Surgery',
    topics: `Advanced Trauma Life Support (ATLS) Primary Survey\nHypovolemic shock resuscitation and Massive Transfusion Protocol\nBurns Parkland formula and Wallace Rule of Nines\nBreast carcinoma triple assessment and TNM staging\nThyroid carcinoma subtypes and surgical management\nSolitary thyroid nodule Bethesda classification\nInguinal hernia anatomy and Lichtenstein mesh repair\nAcute appendicitis Alvarado score\nIntestinal obstruction small vs large bowel\nColorectal carcinoma screening and Dukes staging\nAcute pancreatitis Atlanta classification and Ranson criteria\nCholelithiasis, Choledocholithiasis, and Charcot triad\nVaricose veins CEAP classification and Trendelenburg test\nPeripheral arterial disease Fontaine stages and ABPI`,
    updatedAt: '2026-08-16T12:00:00.000Z'
  },
  {
    key: 'obstetrics_and_gynecology',
    id: 'obstetrics_and_gynecology',
    subject: 'Obstetrics and Gynecology',
    topics: `Antenatal care visits and WHO recommendations\nFirst and second trimester maternal serum screening\nPreeclampsia and Eclampsia Pritchard regimen\nGestational Diabetes Mellitus DIPSI and ADA criteria\nAntepartum hemorrhage Placenta Previa vs Abruption\nPostpartum Hemorrhage (PPH) 4 Ts and management\nNormal labor stages and Partograph interpretation\nMalpresentations (Breech, Face, Brow)\nCervical cancer screening Pap smear and Bethesda system\nEndometrial hyperplasia vs Carcinoma\nOvarian tumors germ cell vs epithelial\nPolycystic Ovarian Syndrome (PCOS) Rotterdam criteria\nInfertility male and female evaluation\nContraception methods and Medical Termination of Pregnancy (MTP)`,
    updatedAt: '2026-08-16T12:00:00.000Z'
  }
];

const pytUserProgress = [
  {
    id: 'ent',
    subject: 'ENT',
    progress_map: {
      'Tympanic membrane quadrants': 1,
      'Safe vs unsafe CSOM': 1,
      'Cholesteatoma': 1,
      'Rinne and Weber tests': 1,
      'Meniere disease': 1,
      'Epistaxis management': 1,
      'Nasopharyngeal carcinoma': 1
    },
    pages_map: {
      'Tympanic membrane quadrants': [{ source: 'ENT Marrow Ed8', pages: '3-5', offset: 0 }],
      'Safe vs unsafe CSOM': [{ source: 'ENT Marrow Ed8', pages: '12-16', offset: 0 }],
      'Cholesteatoma': [{ source: 'ENT Marrow Ed8', pages: '18-22', offset: 0 }],
      'Rinne and Weber tests': [{ source: 'ENT Marrow Ed8', pages: '25-28', offset: 0 }]
    }
  },
  {
    id: 'pharmacology',
    subject: 'Pharmacology',
    progress_map: {
      'Organophosphate poisoning and management': 1,
      'Anti-arrhythmic drugs Vaughan Williams classification': 1,
      'Anti-tubercular drugs HRZE side effects': 1
    },
    pages_map: {
      'Organophosphate poisoning and management': [{ source: 'KDT 8th Ed', pages: '102-108', offset: 0 }]
    }
  },
  {
    id: 'pathology',
    subject: 'Pathology',
    progress_map: {
      'Apoptosis intrinsic and extrinsic pathways': 1,
      'Hodgkin vs Non-Hodgkin lymphoma': 1
    },
    pages_map: {
      'Apoptosis intrinsic and extrinsic pathways': [{ source: 'Robbins 10th Ed', pages: '45-52', offset: 0 }]
    }
  }
];

// -------------------------------------------------------------
// 9. TEXTBOOKS METADATA
// -------------------------------------------------------------
const textbooksMetadata = [
  {
    id: 'book_marrow_ent',
    subject: 'ENT',
    title: 'Marrow ENT Revision Notes Ed8',
    fileName: 'Marrow_ENT_Ed8_Full.pdf',
    totalPages: 118,
    offset: 0,
    uploadedAt: '2026-05-10T10:00:00.000Z'
  },
  {
    id: 'book_kdt_pharm',
    subject: 'Pharmacology',
    title: 'KD Tripathi Essentials of Medical Pharmacology',
    fileName: 'KDT_Pharmacology_8th.pdf',
    totalPages: 980,
    offset: 14,
    uploadedAt: '2026-05-12T11:00:00.000Z'
  },
  {
    id: 'book_robbins_path',
    subject: 'Pathology',
    title: 'Robbins & Cotran Pathologic Basis of Disease',
    fileName: 'Robbins_Pathology_10th.pdf',
    totalPages: 1350,
    offset: 22,
    uploadedAt: '2026-05-15T09:00:00.000Z'
  },
  {
    id: 'book_bdc_anatomy',
    subject: 'Anatomy',
    title: 'BD Chaurasia Human Anatomy General & Head-Neck',
    fileName: 'BD_Chaurasia_Vol1.pdf',
    totalPages: 450,
    offset: 8,
    uploadedAt: '2026-05-18T14:00:00.000Z'
  }
];

// -------------------------------------------------------------
// 10. SCANNED PAGES / SCANS STORAGE
// -------------------------------------------------------------
const pagesData = [
  {
    id: 'page_ent_cholesteatoma',
    subject: 'ENT',
    subdeck: 'Ear',
    pageNumber: 14,
    label: 'Cholesteatoma & Radical Mastoidectomy Anatomy',
    notes: 'Diagram showing Attic Retraction Pocket and erosion of scutum.',
    tags: ['cholesteatoma', 'high-yield-diagram'],
    imageBoxes: [
      { ymin: 120, xmin: 80, ymax: 450, xmax: 520, label: 'Attic Perforation Flakes' }
    ],
    createdAt: '2026-06-01T10:00:00.000Z'
  },
  {
    id: 'page_pharm_autonomic',
    subject: 'Pharmacology',
    subdeck: 'Autonomic Nervous System',
    pageNumber: 28,
    label: 'Adrenergic Receptor Subtypes Distribution Table',
    notes: 'Summary of Alpha-1, Alpha-2, Beta-1, Beta-2, Beta-3 tissue distributions and G-protein couplings.',
    tags: ['ans-table', 'g-protein'],
    imageBoxes: [],
    createdAt: '2026-06-05T11:00:00.000Z'
  },
  {
    id: 'page_path_inflammation',
    subject: 'Pathology',
    subdeck: 'General Pathology',
    pageNumber: 35,
    label: 'Arachidonic Acid Metabolites Cascade',
    notes: 'Cyclooxygenase vs Lipoxygenase pathways and pharmacological inhibitors (NSAIDs, Zileuton, Montelukast).',
    tags: ['inflammation', 'biochemical-cascade'],
    imageBoxes: [],
    createdAt: '2026-06-10T14:00:00.000Z'
  }
];

// -------------------------------------------------------------
// 11. TOPIC HINTS (AI-Generated Recall Trees)
// -------------------------------------------------------------
const topicHints = [
  {
    topicId: 'ENT_Pharynx : Part 2 - Adenoids, JNA & Nasopharyngeal Carcinoma',
    hints: [],
    tree: [
      {
        id: '1',
        title: 'Nasopharyngeal Carcinoma (NPC)',
        prompt: 'Recall the etiology, geographical distribution, clinical presentation, and management of NPC.',
        children: [
          {
            id: '1.1',
            title: 'Etiology & Risk Factors',
            prompt: 'Which virus (EBV) and dietary factors (salted fish / nitrosamines) are strongly linked with NPC?'
          },
          {
            id: '1.2',
            title: 'Clinical Presentation & Trotter Triad',
            prompt: 'Recall the presenting cervical lymphadenopathy (fossa of Rosenmuller) and Trotter triad components.'
          },
          {
            id: '1.3',
            title: 'Treatment Modality of Choice',
            prompt: 'Why is Radiotherapy (CCRT) the definitive treatment of choice over surgery?'
          }
        ]
      },
      {
        id: '2',
        title: 'Juvenile Nasopharyngeal Angiofibroma (JNA)',
        prompt: 'Recall the demographics, site of origin, clinical signs, and imaging findings.',
        children: [
          {
            id: '2.1',
            title: 'Demographics & Presentation',
            prompt: 'Adolescent male presenting with painless, recurrent, profuse epistaxis and nasal obstruction.'
          },
          {
            id: '2.2',
            title: 'Diagnostic Imaging Sign',
            prompt: 'What is Holman-Miller sign (antral sign - anterior bowing of posterior maxillary sinus wall)?'
          },
          {
            id: '2.3',
            title: 'Biopsy Contraindication',
            prompt: 'Why is pre-operative biopsy strictly contraindicated in JNA?'
          }
        ]
      }
    ],
    chapterTitle: 'Pharynx : Part 2',
    generatedAt: '2026-08-15T19:01:23.751Z',
    usedModel: 'gemini-3.5-flash',
    startPage: 94,
    endPage: 101
  },
  {
    topicId: 'Pharmacology_Autonomic Nervous System - Cholinergic Drugs & Organophosphate Poisoning',
    hints: [],
    tree: [
      {
        id: '1',
        title: 'Organophosphate Toxicity Mechanisms',
        prompt: 'Recall irreversible inhibition of acetylcholinesterase, acetylcholine accumulation, and clinical signs.',
        children: [
          {
            id: '1.1',
            title: 'SLUDGE / DUMBELS Mnemonic',
            prompt: 'Diarrhea, Urination, Miosis, Bronchorrhea/Bradycardia, Emesis, Lacrimation, Salivation.'
          },
          {
            id: '1.2',
            title: 'Management Algorithm',
            prompt: 'Atropine titration (endpoint: lung base crepitations clear) + Pralidoxime before chemical aging.'
          }
        ]
      }
    ],
    chapterTitle: 'Cholinergic Pharmacology',
    generatedAt: '2026-08-14T15:30:00.000Z',
    usedModel: 'gemini-3.5-flash',
    startPage: 1,
    endPage: 12
  }
];

// -------------------------------------------------------------
// 12. HIERARCHY & SETTINGS
// -------------------------------------------------------------
const hierarchyPaths = [
  'DoctorKishor',
  'DoctorKishor::NEET_PG_Vault',
  ...subjectsDefinitions.map(s => `DoctorKishor::NEET_PG_Vault::${s.subject}`)
];

const deckCardCounts = {};
const subjectCardCounts = {};

subjectsDefinitions.forEach(s => {
  const count = s.topics.length * 18;
  deckCardCounts[`DoctorKishor::NEET_PG_Vault::${s.subject}`] = count;
  subjectCardCounts[s.subject] = count;
});

const hierarchy = {
  paths: hierarchyPaths,
  deckCardCounts,
  subjectCardCounts,
  maxDailyReviewCap: 60
};

const settings = [
  {
    key: 'apiKeys',
    value: {
      imageStorageMode: 'local',
      settingsThemeMode: 'dark',
      aiFeatureModels: {
        cardGeneration: ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'],
        pageIndexing: ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'],
        studyScheduler: ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'],
        autoTagging: ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash']
      },
      autoBackupEnabled: true,
      autoBackupFrequency: 'daily',
      autoBackupRetention: '7'
    },
    updatedAt: '2026-08-16T12:00:00.000Z'
  },
  {
    key: 'bottomNav',
    value: ['studyRoom', 'cards', 'library', 'study', 'smartReview', 'settings'],
    updatedAt: '2026-08-16T12:00:00.000Z'
  },
  {
    key: 'exam_profiles',
    value: examProfiles,
    updatedAt: '2026-08-16T12:00:00.000Z'
  },
  {
    key: 'fsrs_config',
    value: fsrsConfig,
    updatedAt: '2026-08-16T12:00:00.000Z'
  },
  {
    key: 'hierarchy',
    value: hierarchy,
    updatedAt: '2026-08-16T12:00:00.000Z'
  },
  {
    key: 'max_daily_review_cap',
    value: 60,
    updatedAt: '2026-08-16T12:00:00.000Z'
  },
  {
    key: 'obsCustomizerConfig',
    value: {
      obsSelectedWidget: 'todayAgenda',
      obsTheme: 'transparent',
      obsBgColor: '#000000',
      obsTextColor: '#ffffff',
      obsFontSize: 'medium',
      obsBorderRadius: 'xl',
      obsBorderColor: '#3b82f6',
      obsBorderWidth: 0,
      obsOpacity: 100,
      obsShowNotes: true,
      obsShowChecklist: true,
      obsShowUpcoming: true,
      obsHideCompleted: false,
      obsTimerBackground: 'cyberpunk',
      obsTimerBgTheme: 'gradient'
    },
    updatedAt: '2026-08-16T12:00:00.000Z'
  },
  {
    key: 'obsToken',
    value: {
      token: 'obs_demo_vault_token_778912',
      createdAt: 1786727003721
    },
    updatedAt: '2026-08-16T12:00:00.000Z'
  },
  {
    key: 'studyRoomPreferences',
    value: {
      fsYoutubeVideoId: 'jfKfPfyJRdk', // Lofi stream
      fsBgVideoBlur: 2,
      fsBgVideoStartTime: '',
      fullscreenTimerBg: 'cyberpunk',
      fullscreenTimerStyle: 'regular',
      fsBgCategory: 'Anime',
      fsBgVideoVolume: 0,
      fsSoundVolumes: {
        jazz: 0,
        coffee: 15,
        rain: 45,
        lofi: 60,
        fireplace: 10,
        piano: 0,
        nature: 0,
        binaural: 20,
        library: 30,
        ghibli: 0
      },
      fsWidgets: [
        {
          title: 'subjectTracker',
          y: 180,
          h: 390,
          id: 'widget_demo_subject_tracker',
          url: '',
          customCss: 'body { background-color: rgba(0, 0, 0, 0); margin: 0; overflow: hidden; }',
          visible: true,
          backgroundType: 'translucent',
          x: 24,
          type: 'existing_widget',
          nativeId: 'subjectTracker',
          w: 320
        },
        {
          y: 90,
          h: 80,
          visible: true,
          title: 'Study Streak Counter',
          nativeId: 'streakCounter',
          w: 160,
          backgroundType: 'transparent',
          customCss: '',
          fontSize: 12,
          url: '',
          x: 24,
          id: 'widget_demo_streak',
          type: 'existing_widget'
        },
        {
          x: 1280,
          title: 'quickNotes',
          w: 240,
          url: '',
          customCss: '',
          id: 'widget_demo_quick_notes',
          h: 280,
          y: 510,
          backgroundType: 'transparent',
          nativeId: 'quickNotes',
          type: 'existing_widget',
          visible: true
        },
        {
          h: 310,
          y: 180,
          backgroundType: 'translucent',
          url: '',
          nativeId: 'todayStatsOverview',
          w: 250,
          id: 'widget_demo_today_stats',
          title: 'todayStatsOverview',
          visible: true,
          customCss: 'body { background: transparent; }',
          type: 'existing_widget',
          fontSize: 12,
          x: 1270
        }
      ],
      fsTimerFontSize: 142,
      fsTimerOpacity: 100,
      fsTimerPos: { x: 0, y: 0 },
      fsTimerMoved: false,
      fsTimerBlendMode: 'normal',
      fsQuoteVisible: true,
      fsCurrentQuoteIndex: 1,
      fsQuoteShuffleInterval: '5m'
    },
    updatedAt: '2026-08-16T12:00:00.000Z'
  }
];

// -------------------------------------------------------------
// 13. KV STORE CONSOLIDATION
// -------------------------------------------------------------
const kvStore = [
  { key: 'flashcards', value: flashcards, updatedAt: '2026-08-16T12:00:00.000Z' },
  { key: 'pages', value: pagesData, updatedAt: '2026-08-16T12:00:00.000Z' },
  { key: 'study_logs', value: studyLogs, updatedAt: '2026-08-16T12:00:00.000Z' },
  { key: 'subject_tracker_data', value: subjectTrackerData, updatedAt: '2026-08-16T12:00:00.000Z' },
  { key: 'pyt_user_progress', value: pytUserProgress, updatedAt: '2026-08-16T12:00:00.000Z' },
  { key: 'textbooks_metadata', value: textbooksMetadata, updatedAt: '2026-08-16T12:00:00.000Z' },
  {
    key: `active_new_topics_${TODAY_STR}`,
    value: [
      'Anatomy_Perineal Spaces & Ischiorectal Fossa',
      'Anatomy_Larynx Anatomy & Vocal Cord Innervation',
      'Pharmacology_Anti-Epileptics & Narrow Therapeutic Index Drugs',
      'ENT_Larynx : Part 2 - Tracheostomy & Foreign Body Airway'
    ],
    updatedAt: '2026-08-16T12:00:00.000Z'
  },
  {
    key: 'active_new_topics_today',
    value: [
      'Anatomy_Perineal Spaces & Ischiorectal Fossa',
      'Anatomy_Larynx Anatomy & Vocal Cord Innervation',
      'Pharmacology_Anti-Epileptics & Narrow Therapeutic Index Drugs',
      'ENT_Larynx : Part 2 - Tracheostomy & Foreign Body Airway'
    ],
    updatedAt: '2026-08-16T12:00:00.000Z'
  },
  {
    key: 'study_schedule',
    value: {
      [TODAY_STR]: {
        date: TODAY_STR,
        notes: 'Target: Complete Due FSRS Smart Reviews (ENT + Pharm + Pathology), solve 50 Pharmacology MCQs, and do 1 hour of high-yield flashcard drill.',
        tasks: [
          { id: 'task_1', title: 'Complete 12 Due Today FSRS Topics', completed: true },
          { id: 'task_2', title: 'Review 60 Flashcards in Rapid Review', completed: true },
          { id: 'task_3', title: 'Grand Test 15 Mistake Analysis', completed: false }
        ]
      }
    },
    updatedAt: '2026-08-16T12:00:00.000Z'
  },
  {
    key: 'timerState',
    value: {
      timerType: 'pomodoro',
      pomodoroStatus: 'idle',
      pomodoroDuration: 1500,
      pomodoroBreakDuration: 300,
      pomodoroLongBreakDuration: 1200,
      pomodoroTargetRounds: 4,
      pomodoroTimeLeft: 1500,
      pomodoroTimeLeftAtStart: 1500,
      pomodoroStartedAt: null,
      pomodoroMode: 'study',
      pomodoroRounds: 3,
      timerStatus: 'idle',
      timerDuration: 1800,
      timerTimeLeft: 1800,
      timerTimeLeftAtStart: 1800,
      timerStartedAt: null,
      stopwatchStatus: 'idle',
      stopwatchStartedAt: null,
      stopwatchElapsedBeforePause: 0,
      stopwatchLaps: []
    },
    updatedAt: '2026-08-16T12:00:00.000Z'
  },
  {
    key: 'custom_prompts',
    value: [
      {
        id: 'prompt_high_yield_cloze',
        title: 'High-Yield Medical Cloze Extractor',
        promptText: 'Extract key clinical pearls, diagnostic triads, and drug-of-choice associations into concise Anki-style cloze deletions {{c1::...}}.',
        category: 'medical',
        createdAt: '2026-05-20T10:00:00.000Z'
      }
    ],
    updatedAt: '2026-08-16T12:00:00.000Z'
  },
  { key: 'trash_pages', value: [], updatedAt: '2026-08-16T12:00:00.000Z' },
  { key: 'trash_cards', value: [], updatedAt: '2026-08-16T12:00:00.000Z' }
];

// -------------------------------------------------------------
// 14. LOCAL STORAGE SNAPSHOT (All 27 Keys)
// -------------------------------------------------------------
const localStorageSnapshot = {
  pyt_gemini_api_key: 'AQ.Ab8RN6L_DEMO_VAULT_KEY_PREVIEW_ONLY',
  pyt_imgbb_api_key: '03d6b5012af1cd86455b9e7a77a0bfcd',
  pyt_github_username: '',
  pyt_github_repo: '',
  pyt_github_pat: '',
  pyt_auto_backup_enabled: 'true',
  pyt_auto_backup_freq: 'daily',
  pyt_auto_backup_ret: '7',
  pyt_settings_theme_mode: 'dark',
  pyt_image_storage_mode: 'local',
  pyt_ai_feature_models: JSON.stringify(settings[0].value.aiFeatureModels),
  local_device_id: 'device_demo_scholar_macbook_pro',
  auto_anki_expanded_nav_category: 'study',
  auto_anki_exam_profiles: JSON.stringify(examProfiles),
  study_room_layout_prefs: JSON.stringify(settings[8].value),
  fs_quick_notes: '• Review Robbins Glomerulonephritis electron microscopy patterns.\n• Practice Dix-Hallpike and Epley maneuvers for ENT revision.\n• Memorize Antidotes: Pralidoxime (OP), Flumazenil (Benzos), Fomepizole (Methanol/Ethylene Glycol).',
  stopwatch_show_milliseconds: 'true',
  dashboard_daily_card_target: '60',
  dashboard_daily_hours_target: '6.5',
  camp_student_info: JSON.stringify(campData[1].data),
  camp_history: JSON.stringify(campHistory),
  camp_timer_history: JSON.stringify(campTimerHistory)
};

// Add dynamic camp sessions to localStorage snapshot
campDailyLogs.forEach(log => {
  localStorageSnapshot[`camp_sessions_${log.dateStr}`] = JSON.stringify(log.sessions);
  localStorageSnapshot[`camp_bedToBook_${log.dateStr}`] = log.bedToBook;
});

// -------------------------------------------------------------
// 15. COMPOSE UNIVERSAL SNAPSHOT PAYLOAD
// -------------------------------------------------------------
const payload = {
  meta: {
    version: '2.0',
    engine: 'AutoAnki FSRS-6 Unified Vault',
    timestamp: new Date().toISOString(),
    schemaVersion: 3
  },
  stores: {
    topics: topicsStore,
    settings: settings,
    camp_tracker: [],
    camp_data: campData,
    camp_daily_logs: campDailyLogs,
    pyt_data: pytData,
    kv_store: kvStore,
    topic_hints: topicHints,
    hint_quota: [
      { dateStr: TODAY_STR, count: 4, updatedAt: '2026-08-16T12:00:00.000Z' }
    ]
  },
  localStorageSnapshot: localStorageSnapshot
};

// Compute FNV-1a checksum
const checksumInput = JSON.stringify(payload.stores);
payload.meta.checksum = computeChecksum(checksumInput);

console.log(`Payload compiled successfully:`);
console.log(`- Topics in Curriculum: ${payload.stores.topics.length}`);
console.log(`- Subjects in Tracker: ${subjectTrackerData.length}`);
console.log(`- Flashcards: ${flashcards.length}`);
console.log(`- Study Log Days: ${Object.keys(studyLogs).length} (Total ~${totalCalculatedHours.toFixed(0)} study hours logged)`);
console.log(`- CAMP Daily Logs: ${campDailyLogs.length}`);
console.log(`- PYT Subjects: ${pytData.length}`);
console.log(`- Textbooks: ${textbooksMetadata.length}`);
console.log(`- Checksum: ${payload.meta.checksum}`);

// Write output JSON files
const outputPath1 = path.resolve(__dirname, '../mock_demo_export_vault.json');
const outputPath2 = path.resolve(__dirname, '../public/mock_demo_export_vault.json');

fs.writeFileSync(outputPath1, JSON.stringify(payload, null, 2), 'utf-8');
fs.writeFileSync(outputPath2, JSON.stringify(payload, null, 2), 'utf-8');

console.log(`Written to ${outputPath1} (${(fs.statSync(outputPath1).size / 1024).toFixed(1)} KB)`);
console.log(`Written to ${outputPath2} (${(fs.statSync(outputPath2).size / 1024).toFixed(1)} KB)`);

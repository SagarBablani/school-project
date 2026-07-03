import mammoth from "mammoth";
import { createWorker } from "tesseract.js";
import * as canvas from "@napi-rs/canvas";

function ensurePdfDomGlobals() {
  if (typeof globalThis.DOMMatrix === "undefined") globalThis.DOMMatrix = canvas.DOMMatrix;
  if (typeof globalThis.ImageData === "undefined") globalThis.ImageData = canvas.ImageData;
  if (typeof globalThis.Path2D === "undefined") globalThis.Path2D = canvas.Path2D;
  if (typeof globalThis.Canvas === "undefined") globalThis.Canvas = canvas.Canvas;
}

async function loadPdfParse() {
  ensurePdfDomGlobals();
  const module = await import("pdf-parse");
  return module.default || module;
}

const UNSAFE_PATTERNS = [
  /ignore (all )?(previous|prior|system) instructions/i,
  /reveal (secrets|tokens|passwords)/i,
  /send .*outside/i
];

export function detectUnsafe(text) {
  return UNSAFE_PATTERNS.some((pattern) => pattern.test(text));
}

export async function extractTextFromFile(file) {
  if (!file || !file.buffer) return "";
  const name = String(file.originalname || "").toLowerCase();
  const mimetype = String(file.mimetype || "").toLowerCase();
  const buffer = file.buffer;
  const ext = name.split(".").pop();

  try {
    if (mimetype === "application/pdf" || ext === "pdf") {
      const pdfParse = await loadPdfParse();
      const result = await pdfParse(buffer);
      return String(result.text || "").trim();
    }
    if (mimetype.includes("wordprocessingml") || ext === "docx") {
      const result = await mammoth.extractRawText({ buffer });
      return String(result.value || "").trim();
    }
    if (mimetype.startsWith("text/") || ext === "txt") {
      return buffer.toString("utf8").trim();
    }
    if (mimetype.startsWith("image/") || ["jpg", "jpeg", "png", "tiff", "bmp", "gif"].includes(ext)) {
      const worker = createWorker({ logger: () => {} });
      await worker.load();
      await worker.loadLanguage("eng");
      await worker.initialize("eng");
      const { data } = await worker.recognize(buffer);
      await worker.terminate();
      return String(data.text || "").trim();
    }
    return buffer.toString("utf8").trim();
  } catch (error) {
    console.error("File text extraction failed", error.message);
    return "";
  }
}

export function parseDocument({ type, text, context = {} }) {
  const clean = String(text || "").trim();
  if (!clean) return result(type, {}, ["Document has no readable text."], 0.05, true);
  if (detectUnsafe(clean)) return result(type, {}, ["Potential prompt injection detected."], 0.1, true, true);
  if (type === "roster") return parseRoster(clean, context);
  if (type === "policy") return parsePolicy(clean);
  return parseAssignment(clean, context);
}

function parseAssignment(text, context) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const title = pick(text, /(?:title|assignment)\s*:\s*(.+)/i) || lines[0];
  const subject = pick(text, /subject\s*:\s*(.+)/i);
  const dueRaw = pick(text, /(?:due|deadline)\s*:\s*(.+)/i) || text.match(/\b(?:due|deadline)\s+(?:on|by)?\s*([A-Za-z]+ \d{1,2}(?:,\s*\d{4})?|\d{4}-\d{2}-\d{2})/i)?.[1];
  const targetRaw = pick(text, /(?:target|class|students?)\s*:\s*(.+)/i);
  const instructions = lines.filter((line) => !/^(title|assignment|subject|due|deadline|target|class|students?)\s*:/i.test(line)).join("\n");
  const ambiguityNotes = [];
  if (!title) ambiguityNotes.push("Missing assignment title.");
  if (!subject) ambiguityNotes.push("Missing subject.");
  if (!dueRaw) ambiguityNotes.push("Missing due date.");
  if (!targetRaw) ambiguityNotes.push("Missing target class or students.");
  let dueDate = null;
  if (dueRaw) {
    const parsed = new Date(dueRaw);
    if (Number.isNaN(parsed.getTime())) ambiguityNotes.push(`Could not parse due date: ${dueRaw}`);
    else dueDate = parsed.toISOString();
  }
  const classIds = [];
  const targetStudentIds = [];
  if (targetRaw) {
    const lower = targetRaw.toLowerCase();
    for (const klass of context.classes || []) {
      if (lower.includes(klass.name.toLowerCase()) || lower.includes(klass.grade.toLowerCase())) classIds.push(klass.id);
    }
    for (const student of context.students || []) {
      if (lower.includes(student.name.toLowerCase())) targetStudentIds.push(student.id);
    }
    if (!classIds.length && !targetStudentIds.length) ambiguityNotes.push(`Target did not match known classes or students: ${targetRaw}`);
  }
  return result("assignment", { title, subject, dueDate, targetRaw, instructions, classIds, targetStudentIds }, ambiguityNotes, confidence(ambiguityNotes), ambiguityNotes.length > 0);
}

function parseRoster(text, context) {
  const rows = [];
  const ambiguityNotes = [];
  const seen = new Set();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const [index, line] of lines.entries()) {
    if (index === 0 && /student/i.test(line) && /class|grade/i.test(line)) continue;
    const [studentName, className, guardianContact, notes = ""] = line.split(/,|\t/).map((part) => part.trim());
    if (!studentName || !className || !guardianContact) {
      ambiguityNotes.push(`Row ${index + 1} is missing student, class, or guardian contact.`);
      continue;
    }
    const key = `${studentName.toLowerCase()}|${className.toLowerCase()}`;
    if (seen.has(key)) ambiguityNotes.push(`Duplicate roster row for ${studentName} in ${className}.`);
    seen.add(key);
    const klass = (context.classes || []).find((item) => item.name.toLowerCase() === className.toLowerCase() || item.grade.toLowerCase() === className.toLowerCase());
    if (!klass) ambiguityNotes.push(`Unknown class for ${studentName}: ${className}.`);
    if (!/@|\+?\d{7,}/.test(guardianContact)) ambiguityNotes.push(`Guardian contact for ${studentName} looks incomplete.`);
    rows.push({ studentName, className, classId: klass?.id, guardianContact, notes });
  }
  return result("roster", { rows }, ambiguityNotes, confidence(ambiguityNotes), ambiguityNotes.length > 0);
}

function parsePolicy(text) {
  const quiet = text.match(/quiet hours?\s*:?\s*(\d{1,2}:?\d{0,2})\s*(?:-|to)\s*(\d{1,2}:?\d{0,2})/i);
  const approval = /teacher approval|required approval|approve reminders/i.test(text);
  const ambiguityNotes = quiet ? [] : ["Missing quiet hours."];
  return result("policy", {
    quietHours: quiet ? { start: normalizeTime(quiet[1]), end: normalizeTime(quiet[2]) } : null,
    teacherApprovalRequired: approval
  }, ambiguityNotes, quiet ? 0.86 : 0.62, ambiguityNotes.length > 0);
}

export function identifyIntent(message) {
  const text = String(message || "").trim();
  if (!text) return { intent: "unknown", confidence: 0.1, unsafe: false, entities: {} };
  if (detectUnsafe(text)) return { intent: "unsafe", confidence: 0.98, unsafe: true, entities: {} };
  const lower = text.toLowerCase();
  if (/resubmit|re-submit|updated (my )?(work|submission)|revised submission/.test(lower)) return { intent: "resubmission", confidence: 0.85, unsafe: false, entities: { body: text } };
  if (/submit|here is my work|attached/.test(lower)) return { intent: "submission", confidence: 0.86, unsafe: false, entities: { body: text } };
  if (/blocked|stuck|help|confused/.test(lower)) return { intent: "blocked_help_request", confidence: 0.84, unsafe: false, entities: { note: text } };
  if (/progress|working on|almost done|started/.test(lower)) return { intent: "progress_update", confidence: 0.78, unsafe: false, entities: { note: text } };
  if (/revise|redo|needs? (a )?revision|please fix/.test(lower)) return { intent: "revision_request", confidence: 0.8, unsafe: false, entities: { note: text } };
  if (/complete|approved|looks good/.test(lower)) return { intent: "completion_decision", confidence: 0.8, unsafe: false, entities: { note: text } };
  if (/feedback/.test(lower)) return { intent: "teacher_feedback", confidence: 0.76, unsafe: false, entities: { note: text } };
  if (/opt.?in|subscribe to (updates|digest)|enroll me/.test(lower)) return { intent: "parent_opt_in", confidence: 0.82, unsafe: false, entities: {} };
  if (/acknowledge|got it|noted|i.?ll (handle|follow up|take care)/.test(lower)) return { intent: "escalation_acknowledgement", confidence: 0.75, unsafe: false, entities: {} };
  if (/digest|summary/.test(lower)) return { intent: "parent_digest_request", confidence: 0.78, unsafe: false, entities: {} };
  if (/update assignment|change (the )?(due date|deadline)|extend (the )?deadline|reschedule/.test(lower)) return { intent: "update_assignment", confidence: 0.7, unsafe: false, entities: { text } };
  if (/cancel assignment|call off (the )?assignment|remove (the )?assignment/.test(lower)) return { intent: "cancel_assignment", confidence: 0.72, unsafe: false, entities: { text } };
  if (/create assignment|new assignment|due/.test(lower)) return { intent: "create_assignment", confidence: 0.72, unsafe: false, entities: { text } };
  return { intent: "unknown", confidence: 0.35, unsafe: false, entities: { text } };
}

function result(type, fields, ambiguityNotes, confidenceScore, needsClarification, unsafe = false) {
  return { type, fields, ambiguityNotes, confidence: confidenceScore, needsClarification, unsafe };
}

function pick(text, pattern) {
  return text.match(pattern)?.[1]?.trim();
}

function confidence(notes) {
  return Math.max(0.25, 0.94 - notes.length * 0.14);
}

function normalizeTime(value) {
  const candidate = value.includes(":") ? value : `${value}:00`;
  const [h, m = "00"] = candidate.split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

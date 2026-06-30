import { mkdir, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { parseDocument, extractTextFromFile } from "../parser.js";
import { addAudit, makeId } from "../models/store.js";
import { applyRoster, createAssignmentFromDocument, schoolContext } from "../models/schoolOpsModel.js";
import { requireRole } from "./http.js";

export async function uploadDocument(req, res) {
  const { store, uploadDir, broadcast } = req.app.locals;
  requireRole(req.user, ["admin", "teacher"]);
  const body = req.body || {};
  const type = String(body.type || "assignment");
  const file = req.file;
  const text = file ? await extractTextFromFile(file) : String(body.text || "");
  const document = await store.mutate(async (data) => {
    const context = schoolContext(data, req.user.schoolId);
    const parsed = parseDocument({ type, text, context });
    const fileExt = file ? extname(file.originalname) || ".dat" : ".txt";
    const documentRecord = {
      id: makeId("doc"),
      schoolId: req.user.schoolId,
      actorId: req.user.id,
      type,
      originalName: file ? file.originalname : body.name || `${type}-paste.txt`,
      fileName: file ? `${makeId("upload")}${fileExt}` : null,
      fileType: file ? file.mimetype : "text/plain",
      text,
      parsed,
      approvalState: parsed.needsClarification || parsed.unsafe ? "needs_review" : "pending_approval",
      createdAt: new Date().toISOString()
    };
    data.documents.unshift(documentRecord);
    await mkdir(uploadDir, { recursive: true });
    if (file) {
      await writeFile(join(uploadDir, documentRecord.fileName), file.buffer);
    } else {
      await writeFile(join(uploadDir, `${documentRecord.id}.txt`), text);
    }
    addAudit(data, {
      correlationId: req.correlationId,
      actorId: req.user.id,
      schoolId: req.user.schoolId,
      resourceType: "document",
      resourceId: documentRecord.id,
      action: "document.parsed",
      details: { type, fileName: documentRecord.fileName, confidence: parsed.confidence, notes: parsed.ambiguityNotes }
    });
    return documentRecord;
  });
  broadcast(req.user.schoolId);
  res.status(201).json({ document });
}

export async function approveDocument(req, res) {
  const { store, broadcast } = req.app.locals;
  requireRole(req.user, ["admin", "teacher"]);
  const result = await store.mutate((data) => {
    const doc = data.documents.find((item) => item.id === req.params.documentId && item.schoolId === req.user.schoolId);
    if (!doc) {
      const error = new Error("Document not found.");
      error.status = 404;
      throw error;
    }
    const fields = { ...doc.parsed.fields, ...(req.body?.fields || {}) };
    doc.parsed.fields = fields;
    doc.approvalState = "approved";
    addAudit(data, { correlationId: req.correlationId, actorId: req.user.id, schoolId: req.user.schoolId, resourceType: "document", resourceId: doc.id, action: "document.approved" });
    if (doc.type === "assignment") return createAssignmentFromDocument(data, doc, req.user, req.correlationId);
    if (doc.type === "roster") return applyRoster(data, doc, req.user, req.correlationId);
    if (doc.type === "policy") {
      const school = data.schools.find((item) => item.id === req.user.schoolId);
      if (fields.quietHours) school.policy = fields.quietHours;
      addAudit(data, { correlationId: req.correlationId, actorId: req.user.id, schoolId: req.user.schoolId, resourceType: "school", resourceId: school.id, action: "policy.updated", details: school.policy });
      return { document: doc };
    }
    return { document: doc };
  });
  broadcast(req.user.schoolId);
  res.status(200).json(result);
}

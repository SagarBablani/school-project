import { Router } from "express";
import multer from "multer";
import { acceptInvite, createClass, createInvite, currentUserSnapshot, seedDemo } from "../controllers/schoolController.js";
import { approveDocument, uploadDocument } from "../controllers/documentController.js";
import { asyncHandler } from "../controllers/http.js";
import { handleEvents } from "../controllers/eventController.js";
import { handleMessage } from "../controllers/messageController.js";
import { processChatWebhook, bindChat } from "../controllers/chatController.js";
import { joinWithInvite, login, logout, register } from "../controllers/authController.js";
import { requestContext, requireLogin } from "../middleware/authMiddleware.js";
import { runReminders } from "../controllers/reminderController.js";
import { cancelAssignment, updateAssignment } from "../controllers/assignmentController.js";
import { requestGuardianDigest, setGuardianOptIn } from "../controllers/guardianController.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export function createApiRouter() {
  const router = Router();

  router.use(asyncHandler(requestContext));

  router.get("/events", requireLogin, handleEvents);
  router.post("/register", asyncHandler(register));
  router.post("/login", asyncHandler(login));
  router.post("/join", asyncHandler(joinWithInvite));
  router.post("/logout", logout);
  router.post("/webhook/telegram", asyncHandler((req, res) => processChatWebhook(req, res, "telegram")));
  router.post("/webhook/whatsapp", asyncHandler((req, res) => processChatWebhook(req, res, "whatsapp")));

  router.use(requireLogin);
  router.get("/me", asyncHandler(currentUserSnapshot));
  router.post("/classes", asyncHandler(createClass));
  router.post("/invites", asyncHandler(createInvite));
  router.post("/accept-invite", asyncHandler(acceptInvite));
  router.post("/documents", upload.single("file"), asyncHandler(uploadDocument));
  router.post("/documents/:documentId/approve", asyncHandler(approveDocument));
  router.post("/messages", asyncHandler(handleMessage));
  router.post("/webhook/telegram/bind", asyncHandler((req, res) => bindChat(req, res, "telegram")));
  router.post("/webhook/whatsapp/bind", asyncHandler((req, res) => bindChat(req, res, "whatsapp")));
  router.post("/reminders/run", asyncHandler(runReminders));
  router.post("/demo/seed", asyncHandler(seedDemo));
  router.patch("/assignments/:assignmentId", asyncHandler(updateAssignment));
  router.post("/assignments/:assignmentId/cancel", asyncHandler(cancelAssignment));
  router.post("/guardian/opt-in", asyncHandler(setGuardianOptIn));
  router.post("/guardian/digest", asyncHandler(requestGuardianDigest));

  return router;
}

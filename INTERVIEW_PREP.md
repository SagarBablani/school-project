# Interview Preparation Guide

## 1. Live Demo (10 min)

### Quick Demo Flow
1. **Register** as "Northstar Public School" admin
2. **Seed classes** (click "Seed classes" button)
3. **Create invite** for a teacher
4. **Join as teacher** in a new session/incognito
5. **Upload roster** (paste sample data):
   ```
   student,class,guardian
   Riya Sen,Grade 6A,riya.parent@example.com
   Kabir Mehta,Grade 6A,kabir.parent@example.com
   Kabir Mehta,Grade 6A,kabir.parent@example.com
   ```
   - Show the duplicate row flagged for review
   - Approve it to create student/guardian users
6. **Upload assignment** (paste):
   ```
   Title: Cell Structure Lab Reflection
   Subject: Biology
   Class: Grade 6A
   Due: 2026-07-08
   Write a 300 word reflection and include one diagram.
   ```
   - Show parsed fields and approval workflow
7. **Send test message** as student: "I am blocked on the diagram"
   - Show intent routing and state tracking
8. **Run reminders** manually
   - Show blocked student escalation
9. **Review audit tab** to show all actions logged

---

## 2. Architecture Walkthrough (20 min)

### Domain Model
**Files**: [src/store.js](src/store.js)

Entities:
- **school**: tenant boundary, reminder policy
- **user**: admin, teacher, student, guardian with role-scoped access
- **class**: organizational unit within a school
- **invite**: short-lived, role-scoped onboarding code (expires in 7 days)
- **document**: original text + parsed output + confidence + ambiguity notes + approval state
- **assignment**: action created only after document approval (immutable after approval)
- **submission**: student state (pending/submitted/blocked) with history
- **reminder**: idempotent daily decision (key = assignmentId + studentId + date)
- **auditEvent**: append-only timeline (600-item limit, newest first)

### Access Model
**Files**: [src/auth.js](src/auth.js), [src/middleware/authMiddleware.js](src/middleware/authMiddleware.js)

Rules:
- All routes check school ID on scoped read/write
- **Admin**: school-wide operations (invites, approvals, reminders)
- **Teacher**: view + manage assignments for assigned classes
- **Student**: view only own assignments
- **Guardian**: view assignments for linked students

Access decision is function-based (not middleware) for testability.

### Parser Strategy
**Files**: [src/parser.js](src/parser.js)

Approach:
- Deterministic, rule-based extraction (no ML in exercise)
- Treats extracted values as **proposed actions** requiring admin review
- Produces: structured `fields`, `confidence` (0-1), `ambiguityNotes` list
- Triggers review for: missing due dates, unknown classes, duplicate rows, unsafe text

Parser types:
- `assignment`: title, subject, class, due date
- `roster`: student, class, guardian (flags duplicates, incomplete contacts)
- `policy`: guardian approval flag, message rules

### Intent Layer
**Files**: [src/parser.js](src/parser.js#L131), [src/controllers/messageController.js](src/controllers/messageController.js)

Message intents:
- `progress_update`: student progress
- `blocked`: student blocked, triggers escalation
- `submission_ready`: student completed
- `feedback_request`: teacher feedback
- Unsafe input → fallback intent, audit denial

### Scheduler
**Files**: [src/scheduler.js](src/scheduler.js), [src/reminders.js](src/reminders.js)

Design:
- Runs every 5 minutes (configurable via `SCHEDULER_CRON`)
- Persists `lastRunAt` to `work/data.json` for durability
- Idempotent: reminder key = `${assignmentId}_${studentId}_${date}`
- Reminder engine evaluates: quiet hours, submission status, blocked escalation
- Broadcasts SSE update to all connected clients for real-time dashboard

---

## 3. Pair Extension Examples (20 min)

### Example 1: Add New Document Type (e.g., "field_trip")

**Steps**:

1. **Update parser** [src/parser.js](src/parser.js#L68):
   ```javascript
   if (type === "field_trip") return parseFieldTrip(clean, context);
   ```

2. **Add parser function**:
   ```javascript
   function parseFieldTrip(text, context) {
     const location = extractLine("Location:", text);
     const date = extractLine("Date:", text);
     return {
       fields: { location, date },
       confidence: location && date ? 0.9 : 0.5,
       ambiguityNotes: []
     };
   }
   ```

3. **Update frontend dropdown** [src/client/main.jsx](src/client/main.jsx#L245):
   ```javascript
   <option value="field_trip">Field Trip</option>
   ```

4. **Test**: Upload, review parsed fields, approve, check audit.

### Example 2: Add New Role (e.g., "principal")

**Steps**:

1. **Update auth checks** [src/auth.js](src/auth.js#L54):
   ```javascript
   if (user.role === "principal") {
     return school.id === schoolId; // full school access
   }
   ```

2. **Update invite validation** [src/controllers/schoolController.js](src/controllers/schoolController.js#L31):
   ```javascript
   if (!["teacher", "student", "guardian", "principal"].includes(role)) ...
   ```

3. **Update frontend form** [src/client/main.jsx](src/client/main.jsx#L189):
   ```javascript
   <option value="principal">Principal</option>
   ```

4. **Test**: Create principal invite, join, verify access.

### Example 3: Add New Access Rule (e.g., "teachers can see all student submissions in their class")

**Steps**:

1. **Update submission authorization** [src/auth.js](src/auth.js):
   ```javascript
   if (user.role === "teacher") {
     const assignment = data.assignments.find(a => a.id === submissionAssignmentId);
     return user.classIds.includes(assignment.classId);
   }
   ```

2. **Add API route** [src/routes/apiRoutes.js](src/routes/apiRoutes.js#L40):
   ```javascript
   router.get("/submissions/class/:classId", requireLogin, asyncHandler(getSubmissionsByClass));
   ```

3. **Implement controller** [src/controllers/submissionController.js](src/controllers/submissionController.js):
   ```javascript
   export async function getSubmissionsByClass(req, res) {
     const { classId } = req.params;
     checkAccess(req.user, classId, "view_class_submissions");
     const submissions = data.submissions.filter(/* ... */);
     res.json(submissions);
   }
   ```

4. **Test**: Teacher retrieves class submissions, audit logs action.

---

## 4. Mentorship Simulation (10 min)

### Safe Feature Addition Process

**For a junior developer adding a feature, walk them through:**

1. **Write test first** (if boundary is risky):
   ```bash
   npm test -- [test name]
   ```
   File: [test/](test/)

2. **Understand access boundary**:
   - Read [src/auth.js](src/auth.js) for existing patterns
   - Ask: "Which roles should access this?"
   - Add access check **before** business logic

3. **Make the change** (in order):
   - Controller: add API endpoint
   - Model: update data structure if needed
   - Middleware: verify auth
   - Frontend: wire up UI
   - Test: verify end-to-end

4. **Run tests**:
   ```bash
   npm test
   ```

5. **Check audit trail**:
   - Ensure action is logged in [src/auth.js](src/auth.js#L33) or controller
   - Verify audit event includes `actorId`, `schoolId`, `action`, `resourceId`

6. **Code review checklist**:
   - [ ] Access checks on all new endpoints
   - [ ] Audit events logged for state mutations
   - [ ] Tests pass
   - [ ] No hardcoded IDs or secrets
   - [ ] Error messages are safe (no internal leaks)

**Example**: "If you want to add a feature to let students withdraw submissions, start by:
1. Checking [src/auth.js](src/auth.js) — can a student mutate their own submission?
2. Adding a test in [test/reminders.test.js](test/reminders.test.js)
3. Adding controller logic
4. Wiring up the frontend button
5. Running `npm test` to verify
6. Checking the audit log shows the withdrawal"

---

## Quick Start for Demo

```bash
# Install
npm install

# Run backend
npm run dev:api

# Run frontend (in another terminal)
npm run dev

# Open http://127.0.0.1:5173
```

**Credentials** (pre-seeded on register):
- Admin: `admin@northstar.test` / `demo1234`
- Teacher: create via invite
- Student: created via roster upload

---

## Key Files to Reference

| File | Purpose |
|------|---------|
| [src/store.js](src/store.js) | Domain model, audit utilities |
| [src/auth.js](src/auth.js) | Access control logic |
| [src/parser.js](src/parser.js) | Document parsing + intent identification |
| [src/reminders.js](src/reminders.js) | Reminder engine logic |
| [src/scheduler.js](src/scheduler.js) | Background scheduler |
| [src/controllers/](src/controllers/) | API endpoints by feature |
| [src/client/main.jsx](src/client/main.jsx) | Frontend UI |
| [test/](test/) | Test suite |

---

## Notes

- All data persisted to `work/data.json` — survives restarts
- SSE broadcasts live updates; refresh not needed
- Audit trail is immutable and append-only
- Role-based access is stateless (no sessions in memory)
- Parser is rule-based; safe for sandbox use

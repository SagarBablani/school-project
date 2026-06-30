import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, Bell, BookOpen, CheckCircle2, FileText, Lock, LogOut, MessageSquare, Plus, RefreshCw, School, Send, Shield, Users } from "lucide-react";
import "./styles.css";

const emptyForm = { schoolName: "Northstar Public School", name: "Asha Rao", email: "admin@northstar.test", password: "demo1234", code: "" };

function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [authMode, setAuthMode] = useState("register");
  const [auth, setAuth] = useState(emptyForm);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const response = await fetch("/api/me");
    if (response.ok) setSnapshot(await response.json());
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  useEffect(() => {
    if (!snapshot?.user) return undefined;
    const events = new EventSource("/api/events");
    events.addEventListener("update", () => refresh());
    return () => events.close();
  }, [snapshot?.user?.id]);

  async function submitAuth(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const path = authMode === "register" ? "/api/register" : authMode === "join" ? "/api/join" : "/api/login";
    const payload = authMode === "register" ? auth : authMode === "join" ? { code: auth.code, name: auth.name, email: auth.email, password: auth.password } : { email: auth.email, password: auth.password };
    const response = await api(path, payload);
    setBusy(false);
    if (response.error) return setError(response.error);
    setSnapshot(response);
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    setSnapshot(null);
  }

  if (!snapshot?.user) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="brand-row">
            <School size={34} />
            <div>
              <h1>School Ops Agent</h1>
              <p>Registration, document parsing, reminders, and auditability for the live scenario.</p>
            </div>
          </div>
          <div className="segmented">
            <button className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")}>Register</button>
            <button className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>Log in</button>
            <button className={authMode === "join" ? "active" : ""} onClick={() => setAuthMode("join")}>Join</button>
          </div>
          <form onSubmit={submitAuth} className="form-grid">
            {authMode === "register" && (
              <>
                <label>School<input value={auth.schoolName} onChange={(e) => setAuth({ ...auth, schoolName: e.target.value })} /></label>
              </>
            )}
            {authMode !== "login" && <label>Name<input value={auth.name} onChange={(e) => setAuth({ ...auth, name: e.target.value })} /></label>}
            {authMode === "join" && <label>Invite code<input value={auth.code} onChange={(e) => setAuth({ ...auth, code: e.target.value.toUpperCase() })} /></label>}
            <label>Email<input value={auth.email} onChange={(e) => setAuth({ ...auth, email: e.target.value })} /></label>
            <label>Password<input type="password" value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} /></label>
            {error && <p className="error"><AlertTriangle size={16} />{error}</p>}
            <button className="primary" disabled={busy}>{busy ? "Working..." : authMode === "register" ? "Create school" : authMode === "join" ? "Join school" : "Log in"}</button>
          </form>
        </section>
      </main>
    );
  }

  return <Workspace snapshot={snapshot} setSnapshot={setSnapshot} logout={logout} refresh={refresh} />;
}

function Workspace({ snapshot, setSnapshot, logout, refresh }) {
  const { user, school } = snapshot;
  const [tab, setTab] = useState(user.role === "student" ? "student" : "ops");

  async function demoSeed() {
    const response = await api("/api/demo/seed", {});
    if (!response.error) setSnapshot(response);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="school-mark"><School /><span>{school?.name}</span></div>
        <nav>
          <button className={tab === "ops" ? "active" : ""} onClick={() => setTab("ops")}><Shield /> Operations</button>
          <button className={tab === "documents" ? "active" : ""} onClick={() => setTab("documents")}><FileText /> Documents</button>
          <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}><MessageSquare /> Chat simulator</button>
          <button className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}><Lock /> Audit</button>
        </nav>
        <div className="user-box">
          <span>{user.name}</span>
          <strong>{user.role}</strong>
          <button onClick={logout}><LogOut size={16} /> Logout</button>
        </div>
      </aside>
      <section className="content">
        <header className="topbar">
          <div>
            <h2>{titleFor(tab)}</h2>
            <p>{summaryForRole(user.role)}</p>
          </div>
          <div className="top-actions">
            {user.role === "admin" && <button onClick={demoSeed}><Plus size={16} /> Seed classes</button>}
            <button onClick={refresh}><RefreshCw size={16} /> Refresh</button>
          </div>
        </header>
        {tab === "ops" && <Ops snapshot={snapshot} refresh={refresh} />}
        {tab === "documents" && <Documents snapshot={snapshot} refresh={refresh} />}
        {tab === "chat" && <Chat snapshot={snapshot} refresh={refresh} />}
        {tab === "audit" && <Audit events={snapshot.auditEvents} />}
      </section>
    </main>
  );
}

function Ops({ snapshot, refresh }) {
  const { user } = snapshot;
  return (
    <div className="grid two">
      <Metrics snapshot={snapshot} />
      {user.role === "admin" && <AdminTools snapshot={snapshot} refresh={refresh} />}
      <Assignments snapshot={snapshot} />
      <Submissions snapshot={snapshot} />
    </div>
  );
}

function Metrics({ snapshot }) {
  const blocked = snapshot.submissions.filter((item) => item.status === "blocked").length;
  const submitted = snapshot.submissions.filter((item) => item.status === "submitted").length;
  const pendingDocs = snapshot.documents.filter((item) => item.approvalState !== "approved").length;
  return (
    <section className="panel metrics">
      <Metric icon={<Users />} label="People" value={snapshot.users.length} />
      <Metric icon={<FileText />} label="Parse review" value={pendingDocs} />
      <Metric icon={<AlertTriangle />} label="Blocked" value={blocked} />
      <Metric icon={<CheckCircle2 />} label="Submitted" value={submitted} />
    </section>
  );
}

function Metric({ icon, label, value }) {
  return <div className="metric">{icon}<span>{label}</span><strong>{value}</strong></div>;
}

function AdminTools({ snapshot, refresh }) {
  const [klass, setKlass] = useState({ name: "Grade 6A", grade: "6" });
  const [invite, setInvite] = useState({ role: "teacher", name: "Meera Iyer", email: "teacher@northstar.test", classIds: [] });
  const students = snapshot.users.filter((item) => item.role === "student");

  async function addClass(event) {
    event.preventDefault();
    await api("/api/classes", klass);
    refresh();
  }

  async function addInvite(event) {
    event.preventDefault();
    await api("/api/invites", { ...invite, classIds: invite.role === "teacher" || invite.role === "student" ? invite.classIds : [], studentIds: invite.role === "guardian" ? invite.studentIds || [] : [] });
    refresh();
  }

  return (
    <section className="panel">
      <h3>Setup</h3>
      <form className="inline-form" onSubmit={addClass}>
        <input value={klass.name} onChange={(e) => setKlass({ ...klass, name: e.target.value })} />
        <input value={klass.grade} onChange={(e) => setKlass({ ...klass, grade: e.target.value })} />
        <button><Plus size={16} /> Class</button>
      </form>
      <form className="form-grid" onSubmit={addInvite}>
        <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
          <option value="teacher">Teacher</option>
          <option value="student">Student</option>
          <option value="guardian">Guardian</option>
        </select>
        <input value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} placeholder="Name" />
        <input value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="Email" />
        {invite.role !== "guardian" ? (
          <select multiple value={invite.classIds} onChange={(e) => setInvite({ ...invite, classIds: selected(e) })}>
            {snapshot.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        ) : (
          <select multiple value={invite.studentIds || []} onChange={(e) => setInvite({ ...invite, studentIds: selected(e) })}>
            {students.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        )}
        <button><Send size={16} /> Create invite</button>
      </form>
      <div className="list compact">
        {snapshot.invites.slice(0, 6).map((item) => <div key={item.id}><strong>{item.code}</strong><span>{item.role} {item.usedBy ? "used" : "open"}</span></div>)}
      </div>
    </section>
  );
}

function Documents({ snapshot, refresh }) {
  const [doc, setDoc] = useState({
    type: "assignment",
    text: "Title: Cell Structure Lab Reflection\nSubject: Biology\nClass: Grade 6A\nDue: 2026-07-08\nWrite a 300 word reflection and include one diagram."
  });
  const [file, setFile] = useState(null);
  const [overrideFields, setOverrideFields] = useState({});

  async function upload(event) {
    event.preventDefault();
    const formData = new FormData();
    formData.append("type", doc.type);
    if (file) {
      formData.append("file", file);
    } else {
      formData.append("text", doc.text);
    }
    const response = await api("/api/documents", formData);
    if (!response.error) {
      setFile(null);
      refresh();
    }
  }

  async function approve(id) {
    await api(`/api/documents/${id}/approve`, { fields: overrideFields[id] || {} });
    setOverrideFields({});
    refresh();
  }

  return (
    <div className="grid two">
      <section className="panel">
        <h3>Upload or paste document</h3>
        <form className="form-grid" onSubmit={upload}>
          <select value={doc.type} onChange={(e) => setDoc({ ...doc, type: e.target.value })}>
            <option value="assignment">Assignment brief</option>
            <option value="roster">Class roster</option>
            <option value="policy">School policy</option>
          </select>
          <label className="file-input-wrapper">
            <FileText size={16} /> Choose file
            <input type="file" accept=".txt,.pdf,.docx,.png,.jpg,.jpeg,.tiff,.bmp,.gif" onChange={(e) => setFile(e.target.files[0] || null)} />
          </label>
          {!file && <textarea value={doc.text} onChange={(e) => setDoc({ ...doc, text: e.target.value })} />}
          {file && <div className="file-preview">📎 {file.name}</div>}
          <button><FileText size={16} /> Parse document</button>
        </form>
      </section>
      <section className="panel">
        <h3>Review queue</h3>
        <div className="list">
          {snapshot.documents.map((item) => (
            <article key={item.id} className="doc-card">
              <div className="row"><strong>{item.type}</strong><Pill>{item.approvalState}</Pill></div>
              <p>Confidence {Math.round(item.parsed.confidence * 100)}%</p>
              {item.parsed.ambiguityNotes.length > 0 && <ul>{item.parsed.ambiguityNotes.map((note) => <li key={note}>{note}</li>)}</ul>}
              <pre>{JSON.stringify(item.parsed.fields, null, 2)}</pre>
              {item.type === "assignment" && (
                <textarea
                  placeholder='Optional JSON overrides, e.g. {"subject":"Biology"}'
                  onChange={(e) => setOverrideFields({ ...overrideFields, [item.id]: parseJson(e.target.value) })}
                />
              )}
              {item.approvalState !== "approved" && <button onClick={() => approve(item.id)}><CheckCircle2 size={16} /> Approve</button>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Chat({ snapshot, refresh }) {
  const [message, setMessage] = useState("I am blocked on the diagram part");
  const [assignmentId, setAssignmentId] = useState(snapshot.assignments[0]?.id || "");
  const [studentId, setStudentId] = useState("");
  const [last, setLast] = useState(null);

  async function send(event) {
    event.preventDefault();
    const response = await api("/api/messages", { assignmentId, studentId, text: message });
    setLast(response);
    refresh();
  }

  async function reminders() {
    setLast(await api("/api/reminders/run", { force: true }));
    refresh();
  }

  return (
    <div className="grid two">
      <section className="panel">
        <h3>Message envelope</h3>
        <form className="form-grid" onSubmit={send}>
          <select value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)}>
            <option value="">No assignment</option>
            {snapshot.assignments.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
          {snapshot.user.role !== "student" && (
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">Select student for teacher feedback</option>
              {snapshot.users.filter((item) => item.role === "student").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          )}
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} />
          <button><MessageSquare size={16} /> Route intent</button>
        </form>
        <button className="secondary" onClick={reminders}><Bell size={16} /> Run reminders</button>
        {last && <pre>{JSON.stringify(last, null, 2)}</pre>}
      </section>
      <Submissions snapshot={snapshot} />
    </div>
  );
}

function Assignments({ snapshot }) {
  return (
    <section className="panel">
      <h3>Assignments</h3>
      <div className="list">
        {snapshot.assignments.map((item) => (
          <article key={item.id}>
            <div className="row"><strong>{item.title}</strong><Pill>{item.status}</Pill></div>
            <p>{item.subject} · due {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "not set"}</p>
            <small>{item.targetStudentIds.length} target student(s)</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function Submissions({ snapshot }) {
  const names = Object.fromEntries(snapshot.users.map((user) => [user.id, user.name]));
  return (
    <section className="panel">
      <h3>Student state</h3>
      <div className="list compact">
        {snapshot.submissions.map((item) => (
          <div key={item.id}>
            <strong>{names[item.studentId] || "Student"}</strong>
            <Pill>{item.status}</Pill>
          </div>
        ))}
      </div>
    </section>
  );
}

function Audit({ events }) {
  return (
    <section className="panel">
      <h3>Event timeline</h3>
      <div className="timeline">
        {events.map((event) => (
          <article key={event.id}>
            <time>{new Date(event.at).toLocaleString()}</time>
            <strong>{event.action}</strong>
            <span>{event.outcome} · {event.correlationId}</span>
            <pre>{JSON.stringify(event.details, null, 2)}</pre>
          </article>
        ))}
      </div>
    </section>
  );
}

function Pill({ children }) {
  return <span className="pill">{children}</span>;
}

async function api(path, payload) {
  const headers = {};
  let body = payload;
  if (!(payload instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(payload);
  }
  const response = await fetch(path, {
    method: "POST",
    headers,
    body
  });
  return response.json();
}

function selected(event) {
  return Array.from(event.target.selectedOptions).map((option) => option.value);
}

function parseJson(value) {
  try {
    return value.trim() ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function titleFor(tab) {
  return ({ ops: "Operations", documents: "Documents", chat: "Chat and reminders", audit: "Audit timeline" })[tab];
}

function summaryForRole(role) {
  return {
    admin: "School-wide setup, approvals, reminders, and access boundaries.",
    teacher: "Assigned class workflow with submissions, blockers, and feedback.",
    student: "Your assignments, progress updates, submissions, and feedback.",
    guardian: "Linked-child visibility with limited detail."
  }[role] || "Scoped school operations.";
}

createRoot(document.getElementById("root")).render(<App />);

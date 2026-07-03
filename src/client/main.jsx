import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, Bell, BookOpen, CheckCircle2, FileText, Lock, LogOut, MessageSquare, School, Send, Shield, Users } from "lucide-react";
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
              <h1>School Operations Platform</h1>
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
  const [tab, setTab] = useState(
    user.role === "student" ? "student" : user.role === "guardian" ? "guardian" : "ops"
  );

  async function demoSeed() {
    const response = await api("/api/demo/seed", {});
    if (!response.error) setSnapshot(response);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="school-mark"><School /><span>{school?.name}</span></div>
        <nav>
          {["admin", "teacher"].includes(user.role) && (
            <>
              <button className={tab === "ops" ? "active" : ""} onClick={() => setTab("ops")}><Shield /> Operations</button>
              <button className={tab === "documents" ? "active" : ""} onClick={() => setTab("documents")}><FileText /> Documents</button>
            </>
          )}
          {user.role === "student" && (
            <button className={tab === "student" ? "active" : ""} onClick={() => setTab("student")}><BookOpen /> Dashboard</button>
          )}
          {user.role === "guardian" && (
            <button className={tab === "guardian" ? "active" : ""} onClick={() => setTab("guardian")}><Users /> Children</button>
          )}
          <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}><MessageSquare /> Chat simulator</button>
          {["admin", "teacher"].includes(user.role) && (
            <button className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}><Lock /> Audit</button>
          )}
        </nav>
        <div className="user-box">
          <span>{user.name}</span>
          <strong style={{ color: "#75ddbf" }}>{user.role}</strong>
          <button onClick={logout}><LogOut size={16} /> Logout</button>
        </div>
      </aside>
      <section className="content">
        <header className="topbar">
          <div>
            <h2>{titleFor(tab)}</h2>
            <p>{summaryForRole(user.role)}</p>
          </div>
        </header>
        {tab === "ops" && <Ops snapshot={snapshot} refresh={refresh} demoSeed={demoSeed} />}
        {tab === "documents" && <Documents snapshot={snapshot} refresh={refresh} />}
        {tab === "student" && <StudentDashboard snapshot={snapshot} refresh={refresh} />}
        {tab === "guardian" && <GuardianDashboard snapshot={snapshot} refresh={refresh} />}
        {tab === "chat" && <Chat snapshot={snapshot} refresh={refresh} />}
        {tab === "audit" && <Audit events={snapshot.auditEvents} />}
      </section>
    </main>
  );
}

function Ops({ snapshot, refresh, demoSeed }) {
  const { user } = snapshot;
  return (
    <div className="grid two">
      <section className="panel" style={{ gridColumn: "1 / -1" }}>
        <div className="panel-header">
          <h3>Operations overview</h3>
          <div className="top-actions">
            <button onClick={refresh}><BookOpen size={16} /> Refresh</button>
            {user.role === "admin" && <button className="secondary" onClick={demoSeed} style={{ marginTop: 0 }}><Send size={16} /> Seed classes</button>}
          </div>
        </div>
        <Metrics snapshot={snapshot} />
      </section>
      {user.role === "admin" && <AdminTools snapshot={snapshot} refresh={refresh} />}
      <div className="grid" style={{ gridColumn: user.role === "admin" ? "auto" : "1 / -1" }}>
        <Assignments snapshot={snapshot} />
        <Submissions snapshot={snapshot} />
      </div>
    </div>
  );
}

function Metrics({ snapshot }) {
  const blocked = snapshot.submissions.filter((item) => item.status === "blocked").length;
  const submitted = snapshot.submissions.filter((item) => item.status === "submitted").length;
  const pendingDocs = snapshot.documents.filter((item) => item.approvalState !== "approved").length;
  return (
    <div className="metrics">
      <Metric icon={<Users />} label="People" value={snapshot.users.length} />
      <Metric icon={<FileText />} label="Parse review" value={pendingDocs} />
      <Metric icon={<AlertTriangle />} label="Blocked" value={blocked} />
      <Metric icon={<CheckCircle2 />} label="Submitted" value={submitted} />
    </div>
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
      <h3>Setup Classes & Invites</h3>
      <form className="inline-form" onSubmit={addClass} style={{ marginBottom: "1.5rem" }}>
        <input value={klass.name} onChange={(e) => setKlass({ ...klass, name: e.target.value })} placeholder="Class Name" />
        <input value={klass.grade} onChange={(e) => setKlass({ ...klass, grade: e.target.value })} placeholder="Grade" />
        <button className="primary"><Send size={16} /> Add Class</button>
      </form>
      <form className="form-grid" onSubmit={addInvite}>
        <label>
          Invite Role
          <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
            <option value="teacher">Teacher</option>
            <option value="student">Student</option>
            <option value="guardian">Guardian</option>
          </select>
        </label>
        <label>
          Full Name
          <input value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} placeholder="Name" />
        </label>
        <label>
          Email Address
          <input value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="Email" />
        </label>
        {invite.role !== "guardian" ? (
          <label>
            Target Classes (Ctrl+click to select multiple)
            <select multiple value={invite.classIds} onChange={(e) => setInvite({ ...invite, classIds: selected(e) })} style={{ minHeight: "80px" }}>
              {snapshot.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        ) : (
          <label>
            Linked Student(s)
            <select multiple value={invite.studentIds || []} onChange={(e) => setInvite({ ...invite, studentIds: selected(e) })} style={{ minHeight: "80px" }}>
              {students.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        )}
        <button className="primary"><Send size={16} /> Create Invite Link</button>
      </form>
      <div className="list compact" style={{ marginTop: "1.5rem" }}>
        <h4>Recent Invites</h4>
        {snapshot.invites.slice(0, 6).map((item) => <div key={item.id}><strong>{item.code}</strong><span>{item.role} ({item.usedBy ? "used" : "open"})</span></div>)}
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

  async function approve(id, fields) {
    await api(`/api/documents/${id}/approve`, { fields });
    refresh();
  }

  return (
    <div className="grid two">
      <section className="panel">
        <div className="panel-header">
          <h3>Upload or paste document</h3>
        </div>
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
          <button className="primary"><FileText size={16} /> Parse document</button>
        </form>
      </section>
      <section className="panel">
        <h3>Review & Approval Queue</h3>
        <div className="list">
          {snapshot.documents.map((item) => (
            <DocumentReviewCard
              key={item.id}
              item={item}
              classes={snapshot.classes}
              approve={approve}
            />
          ))}
          {snapshot.documents.length === 0 && <p style={{ color: "#5d736b", textAlign: "center", padding: "2rem" }}>Review queue is currently empty.</p>}
        </div>
      </section>
    </div>
  );
}

function DocumentReviewCard({ item, classes, approve }) {
  const [fields, setFields] = useState(item.parsed.fields || {});
  const [rows, setRows] = useState(item.parsed.fields.rows || []);

  useEffect(() => {
    setFields(item.parsed.fields || {});
    setRows(item.parsed.fields.rows || []);
  }, [item]);

  async function handleApprove() {
    const payloadFields = { ...fields };
    if (item.type === "roster") {
      payloadFields.rows = rows;
    }
    await approve(item.id, payloadFields);
  }

  function handleFieldChange(key, val) {
    setFields((prev) => ({ ...prev, [key]: val }));
  }

  function handleRowFieldChange(index, key, val) {
    const updated = [...rows];
    updated[index] = { ...updated[index], [key]: val };
    setRows(updated);
  }

  function removeRosterRow(index) {
    const updated = rows.filter((_, idx) => idx !== index);
    setRows(updated);
  }

  const confidenceScore = Math.round(item.parsed.confidence * 100);
  const isApproved = item.approvalState === "approved";

  return (
    <article className="doc-card" style={{ borderLeft: isApproved ? "4px solid #1e8f71" : "4px solid #f59e0b" }}>
      <div className="row">
        <strong>{item.type === "policy" ? "School Policy" : item.type === "roster" ? "Class Roster" : "Assignment Brief"}</strong>
        <span className="pill" style={{ background: isApproved ? "#d7f1e5" : "#fef3c7", color: isApproved ? "#0f5f4f" : "#d97706" }}>
          {item.approvalState}
        </span>
      </div>
      
      {!isApproved && (
        <div style={{ marginTop: "0.5rem", marginBottom: "1rem" }}>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#4c6a61" }}>Parser Confidence: <strong>{confidenceScore}%</strong></p>
          {item.parsed.ambiguityNotes.length > 0 && (
            <div className="ambiguity-box" style={{ background: "#fef2f2", border: "1px solid #fee2e2", borderRadius: "10px", padding: "0.75rem", marginTop: "0.5rem" }}>
              <strong style={{ color: "#991b1b", display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem" }}><AlertTriangle size={14} /> Attention required:</strong>
              <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.2rem", fontSize: "0.8rem", color: "#7f1d1d" }}>
                {item.parsed.ambiguityNotes.map((note, idx) => <li key={idx}>{note}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="review-editor-box" style={{ marginTop: "0.5rem" }}>
        {item.type === "assignment" && (
          <div className="form-grid">
            <label>
              Title
              <input 
                disabled={isApproved} 
                value={fields.title || ""} 
                onChange={(e) => handleFieldChange("title", e.target.value)} 
                className={!fields.title ? "input-error" : ""}
              />
            </label>
            <label>
              Subject
              <input 
                disabled={isApproved} 
                value={fields.subject || ""} 
                onChange={(e) => handleFieldChange("subject", e.target.value)} 
                className={!fields.subject ? "input-error" : ""}
              />
            </label>
            <label>
              Due Date
              <input 
                type="date"
                disabled={isApproved} 
                value={fields.dueDate ? fields.dueDate.substring(0, 10) : ""} 
                onChange={(e) => handleFieldChange("dueDate", e.target.value ? new Date(e.target.value).toISOString() : null)} 
                className={!fields.dueDate ? "input-error" : ""}
              />
            </label>
             <div>
              <label>Target Classes</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.25rem", marginBottom: "0.5rem" }}>
                {(fields.classIds || []).map((classId) => {
                  const cls = classes.find((c) => c.id === classId);
                  if (!cls) return null;
                  return (
                    <span key={classId} className="pill" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.25rem 0.6rem" }}>
                      {cls.name}
                      {!isApproved && (
                        <button 
                          type="button" 
                          style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer", color: "#ef4444", fontWeight: "bold", fontSize: "1rem" }}
                          onClick={() => {
                            const updated = (fields.classIds || []).filter((id) => id !== classId);
                            handleFieldChange("classIds", updated);
                          }}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  );
                })}
                {(!fields.classIds || fields.classIds.length === 0) && (
                  <span style={{ fontSize: "0.85rem", color: "#8caba1", fontStyle: "italic" }}>No target classes selected.</span>
                )}
              </div>
              {!isApproved && (
                <select 
                  value="" 
                  onChange={(e) => {
                    if (e.target.value) {
                      const updated = Array.from(new Set([...(fields.classIds || []), e.target.value]));
                      handleFieldChange("classIds", updated);
                    }
                  }}
                  className={(!fields.classIds || !fields.classIds.length) ? "input-error" : ""}
                  style={{ width: "auto", padding: "0.5rem 1rem", borderRadius: "10px" }}
                >
                  <option value="">+ Add class...</option>
                  {classes.filter((cls) => !(fields.classIds || []).includes(cls.id)).map((cls) => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
              )}
            </div>
            <label>
              Instructions
              <textarea 
                disabled={isApproved} 
                value={fields.instructions || ""} 
                onChange={(e) => handleFieldChange("instructions", e.target.value)} 
                style={{ minHeight: "80px" }}
              />
            </label>
          </div>
        )}

        {item.type === "roster" && (
          <div style={{ overflowX: "auto" }}>
            <table className="roster-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e5f0ea", textAlign: "left" }}>
                  <th style={{ padding: "0.5rem" }}>Student</th>
                  <th style={{ padding: "0.5rem" }}>Class</th>
                  <th style={{ padding: "0.5rem" }}>Guardian Email</th>
                  {!isApproved && <th style={{ padding: "0.5rem" }}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const hasClass = classes.some((c) => c.id === row.classId);
                  return (
                    <tr key={idx} style={{ borderBottom: "1px solid #e5f0ea" }}>
                      <td style={{ padding: "0.35rem 0.5rem" }}>
                        <input 
                          disabled={isApproved} 
                          value={row.studentName || ""} 
                          onChange={(e) => handleRowFieldChange(idx, "studentName", e.target.value)}
                          style={{ padding: "0.4rem", borderRadius: "8px" }}
                        />
                      </td>
                      <td style={{ padding: "0.35rem 0.5rem" }}>
                        <select 
                          disabled={isApproved} 
                          value={row.classId || ""} 
                          onChange={(e) => handleRowFieldChange(idx, "classId", e.target.value)}
                          style={{ padding: "0.4rem", borderRadius: "8px" }}
                          className={!hasClass ? "input-error" : ""}
                        >
                          <option value="">Select...</option>
                          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: "0.35rem 0.5rem" }}>
                        <input 
                          disabled={isApproved} 
                          value={row.guardianContact || ""} 
                          onChange={(e) => handleRowFieldChange(idx, "guardianContact", e.target.value)}
                          style={{ padding: "0.4rem", borderRadius: "8px" }}
                          className={!row.guardianContact?.includes("@") ? "input-error" : ""}
                        />
                      </td>
                      {!isApproved && (
                        <td style={{ padding: "0.35rem 0.5rem" }}>
                          <button type="button" className="danger-button" onClick={() => removeRosterRow(idx)} style={{ padding: "0.3rem 0.6rem", borderRadius: "8px" }}>Remove</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && <p style={{ color: "#5d736b", padding: "1rem", textAlign: "center" }}>No students in this roster document.</p>}
          </div>
        )}

        {item.type === "policy" && (
          <div className="form-grid">
            <div style={{ display: "flex", gap: "1rem" }}>
              <label style={{ flex: 1 }}>
                Quiet Hours Start
                <input 
                  type="time" 
                  disabled={isApproved} 
                  value={fields.quietHours?.start || "21:00"} 
                  onChange={(e) => handleFieldChange("quietHours", { ...(fields.quietHours || {}), start: e.target.value })} 
                />
              </label>
              <label style={{ flex: 1 }}>
                Quiet Hours End
                <input 
                  type="time" 
                  disabled={isApproved} 
                  value={fields.quietHours?.end || "07:00"} 
                  onChange={(e) => handleFieldChange("quietHours", { ...(fields.quietHours || {}), end: e.target.value })} 
                />
              </label>
            </div>
            <label className="checkbox-row" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
              <input 
                type="checkbox" 
                disabled={isApproved} 
                checked={fields.teacherApprovalRequired || false} 
                onChange={(e) => handleFieldChange("teacherApprovalRequired", e.target.checked)} 
                style={{ width: "auto" }}
              />
              Require Teacher Approval for Reminders
            </label>
          </div>
        )}
      </div>

      {!isApproved && (
        <button className="primary" onClick={handleApprove} style={{ marginTop: "1rem", width: "100%" }}>
          <CheckCircle2 size={16} /> Approve & Commit Changes
        </button>
      )}
    </article>
  );
}

function StudentDashboard({ snapshot, refresh }) {
  const { user, assignments, submissions } = snapshot;
  const [comment, setComment] = useState("");
  const [activeAsg, setActiveAsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function updateStatus(assignmentId, status) {
    setBusy(true);
    let msg = "";
    if (status === "blocked") msg = "I am blocked on this assignment";
    else if (status === "in_progress") msg = "I have started working on this assignment";
    else if (status === "submitted") msg = "Here is my completed reflection work";
    
    await api("/api/messages", { assignmentId, text: msg });
    setBusy(false);
    refresh();
  }

  async function sendComment(event) {
    event.preventDefault();
    if (!activeAsg || !comment.trim()) return;
    setBusy(true);
    await api("/api/messages", { assignmentId: activeAsg.id, text: comment });
    setComment("");
    setBusy(false);
    refresh();
  }

  return (
    <div className="grid two">
      <section className="panel">
        <h3>My Assignments</h3>
        <div className="list">
          {assignments.map((asg) => {
            const sub = submissions.find((s) => s.assignmentId === asg.id);
            const status = sub?.status || "not_started";
            return (
              <article key={asg.id} className={`asg-card ${activeAsg?.id === asg.id ? "selected" : ""}`} onClick={() => setActiveAsg(asg)} style={{ cursor: "pointer" }}>
                <div className="row">
                  <strong>{asg.title}</strong>
                  <span className={`pill status-${status}`}>{status.replace("_", " ")}</span>
                </div>
                <p style={{ margin: "0.25rem 0", fontSize: "0.9rem", color: "#4c6a61" }}>{asg.subject} · Due {asg.dueDate ? new Date(asg.dueDate).toLocaleDateString() : "Not set"}</p>
                <div className="top-actions" style={{ marginTop: "1rem" }} onClick={(e) => e.stopPropagation()}>
                  <button disabled={busy} onClick={() => updateStatus(asg.id, "in_progress")} style={{ padding: "0.4rem 0.8rem", borderRadius: "10px", fontSize: "0.8rem" }}>Start</button>
                  <button disabled={busy} onClick={() => updateStatus(asg.id, "blocked")} style={{ padding: "0.4rem 0.8rem", borderRadius: "10px", fontSize: "0.8rem", background: "#fef3c7", color: "#d97706" }}>Block</button>
                  <button disabled={busy} onClick={() => updateStatus(asg.id, "submitted")} className="primary" style={{ padding: "0.4rem 0.8rem", borderRadius: "10px", fontSize: "0.8rem" }}>Submit</button>
                </div>
              </article>
            );
          })}
          {assignments.length === 0 && <p style={{ color: "#5d736b", padding: "2rem", textAlign: "center" }}>No assignments found.</p>}
        </div>
      </section>

      <section className="panel">
        {activeAsg ? (
          <div>
            <h3>{activeAsg.title} Details</h3>
            <p><strong>Instructions:</strong></p>
            <pre style={{ background: "#f4f8f6", color: "#102a27", border: "1px solid #dceee6", maxHeight: "150px" }}>{activeAsg.instructions || "No instructions provided."}</pre>
            
            <h4 style={{ marginTop: "1.5rem", borderBottom: "1px solid #e5f0ea", paddingBottom: "0.5rem" }}>Chat & Submission History</h4>
            <div className="list" style={{ maxHeight: "250px", overflowY: "auto", paddingRight: "0.5rem", gap: "0.5rem" }}>
              {submissions.find((s) => s.assignmentId === activeAsg.id)?.history.map((h, i) => (
                <div key={i} style={{ padding: "0.6rem", border: "1px solid #e5f0ea", borderRadius: "12px", background: "#fdfdfd" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#8caba1", marginBottom: "0.2rem" }}>
                    <span>{h.actorId === user.id ? "You" : "Teacher/System"}</span>
                    <span>{new Date(h.at).toLocaleTimeString()}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.85rem" }}>{h.text}</p>
                </div>
              ))}
              {(!submissions.find((s) => s.assignmentId === activeAsg.id)?.history?.length) && (
                <p style={{ color: "#8caba1", fontSize: "0.85rem", textAlign: "center", padding: "1rem" }}>No activity logs yet.</p>
              )}
            </div>

            <form onSubmit={sendComment} className="form-grid" style={{ marginTop: "1rem" }}>
              <textarea 
                value={comment} 
                onChange={(e) => setComment(e.target.value)} 
                placeholder="Ask a question or send updates..."
                style={{ minHeight: "80px", padding: "0.75rem" }}
              />
              <button disabled={busy} className="primary" style={{ width: "100%" }}><Send size={14} /> Send Message</button>
            </form>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "4rem 2rem", color: "#8caba1" }}>
            <BookOpen size={48} style={{ marginBottom: "1rem", color: "#cbdcd6" }} />
            <p>Select an assignment on the left to see details, submit work, or ask a question.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function GuardianDashboard({ snapshot, refresh }) {
  const { users, assignments, submissions, reminders } = snapshot;
  const children = users.filter((u) => u.role === "student");

  return (
    <div className="grid">
      {children.map((child) => {
        const childSubmissions = submissions.filter((s) => s.studentId === child.id);
        const childReminders = reminders.filter((r) => r.studentId === child.id);

        return (
          <section key={child.id} className="panel">
            <div className="panel-header">
              <h3>Progress overview: {child.name}</h3>
              <button onClick={refresh}><BookOpen size={16} /> Refresh</button>
            </div>
            
            <div className="grid two" style={{ marginTop: "1rem" }}>
              <div>
                <h4 style={{ color: "#0f2f28", borderBottom: "1px solid #e5f0ea", paddingBottom: "0.5rem" }}>Assignments</h4>
                <div className="list">
                  {assignments.map((asg) => {
                    const sub = childSubmissions.find((s) => s.assignmentId === asg.id);
                    const status = sub?.status || "not_started";
                    const isBlocked = status === "blocked";
                    return (
                      <article key={asg.id} style={{ borderLeft: isBlocked ? "4px solid #dc2626" : "1px solid #e5f0ea" }}>
                        <div className="row">
                          <strong>{asg.title}</strong>
                          <span className={`pill status-${status}`}>{status.replace("_", " ")}</span>
                        </div>
                        <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#4c6a61" }}>Subject: {asg.subject} · Due {asg.dueDate ? new Date(asg.dueDate).toLocaleDateString() : "Not set"}</p>
                        {isBlocked && (
                          <div style={{ marginTop: "0.5rem", background: "#fef2f2", border: "1px solid #fee2e2", padding: "0.5rem", borderRadius: "8px", color: "#b91c1c", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                            <AlertTriangle size={14} /> Student has reported a block. Intervention recommended.
                          </div>
                        )}
                        {sub?.history && sub.history.length > 0 && (
                          <div style={{ marginTop: "0.5rem", padding: "0.4rem 0.6rem", background: "#f4f8f6", borderRadius: "8px" }}>
                            <small style={{ color: "#5d736b", fontSize: "0.75rem" }}>Latest: {sub.history[0].text}</small>
                          </div>
                        )}
                      </article>
                    );
                  })}
                  {assignments.length === 0 && <p style={{ color: "#5d736b", textAlign: "center", padding: "1rem" }}>No assignments found.</p>}
                </div>
              </div>

              <div>
                <h4 style={{ color: "#0f2f28", borderBottom: "1px solid #e5f0ea", paddingBottom: "0.5rem" }}>Activity & Notifications</h4>
                <div className="list compact">
                  {childReminders.slice(0, 10).map((r) => (
                    <div key={r.id}>
                      <strong>{r.action.replace(/_/g, " ")}</strong>
                      <span style={{ fontSize: "0.8rem", color: "#8caba1" }}>{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                  {childReminders.length === 0 && <p style={{ color: "#5d736b", textAlign: "center", padding: "1rem" }}>No notification logs found.</p>}
                </div>
              </div>
            </div>
          </section>
        );
      })}
      {children.length === 0 && (
        <section className="panel" style={{ textAlign: "center", padding: "2rem" }}>
          <p style={{ color: "#5d736b" }}>No linked students are currently registered under your account.</p>
        </section>
      )}
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
        <div className="panel-header">
          <h3>Message envelope</h3>
        </div>
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
          <button className="primary"><MessageSquare size={16} /> Route intent</button>
        </form>
        <button className="secondary" onClick={reminders} style={{ width: "100%" }}><Bell size={16} /> Run reminders</button>
        {last && <pre style={{ marginTop: "1rem" }}>{JSON.stringify(last, null, 2)}</pre>}
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
        {snapshot.assignments.length === 0 && <p style={{ color: "#5d736b", padding: "1rem", textAlign: "center" }}>No assignments found.</p>}
      </div>
    </section>
  );
}

function Submissions({ snapshot }) {
  const names = Object.fromEntries(snapshot.users.map((user) => [user.id, user.name]));
  return (
    <section className="panel">
      <h3>Student status</h3>
      <div className="list compact">
        {snapshot.submissions.map((item) => (
          <div key={item.id}>
            <strong>{names[item.studentId] || "Student"}</strong>
            <Pill>{item.status}</Pill>
          </div>
        ))}
        {snapshot.submissions.length === 0 && <p style={{ color: "#5d736b", padding: "1rem", textAlign: "center" }}>No student statuses available.</p>}
      </div>
    </section>
  );
}

function Audit({ events }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h3>Event timeline</h3>
      </div>
      <div className="timeline">
        {events.map((event) => (
          <article key={event.id}>
            <time>{new Date(event.at).toLocaleString()}</time>
            <strong>{event.action}</strong>
            <span>{event.outcome} · {event.correlationId}</span>
            <pre>{JSON.stringify(event.details, null, 2)}</pre>
          </article>
        ))}
        {events.length === 0 && <p style={{ color: "#5d736b", padding: "2rem", textAlign: "center" }}>No audit events logged.</p>}
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
  return ({ ops: "Operations", documents: "Documents", chat: "Chat and reminders", audit: "Audit timeline", student: "Student Dashboard", guardian: "Guardian Dashboard" })[tab] || "Dashboard";
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

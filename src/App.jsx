import React, { useState, useEffect, useMemo } from "react";
import {
  Home, ListChecks, CalendarDays, GraduationCap, Briefcase, TrendingUp,
  Plus, X, Sparkles, Trash2, Pencil, CheckCircle2, Circle, AlertTriangle,
  Clock, BookOpen, Target, ChevronRight
} from "lucide-react";

/* ---------------------------------------------------------------------- */
/* Constants & helpers                                                    */
/* ---------------------------------------------------------------------- */

const STORAGE_KEY = "trackme-data-v1";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_FULL = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const SOFT_COLORS = ["var(--orange-soft)", "var(--pink-soft)", "var(--violet-soft)", "var(--teal-soft)", "var(--blue-soft)", "var(--yellow-soft)"];
const soft = (i) => SOFT_COLORS[i % SOFT_COLORS.length];

const emptyData = () => ({ timetable: [], events: [], tasks: [], goals: [] });

const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2) + Date.now());

function todayDayName() {
  const map = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return map[new Date().getDay()];
}

function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.round((d - today) / 86400000);
}

function dueLabel(dateStr) {
  if (!dateStr) return null;
  const du = daysUntil(dateStr);
  if (du < 0) return { text: `${Math.abs(du)}d overdue`, tone: "urgent" };
  if (du === 0) return { text: "Due today", tone: "urgent" };
  if (du === 1) return { text: "Due tomorrow", tone: "warn" };
  if (du <= 5) return { text: `Due in ${du}d`, tone: "warn" };
  return { text: `Due in ${du}d`, tone: "calm" };
}

function fmtHeroDate() {
  const d = new Date();
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function to12h(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${period}`;
}

/* ---------------------------------------------------------------------- */
/* Scoring / planning logic                                               */
/* ---------------------------------------------------------------------- */

function taskUrgency(t) {
  if (t.status === "done") return -1;
  const pw = { high: 3, medium: 2, low: 1 }[t.priority] || 1;
  const du = daysUntil(t.deadline);
  let tf;
  if (!t.deadline) tf = 1;
  else if (du < 0) tf = 5;
  else if (du === 0) tf = 4.5;
  else if (du <= 2) tf = 3.5;
  else if (du <= 5) tf = 2;
  else tf = 1;
  return pw * tf;
}

function eventUrgency(e) {
  const du = daysUntil(e.date);
  if (du < -1) return -1;
  const tf = du <= 0 ? 6 : du <= 2 ? 5 : du <= 5 ? 3.5 : du <= 10 ? 2 : 1;
  const typeW = e.type === "exam" ? 3 : e.type === "assignment" ? 2.4 : 1.8;
  const prepGap = e.type === "exam" ? (100 - (e.prepStatus || 0)) / 100 : 0.55;
  return tf * typeW * (0.45 + prepGap);
}

function buildFocusList(data) {
  const tasks = data.tasks
    .filter((t) => t.status !== "done")
    .map((t) => ({ kind: "task", id: t.id, score: taskUrgency(t), item: t }))
    .filter((x) => x.score > 0);
  const events = data.events
    .map((e) => ({ kind: "event", id: e.id, score: eventUrgency(e), item: e }))
    .filter((x) => x.score > 0 && daysUntil(x.item.date) <= 14);
  return [...tasks, ...events].sort((a, b) => b.score - a.score).slice(0, 7);
}

function suggestionAnswers(data) {
  const focus = buildFocusList(data);
  const todaysClasses = data.timetable
    .filter((c) => c.day === todayDayName())
    .sort((a, b) => a.start.localeCompare(b.start));
  const overdue = data.tasks.filter((t) => t.status !== "done" && t.deadline && daysUntil(t.deadline) < 0);
  const nearExams = data.events.filter((e) => e.type === "exam" && daysUntil(e.date) >= 0 && daysUntil(e.date) <= 10);
  const weakExams = nearExams.filter((e) => (e.prepStatus || 0) < 60);
  const studyGoals = data.goals.filter((g) => g.type === "study");
  const placementGoals = data.goals.filter((g) => g.type === "placement");

  return {
    today: () => {
      const lines = [];
      lines.push(
        todaysClasses.length
          ? `You have ${todaysClasses.length} class${todaysClasses.length > 1 ? "es" : ""} today, starting at ${to12h(todaysClasses[0].start)}.`
          : "No classes on your timetable for today — a good stretch of open time."
      );
      if (focus[0]) lines.push(`Top priority right now: "${focus[0].item.title}".`);
      if (focus.length > 1) lines.push(`After that, work through: ${focus.slice(1, 4).map((f) => f.item.title).join(", ")}.`);
      if (!focus.length) lines.push("Nothing urgent is on your plate — a good time to get ahead on a goal.");
      return lines;
    },
    studyFirst: () => {
      const examPick = [...nearExams].sort((a, b) => eventUrgency(b) - eventUrgency(a))[0];
      const studyTask = data.tasks
        .filter((t) => t.status !== "done" && t.category === "study")
        .sort((a, b) => taskUrgency(b) - taskUrgency(a))[0];
      const lines = [];
      if (examPick) lines.push(`Start with "${examPick.title}" — it's ${daysUntil(examPick.date)}d away and prep is at ${examPick.prepStatus || 0}%.`);
      if (studyTask) lines.push(`Next, tackle your study task "${studyTask.title}".`);
      if (!examPick && !studyTask) lines.push("No exams or study tasks logged yet — add some in Academic or Tasks to get a study order.");
      return lines;
    },
    mostImportant: () => {
      if (!focus.length) return ["Nothing stands out as urgent — everything's currently under control."];
      const top = focus[0];
      const label = top.kind === "task" ? `task "${top.item.title}" (${top.item.priority} priority)` : `${top.item.type} "${top.item.title}"`;
      return [`Right now the most important thing is your ${label}.`];
    },
    fallingBehind: () => {
      const lines = [];
      if (overdue.length) lines.push(`You have ${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}: ${overdue.slice(0, 3).map((t) => t.title).join(", ")}.`);
      if (weakExams.length) lines.push(`${weakExams.length} exam${weakExams.length > 1 ? "s are" : " is"} within 10 days with preparation still under 60%.`);
      if (!overdue.length && !weakExams.length) lines.push("You're on track — no overdue work and exam prep looks reasonable.");
      else lines.push("Consider clearing the overdue items first, then shift focus to the weakest exam.");
      return lines;
    },
    freeTime: () => {
      const lowPriority = data.tasks.filter((t) => t.status !== "done" && t.priority === "low");
      const goalToPush = [...studyGoals, ...placementGoals].sort((a, b) => (a.progress || 0) - (b.progress || 0))[0];
      const lines = [];
      if (goalToPush) lines.push(`Free time is a good fit for your goal "${goalToPush.title}", currently at ${goalToPush.progress || 0}%.`);
      if (lowPriority.length) lines.push(`You could also clear a lower-priority task: "${lowPriority[0].title}".`);
      if (!goalToPush && !lowPriority.length) lines.push("Nothing queued for spare time — add a study or placement goal to make use of it.");
      return lines;
    },
    examPrep: () => {
      if (!nearExams.length) return ["No exams within the next 10 days."];
      return nearExams
        .sort((a, b) => eventUrgency(b) - eventUrgency(a))
        .map((e) => `"${e.title}" — ${daysUntil(e.date)}d away, prep at ${e.prepStatus || 0}%.`);
    },
  };
}

/* ---------------------------------------------------------------------- */
/* Entity form config                                                     */
/* ---------------------------------------------------------------------- */

const CONFIGS = {
  task: {
    label: "Task",
    array: "tasks",
    fields: [
      { name: "title", label: "Task", type: "text", required: true },
      { name: "category", label: "Category", type: "select", options: ["academic", "study", "placement", "personal"] },
      { name: "priority", label: "Priority", type: "select", options: ["high", "medium", "low"] },
      { name: "deadline", label: "Deadline", type: "date" },
      { name: "subject", label: "Subject / area", type: "text" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
    defaults: { category: "academic", priority: "medium", status: "pending", deadline: "", subject: "", notes: "" },
  },
  class: {
    label: "Class",
    array: "timetable",
    fields: [
      { name: "day", label: "Day", type: "select", options: DAYS },
      { name: "subject", label: "Subject", type: "text", required: true },
      { name: "start", label: "Start time", type: "time", required: true },
      { name: "end", label: "End time", type: "time", required: true },
      { name: "location", label: "Location", type: "text" },
    ],
    defaults: { day: "Mon", subject: "", start: "09:00", end: "10:00", location: "" },
  },
  event: {
    label: "Academic event",
    array: "events",
    fields: [
      { name: "type", label: "Type", type: "select", options: ["exam", "assignment", "deadline", "event"] },
      { name: "title", label: "Title", type: "text", required: true },
      { name: "subject", label: "Subject", type: "text" },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "prepStatus", label: "Preparation done (%)", type: "number", min: 0, max: 100, showIf: (v) => v.type === "exam" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
    defaults: { type: "exam", title: "", subject: "", date: "", prepStatus: 0, notes: "" },
  },
  goal: {
    label: "Goal",
    array: "goals",
    fields: [
      { name: "type", label: "Type", type: "select", options: ["study", "placement"] },
      { name: "title", label: "Goal", type: "text", required: true },
      { name: "target", label: "Target / description", type: "text" },
      { name: "progress", label: "Progress (%)", type: "number", min: 0, max: 100 },
      { name: "deadline", label: "Target date", type: "date" },
    ],
    defaults: { type: "study", title: "", target: "", progress: 0, deadline: "" },
  },
};

/* ---------------------------------------------------------------------- */
/* Small UI atoms                                                         */
/* ---------------------------------------------------------------------- */

function Tag({ children, tone = "calm" }) {
  return <span className={`tm-tag tm-tag-${tone}`}>{children}</span>;
}

function IconBtn({ onClick, children, title }) {
  return (
    <button onClick={onClick} title={title} className="tm-iconbtn">
      {children}
    </button>
  );
}

function EmptyState({ icon, text, cta, onCta }) {
  return (
    <div className="tm-empty">
      {icon}
      <p>{text}</p>
      {cta && (
        <button className="tm-btn-primary" onClick={onCta}>
          <Plus size={15} /> {cta}
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Entity form + modal                                                    */
/* ---------------------------------------------------------------------- */

function EntityForm({ config, initial, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => ({ ...config.defaults, ...(initial || {}) }));
  const set = (name, value) => setForm((f) => ({ ...f, [name]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const missing = config.fields.filter((f) => f.required && !form[f.name]);
    if (missing.length) return;
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="tm-form">
      {config.fields.map((f) => {
        if (f.showIf && !f.showIf(form)) return null;
        return (
          <div key={f.name} className="tm-field">
            <label>{f.label}{f.required ? " *" : ""}</label>
            {f.type === "select" ? (
              <select value={form[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)}>
                {f.options.map((o) => (
                  <option key={o} value={o}>{o[0].toUpperCase() + o.slice(1)}</option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea rows={3} value={form[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)} />
            ) : (
              <input
                type={f.type}
                min={f.min}
                max={f.max}
                value={form[f.name] ?? (f.type === "number" ? 0 : "")}
                onChange={(e) => set(f.name, f.type === "number" ? Number(e.target.value) : e.target.value)}
              />
            )}
          </div>
        );
      })}
      <div className="tm-form-actions">
        <button type="submit" className="tm-btn-primary">Save</button>
        <button type="button" className="tm-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="tm-modal-backdrop" onClick={onClose}>
      <div className="tm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tm-modal-head">
          <h3>{title}</h3>
          <IconBtn onClick={onClose}><X size={16} /></IconBtn>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Views                                                                  */
/* ---------------------------------------------------------------------- */

function TodayView({ data, openAdd, toggleTask }) {
  const focus = useMemo(() => buildFocusList(data), [data]);
  const todaysClasses = data.timetable.filter((c) => c.day === todayDayName()).sort((a, b) => a.start.localeCompare(b.start));
  const answers = useMemo(() => suggestionAnswers(data), [data]);
  const [openQ, setOpenQ] = useState(null);

  const questions = [
    { key: "today", label: "What should I do today?" },
    { key: "studyFirst", label: "What should I study first?" },
    { key: "mostImportant", label: "Which task is most important?" },
    { key: "fallingBehind", label: "Am I falling behind?" },
    { key: "freeTime", label: "How should I use my free time?" },
    { key: "examPrep", label: "What should I prepare for exams?" },
  ];

  const hasAnything = data.tasks.length || data.events.length || data.timetable.length || data.goals.length;

  return (
    <div className="tm-view">
      <div className="tm-hero">
        <span className="tm-hero-eyebrow">Today's page</span>
        <h1>{fmtHeroDate()}</h1>
      </div>

      {!hasAnything && (
        <EmptyState
          icon={<BookOpen size={28} strokeWidth={1.4} />}
          text="Your planner is empty. Add your timetable, an exam, or a task to see today's focus take shape."
          cta="Add a task"
          onCta={() => openAdd("task")}
        />
      )}

      {hasAnything && (
        <>
          <section className="tm-section">
            <div className="tm-section-head">
              <h2>Classes today</h2>
              <span className="tm-count">{todaysClasses.length}</span>
            </div>
            {todaysClasses.length ? (
              <div className="tm-classrow-list">
                {todaysClasses.map((c, i) => (
                  <div key={c.id} className="tm-classrow" style={{ background: soft(i) }}>
                    <span className="tm-classrow-time">{to12h(c.start)} – {to12h(c.end)}</span>
                    <span className="tm-classrow-subject">{c.subject}</span>
                    {c.location && <span className="tm-classrow-loc">{c.location}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="tm-muted">No classes scheduled today.</p>
            )}
          </section>

          <section className="tm-section">
            <div className="tm-section-head">
              <h2>Focus list</h2>
              <span className="tm-count">{focus.length}</span>
            </div>
            {focus.length ? (
              <ol className="tm-focus-list">
                {focus.map((f, i) => (
                  <li key={f.id} className="tm-focus-item" style={{ background: soft(i) }}>
                    <span className="tm-focus-num">{i + 1}</span>
                    {f.kind === "task" ? (
                      <button className="tm-focus-check" onClick={() => toggleTask(f.item.id)}>
                        <Circle size={17} strokeWidth={1.6} />
                      </button>
                    ) : (
                      <span className="tm-focus-check" style={{ color: "var(--brick)" }}>
                        {f.item.type === "exam" ? <GraduationCap size={17} /> : <AlertTriangle size={17} />}
                      </span>
                    )}
                    <div className="tm-focus-text">
                      <span className="tm-focus-title">{f.item.title}</span>
                      <span className="tm-focus-meta">
                        {f.kind === "task" ? f.item.category : f.item.type}
                        {f.item.deadline || f.item.date ? ` · ${dueLabel(f.item.deadline || f.item.date)?.text}` : ""}
                      </span>
                    </div>
                    <Tag tone={f.kind === "task" ? { high: "urgent", medium: "warn", low: "calm" }[f.item.priority] : "urgent"}>
                      {f.kind === "task" ? f.item.priority : f.item.type}
                    </Tag>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="tm-muted">Nothing urgent — you're clear for now.</p>
            )}
          </section>

          <section className="tm-section">
            <div className="tm-section-head">
              <h2><Sparkles size={16} style={{ marginRight: 6, verticalAlign: -2 }} />AI suggestions</h2>
            </div>
            <div className="tm-chip-row">
              {questions.map((q) => (
                <button
                  key={q.key}
                  className={`tm-chip ${openQ === q.key ? "tm-chip-active" : ""}`}
                  onClick={() => setOpenQ(openQ === q.key ? null : q.key)}
                >
                  {q.label}
                </button>
              ))}
            </div>
            {openQ && (
              <div className="tm-answer">
                {answers[openQ]().map((line, i) => <p key={i}>{line}</p>)}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function TasksView({ data, openAdd, openEdit, deleteItem, toggleTask }) {
  const [filter, setFilter] = useState("all");
  const cats = ["all", "academic", "study", "placement", "personal"];
  const filtered = data.tasks.filter((t) => filter === "all" || t.category === filter);
  const pending = filtered.filter((t) => t.status !== "done").sort((a, b) => taskUrgency(b) - taskUrgency(a));
  const done = filtered.filter((t) => t.status === "done");

  return (
    <div className="tm-view">
      <div className="tm-view-head">
        <h1>Tasks</h1>
        <button className="tm-btn-primary" onClick={() => openAdd("task")}><Plus size={15} /> Add task</button>
      </div>
      <div className="tm-chip-row" style={{ marginBottom: 18 }}>
        {cats.map((c) => (
          <button key={c} className={`tm-chip ${filter === c ? "tm-chip-active" : ""}`} onClick={() => setFilter(c)}>
            {c[0].toUpperCase() + c.slice(1)}
          </button>
        ))}
      </div>

      {!filtered.length && (
        <EmptyState icon={<ListChecks size={28} strokeWidth={1.4} />} text="No tasks here yet." cta="Add task" onCta={() => openAdd("task")} />
      )}

      {!!pending.length && (
        <section className="tm-section">
          <div className="tm-section-head"><h2>Pending</h2><span className="tm-count">{pending.length}</span></div>
          <div className="tm-row-list">
            {pending.map((t, i) => {
              const due = dueLabel(t.deadline);
              return (
                <div key={t.id} className="tm-row" style={{ background: soft(i) }}>
                  <button className="tm-focus-check" onClick={() => toggleTask(t.id)}><Circle size={18} strokeWidth={1.6} /></button>
                  <div className="tm-row-text">
                    <span className="tm-row-title">{t.title}</span>
                    <span className="tm-row-meta">{t.category}{t.subject ? ` · ${t.subject}` : ""}</span>
                  </div>
                  {due && <Tag tone={due.tone}>{due.text}</Tag>}
                  <Tag tone={{ high: "urgent", medium: "warn", low: "calm" }[t.priority]}>{t.priority}</Tag>
                  <IconBtn onClick={() => openEdit("task", t)} title="Edit"><Pencil size={14} /></IconBtn>
                  <IconBtn onClick={() => deleteItem("task", t.id)} title="Delete"><Trash2 size={14} /></IconBtn>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!!done.length && (
        <section className="tm-section">
          <div className="tm-section-head"><h2>Completed</h2><span className="tm-count">{done.length}</span></div>
          <div className="tm-row-list">
            {done.map((t) => (
              <div key={t.id} className="tm-row tm-row-done">
                <button className="tm-focus-check" onClick={() => toggleTask(t.id)}><CheckCircle2 size={18} style={{ color: "var(--teal)" }} /></button>
                <div className="tm-row-text">
                  <span className="tm-row-title">{t.title}</span>
                  <span className="tm-row-meta">{t.category}</span>
                </div>
                <IconBtn onClick={() => deleteItem("task", t.id)} title="Delete"><Trash2 size={14} /></IconBtn>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ScheduleView({ data, openAdd, openEdit, deleteItem }) {
  return (
    <div className="tm-view">
      <div className="tm-view-head">
        <h1>Weekly schedule</h1>
        <button className="tm-btn-primary" onClick={() => openAdd("class")}><Plus size={15} /> Add class</button>
      </div>
      {!data.timetable.length ? (
        <EmptyState icon={<CalendarDays size={28} strokeWidth={1.4} />} text="No classes added yet." cta="Add class" onCta={() => openAdd("class")} />
      ) : (
        <div className="tm-grid">
          {DAYS.map((day, di) => {
            const items = data.timetable.filter((c) => c.day === day).sort((a, b) => a.start.localeCompare(b.start));
            return (
              <div key={day} className={`tm-daycol ${day === todayDayName() ? "tm-daycol-today" : ""}`}>
                <div className="tm-daycol-head">{DAY_FULL[day]}</div>
                {items.length ? items.map((c) => (
                  <div key={c.id} className="tm-classcard" style={{ background: soft(di) }}>
                    <span className="tm-classcard-time">{to12h(c.start)}–{to12h(c.end)}</span>
                    <span className="tm-classcard-subject">{c.subject}</span>
                    {c.location && <span className="tm-classcard-loc">{c.location}</span>}
                    <div className="tm-classcard-actions">
                      <IconBtn onClick={() => openEdit("class", c)}><Pencil size={12} /></IconBtn>
                      <IconBtn onClick={() => deleteItem("class", c.id)}><Trash2 size={12} /></IconBtn>
                    </div>
                  </div>
                )) : <span className="tm-daycol-empty">—</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AcademicView({ data, openAdd, openEdit, deleteItem }) {
  const [filter, setFilter] = useState("all");
  const types = ["all", "exam", "assignment", "deadline", "event"];
  const filtered = data.events
    .filter((e) => filter === "all" || e.type === filter)
    .sort((a, b) => daysUntil(a.date) - daysUntil(b.date));

  return (
    <div className="tm-view">
      <div className="tm-view-head">
        <h1>Academic planner</h1>
        <button className="tm-btn-primary" onClick={() => openAdd("event")}><Plus size={15} /> Add event</button>
      </div>
      <div className="tm-chip-row" style={{ marginBottom: 18 }}>
        {types.map((t) => (
          <button key={t} className={`tm-chip ${filter === t ? "tm-chip-active" : ""}`} onClick={() => setFilter(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {!filtered.length ? (
        <EmptyState icon={<GraduationCap size={28} strokeWidth={1.4} />} text="Nothing on the academic calendar yet." cta="Add event" onCta={() => openAdd("event")} />
      ) : (
        <div className="tm-row-list">
          {filtered.map((e, i) => {
            const due = dueLabel(e.date);
            return (
              <div key={e.id} className="tm-row tm-row-tall" style={{ background: soft(i) }}>
                <div className="tm-row-text">
                  <span className="tm-row-title">{e.title}</span>
                  <span className="tm-row-meta">{e.type}{e.subject ? ` · ${e.subject}` : ""} · {new Date(e.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  {e.type === "exam" && (
                    <div className="tm-bar">
                      <div className="tm-bar-fill" style={{ width: `${e.prepStatus || 0}%` }} />
                      <span className="tm-bar-label">{e.prepStatus || 0}% prepared</span>
                    </div>
                  )}
                </div>
                {due && <Tag tone={due.tone}>{due.text}</Tag>}
                <IconBtn onClick={() => openEdit("event", e)} title="Edit"><Pencil size={14} /></IconBtn>
                <IconBtn onClick={() => deleteItem("event", e.id)} title="Delete"><Trash2 size={14} /></IconBtn>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PlacementView({ data, openAdd, openEdit, deleteItem, toggleTask }) {
  const goals = data.goals.filter((g) => g.type === "placement");
  const tasks = data.tasks.filter((t) => t.category === "placement").sort((a, b) => taskUrgency(b) - taskUrgency(a));

  return (
    <div className="tm-view">
      <div className="tm-view-head">
        <h1>Placement preparation</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="tm-btn-ghost" onClick={() => openAdd("goal", { type: "placement" })}><Plus size={15} /> Add goal</button>
          <button className="tm-btn-primary" onClick={() => openAdd("task", { category: "placement" })}><Plus size={15} /> Add task</button>
        </div>
      </div>

      <section className="tm-section">
        <div className="tm-section-head"><h2>Goals</h2><span className="tm-count">{goals.length}</span></div>
        {goals.length ? (
          <div className="tm-row-list">
            {goals.map((g, i) => (
              <div key={g.id} className="tm-row tm-row-tall" style={{ background: soft(i) }}>
                <div className="tm-row-text">
                  <span className="tm-row-title">{g.title}</span>
                  {g.target && <span className="tm-row-meta">{g.target}</span>}
                  <div className="tm-bar">
                    <div className="tm-bar-fill" style={{ width: `${g.progress || 0}%`, background: "linear-gradient(90deg, var(--teal), var(--violet))" }} />
                    <span className="tm-bar-label">{g.progress || 0}%</span>
                  </div>
                </div>
                <IconBtn onClick={() => openEdit("goal", g)}><Pencil size={14} /></IconBtn>
                <IconBtn onClick={() => deleteItem("goal", g.id)}><Trash2 size={14} /></IconBtn>
              </div>
            ))}
          </div>
        ) : <p className="tm-muted">No placement goals yet.</p>}
      </section>

      <section className="tm-section">
        <div className="tm-section-head"><h2>Tasks</h2><span className="tm-count">{tasks.length}</span></div>
        {tasks.length ? (
          <div className="tm-row-list">
            {tasks.map((t, i) => {
              const due = dueLabel(t.deadline);
              return (
                <div key={t.id} className={`tm-row ${t.status === "done" ? "tm-row-done" : ""}`} style={t.status === "done" ? undefined : { background: soft(i) }}>
                  <button className="tm-focus-check" onClick={() => toggleTask(t.id)}>
                    {t.status === "done" ? <CheckCircle2 size={18} style={{ color: "var(--teal)" }} /> : <Circle size={18} strokeWidth={1.6} />}
                  </button>
                  <div className="tm-row-text">
                    <span className="tm-row-title">{t.title}</span>
                    {t.subject && <span className="tm-row-meta">{t.subject}</span>}
                  </div>
                  {due && <Tag tone={due.tone}>{due.text}</Tag>}
                  <IconBtn onClick={() => deleteItem("task", t.id)}><Trash2 size={14} /></IconBtn>
                </div>
              );
            })}
          </div>
        ) : <p className="tm-muted">No placement tasks yet.</p>}
      </section>
    </div>
  );
}

function ProgressView({ data }) {
  const totalTasks = data.tasks.length;
  const doneTasks = data.tasks.filter((t) => t.status === "done").length;
  const taskPct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const studyGoals = data.goals.filter((g) => g.type === "study");
  const placementGoals = data.goals.filter((g) => g.type === "placement");
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((s, g) => s + (g.progress || 0), 0) / arr.length) : 0);

  const exams = data.events.filter((e) => e.type === "exam");
  const examPrepAvg = avg(exams.map((e) => ({ progress: e.prepStatus })));

  const stats = [
    { label: "Tasks completed", value: `${doneTasks}/${totalTasks}`, pct: taskPct, tone: "var(--orange)" },
    { label: "Study goal progress", value: `${avg(studyGoals)}%`, pct: avg(studyGoals), tone: "var(--teal)" },
    { label: "Placement goal progress", value: `${avg(placementGoals)}%`, pct: avg(placementGoals), tone: "var(--brick)" },
    { label: "Exam preparation", value: `${examPrepAvg}%`, pct: examPrepAvg, tone: "var(--violet)" },
  ];

  return (
    <div className="tm-view">
      <div className="tm-view-head"><h1>Progress</h1></div>
      <div className="tm-stat-grid">
        {stats.map((s, i) => (
          <div key={s.label} className="tm-stat-card" style={{ background: soft(i) }}>
            <span className="tm-stat-label">{s.label}</span>
            <span className="tm-stat-value">{s.value}</span>
            <div className="tm-bar">
              <div className="tm-bar-fill" style={{ width: `${s.pct}%`, background: s.tone }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* App shell                                                              */
/* ---------------------------------------------------------------------- */

const NAV = [
  { key: "today", label: "Today", icon: Home },
  { key: "tasks", label: "Tasks", icon: ListChecks },
  { key: "schedule", label: "Schedule", icon: CalendarDays },
  { key: "academic", label: "Academic", icon: GraduationCap },
  { key: "placement", label: "Placement", icon: Briefcase },
  { key: "progress", label: "Progress", icon: TrendingUp },
];

export default function App() {
  const [data, setData] = useState(emptyData());
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("today");
  const [modal, setModal] = useState(null); // { kind, editing }

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setData({ ...emptyData(), ...JSON.parse(raw) });
    } catch (e) {
      /* no saved data yet */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error("Save failed", e);
    }
  }, [data, loaded]);

  const openAdd = (kind, prefill) => setModal({ kind, editing: null, prefill });
  const openEdit = (kind, item) => setModal({ kind, editing: item });
  const closeModal = () => setModal(null);

  const saveEntity = (kind, form) => {
    const arr = CONFIGS[kind].array;
    if (modal?.editing) {
      setData((d) => ({ ...d, [arr]: d[arr].map((x) => (x.id === modal.editing.id ? { ...x, ...form } : x)) }));
    } else {
      setData((d) => ({ ...d, [arr]: [...d[arr], { ...form, id: uid() }] }));
    }
    closeModal();
  };

  const deleteItem = (kind, id) => {
    const arr = CONFIGS[kind].array;
    setData((d) => ({ ...d, [arr]: d[arr].filter((x) => x.id !== id) }));
  };

  const toggleTask = (id) => {
    setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, status: t.status === "done" ? "pending" : "done" } : t)) }));
  };

  const pendingCount = data.tasks.filter((t) => t.status !== "done").length;

  if (!loaded) {
    return (
      <div className="tm-root tm-loading">
        <style>{STYLES}</style>
        <span>Loading TrackMe AI…</span>
      </div>
    );
  }

  return (
    <div className="tm-root">
      <style>{STYLES}</style>

      <aside className="tm-sidebar">
        <div className="tm-brand">
          <Target size={20} />
          <span>TrackMe <em>AI</em></span>
        </div>
        <nav className="tm-nav">
          {NAV.map((n) => {
            const Icon = n.icon;
            return (
              <button key={n.key} className={`tm-nav-item ${tab === n.key ? "tm-nav-active" : ""}`} onClick={() => setTab(n.key)}>
                <Icon size={17} strokeWidth={1.7} />
                <span>{n.label}</span>
                {n.key === "tasks" && pendingCount > 0 && <span className="tm-nav-badge">{pendingCount}</span>}
              </button>
            );
          })}
        </nav>
        <div className="tm-sidebar-foot">
          <ChevronRight size={13} />
          <span>Your data stays saved on this device</span>
        </div>
      </aside>

      <main className="tm-main">
        {tab === "today" && <TodayView data={data} openAdd={openAdd} toggleTask={toggleTask} />}
        {tab === "tasks" && <TasksView data={data} openAdd={openAdd} openEdit={openEdit} deleteItem={deleteItem} toggleTask={toggleTask} />}
        {tab === "schedule" && <ScheduleView data={data} openAdd={openAdd} openEdit={openEdit} deleteItem={deleteItem} />}
        {tab === "academic" && <AcademicView data={data} openAdd={openAdd} openEdit={openEdit} deleteItem={deleteItem} />}
        {tab === "placement" && <PlacementView data={data} openAdd={openAdd} openEdit={openEdit} deleteItem={deleteItem} toggleTask={toggleTask} />}
        {tab === "progress" && <ProgressView data={data} />}
      </main>

      {modal && (
        <Modal title={`${modal.editing ? "Edit" : "Add"} ${CONFIGS[modal.kind].label.toLowerCase()}`} onClose={closeModal}>
          <EntityForm
            config={CONFIGS[modal.kind]}
            initial={modal.editing || modal.prefill}
            onSubmit={(form) => saveEntity(modal.kind, form)}
            onCancel={closeModal}
          />
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Styles                                                                 */
/* ---------------------------------------------------------------------- */

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');

.tm-root {
  --ink: #241735;
  --paper: #FFFBF3;
  --paper-2: #F4EBFF;
  --violet: #7C3AED;
  --violet-soft: #EBE0FF;
  --pink: #EC4899;
  --pink-soft: #FDE1F1;
  --orange: #F97316;
  --orange-soft: #FFE3C2;
  --blue-soft: #DCEAFE;
  --yellow-soft: #FFF3D6;
  --amber: #F5A524;
  --amber-soft: #FFE9C2;
  --brick: #F0355A;
  --brick-soft: #FFDDE4;
  --teal: #0F9E8E;
  --teal-soft: #CFF6EE;
  --line: #EADCFB;
  font-family: 'IBM Plex Sans', sans-serif;
  background: linear-gradient(160deg, #FFF9EE 0%, #FBF1FF 55%, #F4EEFF 100%);
  color: var(--ink);
  min-height: 100vh;
  display: flex;
  width: 100%;
}
.tm-loading { align-items: center; justify-content: center; font-size: 14px; opacity: .7; }

/* Sidebar */
.tm-sidebar {
  width: 220px;
  flex-shrink: 0;
  padding: 22px 16px;
  display: flex;
  flex-direction: column;
  gap: 22px;
  background: linear-gradient(200deg, #F97316 0%, #EC4899 52%, #7C3AED 100%);
  color: #fff;
}
.tm-brand { display: flex; align-items: center; gap: 8px; font-family: 'Fraunces', serif; font-size: 18px; font-weight: 700; color: #fff; }
.tm-brand em { font-style: italic; color: #FFE38A; }
.tm-nav { display: flex; flex-direction: column; gap: 2px; }
.tm-nav-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 10px; border-radius: 8px; border: none; background: transparent;
  font-family: inherit; font-size: 13.5px; color: #fff; opacity: .78;
  cursor: pointer; text-align: left; position: relative;
}
.tm-nav-item:hover { opacity: 1; background: rgba(255,255,255,.14); }
.tm-nav-active { opacity: 1; background: #fff; color: var(--violet); font-weight: 700; }
.tm-nav-badge { margin-left: auto; background: #FFE38A; color: #7A4E00; font-size: 10.5px; padding: 1px 6px; border-radius: 20px; font-weight: 700; }
.tm-sidebar-foot { margin-top: auto; display: flex; align-items: center; gap: 4px; font-size: 11px; opacity: .65; }

/* Main */
.tm-main { flex: 1; padding: 32px 40px 60px; max-width: 780px; }
.tm-view-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
.tm-view-head h1 { font-family: 'Fraunces', serif; font-size: 26px; font-weight: 600; margin: 0; }

.tm-hero { margin-bottom: 28px; animation: tm-rise .5s ease; }
.tm-hero-eyebrow { font-size: 11.5px; letter-spacing: .04em; color: var(--orange); font-weight: 700; }
.tm-hero h1 { font-family: 'Fraunces', serif; font-size: 34px; font-weight: 600; margin: 4px 0 0; background: linear-gradient(100deg, var(--orange), var(--pink) 70%); -webkit-background-clip: text; background-clip: text; color: transparent; }
@keyframes tm-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

.tm-section { margin-bottom: 30px; }
.tm-section-head { display: flex; align-items: center; gap: 8px; border-bottom: 2px solid var(--line); padding-bottom: 8px; margin-bottom: 12px; }
.tm-section-head h2 { font-size: 14.5px; font-weight: 700; margin: 0; display: flex; align-items: center; color: var(--violet); }
.tm-count { font-size: 11.5px; color: #fff; opacity: 1; background: var(--pink); padding: 1px 7px; border-radius: 20px; font-weight: 700; }
.tm-muted { font-size: 13px; opacity: .55; }

.tm-empty { border: 2px dashed var(--violet-soft); border-radius: 14px; padding: 40px 20px; display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; color: var(--violet); background: #fff; }
.tm-empty p { font-size: 13.5px; max-width: 320px; margin: 0; color: var(--ink); opacity: .75; }

/* classes today strip */
.tm-classrow-list { display: flex; flex-direction: column; gap: 6px; }
.tm-classrow { display: flex; align-items: baseline; gap: 12px; padding: 8px 10px; border-radius: 8px; font-size: 13.5px; }
.tm-classrow-time { font-variant-numeric: tabular-nums; color: var(--orange); font-weight: 700; min-width: 130px; }
.tm-classrow-subject { font-weight: 500; }
.tm-classrow-loc { margin-left: auto; opacity: .5; font-size: 12px; }

/* focus list */
.tm-focus-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.tm-focus-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; }
.tm-focus-num { font-family: 'Fraunces', serif; font-size: 15px; color: var(--pink); font-weight: 700; opacity: .8; width: 18px; }
.tm-focus-check { border: none; background: none; cursor: pointer; display: flex; color: var(--orange); opacity: .8; }
.tm-focus-text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.tm-focus-title { font-size: 13.8px; font-weight: 500; }
.tm-focus-meta { font-size: 11.5px; opacity: .5; text-transform: capitalize; }

/* generic rows */
.tm-row-list { display: flex; flex-direction: column; gap: 6px; }
.tm-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; }
.tm-row-tall { align-items: flex-start; padding: 12px 12px; }
.tm-row-done { opacity: .55; background: #fff; }
.tm-row-text { display: flex; flex-direction: column; flex: 1; min-width: 0; gap: 2px; }
.tm-row-title { font-size: 13.8px; font-weight: 600; }
.tm-row-meta { font-size: 11.5px; opacity: .5; text-transform: capitalize; }

/* tags */
.tm-tag { font-size: 10.5px; padding: 3px 9px; border-radius: 20px; font-weight: 700; text-transform: capitalize; white-space: nowrap; }
.tm-tag-urgent { background: var(--brick); color: #fff; }
.tm-tag-warn { background: var(--orange); color: #fff; }
.tm-tag-calm { background: var(--teal); color: #fff; }

/* icon buttons */
.tm-iconbtn { border: none; background: none; cursor: pointer; opacity: .45; padding: 4px; display: flex; color: var(--violet); }
.tm-iconbtn:hover { opacity: 1; }

/* chips */
.tm-chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
.tm-chip { border: 1.5px solid var(--violet-soft); background: #fff; border-radius: 20px; padding: 7px 13px; font-size: 12.5px; cursor: pointer; font-family: inherit; color: var(--violet); font-weight: 500; }
.tm-chip:hover { border-color: var(--orange); }
.tm-chip-active { background: linear-gradient(100deg, var(--orange), var(--pink)); color: #fff; border-color: transparent; }
.tm-answer { margin-top: 14px; background: #fff; border: 2px solid var(--orange-soft); border-radius: 12px; padding: 14px 16px; font-size: 13.5px; line-height: 1.55; }
.tm-answer p { margin: 0 0 6px; }
.tm-answer p:last-child { margin-bottom: 0; }

/* progress bars */
.tm-bar { position: relative; background: var(--paper-2); height: 7px; border-radius: 4px; margin-top: 6px; width: 100%; max-width: 220px; overflow: hidden; }
.tm-bar-fill { height: 100%; background: linear-gradient(90deg, var(--orange), var(--pink)); border-radius: 4px; }
.tm-bar-label { font-size: 10.5px; opacity: .55; margin-left: 2px; display: block; margin-top: 3px; }

/* buttons */
.tm-btn-primary { display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(100deg, var(--orange), var(--pink)); color: #fff; border: none; border-radius: 8px; padding: 9px 14px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; box-shadow: 0 3px 10px rgba(249,115,22,.28); }
.tm-btn-primary:hover { filter: brightness(1.06); }
.tm-btn-ghost { display: inline-flex; align-items: center; gap: 6px; background: #fff; color: var(--violet); border: 1.5px solid var(--violet-soft); border-radius: 8px; padding: 9px 14px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }

/* schedule grid */
.tm-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; }
.tm-daycol { background: #fff; border: 2px solid var(--line); border-radius: 12px; padding: 10px; min-height: 140px; display: flex; flex-direction: column; gap: 8px; }
.tm-daycol-today { border-color: var(--orange); box-shadow: 0 4px 14px rgba(249,115,22,.2); }
.tm-daycol-head { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .02em; color: var(--violet); }
.tm-daycol-empty { font-size: 11px; opacity: .3; }
.tm-classcard { background: var(--violet-soft); border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; position: relative; }
.tm-classcard-time { font-size: 10px; color: var(--pink); font-weight: 700; }
.tm-classcard-subject { font-size: 12.5px; font-weight: 600; }
.tm-classcard-loc { font-size: 10.5px; opacity: .55; }
.tm-classcard-actions { position: absolute; top: 4px; right: 4px; display: none; gap: 2px; }
.tm-classcard:hover .tm-classcard-actions { display: flex; }

/* stat cards */
.tm-stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.tm-stat-card { border: none; border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 4px; }
.tm-stat-label { font-size: 11.5px; opacity: .65; font-weight: 700; }
.tm-stat-value { font-family: 'Fraunces', serif; font-size: 26px; font-weight: 700; color: var(--ink); }

/* modal & form */
.tm-modal-backdrop { position: fixed; inset: 0; background: rgba(36,23,53,.45); display: flex; align-items: center; justify-content: center; z-index: 50; }
.tm-modal { background: #fff; border-radius: 16px; padding: 22px 24px; width: 380px; max-width: 90vw; max-height: 85vh; overflow-y: auto; border-top: 5px solid var(--orange); }
.tm-modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.tm-modal-head h3 { font-family: 'Fraunces', serif; font-size: 18px; margin: 0; font-weight: 700; color: var(--orange); }
.tm-form { display: flex; flex-direction: column; gap: 12px; }
.tm-field { display: flex; flex-direction: column; gap: 4px; }
.tm-field label { font-size: 11.5px; font-weight: 700; opacity: .6; }
.tm-field input, .tm-field select, .tm-field textarea {
  border: 1.5px solid var(--line); border-radius: 8px; padding: 8px 10px; font-size: 13px; font-family: inherit; background: var(--paper); color: var(--ink);
}
.tm-field input:focus, .tm-field select:focus, .tm-field textarea:focus { outline: none; border-color: var(--violet); box-shadow: 0 0 0 3px var(--violet-soft); }
.tm-form-actions { display: flex; gap: 8px; margin-top: 4px; }

@media (max-width: 900px) {
  .tm-root { flex-direction: column; }
  .tm-sidebar { width: 100%; flex-direction: row; align-items: center; padding: 12px 16px; gap: 14px; overflow-x: auto; }
  .tm-nav { flex-direction: row; }
  .tm-sidebar-foot { display: none; }
  .tm-main { padding: 20px; }
  .tm-grid { grid-template-columns: 1fr 1fr; }
  .tm-stat-grid { grid-template-columns: 1fr; }
}
`;

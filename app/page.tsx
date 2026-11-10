"use client";

import { useCallback, useEffect, useState } from "react";
import type { Item, Movement, Parsed } from "@/lib/types";

type Change = { godown: number; before: number; after: number };
type Preview = {
  ok: boolean;
  error?: string;
  understood?: Parsed;
  item?: Item;
  movement?: Movement;
  change?: { from: Change; to: Change | null };
};
type Activity = {
  id: number; created_at: string; type: "sale" | "transfer"; quantity: number;
  from_godown: number; to_godown: number | null; brand: string; model: string; size: string;
};

async function getJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  return res.json();
}

export default function Home() {
  const [refresh, setRefresh] = useState(0); // bump to reload stock + activity

  return (
    <main>
      <h1>Kalra Tyres · Stock</h1>
      <Search refresh={refresh} />
      <Command onSaved={() => setRefresh((n) => n + 1)} />
      <ActivityList refresh={refresh} />
    </main>
  );
}

/* ---------- 1. Search ---------- */
function Search({ refresh }: { refresh: number }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [resultsFor, setResultsFor] = useState(""); // which search the table is showing
  const [error, setError] = useState("");

  useEffect(() => {
    if (!q.trim()) { setItems([]); setResultsFor(""); setError(""); return; }
    const timer = setTimeout(async () => {
      try {
        const data = await getJson(`/api/items?q=${encodeURIComponent(q)}`);
        if (data.error) { setError(data.error); return; }
        setError("");
        setItems(data.items);
        setResultsFor(q);
      } catch {
        setError("Can't reach the stock list. Check the internet and retry.");
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, refresh]);

  return (
    <section>
      <h2>Find stock</h2>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Size, brand or model, e.g. 185/65 R15 or 1856515"
        autoFocus
      />
      {error && <div className="error">{error}</div>}
      {!error && !q.trim() && <p className="hint">Type a size, brand or model.</p>}
      {!error && q.trim() && resultsFor !== q && items.length === 0 && <p className="hint">Searching…</p>}
      {!error && q.trim() && resultsFor === q && items.length === 0 && <p className="hint">No items match &ldquo;{q}&rdquo;.</p>}
      {items.length > 0 && !error && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th><th>Brand</th><th>Model</th><th>Size</th>
                <th className="num">G1</th><th className="num">G2</th><th className="num">G3</th><th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>{it.category}</td><td>{it.brand}</td><td>{it.model}</td><td>{it.size}</td>
                  {[it.godown_1, it.godown_2, it.godown_3].map((n, i) => (
                    <td key={i} className={`num ${n === 0 ? "zero" : ""}`}>{n}</td>
                  ))}
                  <td className="num total">{it.godown_1 + it.godown_2 + it.godown_3}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ---------- 2. Sentence -> confirm card ---------- */
function Command({ onSaved }: { onSaved: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"" | "reading" | "saving">("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saveError, setSaveError] = useState("");

  async function read(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy("reading"); setPreview(null); setSaveError("");
    try {
      setPreview(await getJson("/api/parse", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentence: text }),
      }));
    } catch {
      setPreview({ ok: false, error: "Couldn't reach the app. Check the internet. Nothing was changed." });
    }
    setBusy("");
  }

  async function confirm() {
    if (!preview?.movement || busy) return;
    setBusy("saving"); setSaveError("");
    try {
      const data = await getJson("/api/movements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preview.movement),
      });
      if (data.ok) { setText(""); setPreview(null); onSaved(); }
      else { setSaveError(data.error); onSaved(); }
    } catch {
      setSaveError("Couldn't reach the app. Check the internet. Nothing was changed.");
    }
    setBusy("");
  }

  return (
    <section>
      <h2>Record a sale or move</h2>
      <form className="row" onSubmit={read}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Sold 2 MRF ZLX 185/65 R15 from Godown 2"
          disabled={busy !== ""}
        />
        <button type="submit" disabled={!text.trim() || busy !== ""}>
          {busy === "reading" ? "Reading…" : "Check"}
        </button>
      </form>
      {busy === "reading" && <p className="hint">Reading your sentence with Gemini…</p>}
      {preview && <ConfirmCard p={preview} busy={busy === "saving"} saveError={saveError}
        onConfirm={confirm} onCancel={() => { setPreview(null); setSaveError(""); }} />}
    </section>
  );
}

function Field({ label, value, required }: { label: string; value: React.ReactNode; required?: boolean }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <>
      <dt>{label}</dt>
      <dd>{empty ? <span className={required ? "missing" : "unset"}>not stated</span> : value}</dd>
    </>
  );
}

function ConfirmCard({ p, busy, saveError, onConfirm, onCancel }: {
  p: Preview; busy: boolean; saveError: string; onConfirm: () => void; onCancel: () => void;
}) {
  const u = p.understood;
  const transfer = u?.type === "transfer";
  return (
    <div className={`card ${p.ok ? "" : "failed"}`}>
      {u && (
        <>
          <strong>What the AI understood</strong>
          <dl>
            <Field label="Type" value={u.type} required />
            <Field label="Quantity" value={u.quantity} required />
            <Field label="Brand" value={u.brand} />
            <Field label="Model" value={u.model} />
            <Field label="Size" value={u.size} />
            <Field label="Category" value={u.category} />
            <Field label="From" value={u.from_godown && `Godown ${u.from_godown}`} required />
            {(transfer || u.to_godown) && <Field label="To" value={u.to_godown && `Godown ${u.to_godown}`} required />}
          </dl>
        </>
      )}

      {p.ok && p.item && p.change && (
        <>
          <div className="match">
            {p.item.brand} {p.item.model} {p.item.size} <span className="unset">({p.item.category})</span>
          </div>
          <div className="change">
            Godown {p.change.from.godown}: {p.change.from.before} → {p.change.from.after}
            {p.change.to && <> · Godown {p.change.to.godown}: {p.change.to.before} → {p.change.to.after}</>}
          </div>
        </>
      )}

      {!p.ok && (
        <div className="error">
          {p.error}{p.error?.includes("Nothing was changed") ? "" : " Nothing was changed."}
        </div>
      )}
      {saveError && <div className="error">{saveError}</div>}

      <div className="actions">
        {p.ok && !saveError && <button onClick={onConfirm} disabled={busy}>{busy ? "Saving…" : "Confirm"}</button>}
        <button className="secondary" onClick={onCancel} disabled={busy}>{p.ok && !saveError ? "Cancel" : "Close"}</button>
      </div>
    </div>
  );
}

/* ---------- 3. Activity ---------- */
function ActivityList({ refresh }: { refresh: number }) {
  const [rows, setRows] = useState<Activity[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await getJson("/api/movements");
      if (data.error) { setError(data.error); return; }
      setError(""); setRows(data.movements);
    } catch {
      setError("Can't reach the stock list. Check the internet and retry.");
    }
  }, []);

  useEffect(() => { load(); }, [load, refresh]);

  return (
    <section>
      <h2>Activity</h2>
      {error && (
        <div className="error">
          {error} <button className="secondary" onClick={load}>Retry</button>
        </div>
      )}
      {!error && rows?.length === 0 && <p className="hint">No sales or moves yet.</p>}
      <ul className="activity">
        {rows?.map((r) => (
          <li key={r.id}>
            <time>
              {new Date(r.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
            </time>
            {r.type === "sale" ? "Sale" : "Transfer"} · {r.quantity} × {r.brand} {r.model} {r.size} ·{" "}
            {r.type === "sale" ? `from Godown ${r.from_godown}` : `Godown ${r.from_godown} → Godown ${r.to_godown}`}
          </li>
        ))}
      </ul>
    </section>
  );
}

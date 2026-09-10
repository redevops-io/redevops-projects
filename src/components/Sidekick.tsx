import { useEffect, useRef, useState } from "react";
import type { DataClient } from "../data/client";
import type { SidekickContext } from "../data/types";

interface Msg { who: "you" | "sk"; text: string; actions?: { label: string; kind: string }[]; }

// A seed carries a suggested prompt into the panel. `send:false` pre-fills the input and
// focuses it (the user edits before sending); `send:true` submits immediately so the panel
// opens straight onto the answer. `nonce` lets the same text re-trigger and is consumed once.
export interface SidekickSeed { text: string; send: boolean; nonce: number; }

export function Sidekick({ open, ctx, client, onClose, seed }:
  { open: boolean; ctx: SidekickContext; client: DataClient; onClose: () => void; seed?: SidekickSeed | null }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const consumed = useRef<number>(0);

  useEffect(() => {
    if (open && msgs.length === 0) {
      setMsgs([{ who: "sk", text: "I carry your current context (shown above), so “this” always means what you're looking at. Tell me an outcome — I connect the apps, verify them, and run the work." }]);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Consume a seed once per nonce: either submit it (path B — show the answer) or pre-fill and
  // focus the input (suggested-prompt path A) so the user can edit before sending.
  useEffect(() => {
    if (!open || !seed || seed.nonce === consumed.current) return;
    consumed.current = seed.nonce;
    if (seed.send) { void send(seed.text); }
    else { setInput(seed.text); requestAnimationFrame(() => inputRef.current?.focus()); }
  }, [open, seed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [msgs]);

  async function send(text: string) {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { who: "you", text }]);
    setInput("");
    const reply = await client.askSidekick(ctx, text);
    setMsgs((m) => [...m, { who: "sk", text: reply.text, actions: reply.actions }]);
  }

  const objectLine = ctx.objectRef ? <> · Object <b>{ctx.objectRef}</b></> : null;

  return (
    <>
      <div className={`backdrop ${open ? "open" : ""}`} onClick={onClose} />
      <aside className={`sk ${open ? "open" : ""}`} aria-label="Sidekick">
        <div className="hd">
          <span className="logo">◆</span><b>Sidekick</b>
          <span className="pill mut" style={{ marginLeft: 6 }}><span className="dot" />Mission Supervisor</span>
          <button className="x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="ctxchip">Project <b>Customer Operations</b> · Section <b>{ctx.section}</b>{objectLine}</div>
        <div className="body" ref={bodyRef}>
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.who}`}>
              {m.text}
              {m.actions && (
                <div className="acts">
                  {m.actions.map((a, j) => (
                    <button key={j} className={`btn sm ${a.kind === "edit" ? "" : "pri"}`}
                      onClick={() => setMsgs((x) => [...x, { who: "sk", text: `✓ ${a.label}` }])}>{a.label}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="foot">
          <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(input); }}
            placeholder="Tell Sidekick what you want done…" />
          <button className="btn pri" onClick={() => send(input)}>Send</button>
        </div>
      </aside>
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import type { DataClient } from "../data/client";
import type { SidekickContext } from "../data/types";

interface Msg { who: "you" | "sk"; text: string; actions?: { label: string; kind: string }[]; }

export function Sidekick({ open, ctx, client, onClose }:
  { open: boolean; ctx: SidekickContext; client: DataClient; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && msgs.length === 0) {
      setMsgs([{ who: "sk", text: "I carry your current context (shown above), so “this” always means what you're looking at. Tell me an outcome — I connect the apps, verify them, and run the work." }]);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <input value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(input); }}
            placeholder="Tell Sidekick what you want done…" />
          <button className="btn pri" onClick={() => send(input)}>Send</button>
        </div>
      </aside>
    </>
  );
}

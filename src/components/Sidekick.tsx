import { useEffect, useRef, useState } from "react";
import type { DataClient } from "../data/client";
import type { Section } from "./Rail";
import type { SidekickContext } from "../data/types";
import { deployment } from "../data/deployment";

interface Msg { who: "you" | "sk"; text: string; actions?: { label: string; kind: string; ref?: string }[]; }

// A seed carries a suggested prompt into the panel. `send:false` pre-fills the input and
// focuses it (the user edits before sending); `send:true` submits immediately so the panel
// opens straight onto the answer. `nonce` lets the same text re-trigger and is consumed once.
export interface SidekickSeed { text: string; send: boolean; nonce: number; }

export function Sidekick({ open, ctx, client, onClose, seed, go }:
  { open: boolean; ctx: SidekickContext; client: DataClient; onClose: () => void;
    seed?: SidekickSeed | null; go?: (s: Section) => void }) {
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
    try {
      const reply = await client.askSidekick(ctx, text);
      setMsgs((m) => [...m, { who: "sk", text: reply.text, actions: reply.actions }]);
    } catch (e) {
      // a refused or failed request must be said, not swallowed: the person asked something and is waiting
      const why = (e as { status?: number })?.status === 401 || (e as { status?: number })?.status === 403
        ? "This deployment did not accept the request. Check your sign-in, then ask again."
        : "I could not reach the runtime, so I have no answer. Your question was not lost; ask again in a moment.";
      setMsgs((m) => [...m, { who: "sk", text: why }]);
    }
  }

  const drawer = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = drawer.current;
    if (!el) return;
    if (open) el.removeAttribute("inert"); else el.setAttribute("inert", "");
  }, [open]);

  const objectLine = ctx.objectRef ? <> · Object <b>{ctx.objectRef}</b></> : null;

  return (
    <>
      <div className={`backdrop ${open ? "open" : ""}`} onClick={onClose} />
      {/* closed = out of the focus order AND the accessibility tree (it is only slid off-screen, so without this a keyboard user
          tabs into three invisible controls and a screen reader reads a panel nobody can see) */}
      <aside ref={drawer} className={`sk ${open ? "open" : ""}`} aria-label="Sidekick" aria-hidden={open ? undefined : true}>
        <div className="hd">
          <span className="logo" aria-hidden="true">◆</span><b>Sidekick</b>
          <span className="pill mut" style={{ marginLeft: 6 }}><span className="dot" />Mission Supervisor</span>
          <button className="x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="ctxchip">Project <b>{deployment.projectName}</b> · Section <b>{ctx.section}</b>{objectLine}</div>
        <div className="body" ref={bodyRef}>
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.who}`}>
              {m.text}
              {m.actions && (
                <div className="acts">
                  {m.actions.map((a, j) => (
                    <button key={j} className={`btn sm ${a.kind === "edit" ? "" : "pri"}`}
                      onClick={() => {
                        if (a.kind === "navigate" && a.ref && go) { go(a.ref as Section); return; }
                        setMsgs((x) => [...x, { who: "sk", text: `✓ ${a.label}` }]);
                      }}>{a.label}</button>
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

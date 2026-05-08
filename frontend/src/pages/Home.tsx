import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

type GraphNode = {
  id: string;
  label: string;
  kind: "thread" | "entity" | "event";
  source?: "pdf" | "chat" | "note";
  size: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

type GraphLink = { source: string; target: string; kind: "thread_event" | "event_entity" };

const nodesSeed: Omit<GraphNode, "x" | "y" | "vx" | "vy">[] = [
  { id: "t1", label: "Literature Review", kind: "thread", source: "pdf", size: 24 },
  { id: "t2", label: "Market Report", kind: "thread", source: "note", size: 22 },
  { id: "t3", label: "Thesis Draft", kind: "thread", source: "chat", size: 22 },
  { id: "e1", label: "attention.pdf", kind: "entity", size: 14 },
  { id: "e2", label: "source chunk", kind: "entity", size: 13 },
  { id: "e3", label: "claim", kind: "entity", size: 13 },
  { id: "e4", label: "citation", kind: "entity", size: 12 },
  { id: "e5", label: "obsidian note", kind: "entity", size: 12 },
  { id: "ev1", label: "uploaded pdf", kind: "event", source: "pdf", size: 10 },
  { id: "ev2", label: "retrieved top-k", kind: "event", source: "chat", size: 9 },
  { id: "ev3", label: "drafted note", kind: "event", source: "note", size: 9 },
  { id: "ev4", label: "compared claims", kind: "event", source: "chat", size: 9 },
  { id: "ev5", label: "added citation", kind: "event", source: "pdf", size: 9 },
];

const linksSeed: GraphLink[] = [
  { source: "t1", target: "ev1", kind: "thread_event" },
  { source: "t1", target: "ev2", kind: "thread_event" },
  { source: "t1", target: "ev5", kind: "thread_event" },
  { source: "t2", target: "ev4", kind: "thread_event" },
  { source: "t3", target: "ev3", kind: "thread_event" },
  { source: "ev1", target: "e1", kind: "event_entity" },
  { source: "ev2", target: "e2", kind: "event_entity" },
  { source: "ev2", target: "e3", kind: "event_entity" },
  { source: "ev5", target: "e4", kind: "event_entity" },
  { source: "ev3", target: "e5", kind: "event_entity" },
  { source: "ev4", target: "e3", kind: "event_entity" },
];

const presets = [
  {
    id: "summary",
    label: '"Summarize the active source"',
    answer:
      "ReszVault retrieved the highest-signal chunks from attention.pdf and produced a compact source-grounded summary with citations ready for a notebook note.",
    citations: ["attention.pdf", "chunk: transformers", "citation p.4"],
  },
  {
    id: "contradictions",
    label: '"Find contradictions across PDFs"',
    answer:
      "The vault found one weak claim and two supporting passages. The answer stays scoped to the selected notebook so unrelated sources do not leak into the response.",
    citations: ["claim map", "source p.12", "market-report.pdf"],
  },
  {
    id: "obsidian",
    label: '"Draft an Obsidian note"',
    answer:
      "A notebook-ready outline was generated with headings, bullets, and source anchors. You can continue the thread in chat or turn it into a project note.",
    citations: ["obsidian note", "literature review", "top-k retrieval"],
  },
];

export function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activePreset, setActivePreset] = useState(presets[0]);
  const navigate = useNavigate();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let nodes: GraphNode[] = [];
    let frame = 0;
    let alpha = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const spread = Math.min(cx, cy) * 0.72;
      nodes = nodesSeed.map((node, index) => {
        const angle = (Math.PI * 2 * index) / nodesSeed.length;
        const radius = spread * (0.55 + ((index * 19) % 30) / 100);
        return {
          ...node,
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
          vx: 0,
          vy: 0,
        };
      });
      alpha = 1;
    };

    const colorFor = (node: GraphNode) => {
      if (node.kind === "thread") return "#8a85f4";
      if (node.kind === "entity") return "#a1a1aa";
      return "#52525b";
    };

    const step = () => {
      const rect = canvas.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const index = new Map(nodes.map((node) => [node.id, node]));

      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy + 0.1;
          const dist = Math.sqrt(distSq);
          const charge = a.kind === "thread" || b.kind === "thread" ? 1500 : 680;
          const force = (charge * alpha) / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }
      }

      for (const link of linksSeed) {
        const source = index.get(link.source);
        const target = index.get(link.target);
        if (!source || !target) continue;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const rest = link.kind === "thread_event" ? 96 : 66;
        const force = (dist - rest) * 0.06 * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        source.vx += fx;
        source.vy += fy;
        target.vx -= fx;
        target.vy -= fy;
      }

      for (const node of nodes) {
        node.vx += (cx - node.x) * 0.015 * alpha;
        node.vy += (cy - node.y) * 0.015 * alpha;
        node.vx *= 0.65;
        node.vy *= 0.65;
        node.x = Math.max(30, Math.min(rect.width - 30, node.x + node.vx));
        node.y = Math.max(30, Math.min(rect.height - 30, node.y + node.vy));
      }
      alpha = Math.max(0.006, alpha * 0.985);
    };

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      step();
      const index = new Map(nodes.map((node) => [node.id, node]));

      for (const link of linksSeed) {
        const source = index.get(link.source);
        const target = index.get(link.target);
        if (!source || !target) continue;
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle =
          link.kind === "thread_event"
            ? "rgba(138, 133, 244, 0.34)"
            : "rgba(255, 255, 255, 0.12)";
        ctx.lineWidth = link.kind === "thread_event" ? 1.6 : 1;
        ctx.stroke();
      }

      for (const node of nodes) {
        const radius = node.size * 0.62;
        if (node.kind === "thread") {
          ctx.save();
          ctx.shadowBlur = 18;
          ctx.shadowColor = "rgba(111, 107, 217, 0.45)";
          ctx.fillStyle = "rgba(111, 107, 217, 0.12)";
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius * 1.7, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = colorFor(node);
        ctx.fill();
        ctx.strokeStyle =
          node.kind === "thread" ? "rgba(138,133,244,0.48)" : "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1.2;
        ctx.stroke();

        if (node.kind !== "event") {
          ctx.font =
            node.kind === "thread"
              ? "600 10px Inter, sans-serif"
              : "400 9px JetBrains Mono, monospace";
          ctx.textAlign = "left";
          ctx.fillStyle =
            node.kind === "thread" ? "rgba(250,250,250,0.92)" : "rgba(161,161,170,0.72)";
          ctx.fillText(node.label, node.x + radius + 7, node.y + 3);
        }
      }

      frame = requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const openSandbox = () => navigate("/login");
  const openGuest = () => navigate("/guest");

  return (
    <div className="rv-webcopy">
      <header className="copy-header">
        <div className="copy-nav-container">
          <Link className="copy-brand" to="/">
            <span className="copy-logo">R</span>
            <span>reszvault</span>
          </Link>
          <nav className="copy-nav-menu">
            <a href="#sandbox">Sandbox</a>
            <a href="#pipeline">Pipeline</a>
            <a href="#features">Features</a>
            <a href="#faq">FAQ</a>
          </nav>
          <button className="copy-nav-btn" type="button" onClick={openSandbox}>
            Open Sandbox
            <ArrowIcon />
          </button>
        </div>
      </header>

      <main>
        <section className="copy-hero" id="hero">
          <div className="copy-hero-container">
            <span className="copy-hero-badge">
              <span className="copy-pulse-dot" />
              NotebookLM-style vault for grounded research
            </span>
            <h1>
              Every chat forgets your sources.
              <br />
              <span>ReszVault is the memory underneath.</span>
            </h1>
            <p>
              Upload PDFs into notebook-style projects, ask questions against
              selected sources, and turn retrieved evidence into Obsidian-ready
              notes without losing context between chats.
            </p>
            <div className="copy-hero-actions">
              <button className="copy-btn-primary" type="button" onClick={openSandbox}>
                Launch Interactive Sandbox
                <ArrowIcon />
              </button>
              <button className="copy-btn-secondary" type="button" onClick={openGuest}>
                Enter as Guest
              </button>
            </div>
            <div className="copy-hero-stats">
              <div>
                <strong>21</strong>
                <span>Indexed Sources</span>
              </div>
              <div>
                <strong>3</strong>
                <span>Notebook Rooms</span>
              </div>
              <div>
                <strong>100%</strong>
                <span>Source Grounded</span>
              </div>
            </div>
          </div>
        </section>

        <section className="copy-sandbox" id="sandbox">
          <div className="copy-section-head">
            <span>Interactive Demo</span>
            <h2>Query your research vault in real time.</h2>
            <p>
              Same command-center layout as the website reference: chat and
              telemetry on the left, Obsidian-style source graph on the right.
              NotebookLM behavior is adapted through sources, projects, and
              studio actions.
            </p>
          </div>

          <div className="copy-dashboard-grid">
            <div className="copy-panel copy-console-panel">
              <div className="copy-panel-header">
                <div className="copy-window-controls">
                  <span className="copy-dot red" />
                  <span className="copy-dot yellow" />
                  <span className="copy-dot green" />
                </div>
                <div className="copy-panel-tab">reszvault-retrieval@local</div>
              </div>

              <div className="copy-console-body">
                <div className="copy-console-intro">
                  <p>// ReszVault notebook selected: Literature Review</p>
                  <p>// Connected source: attention.pdf (42 indexed chunks)</p>
                  <p className="success">// Status: READY. Query evidence below.</p>
                </div>

                <div className="copy-terminal">
                  <div className="copy-terminal-line">
                    <span>$</span> POST /chat/stream --source active-vault
                  </div>
                  <div className="copy-log-line"><b>[retrieve]</b> semantic top-k selected</div>
                  <div className="copy-log-line"><b>[ground]</b> citations attached to answer</div>
                  <div className="copy-log-line"><b>[studio]</b> note outline ready</div>
                </div>

                <div className="copy-output-card">
                  <span>Retrieved Answer</span>
                  <p>{activePreset.answer}</p>
                  <div>
                    {activePreset.citations.map((citation) => (
                      <button key={citation} type="button">#{citation}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="copy-console-footer">
                <span>Choose a query:</span>
                <div>
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={preset.id === activePreset.id ? "active" : ""}
                      onClick={() => setActivePreset(preset)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="copy-panel copy-graph-panel">
              <div className="copy-panel-header">
                <span className="copy-panel-title">source_graph.json</span>
                <div className="copy-graph-actions">
                  <button type="button">Reheat</button>
                  <button type="button">Zoom Out</button>
                </div>
              </div>
              <div className="copy-graph-canvas-container">
                <canvas ref={canvasRef} />
              </div>
              <div className="copy-graph-footer">
                <div>
                  <span><i className="thread" /> Thread</span>
                  <span><i className="entity" /> Source</span>
                  <span><i className="event" /> Event</span>
                </div>
                <p>Animated source graph · Notebook context stays scoped.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="copy-pipeline" id="pipeline">
          <div className="copy-section-head">
            <span>Notebook Workflow</span>
            <h2>Project. Source. Retrieve. Studio.</h2>
          </div>
          <div className="copy-card-grid">
            {[
              ["01", "Choose project", "Start in a notebook-style vault so sources stay separate."],
              ["02", "Upload sources", "Index PDFs into chunks, claims, citations, and notes."],
              ["03", "Ask chat", "Query only the active source or the full project vault."],
              ["04", "Create notes", "Turn answers into summaries, contradictions, and outlines."],
            ].map(([step, title, text]) => (
              <article key={step}>
                <span>{step}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="copy-pipeline" id="features">
          <div className="copy-section-head">
            <span>NotebookLM adapted</span>
            <h2>Source-first chat, darker command-center UI.</h2>
          </div>
          <div className="copy-card-grid three">
            <article><h3>Sources rail</h3><p>Signed-in users upload and select PDFs from the left rail.</p></article>
            <article><h3>Central chat</h3><p>The chat surface stays focused and grounded to the selected source.</p></article>
            <article><h3>Studio prompts</h3><p>Generate briefings, contradictions, and Obsidian outlines from context.</p></article>
          </div>
        </section>

        <section className="copy-faq" id="faq">
          <h2>Ready to open the vault?</h2>
          <button className="copy-btn-primary" type="button" onClick={openSandbox}>
            Open Sandbox
            <ArrowIcon />
          </button>
        </section>
      </main>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m9 6 6 6-6 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

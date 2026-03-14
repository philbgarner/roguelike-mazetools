import React from "react";

const examples = [
  {
    hash: "#/examples/minimal",
    title: "Minimal",
    description:
      "Default generation with seed and level only. No theme, no authorial controls.",
  },
  {
    hash: "#/examples/themed",
    title: "With Theme",
    description:
      "Medieval Keep theme adds resolved spawns and render uniforms.",
  },
  {
    hash: "#/examples/preset-controls",
    title: "Preset Authorial Controls",
    description:
      "Medium difficulty, balanced budget, standard pacing via preset IDs.",
  },
  {
    hash: "#/examples/inline-controls",
    title: "Inline Authorial Controls",
    description:
      "Babylon Ziggurat theme with fully custom inline difficulty, budget, and pacing.",
  },
];

export default function ExampleGallery() {
  return (
    <div className="maze-app maze-app--centered">
      <div className="maze-controls">
        <h2 className="maze-title">API Quickstart Examples</h2>

        <p style={{ opacity: 0.7, marginBottom: 16 }}>
          Each example calls <code>generateDungeon()</code> with a different
          configuration from API-QUICKSTART.md and renders the result in the
          inspection shell.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {examples.map((ex) => (
            <button
              key={ex.hash}
              className="maze-btn"
              style={{ textAlign: "left", padding: "10px 14px" }}
              onClick={() => {
                window.location.hash = ex.hash;
              }}
            >
              <strong>{ex.title}</strong>
              <br />
              <span style={{ opacity: 0.7, fontSize: "0.9em" }}>
                {ex.description}
              </span>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 20 }}>
          <button
            className="maze-btn"
            onClick={() => {
              window.location.hash = "#/";
            }}
          >
            Back to Wizard
          </button>
        </div>
      </div>
    </div>
  );
}

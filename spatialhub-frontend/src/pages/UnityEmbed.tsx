import { useState } from "react";

const UnityEmbed = () => {
  const [width, setWidth] = useState(960);
  const [height, setHeight] = useState(600);

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">
          <span
            className="page-title-accent"
            style={{ background: "var(--accent-orange)" }}
          />
          Unity WebGL Simulation
        </h2>
        <p className="page-subtitle">Interactive 3D environment viewer</p>
      </div>

      <div className="card" style={{ marginBottom: "24px" }}>
        <div className="card-body">
          <div className="form-inline">
            <div className="form-field">
              <label className="form-label">Width (px)</label>
              <input
                className="form-input"
                type="number"
                value={width}
                onChange={(e) => setWidth(parseInt(e.target.value))}
                style={{ width: "120px" }}
              />
            </div>
            <div className="form-field">
              <label className="form-label">Height (px)</label>
              <input
                className="form-input"
                type="number"
                value={height}
                onChange={(e) => setHeight(parseInt(e.target.value))}
                style={{ width: "120px" }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <iframe
          src="https://itch.io/embed-upload/10601498?color=ffffff"
          title="Unity WebGL Build"
          width="100%"
          height={height}
          allowFullScreen
          style={{ display: "block", border: "none" }}
        />
      </div>
    </div>
  );
};

export default UnityEmbed;

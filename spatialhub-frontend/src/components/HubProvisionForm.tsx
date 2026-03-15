import React, { useState } from "react";
import { provisionHub } from "../api/api";

export const HubProvisionForm: React.FC = () => {
  const [location, setLocation] = useState("");
  const [owner, setOwner] = useState("");
  const [workers, setWorkers] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await provisionHub({ location, owner, workers: workers.split(",") });
      setStatus("success");
      setLocation("");
      setOwner("");
      setWorkers("");
      setTimeout(() => setStatus("idle"), 4000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 4000);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="form-label">Location</label>
        <input
          className="form-input"
          placeholder="e.g., Greenhouse A — Bay 3"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          required
        />
      </div>

      <div className="form-group">
        <label className="form-label">Owner</label>
        <input
          className="form-input"
          placeholder="e.g., operations@farm.io"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          required
        />
      </div>

      <div className="form-group">
        <label className="form-label">Workers</label>
        <input
          className="form-input"
          placeholder="Comma-separated worker IDs"
          value={workers}
          onChange={(e) => setWorkers(e.target.value)}
          required
        />
      </div>

      {status === "success" && (
        <div className="success-state">Hub provisioned successfully</div>
      )}

      {status === "error" && (
        <div className="error-state" style={{ marginBottom: "16px" }}>
          Failed to provision hub
        </div>
      )}

      <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>
        Provision Hub
      </button>
    </form>
  );
};

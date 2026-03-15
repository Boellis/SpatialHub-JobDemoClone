import React from "react";
import { HubProvisionForm } from "../components/HubProvisionForm";

export const ProvisionHub: React.FC = () => (
  <div className="page page--narrow">
    <div className="page-header">
      <h2 className="page-title">
        <span
          className="page-title-accent"
          style={{ background: "var(--accent-green)" }}
        />
        Provision New Hub
      </h2>
      <p className="page-subtitle">Register a new sensor hub to the network</p>
    </div>

    <div className="card">
      <div className="card-body">
        <HubProvisionForm />
      </div>
    </div>
  </div>
);

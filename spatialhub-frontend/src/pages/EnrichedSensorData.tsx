import { useEffect, useState } from "react";
import { fetchEnrichedSensorData } from "../api/api";

export function EnrichedSensorData() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchEnrichedSensorData(1)
      .then((result) => {
        const flat = Array.isArray(result) ? result.flat() : result;
        setData(flat);
      })
      .catch(() => setError("Failed to fetch enriched sensor data"))
      .finally(() => setLoading(false));
  }, []);

  const paginatedData = data.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const totalPages = Math.ceil(data.length / itemsPerPage);

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">
          <span
            className="page-title-accent"
            style={{ background: "var(--accent-purple)" }}
          />
          Enriched Sensor Data
          {data.length > 0 && (
            <span className="badge badge-count">{data.length} records</span>
          )}
        </h2>
        <p className="page-subtitle">
          Telemetry enriched with hub metadata and farm context
        </p>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <div className="loading-text">Loading enriched data</div>
          </div>
        ) : error ? (
          <div className="card-body">
            <div className="error-state">{error}</div>
          </div>
        ) : (
          <>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    {paginatedData[0] &&
                      Object.keys(paginatedData[0]).map((key) => (
                        <th key={key}>{key}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.length > 0 ? (
                    paginatedData.map((item, i) => (
                      <tr key={i}>
                        {Object.values(item).map((val, j) => (
                          <td key={j}>{String(val)}</td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr className="empty-row">
                      <td colSpan={10}>No enriched data available</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 0 && (
              <div className="pagination">
                <span className="pagination-info">
                  Showing {(currentPage - 1) * itemsPerPage + 1}&ndash;
                  {Math.min(currentPage * itemsPerPage, data.length)} of{" "}
                  {data.length}
                </span>
                <div className="pagination-controls">
                  <button
                    className="pagination-btn"
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    &larr; Prev
                  </button>
                  <span className="pagination-current">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    className="pagination-btn"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(p + 1, totalPages))
                    }
                    disabled={currentPage === totalPages}
                  >
                    Next &rarr;
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

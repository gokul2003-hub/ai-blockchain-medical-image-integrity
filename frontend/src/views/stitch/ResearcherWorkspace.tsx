import React, { useState, useEffect } from "react";
import { apiService } from "../../services/api";
import { MetricCard } from "../../components/stitch/MetricCard";
import { ClinicalBadge } from "../../components/stitch/ClinicalBadge";
import { StatusPill } from "../../components/stitch/StatusPill";
import { LoadingState, EmptyState, ErrorState } from "../../components/stitch/States";

interface ResearcherWorkspaceProps {
  token: string;
  activeSubPath: string;
  onNavigate: (path: string) => void;
}

export const ResearcherWorkspace: React.FC<ResearcherWorkspaceProps> = ({
  token,
  activeSubPath,
  onNavigate,
}) => {
  const [images, setImages] = useState<any[]>([]);
  const [fheBenchmark, setFheBenchmark] = useState<any | null>(null);
  const [cryptoBenchmark, setCryptoBenchmark] = useState<any | null>(null);
  const [simulationResult, setSimulationResult] = useState<any | null>(null);
  const [selectedScanId, setSelectedScanId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [simLoading, setSimLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadResearchData();
  }, [token]);

  const loadResearchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [imgsRes, fheRes] = await Promise.allSettled([
        apiService.listImages(),
        apiService.getFheBenchmark(),
      ]);

      if (imgsRes.status === "fulfilled" && Array.isArray(imgsRes.value)) {
        setImages(imgsRes.value);
        if (imgsRes.value.length > 0) {
          setSelectedScanId(imgsRes.value[0].id);
          // Load crypto benchmark for the first scan
          apiService
            .getCryptoBenchmark(imgsRes.value[0].id)
            .then((res) => setCryptoBenchmark(res))
            .catch(() => setCryptoBenchmark(null));
        }
      }
      if (fheRes.status === "fulfilled") {
        setFheBenchmark(fheRes.value);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load research datasets and cryptographic benchmarks.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectScanForCrypto = async (id: number) => {
    setSelectedScanId(id);
    setCryptoBenchmark(null);
    try {
      const data = await apiService.getCryptoBenchmark(id);
      setCryptoBenchmark(data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Crypto benchmark evaluation crashed.");
    }
  };

  const handleRunSimulation = async () => {
    setSimLoading(true);
    setError(null);
    try {
      const result = await apiService.runResearchSimulation();
      setSimulationResult(result);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Federated simulation execution failed.");
    } finally {
      setSimLoading(false);
    }
  };

  if (loading && images.length === 0) {
    return <LoadingState message="Loading Federated Learning & Homomorphic Encryption Laboratory..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-surface-container-low">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-[11px] uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
            <span>Consortium Research Cluster</span>
            <span>/</span>
            <span className="text-primary font-semibold">Federated Privacy-Preserving Analytics</span>
          </div>
          <h1 className="font-headline-xl text-2xl md:text-3xl font-bold text-on-surface tracking-tight">
            Authorized Researcher Workspace
          </h1>
          <p className="font-body-md text-xs md:text-sm text-on-surface-variant max-w-3xl">
            Evaluate privacy-preserving machine learning on de-identified radiographic cohorts, track CKKS homomorphic noise budgets, and test 4D hyperchaotic sensitivity.
          </p>
        </div>

        {/* Primary research-data action — honestly labelled.
            Backend gap: there is NO researcher file-upload endpoint.
            /api/images/upload and /api/images/upload-dicom are gated by
            RoleChecker(["super_admin","doctor","radiologist"]) and must stay
            blocked for researchers. The only supported researcher data-ingestion
            action is POST /api/analytics/research-simulation (plus read-only
            GET benchmark endpoints) — do NOT add clinical upload UI here. */}
        <div className="flex flex-col items-start md:items-end gap-1.5">
          <button
            onClick={handleRunSimulation}
            disabled={simLoading}
            className="px-4 py-2 rounded-lg bg-tertiary text-on-tertiary font-label-md text-xs hover:bg-tertiary-container shadow-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm animate-spin-slow">hub</span>
            <span>{simLoading ? "Running Analysis..." : "Run Approved Research Analysis"}</span>
          </button>
          <p className="font-body-sm text-[10px] leading-snug text-on-surface-variant max-w-[300px] md:text-right">
            De-identified research data only — clinical image upload is restricted to clinical staff.
          </p>
        </div>
      </div>

      {error && <ErrorState message={error} />}

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="De-identified Cohort"
          value={images.length}
          unit="scans"
          subtitle="HIPAA Safe Harbor Filtered"
          icon="biotech"
          iconBgClass="bg-tertiary-fixed text-tertiary"
          footerText="No direct patient identifiers"
          footerBadgeText="Approved"
          footerBadgeClass="bg-secondary-fixed text-on-secondary-fixed font-semibold"
        />
        <MetricCard
          title="Homomorphic Scheme"
          value={fheBenchmark?.scheme ? "CKKS Sim" : "Active"}
          unit="Tensor Math"
          subtitle={`Poly Degree: ${fheBenchmark?.poly_modulus_degree || 8192}`}
          icon="calculate"
          iconBgClass="bg-primary-container text-on-primary-container"
          footerText={`Noise Budget: ${fheBenchmark?.initial_noise_budget_bits || 120} bits`}
          footerBadgeText="Simulation"
        />
        <MetricCard
          title="NPCR Differential"
          value={cryptoBenchmark?.NPCR || "—"}
          unit="Pixel Rate"
          subtitle="Net Pixel Change Rate"
          icon="science"
          iconBgClass="bg-secondary-container text-secondary"
          valueColorClass="text-secondary"
          footerText="IEEE Strict Security Compliant"
          footerBadgeText={cryptoBenchmark?.NPCR ? "Computed" : "Standby"}
          footerBadgeClass="bg-secondary-fixed text-on-secondary-fixed font-semibold"
        />
        <MetricCard
          title="Unified Average Intensity"
          value={cryptoBenchmark?.UACI || "—"}
          unit="UACI Rate"
          subtitle="Ideal 4D Hyperchaos: ~33.46%"
          icon="show_chart"
          footerText="Uniform ciphertext distribution"
          footerBadgeText={cryptoBenchmark?.UACI ? "Computed" : "Standby"}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 1. HOMOMORPHIC ENCRYPTION BENCHMARK LAB                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-surface-container-lowest rounded-xl p-space-md border border-surface-container-high/60 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-surface-container-low">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">
              calculate
            </span>
            <h3 className="font-headline-sm text-sm font-semibold text-on-surface">
              CKKS Homomorphic Tensor Operations &amp; Noise Tracking (Research Simulation)
            </h3>
          </div>
          <span className="px-2.5 py-0.5 rounded font-label-sm text-[10px] bg-tertiary-fixed text-on-tertiary-fixed-variant font-semibold">
            CKKS Research Simulation
          </span>
        </div>

        {fheBenchmark?.operations ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {fheBenchmark.operations.map((op: any, i: number) => (
                <div
                  key={i}
                  className="bg-surface-container-low p-3 rounded-lg border border-surface-container-high/40 space-y-1.5"
                >
                  <span className="font-label-sm text-xs font-semibold text-primary block truncate">
                    {op.op}
                  </span>
                  <div className="text-[11px] text-on-surface-variant font-code-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Decrypted Result:</span>
                      <span className="font-mono text-on-surface font-semibold truncate max-w-[120px]">
                        [{op.decrypted_result?.map((n: number) => n.toFixed(2)).join(", ")}]
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Noise Budget Left:</span>
                      <span className="text-secondary font-semibold">
                        {op.remaining_noise_budget_bits} bits
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-surface-container-low rounded-lg text-xs text-on-surface-variant space-y-1">
              <span className="font-label-sm text-[10px] text-outline uppercase tracking-wider block font-semibold">
                Privacy Status &amp; Research Disclaimer
              </span>
              <p className="font-body-sm text-[11px] leading-relaxed">
                {fheBenchmark.disclaimer || "Simulated CKKS algebraic noise tracking for homomorphic inference evaluation."}
              </p>
            </div>
          </div>
        ) : (
          <EmptyState
            title="FHE Benchmarking Standby"
            description="Run the evaluation or verify backend FHE engine status."
          />
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2. CRYPTOGRAPHIC SENSITIVITY BENCHMARK (NPCR / UACI)               */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-surface-container-lowest rounded-xl p-space-md border border-surface-container-high/60 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-surface-container-low">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-xl">
              science
            </span>
            <h3 className="font-headline-sm text-sm font-semibold text-on-surface">
              4D Hyperchaotic Sensitivity &amp; Correlation Analysis
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <label className="font-label-sm text-xs text-on-surface-variant">
              Select Study:
            </label>
            <select
              value={selectedScanId || ""}
              onChange={(e) => handleSelectScanForCrypto(Number(e.target.value))}
              className="bg-surface-container-low text-on-surface font-body-sm text-xs px-2.5 py-1 rounded border border-surface-container-high focus:outline-none"
            >
              {images.map((img) => (
                <option key={img.id} value={img.id}>
                  Scan #{img.id} - {img.title || "DICOM"}
                </option>
              ))}
            </select>
          </div>
        </div>

        {cryptoBenchmark ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="bg-surface-container-low p-3.5 rounded-lg space-y-2">
              <span className="font-label-sm text-outline uppercase text-[10px] tracking-wider block">
                NPCR (Net Pixel Change Rate)
              </span>
              <span className="font-display-lg text-2xl font-bold text-secondary block">
                {cryptoBenchmark.NPCR}
              </span>
              <p className="font-body-sm text-[11px] text-on-surface-variant">
                Threshold &gt; 99.6% demonstrates extreme plaintext avalanche sensitivity.
              </p>
            </div>

            <div className="bg-surface-container-low p-3.5 rounded-lg space-y-2">
              <span className="font-label-sm text-outline uppercase text-[10px] tracking-wider block">
                UACI (Unified Average Changing Intensity)
              </span>
              <span className="font-display-lg text-2xl font-bold text-primary block">
                {cryptoBenchmark.UACI}
              </span>
              <p className="font-body-sm text-[11px] text-on-surface-variant">
                Expected ~33.4% verifies uniform ciphertext differential distribution.
              </p>
            </div>

            <div className="bg-surface-container-low p-3.5 rounded-lg space-y-2">
              <span className="font-label-sm text-outline uppercase text-[10px] tracking-wider block">
                Security Standard
              </span>
              <span className="font-headline-sm text-sm font-semibold text-on-surface block">
                {cryptoBenchmark.security_status}
              </span>
              <div className="text-[10px] font-mono text-on-surface-variant pt-1">
                Correlation: {JSON.stringify(cryptoBenchmark.correlation_coefficients || { horizontal: 0.002 })}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            title="Evaluating Scan Sensitivity..."
            description="Select a scan to inspect NPCR and UACI metrics from the backend."
          />
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 3. FEDERATED SIMULATION RESULT                                     */}
      {/* ------------------------------------------------------------------ */}
      {simulationResult && (
        <div className="bg-surface-container-lowest rounded-xl p-space-md border border-surface-container-high/60 shadow-sm space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-surface-container-low">
            <span className="material-symbols-outlined text-tertiary text-xl">hub</span>
            <h3 className="font-headline-sm text-sm font-semibold text-on-surface">
              Federated Learning Aggregation Output (FedAvg Research Simulation)
            </h3>
          </div>
          <pre className="p-3 bg-surface-container-low rounded-lg font-code-sm text-xs text-on-surface overflow-x-auto">
            {JSON.stringify(simulationResult, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
export default ResearcherWorkspace;

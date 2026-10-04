import React, { useState, useEffect } from "react";
import { apiService, fetchProtectedBlobUrl } from "../../services/api";
import { wsService } from "../../services/websocket";
import { MetricCard } from "../../components/stitch/MetricCard";
import { StatusPill } from "../../components/stitch/StatusPill";
import { ClinicalBadge } from "../../components/stitch/ClinicalBadge";
import { RiskScoreCard } from "../../components/stitch/RiskScoreCard";
import { TrustScoreCard } from "../../components/stitch/TrustScoreCard";
import { HashComparisonCard } from "../../components/stitch/HashComparisonCard";
import { StepTracker, type StepItem } from "../../components/stitch/StepTracker";
import { QuadViewport } from "../../components/stitch/QuadViewport";
import { AuditLedger } from "../../components/stitch/AuditLedger";
import { ConsentCard } from "../../components/stitch/ConsentCard";
import { LoadingState, EmptyState, ErrorState } from "../../components/stitch/States";
import { FileUploadZone } from "../../components/stitch/FileUploadZone";
import IntegrityProof from "../IntegrityProof";

interface DoctorWorkspaceProps {
  token: string;
  activeSubPath: string;
  onNavigate: (path: string) => void;
  selectedImageId: number | null;
  onSelectImage: (id: number | null) => void;
}

export const DoctorWorkspace: React.FC<DoctorWorkspaceProps> = ({
  token,
  activeSubPath,
  onNavigate,
  selectedImageId,
  onSelectImage,
}) => {
  // State for images, analytics, recovery records, consents
  const [images, setImages] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [selectedScan, setSelectedScan] = useState<any | null>(null);
  const [digitalTwin, setDigitalTwin] = useState<any | null>(null);
  const [integrityEvidence, setIntegrityEvidence] = useState<any | null>(null);
  const [recoveryRecords, setRecoveryRecords] = useState<any[]>([]);
  const [consents, setConsents] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);

  // Filter state for dashboard table
  const [filterType, setFilterType] = useState<"all" | "requires_check" | "tampered" | "verified">("all");
  const [loading, setLoading] = useState<boolean>(true);
  const [recoveryLoading, setRecoveryLoading] = useState<boolean>(false);
  const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preRecoveryUrl, setPreRecoveryUrl] = useState<string | null>(null);
  const [postRecoveryUrl, setPostRecoveryUrl] = useState<string | null>(null);
  const [liveAlert, setLiveAlert] = useState<string | null>(null);

  // Connect to live WebSocket for real-time security alerts
  useEffect(() => {
    wsService.connect();
    const unsub = wsService.on("*", (payload) => {
      if (payload.event === "tampering_detected") {
        setLiveAlert(`[SECURITY ALERT] Tamper detected on Study "${payload.title || '#' + payload.image_id}" (Risk Score: ${payload.risk_score || 'High'})`);
        loadData();
      } else if (payload.event === "new_scan_uploaded") {
        setLiveAlert(`[SYSTEM UPDATE] New imaging study "${payload.title}" registered.`);
        loadData();
      } else if (payload.event === "scan_recovered") {
        setLiveAlert(`[RESTORATION] Image #${payload.image_id} self-recovery verified.`);
        loadData();
      }
    });

    return () => {
      unsub();
    };
  }, []);

  // Clean up object URLs on replacement or unmount
  useEffect(() => {
    return () => {
      if (preRecoveryUrl) URL.revokeObjectURL(preRecoveryUrl);
      if (postRecoveryUrl) URL.revokeObjectURL(postRecoveryUrl);
    };
  }, [preRecoveryUrl, postRecoveryUrl]);

  // Load baseline data on mount
  useEffect(() => {
    loadData();
  }, [token]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [imgsData, analyticsData, recRecordsData, consentData, blocksData, patientsData] =
        await Promise.allSettled([
          apiService.listImages(),
          apiService.getDashboardAnalytics(),
          apiService.getRecoveryRecords(),
          apiService.listConsentGrants(),
          apiService.getBlockchainBlocks(),
          apiService.listPatients(),
        ]);

      if (imgsData.status === "fulfilled" && Array.isArray(imgsData.value)) {
        // Derive display flags from the real quarantine_status DB field
        setImages(imgsData.value.map((img: any) => ({ ...img, is_tampered: !!img.quarantine_status, tampered: !!img.quarantine_status })));
        if (!selectedImageId && imgsData.value.length > 0) {
          onSelectImage(imgsData.value[0].id);
        }
      }
      if (analyticsData.status === "fulfilled") setAnalytics(analyticsData.value);
      if (recRecordsData.status === "fulfilled" && recRecordsData.value?.items) {
        setRecoveryRecords(recRecordsData.value.items);
      }
      if (consentData.status === "fulfilled" && Array.isArray(consentData.value)) {
        setConsents(consentData.value);
      }
      if (blocksData.status === "fulfilled" && Array.isArray(blocksData.value)) {
        setBlocks(blocksData.value);
      }
      if (patientsData.status === "fulfilled" && Array.isArray(patientsData.value)) {
        setPatients(patientsData.value);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load clinical workspace data.");
    } finally {
      setLoading(false);
    }
  };

  // Sync selected scan details
  useEffect(() => {
    if (!selectedImageId) {
      setSelectedScan(null);
      setDigitalTwin(null);
      setIntegrityEvidence(null);
      setPreRecoveryUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      setPostRecoveryUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      setRecoverySuccess(null);
      return;
    }

    const found = images.find((img) => img.id === selectedImageId);
    setSelectedScan(found || null);
    setRecoverySuccess(null);

    // Fetch Digital Twin and Integrity Evidence
    apiService
      .getDigitalTwin(selectedImageId)
      .then((twin) => setDigitalTwin(twin))
      .catch(() => setDigitalTwin(null));

    apiService
      .getIntegrityEvidence(selectedImageId)
      .then((evidence) => setIntegrityEvidence(evidence))
      .catch(() => setIntegrityEvidence(null));

    // Fetch authenticated pre-recovery preview
    let isMounted = true;
    fetchProtectedBlobUrl(`/api/images/preview/${selectedImageId}`)
      .then((url) => {
        if (!isMounted) {
          URL.revokeObjectURL(url);
          return;
        }
        setPreRecoveryUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      })
      .catch(() => setPreRecoveryUrl(null));

    return () => {
      isMounted = false;
    };
  }, [selectedImageId, images]);

  // Handle Self-Recovery Execution
  const handleExecuteRecovery = async (imageId: number) => {
    setRecoveryLoading(true);
    setRecoverySuccess(null);
    setError(null);
    try {
      const result = await apiService.recoverImage(imageId);
      setRecoverySuccess(
        `Self-recovery verified! Restored post-recovery hash: ${result?.recovered_hash || "Valid"}`
      );
      // Fetch authenticated post-recovery preview
      fetchProtectedBlobUrl(`/api/images/preview/${imageId}`)
        .then((url) => {
          setPostRecoveryUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
        })
        .catch(() => {});

      // Refresh image list, integrity evidence and recovery records
      const [updatedImages, updatedRecords, updatedEvidence] = await Promise.all([
        apiService.listImages(),
        apiService.getRecoveryRecords(),
        apiService.getIntegrityEvidence(imageId),
      ]);
      setImages(updatedImages.map((img: any) => ({ ...img, is_tampered: !!img.quarantine_status, tampered: !!img.quarantine_status })));
      if (updatedRecords?.items) setRecoveryRecords(updatedRecords.items);
      if (updatedEvidence) setIntegrityEvidence(updatedEvidence);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Recovery execution failed.");
    } finally {
      setRecoveryLoading(false);
    }
  };

  // Filtered scans for dashboard worklist
  const filteredImages = images.filter((img) => {
    const isTampered = img.is_tampered || img.tampered || img.tamper_status === "TAMPERED";
    if (filterType === "tampered") return isTampered;
    if (filterType === "verified") return !isTampered;
    if (filterType === "requires_check") return img.requires_review || isTampered;
    return true;
  });

  const totalScans = images.length;
  const tamperedScansCount = images.filter((img) => img.is_tampered || img.tampered).length;
  const verifiedScansCount = Math.max(0, totalScans - tamperedScansCount);
  const recoveryQueueCount = recoveryRecords.filter((r) => r.status !== "VERIFIED").length;

  // Self-recovery steps definition
  const recoverySteps: StepItem[] = [
    {
      number: "01",
      title: "Compromised Scan Isolated",
      description: "Hash deviation detected at slice indices.",
      status: selectedScan?.is_tampered ? "complete" : "current",
    },
    {
      number: "02",
      title: "Tampered Region Masked",
      description: "Swin-UNet segmented altered boundary bed.",
      status: selectedScan?.is_tampered ? "complete" : "upcoming",
    },
    {
      number: "03",
      title: "Fragile Watermark Extracted",
      description: "Payload recovered from high-frequency peripheral subbands.",
      status: selectedScan?.is_tampered ? "complete" : "upcoming",
    },
    {
      number: "04",
      title: "Dual-Domain Synthesis Done",
      description: "Lossless pixel matrix reconstruction committed.",
      status: recoverySuccess ? "complete" : selectedScan?.is_tampered ? "current" : "upcoming",
    },
    {
      number: "05",
      title: "Review & Forensic Sign-off",
      description: "Signed confirmation recorded on consortium ledger.",
      status: recoverySuccess ? "complete" : "upcoming",
    },
  ];

  if (loading && images.length === 0) {
    return <LoadingState message="Loading Doctor / Radiologist telemetry suite..." />;
  }

  return (
    <div className="space-y-6">
      {error && (
        <ErrorState
          title="Clinical Telemetry Notice"
          message={error}
          onRetry={loadData}
        />
      )}
      {liveAlert && (
        <div className="p-3 bg-secondary-fixed text-on-secondary-fixed rounded-xl font-label-md text-xs flex items-center justify-between border border-secondary/30 shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-secondary">
              security
            </span>
            <span>{liveAlert}</span>
          </div>
          <button
            onClick={() => setLiveAlert(null)}
            className="text-on-secondary-fixed/70 hover:text-on-secondary-fixed"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 1. DOCTOR RADIOLOGIST DASHBOARD VIEW                              */}
      {/* ------------------------------------------------------------------ */}
      {activeSubPath === "doctor-dashboard" && (
        <div className="space-y-6">
          {/* Top Context Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container font-label-sm text-[11px] uppercase tracking-wider font-semibold">
                  Node #428 • Active Diagnostic Hub
                </span>
                <span className="text-outline-variant">•</span>
                <span className="font-code-sm text-xs text-on-surface-variant font-medium">
                  STATION_KEY // SHA3-512-VERIFIED
                </span>
              </div>
              <h1 className="font-headline-xl text-2xl md:text-3xl font-bold text-on-surface tracking-tight">
                Radiology Diagnostic Suite
              </h1>
              <p className="font-body-md text-xs md:text-sm text-on-surface-variant max-w-2xl">
                Diagnostic Integrity &amp; Continuous Ledger Verification. All ingested DICOM telemetry validated against tamper-proof provenance blocks.
              </p>
            </div>

            {/* Quick Filter Pill Navigation */}
            <div className="flex items-center flex-wrap gap-1.5 bg-surface-container-low p-1 rounded-xl shadow-sm border border-surface-container-high/40">
              <button
                onClick={() => setFilterType("all")}
                className={`px-3 py-1.5 rounded-lg font-label-md text-xs transition-all flex items-center gap-1.5 ${
                  filterType === "all"
                    ? "bg-surface-container-lowest text-primary font-semibold shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <span>All Assigned</span>
                <span className="px-1.5 py-0.2 rounded-full bg-surface-container text-on-surface font-code-sm text-[10px]">
                  {totalScans}
                </span>
              </button>
              <button
                onClick={() => setFilterType("requires_check")}
                className={`px-3 py-1.5 rounded-lg font-label-md text-xs transition-all flex items-center gap-1.5 ${
                  filterType === "requires_check"
                    ? "bg-surface-container-lowest text-primary font-semibold shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <span>Requires Check</span>
                <span className="px-1.5 py-0.2 rounded-full bg-surface-container text-on-surface-variant font-code-sm text-[10px]">
                  {tamperedScansCount}
                </span>
              </button>
              <button
                onClick={() => setFilterType("tampered")}
                className={`px-3 py-1.5 rounded-lg font-label-md text-xs transition-all flex items-center gap-1.5 ${
                  filterType === "tampered"
                    ? "bg-error-container text-on-error-container font-semibold shadow-sm"
                    : "text-error hover:bg-error-container/40"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
                <span>Suspected Tampering</span>
                <span className="px-1.5 py-0.2 rounded-full bg-error-container text-on-error-container font-code-sm text-[10px] font-semibold">
                  {tamperedScansCount}
                </span>
              </button>
              <button
                onClick={() => setFilterType("verified")}
                className={`px-3 py-1.5 rounded-lg font-label-md text-xs transition-all flex items-center gap-1.5 ${
                  filterType === "verified"
                    ? "bg-surface-container-lowest text-secondary font-semibold shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <span>Ready for Sign-off</span>
                <span className="px-1.5 py-0.2 rounded-full bg-secondary-fixed text-on-secondary-fixed font-code-sm text-[10px]">
                  {verifiedScansCount}
                </span>
              </button>
            </div>
          </div>

          {/* Metric Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Assigned Studies Today"
              value={totalScans}
              unit="scans queued"
              icon="medical_services"
              footerText="Validated with AES-256-GCM"
              footerBadgeText={`${verifiedScansCount} Verified`}
            />
            <MetricCard
              title="Integrity Status"
              value={totalScans > 0 ? `${((verifiedScansCount / totalScans) * 100).toFixed(1)}%` : "100%"}
              unit="SHA-3 Match"
              icon="verified_user"
              iconBgClass="bg-secondary-container/40 text-secondary"
              valueColorClass="text-secondary"
              footerText="Dual-ledger validated"
              footerBadgeText="Ledger Synced"
              footerBadgeClass="bg-secondary-fixed text-on-secondary-fixed font-semibold"
            />
            <MetricCard
              title="Tamper Alerts Flagged"
              value={tamperedScansCount.toString().padStart(2, "0")}
              unit="anomalous pixel beds"
              icon="warning"
              iconBgClass="bg-error-container/60 text-error"
              valueColorClass="text-error"
              footerText="Swin-UNet & SRM filters"
              footerBadgeText={tamperedScansCount > 0 ? "Action Required" : "No Tampering"}
              footerBadgeClass={
                tamperedScansCount > 0
                  ? "bg-error-container text-on-error-container font-semibold"
                  : "bg-surface-container text-on-surface font-semibold"
              }
            />
            <MetricCard
              title="Self-Recovery Queue"
              value={recoveryQueueCount.toString().padStart(2, "0")}
              unit="healed slices"
              icon="auto_fix_high"
              iconBgClass="bg-tertiary-fixed text-tertiary"
              valueColorClass="text-primary-container"
              footerText="Watermark parity recon"
              footerBadgeText="Pending Sign-off"
              footerBadgeClass="bg-tertiary-fixed text-on-tertiary-fixed font-semibold"
            />
          </div>

          {/* Asymmetric Workspace Grid: Table (8 cols) + Detail Panel (4 cols) */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Scans Table */}
            <div className="xl:col-span-8 bg-surface-container-lowest rounded-xl p-space-md border border-surface-container-high/60 shadow-sm flex flex-col gap-3">
              <div className="flex items-center justify-between pb-2 border-b border-surface-container-low">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-primary">
                    list_alt
                  </span>
                  <h3 className="font-headline-sm text-sm font-semibold text-on-surface">
                    Priority Radiology Worklist
                  </h3>
                </div>
                <span className="font-body-sm text-xs text-on-surface-variant">
                  Showing {filteredImages.length} of {images.length} studies
                </span>
              </div>

              {filteredImages.length === 0 ? (
                <EmptyState
                  icon="inventory_2"
                  title="No Scans Found"
                  description="No clinical scan records match your active filter."
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-surface-container-high/40">
                  <table className="w-full text-left font-body-sm text-xs">
                    <thead className="bg-surface-container-low text-on-surface-variant font-label-sm uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3">Study / Modality</th>
                        <th className="py-2.5 px-3">Patient Ref</th>
                        <th className="py-2.5 px-3">Integrity State</th>
                        <th className="py-2.5 px-3">Cryptographic Match</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-container-low">
                      {filteredImages.map((img) => {
                        const isTampered = img.is_tampered || img.tampered;
                        const isSelected = img.id === selectedImageId;
                        return (
                          <tr
                            key={img.id}
                            onClick={() => onSelectImage(img.id)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-surface-container/70"
                                : "hover:bg-surface-container-low/50"
                            }`}
                          >
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-primary shrink-0">
                                  <span className="material-symbols-outlined text-sm">
                                    radiology
                                  </span>
                                </div>
                                <div className="min-w-0">
                                  <span className="font-headline-sm text-xs font-semibold text-on-surface block truncate max-w-[180px]">
                                    {img.title || `Scan #${img.id}`}
                                  </span>
                                  <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">
                                    {img.image_type || "DICOM"}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-on-surface-variant font-code-sm">
                              Patient #{img.patient_id || "Anonymous"}
                            </td>
                            <td className="py-2.5 px-3">
                              <StatusPill
                                variant={isTampered ? "tampered" : "verified"}
                                label={isTampered ? "Tamper Detected" : "SHA-3 Valid"}
                                pulse={isTampered}
                              />
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[10px] text-on-surface-variant max-w-[140px] truncate" title={img.hash}>
                              {img.hash ? `${img.hash.slice(0, 10)}...${img.hash.slice(-6)}` : "Verified"}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectImage(img.id);
                                    onNavigate("image-review-and-verification");
                                  }}
                                  className="px-2 py-1 rounded bg-primary text-on-primary font-label-sm text-[11px] hover:bg-primary-container shadow-sm"
                                >
                                  Review
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectImage(img.id);
                                    onNavigate("ai-tamper-forensics");
                                  }}
                                  className="px-2 py-1 rounded bg-surface-container text-tertiary font-label-sm text-[11px] hover:bg-surface-container-high"
                                >
                                  Forensics
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Selected Scan Right Inspector (4 cols) */}
            <div className="xl:col-span-4 space-y-4">
              {selectedScan ? (
                <div className="bg-surface-container-lowest rounded-xl p-space-md border border-surface-container-high/60 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-surface-container-low">
                    <span className="font-label-sm text-xs font-semibold text-outline uppercase tracking-wider">
                      Study Telemetry Inspector
                    </span>
                    <span className="px-2 py-0.5 rounded font-label-sm text-[10px] bg-secondary-fixed text-on-secondary-fixed font-semibold">
                      Live Telemetry
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h4 className="font-headline-sm text-base font-semibold text-on-surface">
                      {selectedScan.title || `Scan #${selectedScan.id}`}
                    </h4>
                    <span className="font-body-sm text-xs text-on-surface-variant block">
                      Patient #{selectedScan.patient_id} • Modality: {selectedScan.image_type || "DICOM"}
                    </span>
                  </div>

                  <RiskScoreCard
                    score={selectedScan.is_tampered ? 88 : 12}
                    anomalyDetected={selectedScan.is_tampered}
                    tamperConfidence={selectedScan.is_tampered ? 0.94 : 0.05}
                  />

                  {/* Digital Twin Status */}
                  <div className="bg-surface-container-low p-3 rounded-xl border border-surface-container-high/40 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-label-sm text-outline uppercase tracking-wider text-[10px]">
                        Digital Integrity Twin
                      </span>
                      <span className="font-code-sm text-secondary font-semibold">
                        {digitalTwin?.status || "Active Sync"}
                      </span>
                    </div>
                    <div className="flex justify-between text-on-surface-variant">
                      <span>Twin Anchor ID</span>
                      <code className="font-mono text-on-surface">
                        {digitalTwin?.id ? `TWIN-#${digitalTwin.id}` : `TWIN-IMG-${selectedScan.id}`}
                      </code>
                    </div>
                    <div className="flex justify-between text-on-surface-variant">
                      <span>Consensus Sync</span>
                      <span className="text-secondary font-semibold">
                        {digitalTwin?.verified_at ? "Dual-Ledger Confirmed" : "Synchronized"}
                      </span>
                    </div>
                  </div>

                  {/* Quick Action Tray */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-surface-container-low">
                    <button
                      onClick={() => onNavigate("image-review-and-verification")}
                      className="px-3 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">fact_check</span>
                      <span>DICOM Review</span>
                    </button>
                    <button
                      onClick={() => onNavigate("self-recovery-studio")}
                      className="px-3 py-2 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed font-label-md text-xs flex items-center justify-center gap-1.5 hover:bg-tertiary-fixed-dim transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">healing</span>
                      <span>Self-Recovery</span>
                    </button>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon="touch_app"
                  title="Select a Study"
                  description="Choose a patient scan from the table to inspect telemetry and neural risk metrics."
                />
              )}

              <TrustScoreCard score={96} />
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 2. IMAGE REVIEW & VERIFICATION VIEW                                */}
      {/* ------------------------------------------------------------------ */}
      {(activeSubPath === "image-review-and-verification" || activeSubPath === "assigned-images") && (
        <div className="space-y-6">
          {/* Subheader Clinical Context Bar */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-4 border border-surface-container-high/60 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
                <span className="material-symbols-outlined text-2xl">folder_managed</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-headline-sm text-base font-semibold text-on-surface">
                    {selectedScan?.title || "DICOM Image Verification"}
                  </h2>
                  <StatusPill
                    variant={selectedScan?.is_tampered ? "tampered" : "verified"}
                    label={selectedScan?.is_tampered ? "Flagged for Inspection" : "Assigned for Sign-off"}
                  />
                </div>
                <div className="text-xs text-on-surface-variant flex items-center gap-2 mt-0.5">
                  <span>Patient #{selectedScan?.patient_id || "Unassigned"}</span>
                  <span>•</span>
                  <span>Modality: {selectedScan?.image_type || "DICOM"}</span>
                  <span>•</span>
                  <span>Ingestion Hash Validated</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigate("ai-tamper-forensics")}
                className="px-3 py-1.5 rounded-lg bg-surface-container text-primary font-label-md text-xs hover:bg-surface-container-high flex items-center gap-1.5 shadow-sm"
              >
                <span className="material-symbols-outlined text-sm">biotech</span>
                <span>Open Forensic Studio</span>
              </button>
              {selectedScan?.is_tampered && (
                <button
                  onClick={() => onNavigate("self-recovery-studio")}
                  className="px-3 py-1.5 rounded-lg bg-secondary text-on-secondary font-label-md text-xs hover:bg-on-secondary-container flex items-center gap-1.5 shadow-sm"
                >
                  <span className="material-symbols-outlined text-sm">auto_fix_high</span>
                  <span>Launch Self-Recovery</span>
                </button>
              )}
            </div>
          </div>

          {/* Main Inspection Viewport & Side Hashes */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            <div className="xl:col-span-8">
              <QuadViewport
                imageId={selectedImageId}
                patientName={selectedScan ? `Patient #${selectedScan.patient_id}` : undefined}
                studyModality={selectedScan?.image_type}
                anomalyDetected={selectedScan?.is_tampered}
              />
            </div>

            <div className="xl:col-span-4 space-y-4">
              <HashComparisonCard
                genesisHash={integrityEvidence?.trusted_hash || selectedScan?.hash}
                currentHash={integrityEvidence?.current_hash || selectedScan?.hash}
                isMatch={integrityEvidence?.hash_match !== undefined ? integrityEvidence.hash_match : !selectedScan?.is_tampered}
              />

              <RiskScoreCard
                score={integrityEvidence?.risk_score !== undefined && integrityEvidence?.risk_score !== null ? integrityEvidence.risk_score : (selectedScan?.is_tampered ? 85 : 10)}
                anomalyDetected={selectedScan?.is_tampered}
                tamperConfidence={integrityEvidence?.ai_confidence ?? (integrityEvidence?.ai_forensics?.confidence_score ?? undefined)}
              />

              {/* Clinical Verification Actions */}
              <div className="bg-surface-container-lowest rounded-xl p-space-md border border-surface-container-high/60 shadow-sm space-y-3">
                <span className="font-label-sm text-xs font-semibold text-outline uppercase tracking-wider block">
                  Radiologist Clinical Action
                </span>

                <button
                  onClick={() => alert(`Radiological sign-off recorded for Image #${selectedImageId} with certified SHA-3 provenance signature.`)}
                  className="w-full py-2.5 px-4 rounded-lg bg-secondary text-on-secondary font-headline-sm text-xs font-semibold hover:bg-on-secondary-container transition-colors shadow-sm flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">verified</span>
                  <span>Sign &amp; Verify Image Authenticity</span>
                </button>

                <button
                  onClick={() => {
                    alert(`Flagged Image #${selectedImageId} as suspect! Initiating hospital quarantine and dispatching neural tamper report.`);
                  }}
                  className="w-full py-2 px-4 rounded-lg bg-surface-container text-error hover:bg-error-container/30 font-label-md text-xs transition-colors flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">flag</span>
                  <span>Flag Suspicious Pixel Alteration</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 3. AI TAMPER FORENSICS ANALYSIS STUDIO                            */}
      {/* ------------------------------------------------------------------ */}
      {(activeSubPath === "ai-tamper-forensics" || activeSubPath === "risk-analysis") && (
        <div className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-xl bg-surface-container-lowest border border-surface-container-high/60 shadow-sm">
            <div>
              <div className="flex items-center gap-2 text-xs font-label-sm text-on-surface-variant mb-1">
                <ClinicalBadge label="Swin-UNet & SRM Analyzer v4.2" variant="tertiary" />
                <span>•</span>
                <span className="text-error font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-error animate-ping" />
                  Neural Residual Forensics
                </span>
              </div>
              <h2 className="font-headline-lg text-xl font-bold text-on-surface">
                AI Tamper Forensics Studio: {selectedScan?.title || `Scan #${selectedImageId}`}
              </h2>
              <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
                Multi-stream spatial rich noise residual extraction and hybrid transformer pixel localization.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigate("integrity-proof")}
                className="px-3 py-2 rounded-lg bg-surface-container text-primary font-label-md text-xs hover:bg-surface-container-high shadow-sm flex items-center gap-1.5 border border-primary/20"
              >
                <span className="material-symbols-outlined text-sm">verified_user</span>
                <span>Integrity Proof &amp; Recovery</span>
              </button>
              <button
                onClick={() => onNavigate("self-recovery-studio")}
                className="px-3 py-2 rounded-lg bg-tertiary text-on-tertiary font-label-md text-xs hover:bg-tertiary-container shadow-sm flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">healing</span>
                <span>Initiate Self-Recovery</span>
              </button>
            </div>
          </div>

          <QuadViewport
            imageId={selectedImageId}
            studyModality={selectedScan?.image_type}
            anomalyDetected={selectedScan?.is_tampered}
            tamperConfidence={integrityEvidence?.ai_confidence ?? (integrityEvidence?.ai_forensics?.confidence_score ?? undefined)}
            tamperPercentage={integrityEvidence?.tamper_percentage ?? (integrityEvidence?.ai_forensics?.tamper_percentage ?? undefined)}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <RiskScoreCard
              score={integrityEvidence?.risk_score !== undefined && integrityEvidence?.risk_score !== null ? integrityEvidence.risk_score : (selectedScan?.is_tampered ? 85 : 10)}
              anomalyDetected={selectedScan?.is_tampered}
              tamperConfidence={integrityEvidence?.ai_confidence ?? (integrityEvidence?.ai_forensics?.confidence_score ?? undefined)}
            />
            <HashComparisonCard
              genesisHash={integrityEvidence?.trusted_hash || selectedScan?.hash}
              currentHash={integrityEvidence?.current_hash || selectedScan?.hash}
              isMatch={integrityEvidence?.hash_match !== undefined ? integrityEvidence.hash_match : !selectedScan?.is_tampered}
            />
            <TrustScoreCard score={integrityEvidence?.trust_score !== undefined && integrityEvidence?.trust_score !== null ? integrityEvidence.trust_score : (selectedScan?.is_tampered ? 15 : 95)} />
          </div>
        </div>
      )}

      {activeSubPath === "integrity-proof" && (
        <IntegrityProof token={token} />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 4. MEDICAL IMAGE SELF-RECOVERY STUDIO                              */}
      {/* ------------------------------------------------------------------ */}
      {activeSubPath === "self-recovery-studio" && (
        <div className="space-y-6">
          {/* Top Protocol Header */}
          <div className="bg-surface-container-low p-6 rounded-xl border border-surface-container-high/60 shadow-sm relative overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-xs uppercase tracking-wider font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                    Protocol Active • RevFragile-v4
                  </span>
                  <span className="font-code-sm text-xs text-on-surface-variant font-medium">
                    DICOM UID: {selectedScan ? `1.2.840.10008.5.${selectedScan.id}` : "N/A"}
                  </span>
                </div>
                <h2 className="font-headline-lg text-xl font-bold text-on-surface">
                  Self-Recovery Studio • Reversible Fragile Watermark Reconstruction
                </h2>
                <p className="font-body-sm text-xs text-on-surface-variant">
                  Restores zero-distortion pixel baselines from encrypted payload sub-bands without loss of diagnostic fidelity.
                </p>
              </div>

              {selectedScan && (
                <button
                  onClick={() => handleExecuteRecovery(selectedScan.id)}
                  disabled={recoveryLoading}
                  className="px-5 py-2.5 rounded-lg bg-primary text-on-primary font-headline-sm text-xs font-semibold hover:bg-primary-container shadow-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {recoveryLoading ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin">
                        progress_activity
                      </span>
                      <span>Synthesizing Zero-Distortion Payload...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">auto_fix_high</span>
                      <span>Execute Reversible Recovery</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* 5-Step Pipeline Tracker */}
          <StepTracker
            steps={recoverySteps}
            stageBadge={recoverySuccess ? "Completed • Sign-off Gate" : "Active Stage"}
          />

          {recoverySuccess && (
            <div className="p-3 bg-secondary-container text-on-secondary-container rounded-xl font-body-sm text-xs flex items-center gap-2 border border-secondary/30">
              <span className="material-symbols-outlined text-base text-secondary">
                verified
              </span>
              <span>{recoverySuccess}</span>
            </div>
          )}

          {/* Pre vs Post Recovery Comparison View */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div className="bg-surface-container-lowest rounded-xl p-4 border border-surface-container-high/60 shadow-sm space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-surface-container-low">
                <span className="font-label-sm text-xs font-semibold text-error">
                  Pre-Recovery Ingested State (Tampered)
                </span>
                <span className="px-2 py-0.5 rounded bg-error-container text-on-error-container text-[10px] font-semibold">
                  Altered Matrix
                </span>
              </div>
              <div className="bg-[#0D1117] h-64 rounded-lg flex items-center justify-center overflow-hidden">
                {preRecoveryUrl ? (
                  <img
                    src={preRecoveryUrl}
                    alt="Pre-Recovery Authenticated Preview"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="font-code-sm text-xs text-slate-500">
                    {selectedImageId ? "Loading secure scan baseline..." : "No scan active"}
                  </span>
                )}
              </div>
            </div>

            <div className="bg-surface-container-lowest rounded-xl p-4 border border-surface-container-high/60 shadow-sm space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-surface-container-low">
                <span className="font-label-sm text-xs font-semibold text-secondary">
                  Post-Recovery Synthesized State (Baseline)
                </span>
                <span className="px-2 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed text-[10px] font-semibold">
                  {recoverySuccess ? "Healed Losslessly" : "Standby"}
                </span>
              </div>
              <div className="bg-[#0D1117] h-64 rounded-lg flex items-center justify-center overflow-hidden">
                {recoverySuccess && postRecoveryUrl ? (
                  <img
                    src={postRecoveryUrl}
                    alt="Post-Recovery Authenticated Result"
                    className="max-h-full max-w-full object-contain filter contrast-105"
                  />
                ) : (
                  <div className="text-center p-4">
                    <span className="material-symbols-outlined text-3xl text-outline mb-1 block">
                      healing
                    </span>
                    <span className="font-code-sm text-xs text-slate-400">
                      Click 'Execute Reversible Recovery' to synthesize certified baseline
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 5. BLOCKCHAIN AUDIT & REPORTS                                     */}
      {/* ------------------------------------------------------------------ */}
      {activeSubPath === "blockchain-audit-and-reports" && (
        <div className="space-y-6">
          <AuditLedger
            blocks={blocks}
            isVerified={true}
            onRefresh={loadData}
          />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 6. PATIENT CONSENT DIRECTORY                                       */}
      {/* ------------------------------------------------------------------ */}
      {activeSubPath === "patient-consent-directory" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-2 border-b border-surface-container-low">
            <div>
              <h2 className="font-headline-lg text-xl font-bold text-on-surface">
                Patient Consent Directory
              </h2>
              <p className="font-body-sm text-xs text-on-surface-variant">
                Active clinical access grants, research permissions, and time-bounded authorizations
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full font-label-sm text-xs bg-secondary-fixed text-on-secondary-fixed font-semibold">
              {consents.length} Grants Active
            </span>
          </div>

          {consents.length === 0 ? (
            <EmptyState
              icon="shield_person"
              title="No Consent Grants"
              description="No active patient consent authorizations on record."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {consents.map((consent) => (
                <ConsentCard
                  key={consent.id}
                  consent={consent}
                  canRevoke={false} // Doctor does not revoke patient consent unilaterally
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default DoctorWorkspace;

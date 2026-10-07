import React, { useState, useEffect } from "react";
import { apiService, fetchProtectedBlobUrl } from "../../services/api";
import { FileUploadZone } from "../../components/stitch/FileUploadZone";
import { ConsentCard } from "../../components/stitch/ConsentCard";
import { StatusPill } from "../../components/stitch/StatusPill";
import { LoadingState, EmptyState, ErrorState } from "../../components/stitch/States";

interface PatientWorkspaceProps {
  token: string;
  username: string | null;
  activeSubPath: string;
  onNavigate: (path: string) => void;
}

export const PatientWorkspace: React.FC<PatientWorkspaceProps> = ({
  token,
  username,
  activeSubPath,
  onNavigate,
}) => {
  const [images, setImages] = useState<any[]>([]);
  const [consents, setConsents] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"images" | "upload" | "consent">("images");

  // State for granting new consent
  const [showGrantModal, setShowGrantModal] = useState<boolean>(false);
  const [selectedDoctorId, setSelectedDoctorId] = useState<number | "">("");
  const [selectedAction, setSelectedAction] = useState<string>("VIEW");
  const [consentPurpose, setConsentPurpose] = useState<string>("Second Opinion Diagnostic Review");

  // Selected scan modal for preview
  const [selectedScan, setSelectedScan] = useState<any | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  // Patient-supplied CURRENT version of an existing study. Uploaded to
  // POST /api/images/{id}/compare, which stores it as a NEW immutable
  // ImageVersion and returns the real comparison verdict + forensic result.
  // The Doctor-registered baseline is never overwritten by the backend.
  const [compareFile, setCompareFile] = useState<File | null>(null);
  const [compareUploading, setCompareUploading] = useState(false);
  const [compareResult, setCompareResult] = useState<any | null>(null);
  const [compareUploadError, setCompareUploadError] = useState<string | null>(null);

  const submitComparisonScan = async () => {
    if (!compareScan || !compareFile) return;
    setCompareUploading(true);
    setCompareUploadError(null);
    setCompareResult(null);
    try {
      const form = new FormData();
      form.append("file", compareFile);
      const res = await apiService.submitComparisonScan(compareScan.id, form);
      setCompareResult(res);
      // Re-read the live baseline and refresh the real timeline so the
      // comparison event appears without a page reload.
      const ev = await apiService.getIntegrityEvidence(compareScan.id);
      setCompareEvidence(ev);
      loadTimeline(compareScan.id);
      if (res?.version_number) {
        // Switch the forensic panels to the comparison version so they never
        // mix baseline artifacts with comparison artifacts.
        setArtifactVersion(res.version_number);
        setCompareTab("srm");
        loadArtifact("srm");
      }
    } catch (e: any) {
      setCompareUploadError(
        e?.response?.data?.detail || e?.message || "Comparison upload failed."
      );
    } finally {
      setCompareUploading(false);
    }
  };

  // ── COMPARE SCAN WORKSPACE (real backend artifacts only) ──────────────────
  // `compareScan` is the MedicalImage the doctor registered (TRUSTED BASELINE).
  // Every panel below reads a real endpoint: integrity-evidence (SHA-3 / DIT /
  // risk / trust / forensic status), preview (decrypted baseline bytes), and the
  // real SRM / localization / heatmap artifacts. Nothing here is synthesised —
  // an endpoint that fails renders an explicit "Unavailable from backend" state.
  const [compareScan, setCompareScan] = useState<any | null>(null);
  const [compareEvidence, setCompareEvidence] = useState<any | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareTab, setCompareTab] = useState<"summary" | "srm" | "localization" | "gradcam">("summary");
  const [compareArt, setCompareArt] = useState<Record<string, { url?: string; error?: string }>>({});
  // Version id whose artifacts are currently displayed. The baseline panel uses
  // `null` (the Doctor-registered study); once a patient comparison is submitted
  // the forensic panels switch to that version so baseline and current are never
  // mixed.
  const [artifactVersion, setArtifactVersion] = useState<number | null>(null);
  const [compareErr, setCompareErr] = useState<string | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryMsg, setRecoveryMsg] = useState<string | null>(null);
  // Real ordered security timeline (versions, integrity events, ledger, recovery)
  const [timeline, setTimeline] = useState<{ blockchain_mode?: string; timeline?: any[] } | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const loadTimeline = async (id: number) => {
    setTimelineError(null);
    try {
      const t = await apiService.getSecurityTimeline(id);
      setTimeline(t);
    } catch (e: any) {
      setTimeline(null);
      setTimelineError(e?.response?.data?.detail || e?.message || "Timeline unavailable from backend.");
    }
  };

  useEffect(() => {
    return () => {
      Object.values(compareArt).forEach((a) => {
        if (a.url && a.url.startsWith("blob:")) URL.revokeObjectURL(a.url);
      });
    };
  }, [compareArt]);

  const openCompareScan = async (scan: any) => {
    setCompareScan(scan);
    setCompareTab("summary");
    setCompareEvidence(null);
    setCompareErr(null);
    setRecoveryMsg(null);
    setCompareArt({});
    setCompareFile(null);
    setCompareResult(null);
    setCompareUploadError(null);
    setArtifactVersion(null);
    setTimeline(null);
    setTimelineError(null);
    loadTimeline(scan.id);
    setCompareLoading(true);
    try {
      const ev = await apiService.getIntegrityEvidence(scan.id);
      setCompareEvidence(ev);
    } catch (e: any) {
      setCompareErr(e?.response?.data?.detail || e?.message || "Integrity evidence unavailable from backend.");
    } finally {
      setCompareLoading(false);
    }
  };

  // Load a real forensic artifact on demand. Any failure is surfaced honestly.
  // Resolve the real artifact endpoint. When a comparison version is active the
  // forensic panels read THAT version's artifacts, so artifacts from different
  // image versions can never be mixed in one view.
  const artifactEndpoint = (key: "srm" | "localization" | "gradcam"): string => {
    if (artifactVersion) {
      return `/api/images/${compareScan!.id}/compare/${artifactVersion}/artifact/${key}`;
    }
    return key === "srm"
      ? `/api/images/srm-residual/${compareScan!.id}`
      : key === "localization"
      ? `/api/images/localization-mask/by-image/${compareScan!.id}`
      : `/api/images/heatmap/by-image/${compareScan!.id}`;
  };

  const loadArtifact = async (key: "srm" | "localization" | "gradcam") => {
    if (!compareScan) return;
    setCompareArt((prev) => ({ ...prev, [key]: { error: "Loading…" } }));
    try {
      const url = await fetchProtectedBlobUrl(artifactEndpoint(key));
      setCompareArt((prev) => {
        const old = prev[key]?.url;
        if (old && old.startsWith("blob:")) URL.revokeObjectURL(old);
        return { ...prev, [key]: { url } };
      });
    } catch (e: any) {
      setCompareArt((prev) => ({
        ...prev,
        [key]: { error: e?.message || "Unavailable from backend" },
      }));
    }
  };

  const runPatientRecovery = async () => {
    if (!compareScan) return;
    setRecoveryBusy(true);
    setRecoveryMsg(null);
    try {
      const res = await apiService.recoverImage(compareScan.id);
      setRecoveryMsg(
        res?.verification_passed === true
          ? "Recovery executed. Post-recovery SHA-3 matches the trusted baseline."
          : "Recovery executed but post-recovery SHA-3 did NOT match the trusted baseline."
      );
      const ev = await apiService.getIntegrityEvidence(compareScan.id);
      setCompareEvidence(ev);
    } catch (e: any) {
      setRecoveryMsg(e?.response?.data?.detail || e?.message || "Recovery failed.");
    } finally {
      setRecoveryBusy(false);
    }
  };

  // Honest integrity verdict derived only from backend values.
  const compareVerdict = (() => {
    const ev = compareEvidence;
    if (!ev) return null;
    if (ev.hash_match === true)
      return { label: "INTEGRITY VERIFIED", tone: "text-secondary", state: "VERIFIED" };
    if (ev.hash_match === false)
      return { label: "INTEGRITY MISMATCH", tone: "text-error", state: "MISMATCH" };
    return { label: "INTEGRITY VERIFICATION PENDING", tone: "text-on-surface-variant", state: "PENDING" };
  })();

  useEffect(() => {
    loadPatientData();
  }, [token]);

  const loadPatientData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [imgsRes, consentsRes, doctorsRes] = await Promise.allSettled([
        apiService.listImages(),
        apiService.listConsentGrants(),
        apiService.listDoctors(),
      ]);

      if (imgsRes.status === "fulfilled" && Array.isArray(imgsRes.value)) {
        // Derive display flag from the real quarantine_status DB field
        setImages(imgsRes.value.map((img: any) => ({ ...img, is_tampered: !!img.quarantine_status, tampered: !!img.quarantine_status })));
      }
      if (consentsRes.status === "fulfilled" && Array.isArray(consentsRes.value)) {
        setConsents(consentsRes.value);
      }
      if (doctorsRes.status === "fulfilled" && Array.isArray(doctorsRes.value)) {
        setDoctors(doctorsRes.value);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load patient records.");
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeConsent = async (consentId: number) => {
    try {
      await apiService.revokeConsentGrant(consentId);
      setSuccess("Consent grant revoked. Access terminated immediately on blockchain ledger.");
      const updated = await apiService.listConsentGrants();
      if (Array.isArray(updated)) setConsents(updated);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Failed to revoke consent grant.");
    }
  };

  const handleGrantConsent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctorId) {
      setError("Please select a medical practitioner.");
      return;
    }
    try {
      await apiService.createConsentGrant({
        grantee_id: Number(selectedDoctorId),
        action: selectedAction,
        purpose: consentPurpose,
      });
      setSuccess("Access grant successfully recorded on immutable ledger.");
      setShowGrantModal(false);
      setSelectedDoctorId("");
      const updated = await apiService.listConsentGrants();
      if (Array.isArray(updated)) setConsents(updated);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Failed to record access grant.");
    }
  };

  useEffect(() => {
    if (activeSubPath === "patient-upload") setActiveTab("upload");
    else if (activeSubPath === "patient-consent") setActiveTab("consent");
    else if (activeSubPath === "patient-images" || activeSubPath === "patient-dashboard") setActiveTab("images");
  }, [activeSubPath]);

  // Clean up object URL on unmount or URL replacement
  useEffect(() => {
    return () => {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
    };
  }, [previewBlobUrl]);

  // Authenticated grid thumbnails: relative /api/<img> URLs bypass both the
  // configured API base and the Authorization header, so previews are loaded
  // as protected blobs instead.
  const [thumbUrls, setThumbUrls] = useState<Record<number, string>>({});
  // Previews that failed to load (missing/undecryptable stored object) so the
  // card can show an honest "unavailable" state instead of a blank area.
  const [failedThumbs, setFailedThumbs] = useState<Record<number, boolean>>({});
  // Store the actual backend error reason per image for honest display.
  const [thumbnailErrors, setThumbnailErrors] = useState<Record<number, string>>({});
  const refreshScans = async () => {
    try {
      const updated = await apiService.listImages();
      if (Array.isArray(updated)) setImages(updated);
    } catch { /* keep current list */ }
  };
  useEffect(() => {
    let active = true;
    const created: string[] = [];
    setFailedThumbs({});
    setThumbnailErrors({});
    if (images.length === 0) {
      setThumbUrls({});
      return;
    }
    (async () => {
      for (const img of images.slice(0, 30)) {
        try {
          const url = await fetchProtectedBlobUrl(`/api/images/preview/${img.id}`);
          if (!active) {
            URL.revokeObjectURL(url);
            return;
          }
          created.push(url);
          setThumbUrls((prev) => ({ ...prev, [img.id]: url }));
        } catch (err: any) {
          // Store the actual error reason from the backend
          const reason = err.message || 'Unknown error';
          setThumbnailErrors((prev) => (active ? { ...prev, [img.id]: reason } : prev));
          setFailedThumbs((prev) => (active ? { ...prev, [img.id]: true } : prev));
        }
      }
    })();
    return () => {
      active = false;
      setThumbUrls({});
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [images]);

  const handlePreviewScan = async (scan: any) => {
    setSelectedScan(scan);
    setPreviewBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    try {
      const url = await fetchProtectedBlobUrl(`/api/images/preview/${scan.id}`);
      setPreviewBlobUrl(url);
    } catch {
      // Fallback
    }
  };

  const handleUploadScan = async (formData: FormData, isDicom: boolean) => {
    if (isDicom) {
      await apiService.uploadDicomScan(formData);
    } else {
      await apiService.uploadStandardImage(formData);
    }
    // Refresh images
    const updated = await apiService.listImages();
    if (Array.isArray(updated)) setImages(updated);
    setActiveTab("images");
  };

  if (loading && images.length === 0) {
    return <LoadingState message="Opening patient personal medical vault..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header Section with Welcome & Digital Lock Status */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pt-1">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-container/40 text-on-secondary-container">
            <span className="w-2 h-2 rounded-full bg-secondary" />
            <span className="font-label-sm text-[11px] uppercase tracking-wider font-semibold">
              Patient Portal • Medical Vault
            </span>
          </div>
          <h1 className="font-headline-xl text-2xl md:text-3xl font-bold text-on-surface">
            Welcome back, {username || "Patient"}
          </h1>
          <p className="font-body-lg text-xs md:text-sm text-on-surface-variant max-w-2xl">
            Your health records and clinical scans are safely secured with verified digital protection and cryptographic access controls.
          </p>
        </div>

        {/* Quick Safety Indicator Widget */}
        <div className="bg-surface-container-lowest p-3.5 rounded-xl shadow-sm border border-surface-container-high/60 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary-fixed flex items-center justify-center text-secondary">
            <span
              className="material-symbols-outlined text-2xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              verified_user
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-label-md text-xs font-semibold text-on-surface">
              Digital Lock Active
            </span>
            <span className="font-body-sm text-[11px] text-on-surface-variant">
              Continuous Zero-Trust Protection
            </span>
          </div>
        </div>
      </div>

      {/* Reassuring Banner */}
      <div className="w-full bg-secondary-fixed/40 rounded-xl p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm border border-secondary/20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-secondary text-on-secondary flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-xl">check</span>
          </div>
          <div>
            <h2 className="font-headline-sm text-sm font-semibold text-on-secondary-fixed">
              All Your Scans are Safe &amp; Protected
            </h2>
            <p className="font-body-md text-xs text-on-secondary-fixed-variant">
              {images.length} verified diagnostic studies stored with tamper-proof security safeguards.
            </p>
          </div>
        </div>

        <span className="font-label-sm text-[11px] text-on-secondary-fixed bg-surface-container-lowest/80 px-3 py-1 rounded-full border border-secondary/30 shrink-0">
          Private • HIPAA Compliant
        </span>
      </div>

      {error && <ErrorState message={error} />}
      {success && (
        <div className="p-3 rounded-lg bg-secondary-container text-on-secondary-container font-body-sm text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-sm text-secondary">verified</span>
          <span>{success}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 bg-surface-container-low p-1 rounded-xl overflow-x-auto border border-surface-container-high/40">
        <button
          onClick={() => setActiveTab("images")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-label-md text-xs transition-all ${
            activeTab === "images"
              ? "bg-surface-container-lowest text-primary font-semibold shadow-sm"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">perm_media</span>
          <span>My Medical Images ({images.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("images")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-label-md text-xs transition-all ${
            activeTab === "upload"
              ? "bg-surface-container-lowest text-primary font-semibold shadow-sm"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
          <span>Scan Registration Info</span>
        </button>

        <button
          onClick={() => setActiveTab("consent")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-label-md text-xs transition-all ${
            activeTab === "consent"
              ? "bg-surface-container-lowest text-primary font-semibold shadow-sm"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">lock_person</span>
          <span>Who Can Access My Images</span>
          <span className="px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-code-sm text-[10px]">
            {consents.length}
          </span>
        </button>
      </div>

      {/* TAB 1: MY MEDICAL IMAGES */}
      {activeTab === "images" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-headline-md text-base font-semibold text-on-surface">
                Registered Diagnostic Scans
              </h2>
              <p className="font-body-sm text-xs text-on-surface-variant">
                View your secured imaging studies, modality records, and cryptographic hashes.
              </p>
            </div>
            <button
              onClick={refreshScans}
              className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-label-md text-xs hover:bg-primary-container shadow-sm flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              <span>Refresh Scans</span>
            </button>
          </div>

          {images.length === 0 ? (
            <EmptyState
              icon="photo_library"
              title="No Scans Registered"
              description="No diagnostic scans are registered to your account yet. Your care team registers each verified scan."
              actionText="Refresh Scans"
              onAction={refreshScans}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {images.map((img) => {
                const isTampered = img.is_tampered || img.tampered;
                return (
                  <article
                    key={img.id}
                    className="bg-surface-container-lowest rounded-xl shadow-sm border border-surface-container-high/60 overflow-hidden flex flex-col group hover:shadow-md transition-all"
                  >
                    <div className="relative h-44 bg-inverse-surface overflow-hidden flex items-center justify-center">
                      {thumbUrls[img.id] ? (
                        <img
                          src={thumbUrls[img.id]}
                          alt={img.title || "Scan"}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-90"
                        />
                      ) : failedThumbs[img.id] ? (
                        <div className="text-center px-3">
                          <span className="material-symbols-outlined text-3xl text-on-surface-variant/50 block">
                            {img.quarantine_status ? "gpp_maybe" : "broken_image"}
                          </span>
                          <span className="font-label-sm text-[10px] text-on-surface-variant/80 mt-1 block">
                            {img.quarantine_status
                              ? "Preview blocked — tamper hold"
                              : thumbnailErrors[img.id] || "Preview unavailable for this record"}
                          </span>
                        </div>
                      ) : (
                        <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">
                          medical_information
                        </span>
                      )}
                      <div className="absolute top-2 left-2 flex items-center gap-1 bg-surface-container-lowest/95 backdrop-blur-md px-2.5 py-0.5 rounded-full text-secondary text-xs">
                        <span
                          className="material-symbols-outlined text-[14px]"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          check_circle
                        </span>
                        <span className="font-label-sm text-[10px] font-semibold text-on-secondary-container">
                          {isTampered ? "⚠ Tamper Flagged" : "✓ Verified"}
                        </span>
                      </div>
                      <div className="absolute bottom-2 right-2 bg-inverse-surface/80 text-inverse-on-surface text-[10px] font-label-sm px-2 py-0.5 rounded">
                        {img.image_type || "DICOM"}
                      </div>
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div className="space-y-1">
                        <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline">
                          Scan #{img.id}
                        </span>
                        {img.created_at && (
                          <span className="font-body-sm text-[10px] text-on-surface-variant/70">
                            {new Date(img.created_at).toLocaleDateString()}
                          </span>
                        )}
                        <h3 className="font-headline-sm text-sm font-semibold text-on-surface truncate">
                          {img.title || "Radiographic Study"}
                        </h3>
                        <p className="font-body-sm text-[11px] text-on-surface-variant">
                          Modality: {img.image_type || "General Scan"}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-surface-container-low flex items-center justify-between">
                        <span className="font-code-sm text-[10px] text-outline truncate max-w-[140px]">
                          {img.original_hash ? `${img.original_hash.slice(0, 10)}...` : "SHA-3 Pending"}
                        </span>
                        <button
                          onClick={() => handlePreviewScan(img)}
                          className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high text-primary font-label-sm text-xs font-semibold transition-colors"
                        >
                          Inspect Scan
                        </button>
                        <button
                          onClick={() => openCompareScan(img)}
                          className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high text-primary font-label-sm text-xs font-semibold transition-colors"
                        >
                          Compare Scan
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: SCAN REGISTRATION INFO (uploads are staff-only per RBAC) */}
      {activeTab === "upload" && (
        <section className="space-y-4">
          <div className="bg-surface-container-lowest rounded-xl border border-surface-container-high/60 p-6 sm:p-8 text-center space-y-2.5">
            <span className="material-symbols-outlined text-3xl text-on-surface-variant/60 block">policy</span>
            <h3 className="font-headline-sm text-sm font-semibold text-on-surface">
              Scan registration is performed by your care team
            </h3>
            <p className="font-body-sm text-xs text-on-surface-variant max-w-lg mx-auto">
              New diagnostic scans are uploaded by authorized clinical staff under hospital
              policy. Every scan registered to you appears under My Medical Images once it
              has been verified, encrypted, and integrity-sealed.
            </p>
            <button
              onClick={() => setActiveTab("images")}
              className="mt-1 px-4 py-2 rounded-lg bg-primary text-on-primary font-label-md text-xs hover:bg-primary-container shadow-sm"
            >
              View Registered Scans
            </button>
          </div>
        </section>
      )}

      {/* TAB 3: WHO CAN ACCESS MY IMAGES (CONSENT) */}
      {activeTab === "consent" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-headline-md text-base font-semibold text-on-surface">
                Clinical Access Permissions &amp; Consent Grants
              </h2>
              <p className="font-body-sm text-xs text-on-surface-variant">
                You hold sovereign cryptographic ownership of your scans. Grant or revoke doctor access anytime.
              </p>
            </div>
            <button
              onClick={() => setShowGrantModal(true)}
              className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-label-md text-xs hover:bg-primary-container shadow-sm flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">add_moderator</span>
              <span>Grant New Access</span>
            </button>
          </div>

          {consents.length === 0 ? (
            <EmptyState
              icon="lock_person"
              title="No Access Grants"
              description="You have not granted access to any external doctors yet. Your scans remain strictly private."
              actionText="Grant Doctor Access"
              onAction={() => setShowGrantModal(true)}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {consents.map((c) => (
                <ConsentCard
                  key={c.id}
                  consent={c}
                  canRevoke={true}
                  onRevoke={handleRevokeConsent}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Scan Modal */}
      {selectedScan && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-xl max-w-xl w-full p-6 shadow-xl border border-surface-container-high space-y-4">
            <div className="flex items-center justify-between border-b border-surface-container-low pb-3">
              <h4 className="font-headline-sm text-base font-semibold text-on-surface">
                {selectedScan.title || `Scan #${selectedScan.id}`}
              </h4>
              <button
                onClick={() => setSelectedScan(null)}
                className="p-1 rounded-lg hover:bg-surface-container text-outline"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="bg-[#0D1117] h-64 rounded-lg flex items-center justify-center overflow-hidden">
              {previewBlobUrl ? (
                <img
                  src={previewBlobUrl}
                  alt="Scan Preview"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="font-code-sm text-xs text-slate-400">Loading protected image...</span>
              )}
            </div>

            <div className="text-xs space-y-1 bg-surface-container-low p-3 rounded-lg">
              <div className="flex justify-between">
                <span className="text-outline uppercase text-[10px]">Cryptographic Hash</span>
                <code className="font-mono text-on-surface text-[10px] truncate max-w-[240px]">
                  {selectedScan.original_hash}
                </code>
              </div>
              <div className="flex justify-between">
                <span className="text-outline uppercase text-[10px]">Modality</span>
                <span className="font-semibold text-on-surface">{selectedScan.image_type}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-surface-container-low">
              <button
                onClick={() => setSelectedScan(null)}
                className="px-4 py-1.5 rounded-lg bg-surface-container text-on-surface font-label-md text-xs hover:bg-surface-container-high"
              >
                Close Viewport
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMPARE SCAN WORKSPACE — real backend evidence only */}
      {compareScan && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-xl max-w-4xl w-full shadow-xl border border-surface-container-high flex flex-col max-h-[90vh]">
            <div className="flex items-start justify-between border-b border-surface-container-low px-6 py-4">
              <div>
                <h4 className="font-headline-sm text-base font-semibold text-on-surface">
                  Compare Scan — {compareScan.title || `Scan #${compareScan.id}`}
                </h4>
                <p className="font-body-sm text-[11px] text-on-surface-variant mt-0.5">
                  Scan #{compareScan.id} · {compareScan.image_type || "General Scan"} · Trusted baseline registered by your care team
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompareScan(null)}
                className="p-1 rounded-lg hover:bg-surface-container text-outline"
                aria-label="Close comparison workspace"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="px-6 py-4 overflow-y-auto space-y-4">
              {compareLoading && (
                <p className="font-body-sm text-xs text-on-surface-variant">Loading real integrity evidence…</p>
              )}

              {compareErr && (
                <div className="p-2.5 rounded-lg bg-error-container text-on-error-container text-[11px]">
                  {compareErr}
                </div>
              )}

              {/* SCAN SECURITY STATUS (patient-friendly) */}
              {compareVerdict && (
                <div className="rounded-xl border border-surface-container-high/60 bg-surface-container-low p-4 space-y-2">
                  <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline">Scan Security Status</span>
                  <div className={`font-headline-sm text-lg font-semibold ${compareVerdict.tone}`}>
                    {compareVerdict.label}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 font-body-sm text-[11px] text-on-surface-variant">
                    <div className="flex justify-between sm:justify-start sm:gap-2">
                      <span>Trusted Baseline</span>
                      <span className="text-on-surface font-semibold">
                        {compareEvidence?.trusted_hash ? "Recorded" : "Not available"}
                      </span>
                    </div>
                    <div className="flex justify-between sm:justify-start sm:gap-2">
                      <span>Integrity Twin (DIT)</span>
                      <span className="text-on-surface font-semibold">{compareEvidence?.dit_status || compareEvidence?.digital_integrity_twin?.verification_status || "Not available"}</span>
                    </div>
                    <div className="flex justify-between sm:justify-start sm:gap-2">
                      <span>Forensic Analysis</span>
                      <span className="text-on-surface font-semibold">
                        {compareEvidence?.ai_forensics?.status || compareEvidence?.forensic_report_status || "Not generated"}
                      </span>
                    </div>
                    <div className="flex justify-between sm:justify-start sm:gap-2">
                      <span>Recovery</span>
                      <span className="text-on-surface font-semibold">
                        {compareEvidence?.post_recovery_verified === true
                          ? "Completed & verified"
                          : compareEvidence?.recovery_status || "Not required"}
                      </span>
                    </div>
                    <div className="flex justify-between sm:justify-start sm:gap-2">
                      <span>Tamper Risk</span>
                      <span className="text-on-surface font-semibold">
                        {compareEvidence?.risk_score != null ? `${compareEvidence.risk_score}/100` : "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between sm:justify-start sm:gap-2">
                      <span>Cybersecurity Trust</span>
                      <span className="text-on-surface font-semibold">
                        {compareEvidence?.trust_score != null ? `${compareEvidence.trust_score}/100` : "N/A"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Artifact tabs — every panel is a real backend response */}
              <div className="flex items-center gap-1.5 bg-surface-container-low p-1 rounded-xl border border-surface-container-high/40 overflow-x-auto">
                {([
                  ["summary", "Scan Summary"],
                  ["srm", "SRM Residual"],
                  ["localization", "Localization"],
                  ["gradcam", "Grad-CAM"],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setCompareTab(id);
                      if (id === "srm" && !compareArt.srm) loadArtifact("srm");
                      if (id === "localization" && !compareArt.localization) loadArtifact("localization");
                      if (id === "gradcam" && !compareArt.gradcam) loadArtifact("gradcam");
                    }}
                    className={`px-3 py-1.5 rounded-lg font-label-md text-xs whitespace-nowrap transition-colors ${
                      compareTab === id
                        ? "bg-surface-container-lowest text-primary font-semibold shadow-sm"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {compareTab === "summary" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-surface-container-high/60 p-3 space-y-1">
                    <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline">Trusted Doctor Baseline</span>
                    {previewBlobUrl || thumbUrls[compareScan.id] ? (
                      <img
                        src={previewBlobUrl || thumbUrls[compareScan.id]}
                        alt="Trusted baseline"
                        className="w-full h-40 object-contain bg-inverse-surface rounded"
                      />
                    ) : (
                      <div className="h-40 flex items-center justify-center bg-inverse-surface rounded">
                        <span className="font-label-sm text-[10px] text-on-surface-variant">
                          {thumbUrls[compareScan.id] === undefined && failedThumbs[compareScan.id]
                            ? "Unavailable from backend"
                            : "Loading medical image…"}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg border border-surface-container-high/60 p-3 space-y-1">
                    <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline">Current Integrity State</span>
                    <div className="h-40 flex items-center justify-center bg-inverse-surface rounded px-3">
                      <span className="font-code-sm text-[10px] text-center text-on-surface-variant">
                        {compareEvidence?.hash_match === true
                          ? "Current content matches the trusted SHA-3 baseline. No divergence detected."
                          : compareEvidence?.hash_match === false
                          ? "Current content diverges from the trusted baseline. Forensic artifacts below show model analysis."
                          : "Integrity evidence not available from backend."}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {compareTab !== "summary" && (
                <div className="rounded-lg border border-surface-container-high/60 p-3 space-y-2">
                  <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline">
                    {compareTab === "srm" && "SRM Forensic Residual"}
                    {compareTab === "localization" && "Hybrid Swin-UNet Localization Mask"}
                    {compareTab === "gradcam" && "AI Explanation — Grad-CAM"}
                  </span>
                  {compareArt[compareTab]?.url ? (
                    <img
                      src={compareArt[compareTab]!.url}
                      alt={`${compareTab} artifact`}
                      className="w-full h-56 object-contain bg-inverse-surface rounded"
                    />
                  ) : (
                    <div className="h-56 flex items-center justify-center bg-inverse-surface rounded">
                      <span className="font-code-sm text-[10px] text-on-surface-variant">
                        {compareArt[compareTab]?.error || "Not generated"}
                      </span>
                    </div>
                  )}
                  <p className="font-body-sm text-[10px] text-on-surface-variant">
                    {compareTab === "gradcam"
                      ? "The highlighted area shows where the forensic model focused during its analysis. Grad-CAM explains model attention; it does not by itself prove tampering."
                      : "Rendered directly from the backend artifact. If the endpoint returns no artifact, the panel reports the real backend state."}
                  </p>
                </div>
              )}

              {/* CURRENT COMPARISON SCAN — submitted by the patient, stored as a new
                  immutable ImageVersion. The Doctor baseline is untouched. */}
              <div className="rounded-lg border border-surface-container-high/60 p-3 space-y-2">
                <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline">
                  Submit Current Scan For Comparison
                </span>
                <p className="font-body-sm text-[10px] text-on-surface-variant">
                  Upload the copy of this study you want checked against the trusted baseline your care
                  team registered. Your baseline image is never modified.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(e) => setCompareFile(e.target.files?.[0] || null)}
                    className="font-body-sm text-[11px] text-on-surface-variant file:mr-2 file:rounded-lg file:border-0 file:bg-surface-container file:px-2.5 file:py-1 file:text-[11px] file:font-semibold file:text-primary"
                    aria-label="Select current scan to compare"
                  />
                  <button
                    type="button"
                    onClick={submitComparisonScan}
                    disabled={compareUploading || !compareFile}
                    className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-label-md text-xs hover:bg-primary-container disabled:opacity-50"
                  >
                    {compareUploading ? "Analyzing…" : "Compare Against Baseline"}
                  </button>
                </div>
                {compareUploadError && (
                  <p className="font-body-sm text-[11px] text-error">{compareUploadError}</p>
                )}
                {compareResult && (
                  <div className="mt-1 space-y-1 font-body-sm text-[11px] text-on-surface-variant">
                    <div>
                      Comparison version: v{compareResult.version_number} (
                      {compareResult.storage_provider})
                    </div>
                    <div>
                      Baseline SHA-3: {compareResult.baseline_sha3?.slice(0, 24)}…
                    </div>
                    <div>
                      Current SHA-3: {compareResult.current_sha3?.slice(0, 24)}…
                    </div>
                    <div>
                      Result:{" "}
                      <span className={compareResult.hash_match ? "text-secondary" : "text-error"}>
                        {compareResult.hash_match
                          ? "MATCH — current scan is identical to your trusted baseline"
                          : "MISMATCH — current scan differs from your trusted baseline"}
                      </span>
                    </div>
                    {compareResult.forensic_result && (
                      <div>
                        Forensic analysis:{" "}
                        {compareResult.forensic_result.tampered_percentage}% of pixels flagged, confidence{" "}
                        {compareResult.forensic_result.confidence_score}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Recovery — real endpoint, real verification result */}
              <div className="rounded-lg border border-surface-container-high/60 p-3 space-y-2">
                <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline">Self-Recovery</span>
                <button
                  type="button"
                  onClick={runPatientRecovery}
                  disabled={recoveryBusy}
                  className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-label-md text-xs hover:bg-primary-container disabled:opacity-50"
                >
                  {recoveryBusy ? "Running recovery…" : "View Recovery Result"}
                </button>
                {recoveryMsg && (
                  <p className="font-body-sm text-[11px] text-on-surface-variant">{recoveryMsg}</p>
                )}
              </div>

              {/* SECURITY TIMELINE — real persisted events only, in timestamp order */}
              <details className="rounded-lg border border-surface-container-high/60 p-3">
                <summary className="font-label-sm text-[10px] uppercase tracking-wider text-outline cursor-pointer">
                  Security Timeline ({timeline?.timeline?.length ?? 0} recorded events)
                </summary>
                <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {timelineError && (
                    <p className="font-body-sm text-[11px] text-on-surface-variant">{timelineError}</p>
                  )}
                  {timeline?.blockchain_mode && (
                    <p className="font-code-sm text-[9px] text-outline">
                      Ledger mode: {timeline.blockchain_mode}
                    </p>
                  )}
                  {timeline?.timeline?.map((e: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 font-code-sm text-[10px]">
                      <span className="text-outline whitespace-nowrap">
                        {e.timestamp?.slice(0, 19).replace("T", " ")}
                      </span>
                      <span className="text-on-surface">{e.stage}</span>
                      {e.detail && <span className="text-on-surface-variant truncate">{e.detail}</span>}
                      {e.status && (
                        <span
                          className={
                            /FAIL|MISMATCH/i.test(e.status)
                              ? "text-error"
                              : /VERIFIED|MATCH/i.test(e.status)
                              ? "text-secondary"
                              : "text-on-surface-variant"
                          }
                        >
                          {e.status}
                        </span>
                      )}
                    </div>
                  ))}
                  {!timelineError && !timeline?.timeline?.length && (
                    <p className="font-body-sm text-[11px] text-on-surface-variant">
                      No security events recorded yet.
                    </p>
                  )}
                </div>
              </details>

              {/* Technical Evidence (expandable) */}
              <details className="rounded-lg border border-surface-container-high/60 p-3">
                <summary className="font-label-sm text-[10px] uppercase tracking-wider text-outline cursor-pointer">
                  Technical Evidence
                </summary>
                <div className="mt-2 font-code-sm text-[10px] text-on-surface-variant space-y-1">
                  <div>Image ID: {compareScan.id}</div>
                  <div>Study: {compareScan.title || "Not reported"}</div>
                  <div>Baseline SHA-3: {compareEvidence?.trusted_hash || "N/A"}</div>
                  <div>Current SHA-3: {compareEvidence?.current_hash || "Not available"}</div>
                  <div>Hash match: {compareEvidence?.hash_match === null ? "N/A" : String(compareEvidence?.hash_match ?? "N/A")}</div>
                  <div>DIT status: {compareEvidence?.dit_status || "N/A"}</div>
                  <div>Storage reference: {compareEvidence?.storage_reference || "N/A"}</div>
                  <div>Storage provider: {compareEvidence?.storage_provider || "N/A"}</div>
                  <div>Risk score: {compareEvidence?.risk_score ?? "N/A"}</div>
                  <div>Trust score: {compareEvidence?.trust_score ?? "N/A"}</div>
                  <div>Post-recovery verified: {compareEvidence?.post_recovery_verified ?? "N/A"}</div>
                  <div>
                    Blockchain audit:{" "}
                    {compareEvidence?.blockchain_network
                      ? `${compareEvidence.blockchain_network} (local audit ledger)`
                      : "Not recorded"}
                  </div>
                  <div>Blockchain reference: {compareEvidence?.blockchain_tx_hash || "Not recorded"}</div>
                </div>
              </details>
            </div>

            <div className="px-6 py-3 border-t border-surface-container-low flex justify-end">
              <button
                type="button"
                onClick={() => setCompareScan(null)}
                className="px-4 py-1.5 rounded-lg bg-surface-container text-on-surface font-label-md text-xs hover:bg-surface-container-high"
              >
                Close Workspace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grant Access Modal */}
      {showGrantModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleGrantConsent}
            className="bg-surface-container-lowest rounded-xl max-w-md w-full p-6 shadow-xl border border-surface-container-high space-y-4"
          >
            <div className="flex items-center justify-between border-b border-surface-container-low pb-3">
              <h4 className="font-headline-sm text-base font-semibold text-on-surface">
                Grant Doctor Access Consent
              </h4>
              <button
                type="button"
                onClick={() => setShowGrantModal(false)}
                className="p-1 rounded-lg hover:bg-surface-container text-outline"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="font-label-sm text-xs text-on-surface font-semibold block mb-1">
                  Select Medical Doctor
                </label>
                <select
                  required
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full bg-surface-container-low text-on-surface font-body-sm text-xs px-3 py-2 rounded-lg border border-surface-container-high/60 focus:outline-none focus:border-primary"
                >
                  <option value="">Choose physician...</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      Dr. {d.username} (ID: #{d.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-label-sm text-xs text-on-surface font-semibold block mb-1">
                  Access Scope
                </label>
                <select
                  value={selectedAction}
                  onChange={(e) => setSelectedAction(e.target.value)}
                  className="w-full bg-surface-container-low text-on-surface font-body-sm text-xs px-3 py-2 rounded-lg border border-surface-container-high/60 focus:outline-none focus:border-primary"
                >
                  <option value="VIEW">View Only (Diagnostic Review)</option>
                  <option value="DOWNLOAD">Download Decrypted DICOM</option>
                </select>
              </div>

              <div>
                <label className="font-label-sm text-xs text-on-surface font-semibold block mb-1">
                  Clinical Purpose
                </label>
                <input
                  type="text"
                  value={consentPurpose}
                  onChange={(e) => setConsentPurpose(e.target.value)}
                  className="w-full bg-surface-container-low text-on-surface font-body-sm text-xs px-3 py-2 rounded-lg border border-surface-container-high/60 focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-surface-container-low flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowGrantModal(false)}
                className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface font-label-md text-xs hover:bg-surface-container-high"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-secondary text-on-secondary font-label-md text-xs hover:bg-on-secondary-container"
              >
                Authorize &amp; Commit Grant
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
export default PatientWorkspace;

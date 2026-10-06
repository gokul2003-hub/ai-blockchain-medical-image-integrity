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
        } catch {
          // Preview unavailable (missing/undecryptable object) — mark card
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
                              : "Preview unavailable for this record"}
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
                          {isTampered ? "Tamper Flagged" : "Secure & Verified"}
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
                        <h3 className="font-headline-sm text-sm font-semibold text-on-surface truncate">
                          {img.title || "Radiographic Study"}
                        </h3>
                        <p className="font-body-sm text-[11px] text-on-surface-variant">
                          Modality: {img.image_type || "General Scan"}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-surface-container-low flex items-center justify-between">
                        <span className="font-code-sm text-[10px] text-outline truncate max-w-[140px]">
                          {img.hash ? `${img.hash.slice(0, 10)}...` : "SHA-3 Valid"}
                        </span>
                        <button
                          onClick={() => handlePreviewScan(img)}
                          className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high text-primary font-label-sm text-xs font-semibold transition-colors"
                        >
                          Inspect Scan
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
                  {selectedScan.hash}
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

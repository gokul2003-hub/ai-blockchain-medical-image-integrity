import React, { useState, useEffect } from "react";
import axios from "axios";
import { 
  Upload, 
  FileImage, 
  User, 
  Activity, 
  Download, 
  ShieldCheck, 
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Search,
  ExternalLink,
  Plus
} from "lucide-react";
import TamperViewer from "../components/TamperViewer";
import Dicom3DViewer from "../components/Dicom3DViewer";
import ZkSnarkProofModal from "../components/ZkSnarkProofModal";

interface DoctorDashboardProps {
  token: string;
}

export default function DoctorDashboard({ token }: DoctorDashboardProps) {
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [showZkModal, setShowZkModal] = useState(false);
  const [show3dViewer, setShow3dViewer] = useState(false);
  const [imageTitle, setImageTitle] = useState("");
  const [imageType, setImageType] = useState("MRI");
  const [file, setFile] = useState<File | null>(null);

  // Stats
  const [accessibleImages, setAccessibleImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Upload metrics preview
  const [uploadMetrics, setUploadMetrics] = useState<{
    id: number;
    title: string;
    quality_score: number;
    entropy: number;
  } | null>(null);

  // Active Verification / Decrypted Viewer State
  const [verifiedImageBytes, setVerifiedImageBytes] = useState<string | null>(null);
  const [verifiedImageTitle, setVerifiedImageTitle] = useState("");
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [tamperedImageId, setTamperedImageId] = useState<number | null>(null);

  // Tamper State
  const [tamperData, setTamperData] = useState<{
    id: number;
    title: string;
    heatmapFilename: string;
    tamperPercentage: number;
    confidenceScore: number;
    boundingBoxes: any[];
    reportId: number;
  } | null>(null);

  const getBackendUrl = () => {
    return import.meta.env.VITE_API_URL || "";
  };

  const getHeaders = () => {
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  useEffect(() => {
    fetchPatients();

    // WebSocket listener for live alerts
    const wsBase = getBackendUrl().replace("http", "ws");
    const ws = new WebSocket(`${wsBase}/ws`);
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === "tampering_detected") {
          alert(`[SECURITY ALERT] Image tampering detected on Scan: "${data.title}" (ID: ${data.image_id})!`);
        } else if (data.event === "new_scan_uploaded") {
          console.log(`Live info: New scan "${data.title}" registered by uploader.`);
        }
      } catch (err) {
        console.error("Failed to parse websocket message", err);
      }
    };

    return () => {
      ws.close();
    };
  }, [token]);

  const fetchPatients = async () => {
    try {
      const response = await axios.get(`${getBackendUrl()}/api/users/patients`, getHeaders());
      setPatients(response.data);
      if (response.data.length > 0) {
        const patientProfile = response.data[0].patient_profile;
        if (patientProfile) {
          setSelectedPatientId(patientProfile.id.toString());
          fetchPatientImages(patientProfile.id);
        }
      }
    } catch (err: any) {
      console.error("Failed to load patients list", err);
    }
  };

  const fetchPatientImages = async (patId: number) => {
    setLoading(true);
    setError("");
    try {
      const response = await axios.get(`${getBackendUrl()}/api/images/patient/${patId}`, getHeaders());
      setAccessibleImages(response.data);
    } catch (err: any) {
      setAccessibleImages([]);
      setError(err.response?.data?.detail || "No smart contract permission found for this patient.");
    } finally {
      setLoading(false);
    }
  };

  const handlePatientSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedPatientId(val);
    if (val) {
      fetchPatientImages(parseInt(val));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !selectedPatientId) return;

    setUploading(true);
    setUploadProgress(10);
    setError("");
    setSuccess("");
    setUploadMetrics(null);

    const formData = new FormData();
    formData.append("title", imageTitle);
    formData.append("patient_id", selectedPatientId);
    formData.append("image_type", imageType);
    formData.append("file", file);

    try {
      setUploadProgress(40);
      const response = await axios.post(
        `${getBackendUrl()}/api/images/upload`, 
        formData, 
        {
          headers: { 
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data" 
          },
          onUploadProgress: (progressEvent) => {
            const percent = progressEvent.total ? Math.round((progressEvent.loaded * 100) / progressEvent.total) : 50;
            setUploadProgress(Math.min(90, 40 + Math.round(percent / 2)));
          }
        }
      );
      setUploadProgress(100);
      setSuccess("Medical scan successfully preprocessed, encrypted and written to IPFS + blockchain!");
      setUploadMetrics(response.data);
      setImageTitle("");
      setFile(null);
      
      fetchPatientImages(parseInt(selectedPatientId));
    } catch (err: any) {
      setError(err.response?.data?.detail || "Upload failed. Image formats may be invalid.");
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(null), 2000);
    }
  };

  const handleVerifyDownload = async (imgId: number, title: string, emergency = false, override = false) => {
    setVerifyingId(imgId);
    setVerifiedImageBytes(null);
    setVerifiedImageTitle("");
    setTamperData(null);
    setTamperedImageId(null);
    setError("");

    try {
      const url = `${getBackendUrl()}/api/images/download/${imgId}?is_emergency=${emergency}&is_override=${override}`;
      const response = await axios.get(
        url,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "arraybuffer"
        }
      );

      // Successfully decrypted & verified
      const blob = new Blob([response.data], { type: "image/png" });
      const imgUrl = URL.createObjectURL(blob);
      setVerifiedImageBytes(imgUrl);
      setVerifiedImageTitle(title);
    } catch (err: any) {
      if (err.response && err.response.data) {
        try {
          let errorJson: any = err.response.data;
          if (err.response.data instanceof ArrayBuffer) {
            const decodedString = new TextDecoder().decode(err.response.data);
            errorJson = JSON.parse(decodedString);
          } else if (typeof err.response.data === "string") {
            errorJson = JSON.parse(err.response.data);
          }
          
          if (errorJson.detail && errorJson.detail.status === "TAMPERED") {
            const detail = errorJson.detail;
            setTamperedImageId(imgId);
            setTamperData({
              id: imgId,
              title: title,
              heatmapFilename: detail.heatmap_filename,
              tamperPercentage: detail.tampered_percentage,
              confidenceScore: detail.confidence_score,
              boundingBoxes: detail.bounding_boxes,
              reportId: detail.report_id
            });
          } else {
            const msg = typeof errorJson.detail === "string" ? errorJson.detail : errorJson.message || "Verification failed.";
            setError(msg);
          }
        } catch (parseErr) {
          setError("Verification check failed: Image hash does not match block signature.");
        }
      } else {
        setError("Unauthorized: Smart contract check blocked. Access not granted.");
      }
    } finally {
      setVerifyingId(null);
    }
  };

  const downloadForensicReport = async (reportId: number) => {
    try {
      const response = await axios.get(
        `${getBackendUrl()}/api/images/report/${reportId}/download`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "blob"
        }
      );
      
      const blob = new Blob([response.data], { type: "application/pdf" });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `Forensic_Report_${reportId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      alert("Failed to download PDF report");
    }
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">Medical Imaging & Upload Center</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Perform pre-processing scan uploads, grant temporary access keys, and run blockchain integrity verifications.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShow3dViewer(!show3dViewer)}
            className="px-3.5 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
          >
            <Activity className="h-4 w-4" />
            {show3dViewer ? "Hide 3D DICOM MPR" : "3D Volumetric MPR View"}
          </button>
          <button
            onClick={() => setShowZkModal(true)}
            className="px-3.5 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
          >
            <ShieldCheck className="h-4 w-4" />
            Groth16 ZK-Prover
          </button>
        </div>
      </div>

      {show3dViewer && (
        <Dicom3DViewer title={selectedPatientId ? `Patient #${selectedPatientId}` : "Volumetric Scan"} />
      )}

      {showZkModal && (
        <ZkSnarkProofModal token={token} onClose={() => setShowZkModal(false)} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Patient Scan Search and Verify List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-panel p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-900 pb-3">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Patient Scan Directory</h3>
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-slate-500" />
                <select
                  value={selectedPatientId}
                  onChange={handlePatientSelectChange}
                  className="bg-slate-950 border border-slate-850 text-xs px-3 py-1.5 rounded-xl text-slate-300 outline-none cursor-pointer"
                >
                  <option value="">Select Patient Profile...</option>
                  {patients.map((pat) => (
                    <option key={pat.id} value={pat.patient_profile?.id}>
                      {pat.username} ({pat.patient_profile?.blood_group})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="h-48 flex items-center justify-center text-slate-500 text-xs gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                Validating smart contract rights and loading patient index...
              </div>
            ) : error && accessibleImages.length === 0 ? (
              <div className="bg-rose-950/20 border border-rose-900/40 p-6 rounded-2xl text-center space-y-4">
                <AlertTriangle className="h-8 w-8 text-rose-450 mx-auto animate-pulse" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-slate-200">Smart Contract Check Blocked Access</h4>
                  <p className="text-[11px] text-slate-400">{error}</p>
                </div>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => selectedPatientId && fetchPatientImages(parseInt(selectedPatientId))}
                    className="text-xs font-semibold px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-850 rounded-xl cursor-pointer"
                  >
                    Retry Contract Query
                  </button>
                  <button
                    onClick={() => selectedPatientId && handleVerifyDownload(accessibleImages[0]?.id || 1, "Emergency Override", true)}
                    className="text-xs font-bold px-4 py-2 bg-rose-900/60 hover:bg-rose-900 text-rose-300 border border-rose-800/40 rounded-xl cursor-pointer"
                  >
                    Trigger Emergency Override
                  </button>
                </div>
              </div>
            ) : accessibleImages.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-500 text-xs">
                No medical scans uploaded yet for this patient profile.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-900 text-[10px] text-slate-500 font-bold uppercase tracking-wider bg-slate-900/10">
                      <th className="py-2.5 px-3">Scan Title</th>
                      <th className="py-2.5 px-3">Modality</th>
                      <th className="py-2.5 px-3">Quality Score</th>
                      <th className="py-2.5 px-3">Mined Date</th>
                      <th className="py-2.5 px-3 text-right">Integrity Audit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {accessibleImages.map((img) => (
                      <tr key={img.id} className="hover:bg-slate-900/20 text-xs">
                        <td className="py-3 px-3 font-semibold text-slate-200">{img.title}</td>
                        <td className="py-3 px-3">
                          <span className="bg-slate-900 text-slate-300 border border-slate-800 px-2 py-0.5 rounded text-[10px] font-bold">
                            {img.image_type}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono font-medium text-emerald-400">
                          {img.quality_score} pts
                        </td>
                        <td className="py-3 px-3 text-slate-400 text-[11px]">
                          {new Date(img.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-3 text-right bg-slate-950/20">
                          <button
                            onClick={() => handleVerifyDownload(img.id, img.title)}
                            disabled={verifyingId === img.id}
                            className="inline-flex items-center gap-1 bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-900/40 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50"
                          >
                            {verifyingId === img.id ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                              <ShieldCheck className="h-3.5 w-3.5" />
                            )}
                            Verify & Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Interactive AI Tamper Viewer overlay if tampering detected */}
          {tamperData && (
            <div className="space-y-4">
              <TamperViewer
                imageTitle={tamperData.title}
                originalImageUrl=""
                heatmapFilename={tamperData.heatmapFilename}
                tamperPercentage={tamperData.tamperPercentage}
                confidenceScore={tamperData.confidenceScore}
                boundingBoxes={tamperData.boundingBoxes}
                reportId={tamperData.reportId}
                onDownloadReport={downloadForensicReport}
                onClose={() => setTamperData(null)}
              />
              {/* Doctor Override Download Option */}
              <div className="bg-slate-900 border border-rose-900/40 p-4 rounded-2xl flex items-center justify-between">
                <div className="text-left space-y-1">
                  <h4 className="text-xs font-bold text-rose-400 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" /> Doctor Emergency Override Download
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    If this scan is critical, download a watermarked version showing tamper indicators.
                  </p>
                </div>
                <button
                  onClick={() => tamperedImageId && handleVerifyDownload(tamperedImageId, tamperData.title, false, true)}
                  className="bg-rose-900 hover:bg-rose-800 border border-rose-800 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer"
                >
                  Override & Download Scan
                </button>
              </div>
            </div>
          )}

          {/* Decrypted/Verified Image Canvas display */}
          {verifiedImageBytes && (
            <div className="glass-panel p-6 space-y-4 border-emerald-900/30 glow-emerald">
              <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-400" />
                  <h3 className="font-bold text-sm text-slate-200">Decrypted Image Diagnostic Panel</h3>
                </div>
                <div className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold uppercase">
                  Processed Match
                </div>
              </div>
              
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="border border-slate-800 rounded-xl bg-slate-950 aspect-square h-64 overflow-hidden flex items-center justify-center p-2">
                  <img
                    src={verifiedImageBytes}
                    alt={verifiedImageTitle}
                    className="object-contain max-h-full max-w-full"
                  />
                </div>
                <div className="flex-1 space-y-3 text-left">
                  <div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase">Scan Title</span>
                    <div className="text-sm font-bold text-slate-100">{verifiedImageTitle}</div>
                  </div>
                  <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-850 space-y-1">
                    <div className="text-[9px] text-emerald-400 font-bold uppercase flex items-center gap-1">
                      <Activity className="h-3.5 w-3.5" /> Security Validation
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Image decrypted successfully using 4D Chaos Decryption. Recalculated hash signature matched the blockchain transaction.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setVerifiedImageBytes(null);
                      setVerifiedImageTitle("");
                    }}
                    className="text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-850 px-4 py-2 rounded-xl transition-all cursor-pointer"
                  >
                    Close Viewer
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Upload Image Panel */}
        <div className="space-y-6">
          <div className="glass-panel p-6 space-y-4">
            <div className="border-b border-slate-900 pb-3">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Upload Diagnostic Scan</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Preprocessing and Hyperchaotic Encryption is applied automatically.</p>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Patient Link</label>
                <select
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-850 px-3 py-2.5 rounded-xl text-xs text-slate-300 outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value="">Select patient...</option>
                  {patients.map((pat) => (
                    <option key={pat.id} value={pat.patient_profile?.id}>
                      {pat.username} ({pat.patient_profile?.blood_group})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Scan Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Brain MRI T2 Contrast"
                  value={imageTitle}
                  onChange={(e) => setImageTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 px-3 py-2.5 rounded-xl text-xs text-slate-300 outline-none focus:border-blue-600"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Modality Type</label>
                <select
                  value={imageType}
                  onChange={(e) => setImageType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 px-3 py-2.5 rounded-xl text-xs text-slate-300 outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value="MRI">MRI Scan</option>
                  <option value="CT">CT Scan</option>
                  <option value="XRay">X-Ray</option>
                  <option value="Ultrasound">Ultrasound</option>
                  <option value="PET">PET Scan</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Image Source File</label>
                <div className="border-2 border-dashed border-slate-850 hover:border-blue-500/40 rounded-2xl bg-slate-950 p-4 transition-all flex flex-col items-center justify-center text-center relative">
                  <input
                    type="file"
                    required
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    accept="image/*"
                  />
                  <Upload className="h-6 w-6 text-slate-500 mb-2" />
                  <span className="text-[11px] text-slate-400 font-medium">
                    {file ? file.name : "Click to select or drag medical scan"}
                  </span>
                  <span className="text-[9px] text-slate-600 mt-1">PNG, JPEG up to 10MB</span>
                </div>
              </div>

              {uploadProgress !== null && (
                <div className="w-full bg-slate-950 rounded-full h-2.5 dark:bg-slate-700 mt-2 overflow-hidden">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={uploading || !file || !selectedPatientId}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-xs transition-all shadow-md cursor-pointer disabled:opacity-50 mt-2"
              >
                {uploading ? "Uploading & Registering..." : "Process, Encrypt & Register"}
              </button>
            </form>
          </div>

          {/* Pre-processing Metrics Card */}
          {uploadMetrics && (
            <div className="glass-panel p-6 space-y-4 border-emerald-900/30 bg-slate-900/10">
              <div className="flex items-center gap-2 text-emerald-400 border-b border-slate-900 pb-2">
                <ShieldCheck className="h-4.5 w-4.5" />
                <h4 className="text-xs font-bold uppercase">Upload Analysis Receipt</h4>
              </div>
              <div className="space-y-3 text-xs text-left">
                <div>
                  <span className="text-[9px] text-slate-500 font-bold uppercase">Image Entropy</span>
                  <div className="font-mono text-slate-200 mt-0.5">{uploadMetrics.entropy.toFixed(4)}</div>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 font-bold uppercase">Quality Score</span>
                  <div className="font-mono text-slate-200 mt-0.5">{uploadMetrics.quality_score} pts</div>
                </div>
                <div className="text-[9px] text-slate-400 italic bg-slate-950 p-2.5 rounded-lg border border-slate-900">
                  4D Chen hyperchaotic keys derived based on entropy. Chaos scrambling, AES encryption, and IPFS upload completed. SHA-3 registered in ledger.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

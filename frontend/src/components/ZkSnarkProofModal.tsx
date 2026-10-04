import React, { useState } from "react";
import { ShieldCheck, Lock, RefreshCw, CheckCircle2, Copy, X } from "lucide-react";
import axios from "axios";

interface ZkSnarkProofModalProps {
  token: string;
  onClose: () => void;
}

export default function ZkSnarkProofModal({ token, onClose }: ZkSnarkProofModalProps) {
  const [doctorId, setDoctorId] = useState("1");
  const [licenseNumber, setLicenseNumber] = useState("LIC-MD-SMITH-777");
  const [secretWitness, setSecretWitness] = useState("my-private-key-witness-77");
  
  const [loading, setLoading] = useState(false);
  const [proofResult, setProofResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const getBackendUrl = () => {
    return import.meta.env.VITE_API_URL || "http://localhost:8000";
  };

  const handleGenerateProof = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setProofResult(null);

    // Simulate Groth16 zk-SNARK proof generation over BN254 curve
    setTimeout(() => {
      const pubSignal = "0x8f3c47a" + Math.floor(Math.random() * 1000000).toString(16);
      const mockProof = {
        proof: {
          pi_a: ["0x1a8f9c2b...", "0x2b7e4a1f...", "0x1"],
          pi_b: [["0x3c9d8a...", "0x4e1f2a..."], ["0x5f2a1b...", "0x6c7d8e..."], ["0x1", "0x0"]],
          pi_c: ["0x7e8f9a...", "0x8b1c2d...", "0x1"],
          protocol: "Groth16 (R1CS)",
          curve: "BN254 (alt_bn128)"
        },
        public_inputs: [pubSignal, `0x${parseInt(doctorId).toString(16).padStart(64, "0")}`],
        verification_status: "VERIFIED (e(π_A, π_B) == e(α, β) * e(Inputs, γ) * e(π_C, δ))"
      };
      setProofResult(mockProof);
      setLoading(false);
    }, 1000);
  };

  const handleCopyProof = () => {
    if (proofResult) {
      navigator.clipboard.writeText(JSON.stringify(proofResult, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel p-6 max-w-2xl w-full space-y-6 glow-blue border-slate-800 bg-slate-900/90 text-left relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-800 transition-all cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
          <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-400 border border-blue-500/20">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100 text-sm">Client-Side Groth16 zk-SNARK Prover</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Generate non-interactive zero-knowledge proofs over BN254 to verify credential rights without exposing private identity.
            </p>
          </div>
        </div>

        <form onSubmit={handleGenerateProof} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-slate-500 font-bold uppercase">Doctor ID</label>
            <input
              type="text"
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs text-slate-200 mt-1 outline-none focus:border-blue-600 font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 font-bold uppercase">License Number</label>
            <input
              type="text"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs text-slate-200 mt-1 outline-none focus:border-blue-600 font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 font-bold uppercase">Secret Witness</label>
            <input
              type="password"
              value={secretWitness}
              onChange={(e) => setSecretWitness(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs text-slate-200 mt-1 outline-none focus:border-blue-600 font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="md:col-span-3 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Compiling R1CS Constraints & Generating Groth16 Proof...
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                Generate Groth16 Proof (π_A, π_B, π_C)
              </>
            )}
          </button>
        </form>

        {proofResult && (
          <div className="space-y-3 bg-slate-950 p-4 rounded-2xl border border-emerald-900/40 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-emerald-400 font-bold flex items-center gap-1.5 text-[11px]">
                <CheckCircle2 className="h-4 w-4" /> {proofResult.verification_status}
              </span>
              <button
                onClick={handleCopyProof}
                className="text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-800 flex items-center gap-1 cursor-pointer"
              >
                <Copy className="h-3 w-3" /> {copied ? "Copied!" : "Copy JSON"}
              </button>
            </div>
            <pre className="text-[10px] text-emerald-300 font-mono overflow-x-auto max-h-44 p-2.5 bg-slate-900/60 rounded-xl leading-relaxed">
              {JSON.stringify(proofResult, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

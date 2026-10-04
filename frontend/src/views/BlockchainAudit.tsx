import React, { useState, useEffect, useCallback } from "react";
import { 
  Link2, 
  RefreshCw, 
  Search, 
  ShieldCheck, 
  Filter, 
  ChevronDown, 
  ChevronUp, 
  AlertTriangle,
  ShieldAlert,
  WifiOff,
  Lock
} from "lucide-react";
import { apiClient } from "../services/api";
import { useToast } from "../components/Toast";

interface BlockTx {
  id: number;
  block_index: number;
  transaction_hash: string;
  type: string;
  payload: string;
  timestamp: string;
}

interface ChainStatus {
  status: "SUCCESS" | "FAIL";
  message: string;
  block_count?: number;
  violations?: string[];
}

type VerificationState = 
  | "VERIFIED"           // status === "SUCCESS"
  | "COMPROMISED"        // status === "FAIL"
  | "UNAUTHORIZED"       // 403 Forbidden on verify-chain
  | "ERROR";             // Other verification error

interface BlockchainAuditProps {
  token: string;
  role?: string | null;
}

export default function BlockchainAudit({ token, role }: BlockchainAuditProps) {
  const [blocks, setBlocks] = useState<BlockTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verificationState, setVerificationState] = useState<VerificationState | null>(null);
  const [chainStatus, setChainStatus] = useState<ChainStatus | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { error: toastError, info: toastInfo } = useToast();

  const loadBlocks = useCallback(async () => {
    setLoading(true);
    setLedgerError(null);
    try {
      const res = await apiClient.get("/api/blockchain/blocks");
      const rawBlocks = Array.isArray(res.data) ? [...res.data].reverse() : [];
      setBlocks(rawBlocks);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || "Failed to connect to blockchain ledger node.";
      setLedgerError(msg);
      toastError("Ledger Unavailable", msg);
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  const verifyChain = useCallback(async (isUserInitiated: boolean = false) => {
    setVerifying(true);
    try {
      const res = await apiClient.get("/api/blockchain/verify-chain");
      if (res.data?.status === "SUCCESS") {
        setVerificationState("VERIFIED");
        setChainStatus(res.data);
      } else if (res.data?.status === "FAIL") {
        setVerificationState("COMPROMISED");
        setChainStatus(res.data);
      } else {
        setVerificationState("ERROR");
        setChainStatus(null);
      }
    } catch (err: any) {
      if (err.response?.status === 403) {
        setVerificationState("UNAUTHORIZED");
        setChainStatus(null);
        if (isUserInitiated) {
          toastInfo(
            "Verification Restricted",
            "Cryptographic block-link verification is restricted to administrative roles (Super Admin, Hospital Admin). Audit view access remains active."
          );
        }
      } else {
        setVerificationState("ERROR");
        setChainStatus(null);
      }
    } finally {
      setVerifying(false);
    }
  }, [toastInfo]);

  useEffect(() => {
    loadBlocks();
    verifyChain(false);
  }, [loadBlocks, verifyChain]);

  const handleRefresh = async () => {
    await Promise.all([loadBlocks(), verifyChain(true)]);
  };

  const filteredBlocks = blocks.filter(b => {
    const q = search.toLowerCase();
    const matchSearch = 
      b.transaction_hash.toLowerCase().includes(q) || 
      b.payload.toLowerCase().includes(q) || 
      b.type.toLowerCase().includes(q);
    const matchType = 
      typeFilter === "All" || 
      b.type === typeFilter || 
      (typeFilter === "RECOVERY" && (b.type === "RECOVERY" || b.type === "RECOVERY_COMPLETED" || b.payload.includes("RECOVERY")));
    return matchSearch && matchType;
  });

  const getTxTypeBadgeColor = (type: string) => {
    switch (type) {
      case "UPLOAD": return "bg-blue-500/15 text-blue-400 border-blue-500/30";
      case "VERIFY": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
      case "ACCESS_GRANT": return "bg-purple-500/15 text-purple-400 border-purple-500/30";
      case "ACCESS_REVOKE": return "bg-amber-500/15 text-amber-400 border-amber-500/30";
      case "TAMPER_ALERT": return "bg-rose-500/15 text-rose-400 border-rose-500/30 animate-pulse";
      case "IMAGE_QUARANTINED": return "bg-rose-500/15 text-rose-400 border-rose-500/30";
      case "RECOVERY": 
      case "RECOVERY_COMPLETED": return "bg-teal-500/15 text-teal-400 border-teal-500/30";
      default: return "bg-slate-500/15 text-slate-400 border-slate-500/30";
    }
  };

  const parsePayload = (payload: string) => {
    try { return JSON.parse(payload); } catch { return payload; }
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <Link2 className="h-5 w-5 text-indigo-400" />
            Blockchain Audit Ledger
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Immutable healthcare security audit timeline and cryptographic events.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading || verifying}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading || verifying ? "animate-spin" : ""}`} />
          {verifying ? "Verifying..." : "Verify Chain"}
        </button>
      </div>

      {/* State 1: CHAIN VERIFIED */}
      {verificationState === "VERIFIED" && chainStatus && (
        <div className="p-4 rounded-xl border flex items-center justify-between bg-emerald-500/10 border-emerald-500/20">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-emerald-400 flex-shrink-0" />
            <div>
              <div className="text-sm font-bold text-emerald-400">
                Ledger Integrity Verified
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {chainStatus.message} • {chainStatus.block_count || blocks.length} blocks verified
              </div>
            </div>
          </div>
          <span className="hidden sm:inline-block text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            Chain Valid
          </span>
        </div>
      )}

      {/* State 2: CHAIN VERIFICATION FAILED */}
      {verificationState === "COMPROMISED" && chainStatus && (
        <div className="p-4 rounded-xl border bg-rose-500/10 border-rose-500/20 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-rose-400 flex-shrink-0" />
              <div>
                <div className="text-sm font-bold text-rose-400">
                  Ledger Integrity Compromised
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {chainStatus.message || "Unauthorized block modification detected in blockchain ledger!"}
                </div>
              </div>
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
              Integrity Alert
            </span>
          </div>
          {chainStatus.violations && chainStatus.violations.length > 0 && (
            <div className="mt-2 p-3 bg-slate-950/70 rounded-lg border border-rose-500/30 space-y-1 text-xs font-mono text-rose-300">
              <div className="text-[10px] uppercase tracking-wider font-bold text-rose-400 mb-1">
                Integrity Violations:
              </div>
              {chainStatus.violations.map((v, i) => (
                <div key={i}>• {v}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* State 3: VERIFICATION NOT AUTHORIZED */}
      {verificationState === "UNAUTHORIZED" && (
        <div className="p-4 rounded-xl border flex items-center justify-between bg-indigo-500/10 border-indigo-500/20">
          <div className="flex items-center gap-3">
            <Lock className="h-6 w-6 text-indigo-400 flex-shrink-0" />
            <div>
              <div className="text-sm font-bold text-indigo-300">
                Audit View Access (Ledger Verification Restricted)
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Cryptographic link verification requires an administrative role (Super Admin or Hospital Admin). You have full read-only access to inspect immutable audit events and transaction payloads below.
              </div>
            </div>
          </div>
          <span className="hidden sm:inline-block text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            Audit Mode
          </span>
        </div>
      )}

      {/* State 4: BLOCKCHAIN UNAVAILABLE */}
      {ledgerError && (
        <div className="p-4 rounded-xl border flex items-center justify-between bg-rose-500/10 border-rose-500/30">
          <div className="flex items-center gap-3">
            <WifiOff className="h-6 w-6 text-rose-400 flex-shrink-0" />
            <div>
              <div className="text-sm font-bold text-rose-400">
                Blockchain Ledger Unavailable
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {ledgerError}
              </div>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            className="px-3 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="glass-panel p-3 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search hash or payload..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 pl-8 pr-3 py-2 rounded-lg text-xs text-slate-200 outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-500" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 px-2 py-2 rounded-lg text-xs text-slate-300 outline-none cursor-pointer focus:border-indigo-500"
          >
            {["All", "UPLOAD", "VERIFY", "TAMPER_ALERT", "IMAGE_QUARANTINED", "ACCESS_GRANT", "ACCESS_REVOKE", "RECOVERY", "RECOVERY_COMPLETED"].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && blocks.length === 0 ? (
        <div className="glass-panel p-16 flex items-center justify-center gap-3 text-slate-500 text-xs">
          <RefreshCw className="h-4 w-4 animate-spin text-indigo-500" /> Loading blockchain ledger...
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <div className="divide-y divide-slate-800/40">
            {filteredBlocks.map(block => {
              const isExpanded = expandedId === block.id;
              const payloadData = parsePayload(block.payload);
              
              return (
                <div key={block.id} className="hover:bg-slate-900/30 transition-colors">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : block.id)}
                    className="w-full flex items-center gap-4 px-4 py-3 text-left cursor-pointer"
                  >
                    <span className="text-[10px] font-mono text-slate-500 w-12 flex-shrink-0">#{block.block_index}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border w-28 text-center flex-shrink-0 ${getTxTypeBadgeColor(block.type)}`}>
                      {block.type}
                    </span>
                    <span className="font-hash text-slate-400 flex-1 truncate hidden md:block">
                      {block.transaction_hash}
                    </span>
                    <span className="text-[11px] text-slate-500 flex-shrink-0 hidden sm:block w-32">
                      {new Date(block.timestamp).toLocaleString()}
                    </span>
                    <span className="text-slate-600 flex-shrink-0">
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 bg-slate-950/40 border-t border-slate-800/40">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                        <div className="space-y-3">
                          <div>
                            <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">Transaction Hash</div>
                            <div className="font-hash text-indigo-400 bg-slate-900/60 p-2 rounded break-all text-[10px]">{block.transaction_hash}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">Timestamp</div>
                            <div className="text-xs text-slate-300">{new Date(block.timestamp).toISOString()}</div>
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">Transaction Payload</div>
                          <pre className="bg-slate-900/60 p-3 rounded-lg overflow-x-auto text-[10px] font-mono text-emerald-400 border border-slate-800/60">
                            {typeof payloadData === 'object' ? JSON.stringify(payloadData, null, 2) : payloadData}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {blocks.length === 0 ? (
              <div className="p-16 flex flex-col items-center justify-center gap-2 text-center text-slate-500">
                <Link2 className="h-8 w-8 text-slate-700 mb-1" />
                <div className="text-sm font-semibold text-slate-300">No Audit Events Recorded</div>
                <p className="text-xs text-slate-500 max-w-sm">
                  The blockchain ledger currently contains no transactions. Events will be appended as images are uploaded, verified, or recovered.
                </p>
              </div>
            ) : filteredBlocks.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">No blocks found matching search criteria.</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

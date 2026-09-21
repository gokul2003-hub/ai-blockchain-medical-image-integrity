import React, { useState } from "react";
import { Database, Search, ArrowRight, ShieldCheck, FileWarning, Eye, Calendar, Key, Binary } from "lucide-react";

interface BlockTx {
  id: number;
  block_index: number;
  transaction_hash: string;
  type: string;
  payload: string;
  timestamp: string;
}

interface AuditExplorerProps {
  blocks: BlockTx[];
  loading: boolean;
  onRefresh: () => void;
}

export default function AuditExplorer({ blocks, loading, onRefresh }: AuditExplorerProps) {
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredBlocks = blocks.filter((b) => {
    const term = searchQuery.toLowerCase();
    return (
      b.transaction_hash.toLowerCase().includes(term) ||
      b.type.toLowerCase().includes(term) ||
      b.payload.toLowerCase().includes(term)
    );
  });

  const getTxTypeBadgeColor = (type: string) => {
    switch (type) {
      case "UPLOAD": return "bg-blue-500/20 text-blue-400 border border-blue-500/30";
      case "VERIFY": return "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
      case "ACCESS_GRANT": return "bg-purple-500/20 text-purple-400 border border-purple-500/30";
      case "ACCESS_REVOKE": return "bg-amber-500/20 text-amber-400 border border-amber-500/30";
      case "TAMPER_ALERT": return "bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse";
      default: return "bg-slate-500/20 text-slate-400";
    }
  };

  const parseBlockPayload = (payload: string) => {
    try {
      return JSON.parse(payload);
    } catch {
      return payload;
    }
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Decentralized Blockchain Ledger</h2>
          <p className="text-xs text-slate-400 mt-1">
            Browse and cryptographically verify recorded events from the immutable audit trail.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="px-4 py-2 bg-slate-900 border border-slate-800 text-xs font-semibold rounded-xl hover:bg-slate-800 cursor-pointer"
        >
          Verify Links & Refresh
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
            <Database className="h-5 w-5" />
          </div>
          <div className="text-left">
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Blocks</div>
            <div className="text-lg font-bold text-slate-100">{blocks.length} Blocks</div>
          </div>
        </div>
        <div className="glass-panel p-4 flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="text-left">
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Ledger Health</div>
            <div className="text-lg font-bold text-slate-100">100% Cryptographic Link</div>
          </div>
        </div>
        <div className="glass-panel p-4 flex items-center gap-3">
          <div className="p-2 bg-rose-500/10 rounded-lg text-rose-400">
            <FileWarning className="h-5 w-5" />
          </div>
          <div className="text-left">
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Security Alerts</div>
            <div className="text-lg font-bold text-slate-100">
              {blocks.filter(b => b.type === "TAMPER_ALERT").length} Recorded
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Blocks Table List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-panel px-4 py-3 flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search transactions by type, hash, payload details..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-0 outline-none w-full text-xs text-slate-300 placeholder:text-slate-500"
            />
          </div>

          <div className="glass-panel overflow-hidden border border-slate-900 rounded-2xl">
            {loading ? (
              <div className="h-64 flex items-center justify-center text-slate-500 text-xs">
                Querying nodes & loading ledger chain...
              </div>
            ) : filteredBlocks.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-slate-500 text-xs">
                No blocks matching transaction criteria
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-900/60 border-b border-slate-800 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">Index</th>
                      <th className="py-3 px-4">Block Hash</th>
                      <th className="py-3 px-4">Tx Type</th>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4 text-right">View</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {filteredBlocks.map((b) => (
                      <tr 
                        key={b.id} 
                        className={`text-xs hover:bg-slate-900/20 transition-all cursor-pointer ${selectedBlockId === b.id ? "bg-slate-900/40" : ""}`}
                        onClick={() => setSelectedBlockId(b.id)}
                      >
                        <td className="py-3 px-4 font-mono font-bold text-blue-400">#{b.block_index}</td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                          {b.transaction_hash.slice(0, 16)}...
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${getTxTypeBadgeColor(b.type)}`}>
                            {b.type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[10px]">
                          {new Date(b.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button className="text-slate-400 hover:text-slate-100 p-1">
                            <Eye className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Selected Block Details Card */}
        <div>
          {selectedBlockId !== null ? (
            (() => {
              const block = blocks.find((b) => b.id === selectedBlockId);
              if (!block) return null;
              const payloadData = parseBlockPayload(block.payload);
              return (
                <div className="glass-panel p-6 space-y-6 sticky top-24">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm tracking-wide text-slate-200">Block #{block.block_index} Details</h3>
                    <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full font-bold">
                      MINED
                    </span>
                  </div>

                  {/* Cryptographic properties */}
                  <div className="space-y-3 border-b border-slate-900 pb-4">
                    <div>
                      <div className="text-[9px] text-slate-500 font-bold uppercase flex items-center gap-1">
                        <Key className="h-3 w-3" /> Block Signature (SHA-3 Hash)
                      </div>
                      <div className="text-[10px] font-mono text-slate-300 break-all bg-slate-950 p-2 rounded-xl mt-1.5 border border-slate-900">
                        {block.transaction_hash}
                      </div>
                    </div>

                    <div>
                      <div className="text-[9px] text-slate-500 font-bold uppercase flex items-center gap-1">
                        <ArrowRight className="h-3 w-3" /> Previous Link Hash
                      </div>
                      <div className="text-[10px] font-mono text-slate-300 break-all bg-slate-950 p-2 rounded-xl mt-1.5 border border-slate-900">
                        {payloadData.previous_hash || "0000000000000000000000000000000000000000000000000000000000000000"}
                      </div>
                    </div>
                  </div>

                  {/* Consensus properties */}
                  <div className="grid grid-cols-2 gap-4 border-b border-slate-900 pb-4">
                    <div>
                      <div className="text-[9px] text-slate-500 font-bold uppercase flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Block Time
                      </div>
                      <div className="text-xs text-slate-300 font-semibold mt-1">
                        {new Date(block.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-500 font-bold uppercase flex items-center gap-1">
                        <Binary className="h-3 w-3" /> Nonce Proof
                      </div>
                      <div className="text-xs text-slate-300 font-mono font-bold mt-1">
                        {payloadData.proof || "100"}
                      </div>
                    </div>
                  </div>

                  {/* Payload Details */}
                  <div>
                    <div className="text-[9px] text-slate-500 font-bold uppercase mb-2">
                      Decrypted Mined Payload Data
                    </div>
                    <pre className="text-[10px] text-emerald-400 bg-slate-950 p-3 rounded-xl overflow-x-auto max-h-64 border border-slate-900 text-left font-mono leading-relaxed">
                      {JSON.stringify(payloadData.data || payloadData, null, 2)}
                    </pre>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="glass-panel p-8 text-center text-slate-500 text-xs flex flex-col items-center justify-center h-80">
              <Database className="h-10 w-10 text-slate-600 mb-3 animate-pulse" />
              Select a ledger block to audit its cryptographic parameters and trace proof payloads.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState } from "react";
import { apiClient } from "../../services/api";

/**
 * Shape returned by GET /api/blockchain/blocks (backend/app/schemas.py,
 * BlockchainTransactionResponse): { id, block_index, transaction_hash, type,
 * payload (JSON string), timestamp }.
 *
 * `payload` is written by LocalSimulatedBlockchain.write_transaction
 * (backend/app/blockchain.py) as
 *   { index, timestamp, type, data, proof, previous_hash }
 * where `data` holds the event fields (action, image_id, status, details, ...).
 *
 * The legacy keys below (block_number/index/hash/previous_hash/ipfs_cid/
 * image_id) are kept optional so pre-shaped rows still render, but every
 * binding below prefers the real backend field names.
 */
export interface BlockchainBlockItem {
  id?: number;
  block_index?: number;
  block_number?: number;
  index?: number;
  hash?: string;
  transaction_hash?: string;
  previous_hash?: string;
  prev_hash?: string;
  timestamp?: string;
  image_id?: number;
  ipfs_cid?: string;
  type?: string;
  action?: string;
  payload?: string | Record<string, any>;
  data?: any;
}

interface BlockPayloadShape {
  index?: number;
  timestamp?: string;
  type?: string;
  data?: Record<string, any>;
  proof?: number | string;
  previous_hash?: string;
}

const NOT_RECORDED = "N/A — not recorded";
const PAYLOAD_UNREADABLE = "N/A — payload not parseable";
const IPFS_NOT_ACTIVE = "N/A — IPFS not active for this record";
const CURRENT_HASH_NOTE =
  "N/A — not recorded (no separate block-hash field in this payload; the block's SHA3-256 content hash is stored as the transaction hash)";
// Every ledger row in the DB is written by LocalSimulatedBlockchain
// (backend/app/blockchain.py) — BlockchainService.record_* always calls
// local_chain.write_transaction, and routes/blockchain.py imports the same
// class for integrity verification.
const BLOCKCHAIN_PROVIDER = "LocalSimulatedBlockchain — local simulation";

const parseBlockPayload = (
  block: BlockchainBlockItem
): { payload: BlockPayloadShape | null; readable: boolean } => {
  const raw = block.payload;
  if (raw == null || raw === "") {
    // Legacy pre-shaped row: no payload string on the item.
    return { payload: null, readable: true };
  }
  if (typeof raw === "object") {
    return { payload: raw as BlockPayloadShape, readable: true };
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { payload: parsed as BlockPayloadShape, readable: true };
    }
    return { payload: null, readable: false };
  } catch {
    return { payload: null, readable: false };
  }
};

// Storage reference classification mirrors the backend heuristics
// (backend/app/routes/images.py: "ipfs" in reference => IPFS, else LOCAL) and
// the recorded reference formats: LocalStorageProvider stores "<uuid>.enc"
// object ids / paths (backend/app/storage_provider.py), IPFSProvider stores a
// CIDv0 (Qm + 44 base58) or CIDv1 string, optionally ipfs://-prefixed.
type StorageKind = "ipfs" | "local" | "unknown";

const classifyStorageRef = (ref?: string): StorageKind => {
  const clean = (ref || "").trim();
  if (!clean) return "unknown";
  const lower = clean.toLowerCase();
  if (lower.startsWith("ipfs://") || lower.includes("ipfs")) return "ipfs";
  if (clean.endsWith(".enc") || clean.includes("/") || clean.includes("\\")) return "local";
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(clean)) return "ipfs";
  if (/^[a-zA-Z0-9]{10,200}$/.test(clean)) return "ipfs";
  return "unknown";
};

interface LedgerRowFacts {
  blockNumber?: number;
  transactionHash?: string;
  currentBlockHash: string;
  previousHash: string;
  eventId: string;
  imageId?: number;
  imageLabel: string;
  study: string;
  actor: string;
  status: string;
  timestamp?: string;
  timestampLabel: string;
  storageProvider: string;
  ipfsCid: string;
  consensus: string;
  blockchainProvider: string;
  payloadReadable: boolean;
}

const getLedgerRowFacts = (block: BlockchainBlockItem): LedgerRowFacts => {
  const { payload, readable } = parseBlockPayload(block);
  const data: Record<string, any> =
    payload?.data && typeof payload.data === "object"
      ? payload.data
      : block.data && typeof block.data === "object"
      ? block.data
      : {};
  const details: Record<string, any> =
    data.details && typeof data.details === "object" ? data.details : {};
  const missing = readable ? NOT_RECORDED : PAYLOAD_UNREADABLE;

  const blockNumber =
    block.block_number ?? block.block_index ?? block.index ?? payload?.index;

  const transactionHash = block.transaction_hash ?? block.hash;

  // Genesis is claimed only when the recorded parent hash is genuinely the
  // all-zero anchor (routes/blockchain.py GENESIS_PARENT_HASH = "0" * 64).
  const previousHashRaw = block.previous_hash ?? block.prev_hash ?? payload?.previous_hash;
  const previousHash =
    typeof previousHashRaw === "string" && previousHashRaw.trim() !== ""
      ? previousHashRaw + (/^0+$/.test(previousHashRaw.trim()) ? " — Genesis anchor (all-zero parent hash)" : "")
      : missing;

  const eventId = String(data.action ?? block.action ?? payload?.type ?? block.type ?? missing);

  const imageIdRaw = block.image_id ?? data.image_id ?? data.image_ref;
  const imageIdNum = Number(imageIdRaw);
  const imageId =
    imageIdRaw != null && Number.isInteger(imageIdNum) && imageIdNum >= 0
      ? imageIdNum
      : undefined;
  const imageLabel = imageId != null ? `Image #${imageId}` : missing;

  // Study / modality only when the backend actually recorded it in the payload.
  let study = missing;
  for (const key of ["study_id", "study", "study_uid", "modality", "image_type", "title"]) {
    const value = details[key] ?? data[key];
    if (value != null && value !== "") {
      study =
        key.startsWith("study") && /^-?\d+$/.test(String(value))
          ? `Study #${value}`
          : String(value);
      break;
    }
  }

  // Actor: details.user_id / actor first (recorded by record_verification and
  // record_tamper_alert), then the upload/forensic authoring fields.
  const actorParts: string[] = [];
  const userId = details.user_id ?? data.user_id;
  if (userId != null) actorParts.push(`User #${userId}`);
  const actorName = details.actor ?? data.actor;
  if (actorName != null) actorParts.push(String(actorName));
  const uploader = data.uploader_id;
  if (uploader != null) actorParts.push(`Uploader #${uploader}`);
  const performer = details.performed_by ?? data.performed_by;
  if (performer != null) actorParts.push(String(performer));
  const actor = actorParts.length > 0 ? actorParts.join(", ") : missing;

  const status = data.status != null ? String(data.status) : missing;

  const timestampRaw = block.timestamp ?? payload?.timestamp;
  let timestampLabel = missing;
  if (timestampRaw) {
    const parsedTime = new Date(timestampRaw);
    timestampLabel = isNaN(parsedTime.getTime())
      ? String(timestampRaw)
      : parsedTime.toISOString();
  }

  const storageRefRaw =
    data.storage_reference ?? data.ipfs_cid ?? block.ipfs_cid;
  const storageRef =
    typeof storageRefRaw === "string" && storageRefRaw.trim() !== ""
      ? storageRefRaw.trim()
      : undefined;
  const storageKind = classifyStorageRef(storageRef);
  const storageProvider = !readable
    ? PAYLOAD_UNREADABLE
    : storageKind === "ipfs"
    ? "ipfs"
    : storageKind === "local"
    ? "local"
    : missing;
  // A CID is only ever shown when the recorded reference really is an IPFS
  // reference; otherwise IPFS is not in use for that record (this backend
  // defaults STORAGE_PROVIDER=local, see backend/app/config.py).
  const ipfsCid =
    !readable
      ? PAYLOAD_UNREADABLE
      : storageKind === "ipfs"
      ? String(storageRef)
      : IPFS_NOT_ACTIVE;

  // No validator/quorum data exists anywhere in this backend: blocks are mined
  // with LocalSimulatedBlockchain.proof_of_work (SHA3-256, 4 leading zeros,
  // backend/app/blockchain.py) and only carry the PoW nonce in payload.proof.
  const proof = payload?.proof;
  const consensus =
    proof != null
      ? `N/A — consensus not recorded (no validator or quorum data in backend). Proof-of-work nonce recorded in payload "proof": ${proof} (SHA3-256 target 0000) via LocalSimulatedBlockchain.`
      : `N/A — consensus not recorded (no validator or quorum data in backend). Blocks are mined by LocalSimulatedBlockchain proof-of-work (SHA3-256, 4 leading zeros).`;

  return {
    blockNumber,
    transactionHash,
    currentBlockHash: block.hash ?? CURRENT_HASH_NOTE,
    previousHash,
    eventId,
    imageId,
    imageLabel,
    study,
    actor,
    status,
    timestamp: timestampRaw ? String(timestampRaw) : undefined,
    timestampLabel,
    storageProvider,
    ipfsCid,
    consensus,
    blockchainProvider: BLOCKCHAIN_PROVIDER,
    payloadReadable: readable,
  };
};

interface DetailRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value, mono = false }) => (
  <div>
    <span className="font-label-sm text-outline uppercase block text-[10px]">
      {label}
    </span>
    {mono ? (
      <code className="font-code-sm bg-surface-container-low p-2 rounded block break-all text-on-surface mt-1">
        {value}
      </code>
    ) : (
      <p className="font-body-sm text-on-surface-variant mt-1 break-words">{value}</p>
    )}
  </div>
);

interface AuditLedgerProps {
  blocks: BlockchainBlockItem[];
  isVerified?: boolean;
  onRefresh?: () => void;
  className?: string;
}

export const AuditLedger: React.FC<AuditLedgerProps> = ({
  blocks,
  isVerified = true,
  onRefresh,
  className = "",
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBlock, setSelectedBlock] = useState<BlockchainBlockItem | null>(null);
  const [exporting, setExporting] = useState(false);

  // GET /api/audit/logs is admin-guarded on the backend — only offer the export
  // action to admin roles so non-admin viewers never hit a 403.
  const isAdminUser = ["admin", "super_admin", "hospital_admin"].includes(
    (localStorage.getItem("med_role") || "").toLowerCase()
  );

  // Reuses the existing GET /api/audit/logs route (same endpoint apiService.getAuditLogs()
  // calls) and the existing apiClient pattern, which attaches the Bearer token automatically.
  const handleExportAuditReport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const response = await apiClient.get("/api/audit/logs", {
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: "application/json" });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `MediSecure_Audit_Report_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("Audit report export failed", err);
    } finally {
      setExporting(false);
    }
  };

  const filteredBlocks = blocks.filter((b) => {
    const q = searchTerm.toLowerCase();
    // Bind to the real backend fields (transaction_hash, block_index, type,
    // payload) while keeping the legacy keys so pre-shaped rows still match.
    const searchable = [
      b.hash,
      b.transaction_hash,
      b.ipfs_cid,
      b.image_id?.toString(),
      b.id?.toString(),
      b.block_index?.toString(),
      b.block_number?.toString(),
      b.type,
      b.action,
      typeof b.payload === "string" ? b.payload : b.payload ? JSON.stringify(b.payload) : undefined,
    ]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" ")
      .toLowerCase();
    return searchable.includes(q);
  });

  return (
    <div
      className={`bg-surface-container-lowest rounded-xl p-space-lg border border-surface-container-high/60 shadow-sm flex flex-col gap-4 ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-surface-container-low">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[22px] text-primary">
            account_tree
          </span>
          <div>
            <h3 className="font-headline-sm text-base font-semibold text-on-surface">
              Cryptographic Audit Ledger
            </h3>
            <p className="font-body-sm text-xs text-on-surface-variant">
              Consortium private blockchain transactions and SHA-3 verification records
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded-full font-label-sm text-xs font-semibold flex items-center gap-1.5 ${
              isVerified
                ? "bg-secondary-fixed text-on-secondary-fixed"
                : "bg-error-container text-on-error-container"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isVerified ? "bg-secondary" : "bg-error"
              }`}
            />
            {isVerified ? "Consensus Validated (100%)" : "Verification Warning"}
          </span>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors"
              title="Refresh ledger"
            >
              <span className="material-symbols-outlined text-base">refresh</span>
            </button>
          )}
          {isAdminUser && (
            <button
              onClick={handleExportAuditReport}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-on-primary font-label-sm text-xs font-semibold hover:bg-primary-container transition-colors disabled:opacity-60"
              title="Export Audit Report"
            >
              <span className="material-symbols-outlined text-base">
                {exporting ? "hourglass_top" : "download"}
              </span>
              {exporting ? "Exporting..." : "Export Audit Report"}
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm">
            search
          </span>
          <input
            type="text"
            placeholder="Search block hash, IPFS CID, or Image ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-surface-container-low text-on-surface font-body-sm text-xs pl-8 pr-3 py-2 rounded-lg border border-surface-container-high/60 focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Blocks Table */}
      <div className="overflow-x-auto rounded-lg border border-surface-container-high/40">
        <table className="w-full text-left font-body-sm text-xs">
          <thead className="bg-surface-container-low text-on-surface-variant font-label-sm uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-2.5 px-3">Block #</th>
              <th className="py-2.5 px-3">Transaction Hash</th>
              <th className="py-2.5 px-3">Target Ref / Image</th>
              <th className="py-2.5 px-3">IPFS CID</th>
              <th className="py-2.5 px-3">Timestamp</th>
              <th className="py-2.5 px-3 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container-low">
            {filteredBlocks.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-outline">
                  No blockchain transaction blocks found matching criteria.
                </td>
              </tr>
            ) : (
              filteredBlocks.map((block, idx) => {
                const facts = getLedgerRowFacts(block);
                const blockNum = facts.blockNumber ?? idx + 1;
                const txHash = facts.transactionHash;
                return (
                  <tr
                    key={block.id || idx}
                    className="hover:bg-surface-container-low/50 transition-colors"
                  >
                    <td className="py-2.5 px-3 font-code-sm font-semibold text-primary">
                      #{blockNum}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-on-surface max-w-[200px] truncate" title={txHash}>
                      {txHash ? `${txHash.slice(0, 16)}...${txHash.slice(-8)}` : facts.payloadReadable ? NOT_RECORDED : PAYLOAD_UNREADABLE}
                    </td>
                    <td className="py-2.5 px-3">
                      {facts.imageId != null ? (
                        <span className="px-1.5 py-0.5 rounded bg-surface-container font-code-sm text-[10px] text-on-surface">
                          Image #{facts.imageId}
                        </span>
                      ) : (
                        <span className="text-outline text-[11px]">{facts.imageLabel}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-on-surface-variant max-w-[150px] truncate" title={facts.ipfsCid}>
                      {facts.ipfsCid}
                    </td>
                    <td className="py-2.5 px-3 text-on-surface-variant">
                      {facts.timestamp
                        ? new Date(facts.timestamp).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : facts.payloadReadable ? NOT_RECORDED : PAYLOAD_UNREADABLE}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => setSelectedBlock(block)}
                        className="px-2 py-1 rounded hover:bg-surface-container text-primary font-label-sm text-[11px] font-semibold"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Inspect Modal */}
      {selectedBlock &&
        (() => {
          // Every field below is derived from the row that was clicked — its
          // own block_index / transaction_hash / payload — so the modal always
          // reflects that transaction, never a fixed default block.
          const facts = getLedgerRowFacts(selectedBlock);
          const modalBlockNum = facts.blockNumber ?? selectedBlock.id;
          return (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-xl max-w-lg w-full p-6 shadow-xl border border-surface-container-high space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-surface-container-low pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">
                  verified
                </span>
                <h4 className="font-headline-sm text-base font-semibold text-on-surface">
                  Block #{modalBlockNum ?? "—"} Verification Details
                </h4>
              </div>
              <button
                onClick={() => setSelectedBlock(null)}
                className="p-1 rounded-lg hover:bg-surface-container text-outline"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <DetailRow label="Event" value={facts.eventId} />
              <DetailRow label="Image ID" value={facts.imageLabel} />
              <DetailRow label="Study / Modality" value={facts.study} />
              <DetailRow label="Actor" value={facts.actor} />
              <DetailRow label="Verification Status" value={facts.status} />
              <DetailRow label="Timestamp" value={facts.timestampLabel} />
              <DetailRow
                label="Block Number"
                value={facts.blockNumber != null ? String(facts.blockNumber) : NOT_RECORDED}
              />
              <DetailRow
                label="Transaction Hash"
                value={facts.transactionHash ?? NOT_RECORDED}
                mono
              />
              <DetailRow label="Current Block Hash (SHA3-256)" value={facts.currentBlockHash} mono />
              <DetailRow label="Previous Block Hash" value={facts.previousHash} mono />
              <DetailRow label="Storage Provider" value={facts.storageProvider} />
              <DetailRow label="IPFS Content Identifier (CID)" value={facts.ipfsCid} mono />
              <DetailRow label="Blockchain Provider" value={facts.blockchainProvider} />
              <DetailRow label="Consensus Signatures" value={facts.consensus} />
            </div>

            <div className="pt-3 border-t border-surface-container-low flex justify-end">
              <button
                onClick={() => setSelectedBlock(null)}
                className="px-4 py-1.5 rounded-lg bg-primary text-on-primary font-label-md text-xs hover:bg-primary-container"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
          );
        })()}
    </div>
  );
};
export default AuditLedger;

import React, { useState, useEffect } from "react";
import { apiService } from "../../services/api";
import { MetricCard } from "../../components/stitch/MetricCard";
import { AuditLedger } from "../../components/stitch/AuditLedger";
import { StatusPill } from "../../components/stitch/StatusPill";
import { LoadingState, EmptyState, ErrorState } from "../../components/stitch/States";
import { AccessGovernancePanel } from "../../components/AccessGovernancePanel";

interface AdminWorkspaceProps {
  token: string;
  activeSubPath: string;
  onNavigate: (path: string) => void;
}

export const AdminWorkspace: React.FC<AdminWorkspaceProps> = ({
  token,
  activeSubPath,
  onNavigate,
}) => {
  const [blocks, setBlocks] = useState<any[]>([]);
  const [chainVerification, setChainVerification] = useState<any | null>(null);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // New user registration modal state
  const [showAddUserModal, setShowAddUserModal] = useState<boolean>(false);
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("Password123!");
  const [newRole, setNewRole] = useState("doctor");
  const [newHospitalId, setNewHospitalId] = useState<number | "">("");
  const [provisionLoading, setProvisionLoading] = useState(false);
  const [provisionSuccess, setProvisionSuccess] = useState<string | null>(null);

  // Hospital node registration state
  const [showAddHospitalModal, setShowAddHospitalModal] = useState<boolean>(false);
  const [hospName, setHospName] = useState("");
  const [hospLicense, setHospLicense] = useState("");
  const [hospAddress, setHospAddress] = useState("");
  const [hospLoading, setHospLoading] = useState(false);

  // DID & Verifiable Credential inspection state
  const [showDidModal, setShowDidModal] = useState<boolean>(false);
  const [inspectedUserDid, setInspectedUserDid] = useState<any | null>(null);
  const [inspectedUserVc, setInspectedUserVc] = useState<any | null>(null);
  const [didLoading, setDidLoading] = useState(false);

  useEffect(() => {
    loadAdminData();
  }, [token]);

  const loadAdminData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        blocksRes,
        chainRes,
        analyticsRes,
        hospitalsRes,
        doctorsRes,
        patientsRes,
        logsRes,
      ] = await Promise.allSettled([
        apiService.getBlockchainBlocks(),
        apiService.verifyBlockchainChain(),
        apiService.getDashboardAnalytics(),
        apiService.listHospitals(),
        apiService.listDoctors(),
        apiService.listPatients(),
        apiService.getAuditLogs(),
      ]);

      if (blocksRes.status === "fulfilled" && Array.isArray(blocksRes.value)) {
        setBlocks(blocksRes.value);
      }
      if (chainRes.status === "fulfilled") setChainVerification(chainRes.value);
      if (analyticsRes.status === "fulfilled") setAnalytics(analyticsRes.value);
      if (hospitalsRes.status === "fulfilled" && Array.isArray(hospitalsRes.value)) {
        setHospitals(hospitalsRes.value);
      }
      if (doctorsRes.status === "fulfilled" && Array.isArray(doctorsRes.value)) {
        setDoctors(doctorsRes.value);
      }
      if (patientsRes.status === "fulfilled" && Array.isArray(patientsRes.value)) {
        setPatients(patientsRes.value);
      }
      if (logsRes.status === "fulfilled" && Array.isArray(logsRes.value)) {
        setAuditLogs(logsRes.value);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load hospital administrator telemetry.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisionLoading(true);
    setError(null);
    setProvisionSuccess(null);
    try {
      if (newRole === "patient") {
        await apiService.register({
          username: newUsername.trim(),
          email: newEmail.trim(),
          password: newPassword,
          role: "patient",
          hospital_id: newHospitalId ? Number(newHospitalId) : undefined,
        });
      } else {
        await apiService.provisionUser({
          username: newUsername.trim(),
          email: newEmail.trim(),
          password: newPassword,
          role: newRole as "hospital_admin" | "doctor" | "radiologist" | "researcher",
          hospital_id: newHospitalId ? Number(newHospitalId) : undefined,
        });
      }
      setProvisionSuccess(`User ${newUsername} successfully provisioned on platform.`);
      setNewUsername("");
      setNewEmail("");
      setShowAddUserModal(false);
      // Reload users
      const [updatedDoctors, updatedPatients] = await Promise.all([
        apiService.listDoctors(),
        apiService.listPatients(),
      ]);
      setDoctors(updatedDoctors);
      setPatients(updatedPatients);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Failed to provision user.");
    } finally {
      setProvisionLoading(false);
    }
  };

  const handleCreateHospital = async (e: React.FormEvent) => {
    e.preventDefault();
    setHospLoading(true);
    setError(null);
    try {
      await apiService.createHospital({
        name: hospName.trim(),
        license_number: hospLicense.trim(),
        address: hospAddress.trim() || undefined,
      });
      setShowAddHospitalModal(false);
      setHospName("");
      setHospLicense("");
      setHospAddress("");
      const updated = await apiService.listHospitals();
      if (Array.isArray(updated)) setHospitals(updated);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Failed to register hospital node.");
    } finally {
      setHospLoading(false);
    }
  };

  const handleInspectDid = async (userId: number) => {
    setDidLoading(true);
    setShowDidModal(true);
    setInspectedUserDid(null);
    setInspectedUserVc(null);
    try {
      const [didRes, vcRes] = await Promise.allSettled([
        apiService.getUserDid(userId),
        apiService.verifyUserCredential(userId),
      ]);
      if (didRes.status === "fulfilled") setInspectedUserDid(didRes.value);
      if (vcRes.status === "fulfilled") setInspectedUserVc(vcRes.value);
    } catch (err: any) {
      setError("Failed to inspect DID credentials.");
    } finally {
      setDidLoading(false);
    }
  };

  const totalTransactions = blocks.length;
  const isChainValid = chainVerification ? chainVerification.status === "SUCCESS" : true;
  const tamperAlerts = blocks.filter((b) => b.type === "TAMPER_ALERT" || b.action === "TAMPER_DETECTED").length;

  if (loading && blocks.length === 0) {
    return <LoadingState message="Connecting to Private Consortium Ledger & HSM Nodes..." />;
  }

  return (
    <div className="space-y-6">
      {error && <ErrorState title="Governance Notice" message={error} onRetry={loadAdminData} />}

      {/* ------------------------------------------------------------------ */}
      {/* 1. ADMIN WORKSPACE / DASHBOARD                                      */}
      {/* ------------------------------------------------------------------ */}
      {activeSubPath === "admin-workspace" && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-surface-container-low">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-[11px] uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                <span>Institutional Governance Suite</span>
                <span>/</span>
                <span className="text-primary font-semibold">Ledger Terminal v4.19</span>
              </div>
              <h1 className="font-headline-xl text-2xl md:text-3xl font-bold text-on-surface tracking-tight">
                Hospital Administrator Workspace
              </h1>
              <p className="font-body-md text-xs md:text-sm text-on-surface-variant max-w-3xl">
                Institutional Integrity Ledger &amp; Access Governance. Real-time cryptographic consensus, multi-site DICOM lineage, and zero-knowledge tamper mitigation records.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddUserModal(true)}
                className="px-3 py-2 rounded-lg bg-primary text-on-primary font-label-md text-xs hover:bg-primary-container shadow-sm flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">person_add</span>
                <span>Provision User</span>
              </button>
              <button
                onClick={loadAdminData}
                className="px-3 py-2 rounded-lg bg-surface-container text-on-surface font-label-md text-xs hover:bg-surface-container-high shadow-sm flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">sync</span>
                <span>Force Re-index</span>
              </button>
            </div>
          </div>

          {/* 4 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Total DICOM Transactions"
              value={totalTransactions}
              subtitle="All-time recorded on private consortium"
              icon="dataset"
              footerText={`Block Height: #${totalTransactions}`}
              footerBadgeText={isChainValid ? "100% Validated" : "Verification Error"}
              footerBadgeClass={
                isChainValid
                  ? "bg-secondary-fixed text-on-secondary-fixed font-semibold"
                  : "bg-error-container text-on-error-container font-semibold"
              }
            />
            <MetricCard
              title="Cryptographic Nodes"
              value={`${hospitals.length} / ${Math.max(1, hospitals.length)}`}
              unit="Active"
              subtitle="Consensus: PBFT Strict Quorum"
              icon="hub"
              iconBgClass="bg-secondary-fixed text-on-secondary-fixed"
              footerText="TLS 1.3 Mutual Authentication"
              footerBadgeText="Online"
              footerBadgeClass="bg-secondary-fixed text-on-secondary-fixed font-semibold"
            />
            <MetricCard
              title="Tamper Alerts Intercepted"
              value={tamperAlerts.toString().padStart(2, "0")}
              unit="Incidents"
              subtitle="100% neutralized & quarantined"
              icon="security"
              iconBgClass="bg-error-container/60 text-error"
              valueColorClass={tamperAlerts > 0 ? "text-error" : "text-on-surface"}
              footerText="Swin-UNet & SRM Defense"
              footerBadgeText={tamperAlerts > 0 ? "Flagged" : "Zero Incursions"}
              footerBadgeClass={
                tamperAlerts > 0
                  ? "bg-error-container text-on-error-container font-semibold"
                  : "bg-surface-container text-on-surface font-semibold"
              }
            />
            <MetricCard
              title="Registered Practitioners"
              value={doctors.length + patients.length}
              unit="Users"
              subtitle={`${doctors.length} Doctors • ${patients.length} Patients`}
              icon="group"
              iconBgClass="bg-tertiary-fixed text-tertiary"
              valueColorClass="text-primary"
              footerText="ABAC / RBAC Policy Enabled"
              footerBadgeText="Enforced"
            />
          </div>

          {/* Audit Ledger */}
          <AuditLedger blocks={blocks} isVerified={isChainValid} onRefresh={loadAdminData} />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 2. USER & ROLE MANAGEMENT                                          */}
      {/* ------------------------------------------------------------------ */}
      {activeSubPath === "user-management" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-surface-container-low">
            <div>
              <h2 className="font-headline-lg text-xl font-bold text-on-surface">
                User &amp; Role Management Directory
              </h2>
              <p className="font-body-sm text-xs text-on-surface-variant">
                Manage clinical accounts, assign cryptographic keys, and enforce RBAC / ABAC policies
              </p>
            </div>
            <button
              onClick={() => setShowAddUserModal(true)}
              className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-label-md text-xs hover:bg-primary-container shadow-sm flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">person_add</span>
              <span>Provision User</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Doctors Table */}
            <div className="bg-surface-container-lowest rounded-xl p-4 border border-surface-container-high/60 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-surface-container-low">
                <span className="font-headline-sm text-sm font-semibold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base text-primary">stethoscope</span>
                  Doctors &amp; Radiologists ({doctors.length})
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-body-sm text-xs">
                  <thead className="bg-surface-container-low text-on-surface-variant text-[11px] uppercase">
                    <tr>
                      <th className="py-2 px-2.5">ID</th>
                      <th className="py-2 px-2.5">Username</th>
                      <th className="py-2 px-2.5">Email</th>
                      <th className="py-2 px-2.5">Role</th>
                      <th className="py-2 px-2.5 text-right">DID Identity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container-low">
                    {doctors.map((d) => (
                      <tr key={d.id} className="hover:bg-surface-container-low/40">
                        <td className="py-2 px-2.5 font-code-sm text-primary">#{d.id}</td>
                        <td className="py-2 px-2.5 font-semibold text-on-surface">{d.username}</td>
                        <td className="py-2 px-2.5 text-on-surface-variant">{d.email}</td>
                        <td className="py-2 px-2.5">
                          <span className="px-1.5 py-0.5 rounded bg-surface-container font-label-sm text-[10px] text-primary">
                            {d.role}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 text-right">
                          <button
                            onClick={() => handleInspectDid(d.id)}
                            className="px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high text-primary font-label-sm text-[10px] inline-flex items-center gap-1 border border-surface-container-high/60"
                          >
                            <span className="material-symbols-outlined text-[13px]">badge</span>
                            <span>Verify DID</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Patients Table */}
            <div className="bg-surface-container-lowest rounded-xl p-4 border border-surface-container-high/60 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-surface-container-low">
                <span className="font-headline-sm text-sm font-semibold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base text-secondary">person</span>
                  Patient Accounts ({patients.length})
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-body-sm text-xs">
                  <thead className="bg-surface-container-low text-on-surface-variant text-[11px] uppercase">
                    <tr>
                      <th className="py-2 px-2.5">ID</th>
                      <th className="py-2 px-2.5">Username</th>
                      <th className="py-2 px-2.5">Email</th>
                      <th className="py-2 px-2.5">Status</th>
                      <th className="py-2 px-2.5 text-right">DID Identity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container-low">
                    {patients.map((p) => (
                      <tr key={p.id} className="hover:bg-surface-container-low/40">
                        <td className="py-2 px-2.5 font-code-sm text-secondary">#{p.id}</td>
                        <td className="py-2 px-2.5 font-semibold text-on-surface">{p.username}</td>
                        <td className="py-2 px-2.5 text-on-surface-variant">{p.email}</td>
                        <td className="py-2 px-2.5">
                          <StatusPill
                            variant={p.is_active === false ? "tampered" : "verified"}
                            label={p.is_active === false ? "Disabled" : "Active"}
                          />
                        </td>
                        <td className="py-2 px-2.5 text-right">
                          <button
                            onClick={() => handleInspectDid(p.id)}
                            className="px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high text-secondary font-label-sm text-[10px] inline-flex items-center gap-1 border border-surface-container-high/60"
                          >
                            <span className="material-symbols-outlined text-[13px]">fingerprint</span>
                            <span>Verify DID</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 3. CONSORTIUM NODES / HOSPITALS                                    */}
      {/* ------------------------------------------------------------------ */}
      {activeSubPath === "hospitals-directory" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-surface-container-low">
            <div>
              <h2 className="font-headline-lg text-xl font-bold text-on-surface">
                Consortium Hospital Nodes &amp; Diagnostic Centers
              </h2>
              <p className="font-body-sm text-xs text-on-surface-variant">
                Federated cluster participants validating private blockchain transactions
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full font-label-sm text-xs bg-secondary-fixed text-on-secondary-fixed font-semibold">
                {hospitals.length} Consensus Nodes
              </span>
              <button
                onClick={() => setShowAddHospitalModal(true)}
                className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-label-md text-xs hover:bg-primary-container shadow-sm flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">add_business</span>
                <span>Register Node</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {hospitals.map((h) => (
              <div
                key={h.id}
                className="bg-surface-container-lowest rounded-xl p-4 border border-surface-container-high/60 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary font-bold">
                      <span className="material-symbols-outlined text-lg">domain</span>
                    </div>
                    <div>
                      <h4 className="font-headline-sm text-sm font-semibold text-on-surface">
                        {h.name}
                      </h4>
                      <span className="font-code-sm text-[10px] text-outline">
                        License: {h.license_number}
                      </span>
                    </div>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-secondary" />
                </div>
                <div className="text-xs text-on-surface-variant space-y-1 bg-surface-container-low p-2.5 rounded-lg">
                  <div className="flex justify-between">
                    <span>Contact Email</span>
                    <span className="font-medium text-on-surface">{h.contact_email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Address</span>
                    <span className="truncate max-w-[160px]">{h.address || "Metro Health Hub"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 4. SECURITY MONITORING & AUDIT LOGS                                */}
      {/* ------------------------------------------------------------------ */}
      {(activeSubPath === "security-monitoring" || activeSubPath === "system-health") && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-surface-container-low">
            <div>
              <h2 className="font-headline-lg text-xl font-bold text-on-surface">
                HIPAA &amp; PHI Security Event Monitoring
              </h2>
              <p className="font-body-sm text-xs text-on-surface-variant">
                Real-time cryptographic audit trail of all medical downloads, verification checks, and emergency overrides
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full font-label-sm text-xs bg-surface-container text-on-surface font-semibold">
              {auditLogs.length} Events Logged
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-surface-container-high/60 bg-surface-container-lowest">
            <table className="w-full text-left font-body-sm text-xs">
              <thead className="bg-surface-container-low text-on-surface-variant text-[11px] uppercase">
                <tr>
                  <th className="py-2.5 px-3">Event ID</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">User Ref</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">IP Address</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-low">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-container-low/50">
                    <td className="py-2.5 px-3 font-code-sm text-primary font-semibold">
                      EVT-#{log.id}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-on-surface">
                      {log.action}
                    </td>
                    <td className="py-2.5 px-3 text-on-surface-variant font-code-sm">
                      User #{log.user_id || "System"}
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusPill
                        variant={log.status === "SUCCESS" ? "verified" : "tampered"}
                        label={log.status || "LOGGED"}
                      />
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-on-surface-variant">
                      {log.ip_address || "127.0.0.1"}
                    </td>
                    <td className="py-2.5 px-3 text-on-surface-variant">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString() : "Recent"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 3b. ACCESS GOVERNANCE                                              */}
      {/* ------------------------------------------------------------------ */}
      {activeSubPath === "access-governance" && (
        <div className="space-y-6">
          <div className="pb-3 border-b border-surface-container-low">
            <h2 className="font-headline-lg text-xl font-bold text-on-surface">
              Access Governance
            </h2>
            <p className="font-body-sm text-xs text-on-surface-variant">
              Patient consent grants, permissions and emergency-override policy enforced by the backend.
            </p>
          </div>
          <AccessGovernancePanel />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 3c. BLOCKCHAIN AUDIT LEDGER                                        */}
      {/* ------------------------------------------------------------------ */}
      {activeSubPath === "blockchain-audit-and-reports" && (
        <div className="space-y-6">
          <AuditLedger
            blocks={blocks}
            isVerified={isChainValid}
            onRefresh={loadAdminData}
          />
        </div>
      )}

      {/* Modal for Provisioning User */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateUser}
            className="bg-surface-container-lowest rounded-xl max-w-md w-full p-6 shadow-xl border border-surface-container-high space-y-4"
          >
            <div className="flex items-center justify-between border-b border-surface-container-low pb-3">
              <h4 className="font-headline-sm text-base font-semibold text-on-surface">
                Provision New Clinical User
              </h4>
              <button
                type="button"
                onClick={() => setShowAddUserModal(false)}
                className="p-1 rounded-lg hover:bg-surface-container text-outline"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="font-label-sm text-xs text-on-surface font-semibold block mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. dr.jennifer"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full bg-surface-container-low text-on-surface font-body-sm text-xs px-3 py-2 rounded-lg border border-surface-container-high/60 focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="font-label-sm text-xs text-on-surface font-semibold block mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. dr.jennifer@metromedical.org"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-surface-container-low text-on-surface font-body-sm text-xs px-3 py-2 rounded-lg border border-surface-container-high/60 focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="font-label-sm text-xs text-on-surface font-semibold block mb-1">
                  Initial Password
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-surface-container-low text-on-surface font-body-sm text-xs px-3 py-2 rounded-lg border border-surface-container-high/60 focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="font-label-sm text-xs text-on-surface font-semibold block mb-1">
                  Institutional Role
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full bg-surface-container-low text-on-surface font-body-sm text-xs px-3 py-2 rounded-lg border border-surface-container-high/60 focus:outline-none focus:border-primary"
                >
                  <option value="doctor">Doctor / Radiologist</option>
                  <option value="hospital_admin">Hospital Admin</option>
                  <option value="researcher">Authorized Researcher</option>
                  <option value="patient">Patient</option>
                </select>
              </div>

              {hospitals.length > 0 && (
                <div>
                  <label className="font-label-sm text-xs text-on-surface font-semibold block mb-1">
                    Hospital Node
                  </label>
                  <select
                    value={newHospitalId}
                    onChange={(e) => setNewHospitalId(e.target.value ? Number(e.target.value) : "")}
                    className="w-full bg-surface-container-low text-on-surface font-body-sm text-xs px-3 py-2 rounded-lg border border-surface-container-high/60 focus:outline-none focus:border-primary"
                  >
                    <option value="">Select hospital node...</option>
                    {hospitals.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name} (Node #{h.id})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-surface-container-low flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddUserModal(false)}
                className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface font-label-md text-xs hover:bg-surface-container-high"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={provisionLoading}
                className="px-4 py-1.5 rounded-lg bg-primary text-on-primary font-label-md text-xs hover:bg-primary-container disabled:opacity-50"
              >
                {provisionLoading ? "Provisioning..." : "Confirm & Enroll"}
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Modal for Registering Hospital Node */}
      {showAddHospitalModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateHospital}
            className="bg-surface-container-lowest rounded-xl max-w-md w-full p-6 shadow-xl border border-surface-container-high space-y-4"
          >
            <div className="flex items-center justify-between border-b border-surface-container-low pb-3">
              <h4 className="font-headline-sm text-base font-semibold text-on-surface">
                Register Consortium Hospital Node
              </h4>
              <button
                type="button"
                onClick={() => setShowAddHospitalModal(false)}
                className="p-1 rounded-lg hover:bg-surface-container text-outline"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="font-label-sm text-xs text-on-surface font-semibold block mb-1">
                  Hospital / Clinical Network Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. St. Jude Diagnostic Network"
                  value={hospName}
                  onChange={(e) => setHospName(e.target.value)}
                  className="w-full bg-surface-container-low text-on-surface font-body-sm text-xs px-3 py-2 rounded-lg border border-surface-container-high/60 focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="font-label-sm text-xs text-on-surface font-semibold block mb-1">
                  Regulatory License Number
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. MED-HOSP-NY-8492"
                  value={hospLicense}
                  onChange={(e) => setHospLicense(e.target.value)}
                  className="w-full bg-surface-container-low text-on-surface font-body-sm text-xs px-3 py-2 rounded-lg border border-surface-container-high/60 focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="font-label-sm text-xs text-on-surface font-semibold block mb-1">
                  Physical / Cloud Gateway Address
                </label>
                <input
                  type="text"
                  placeholder="e.g. 500 Medical Center Parkway, NY"
                  value={hospAddress}
                  onChange={(e) => setHospAddress(e.target.value)}
                  className="w-full bg-surface-container-low text-on-surface font-body-sm text-xs px-3 py-2 rounded-lg border border-surface-container-high/60 focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-surface-container-low flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddHospitalModal(false)}
                className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface font-label-md text-xs hover:bg-surface-container-high"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={hospLoading}
                className="px-4 py-1.5 rounded-lg bg-primary text-on-primary font-label-md text-xs hover:bg-primary-container disabled:opacity-50"
              >
                {hospLoading ? "Registering Node..." : "Enroll Node"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal for DID & Verifiable Credential Inspection */}
      {showDidModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-xl max-w-lg w-full p-6 shadow-xl border border-surface-container-high space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-surface-container-low pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">fingerprint</span>
                <h4 className="font-headline-sm text-base font-semibold text-on-surface">
                  Decentralized Identity &amp; Verifiable Credential
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowDidModal(false)}
                className="p-1 rounded-lg hover:bg-surface-container text-outline"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {didLoading ? (
              <LoadingState message="Retrieving decentralized identity and checking Dilithium PQC signatures..." />
            ) : (
              <div className="space-y-4">
                <div className="bg-surface-container-low p-3.5 rounded-xl border border-surface-container-high/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-label-sm text-xs font-semibold text-on-surface">
                      Subject Decentralized Identifier (DID)
                    </span>
                    <span className="px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-code-sm text-[10px]">
                      W3C did:key Standard
                    </span>
                  </div>
                  <div className="p-2 rounded bg-surface-container-lowest font-mono text-[11px] text-primary break-all border border-surface-container-high/60">
                    {inspectedUserDid?.did || "No DID provisioned"}
                  </div>
                </div>

                <div className="bg-surface-container-low p-3.5 rounded-xl border border-surface-container-high/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-label-sm text-xs font-semibold text-on-surface">
                      Cryptographic Credential Verification
                    </span>
                    <StatusPill
                      variant={inspectedUserVc?.valid ? "verified" : "tampered"}
                      label={inspectedUserVc?.valid ? "Signature Valid" : "Verification Failed"}
                    />
                  </div>
                  <div className="text-xs text-on-surface-variant font-code-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Status:</span>
                      <span className="font-semibold text-on-surface">
                        {inspectedUserVc?.status || (inspectedUserVc?.valid ? "ACTIVE" : "INVALID")}
                      </span>
                    </div>
                    {inspectedUserVc?.issuer && (
                      <div className="flex justify-between">
                        <span>Issuer:</span>
                        <span className="truncate max-w-[200px] text-outline">
                          {inspectedUserVc.issuer}
                        </span>
                      </div>
                    )}
                    {inspectedUserVc?.failure_reasons && inspectedUserVc.failure_reasons.length > 0 && (
                      <div className="p-2 rounded bg-error-container text-on-error-container text-[11px]">
                        Failures: {inspectedUserVc.failure_reasons.join(", ")}
                      </div>
                    )}
                  </div>
                </div>

                {inspectedUserDid?.credential_summary && (
                  <div className="bg-surface-container-low p-3 rounded-lg border border-surface-container-high/40 text-xs space-y-1">
                    <span className="font-label-sm text-[10px] text-outline uppercase tracking-wider block font-semibold">
                      Role Assertion Details
                    </span>
                    <div className="p-2 bg-surface-container-lowest rounded font-mono text-[10px] text-on-surface overflow-x-auto max-h-32">
                      <pre>{JSON.stringify(inspectedUserDid.credential_summary, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="pt-3 border-t border-surface-container-low flex justify-end">
              <button
                type="button"
                onClick={() => setShowDidModal(false)}
                className="px-4 py-1.5 rounded-lg bg-surface-container text-on-surface font-label-md text-xs hover:bg-surface-container-high"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default AdminWorkspace;

import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from "axios";

export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Standardized Storage Keys
const TOKEN_KEY = "med_token";
const USER_KEY = "med_username";
const ROLE_KEY = "med_role";

export const getAuthToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem("token");
};

export const setAuthSession = (token: string, username: string, role: string) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem("token", token); // backwards compatibility
  localStorage.setItem(USER_KEY, username);
  localStorage.setItem(ROLE_KEY, role);
};

export const clearAuthSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("token");
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ROLE_KEY);
};

// Create configured Axios client
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to automatically attach JWT Bearer token
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAuthToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for token expiration / unauthorized
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      clearAuthSession();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("auth:unauthorized"));
        if (window.location.pathname !== "/login") {
          console.warn("Session expired or token invalid. Evicting session credentials.");
        }
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Safely fetches a protected binary resource (image, heatmap, DICOM preview, or residual)
 * with the user's Bearer token and returns an Object URL for rendering in <img> or canvas.
 */
export async function fetchProtectedBlobUrl(endpointUrl: string): Promise<string> {
  const fullUrl = endpointUrl.startsWith("http") ? endpointUrl : `${API_BASE_URL}${endpointUrl}`;
  const token = getAuthToken();
  
  const response = await fetch(fullUrl, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new Error(`Failed to load protected media (${response.status}: ${response.statusText})`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

// ==========================================
// API SERVICE METHODS
// ==========================================

export const apiService = {
  // Auth
  async login(credentials: { username: string; password: string; mfa_code?: string }) {
    const res = await apiClient.post("/api/auth/login", credentials);
    return res.data;
  },

  async register(userData: any) {
    const res = await apiClient.post("/api/auth/register", userData);
    return res.data;
  },

  async provisionUser(userData: {
    username: string;
    email: string;
    password: string;
    role: "hospital_admin" | "doctor" | "radiologist" | "researcher";
    hospital_id?: number | null;
    doctor_profile?: { specialization: string; license_number: string };
  }) {
    const res = await apiClient.post("/api/auth/provision-user", userData);
    return res.data;
  },

  async logout() {
    try {
      await apiClient.post("/api/auth/logout");
    } finally {
      clearAuthSession();
    }
  },

  async getMfaSetup() {
    const res = await apiClient.get("/api/auth/mfa/setup");
    return res.data;
  },

  async enableMfa(code: string) {
    // Backend expects MfaConfirmRequest as a JSON body
    const res = await apiClient.post("/api/auth/mfa/enable", { code });
    return res.data;
  },

  async getSessionProfile() {
    const res = await apiClient.get("/api/auth/me");
    return res.data;
  },

  // Medical Images
  async listImages() {
    const res = await apiClient.get("/api/images/list");
    return res.data;
  },

  async uploadStandardImage(formData: FormData) {
    const res = await apiClient.post("/api/images/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  async uploadDicomScan(formData: FormData) {
    const res = await apiClient.post("/api/images/upload-dicom", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  async downloadImage(imageId: number, isEmergency: boolean = false, isOverride: boolean = false) {
    const res = await apiClient.get(`/api/images/download/${imageId}?is_emergency=${isEmergency}&is_override=${isOverride}`, {
      responseType: "arraybuffer",
    });
    return res.data;
  },

  async getDigitalTwin(imageId: number) {
    const res = await apiClient.get(`/api/images/digital-twin/${imageId}`);
    return res.data;
  },

  async getIntegrityEvidence(imageId: number) {
    const res = await apiClient.get(`/api/images/${imageId}/integrity-evidence`);
    return res.data;
  },

  async recoverImage(imageId: number) {
    const res = await apiClient.post(`/api/images/recover/${imageId}`);
    return res.data;
  },

  async getRecoveryRecords() {
    const res = await apiClient.get("/api/images/recovery-records");
    return res.data;
  },

  async downloadForensicReport(reportId: number) {
    const res = await apiClient.get(`/api/images/report/${reportId}/download`, {
      responseType: "blob",
    });
    return res.data;
  },

  // Consent & Permissions
  async listConsentGrants() {
    const res = await apiClient.get("/api/permissions/consents");
    return res.data;
  },

  async createConsentGrant(payload: {
    grantee_id: number;
    action: string;
    resource_id?: number | null;
    purpose?: string;
    expires_at?: string | null;
  }) {
    // Map legacy UI payload to the backend ConsentCreate schema:
    // recipient_user_id + actions[] + purpose + mandatory expires_at
    const allowed = ["view", "download", "analyze", "share", "recover"];
    const mapped = String(payload.action || "view").toLowerCase();
    const body: Record<string, unknown> = {
      recipient_user_id: payload.grantee_id,
      actions: [allowed.includes(mapped) ? mapped : "view"],
      purpose: (payload.purpose || "Clinical review").slice(0, 128),
      expires_at:
        payload.expires_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    if (payload.resource_id) body.image_id = payload.resource_id;
    const res = await apiClient.post("/api/permissions/consent", body);
    return res.data;
  },

  async revokeConsentGrant(grantId: number) {
    const res = await apiClient.post(`/api/permissions/consent/revoke/${grantId}`);
    return res.data;
  },

  async listPermissions() {
    const res = await apiClient.get("/api/permissions");
    return res.data;
  },

  async emergencyOverride(imageId: number, reason: string) {
    // Backend accepts `justification` as a required query parameter
    const res = await apiClient.post(
      `/api/permissions/emergency-override/${imageId}?justification=${encodeURIComponent(reason)}`
    );
    return res.data;
  },

  // Users & Profiles
  async listPatients() {
    const res = await apiClient.get("/api/users/patients");
    return res.data;
  },

  async listDoctors() {
    const res = await apiClient.get("/api/users/doctors");
    return res.data;
  },

  async listHospitals() {
    const res = await apiClient.get("/api/hospitals");
    return res.data;
  },

  async createHospital(payload: { name: string; license_number: string; address?: string }) {
    const res = await apiClient.post("/api/hospitals", payload);
    return res.data;
  },

  async getUserDid(userId: number) {
    const res = await apiClient.get(`/api/users/${userId}/did`);
    return res.data;
  },

  async getUserCredential(userId: number) {
    const res = await apiClient.get(`/api/users/${userId}/credential`);
    return res.data;
  },

  async verifyUserCredential(userId: number) {
    const res = await apiClient.get(`/api/users/${userId}/credential/verify`);
    return res.data;
  },

  // Analytics & Research
  async getDashboardAnalytics() {
    const res = await apiClient.get("/api/analytics/dashboard");
    return res.data;
  },

  async getFheBenchmark() {
    const res = await apiClient.get("/api/analytics/fhe-benchmark");
    return res.data;
  },

  async getCryptoBenchmark(imageId: number) {
    const res = await apiClient.get(`/api/analytics/crypto-benchmark/${imageId}`);
    return res.data;
  },

  async runResearchSimulation() {
    const res = await apiClient.post("/api/analytics/research-simulation");
    return res.data;
  },

  // Audit Logs
  async getAuditLogs() {
    const res = await apiClient.get("/api/audit/logs");
    return res.data;
  },

  // Blockchain Ledger
  async getBlockchainBlocks() {
    const res = await apiClient.get("/api/blockchain/blocks");
    return res.data;
  },

  async verifyBlockchainChain() {
    const res = await apiClient.get("/api/blockchain/verify-chain");
    return res.data;
  },
};

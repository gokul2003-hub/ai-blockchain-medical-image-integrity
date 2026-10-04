/**
 * MediSecure AI WebSocket Client Service
 * Connects to the backend /ws endpoint for live security alerts,
 * tamper detection events, scan upload confirmations, and node ledger status.
 */

import { API_BASE_URL } from "./api";

export type WebSocketConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface SecurityAlertPayload {
  event: string;
  image_id?: number;
  title?: string;
  patient_id?: number;
  modality?: string;
  risk_score?: number;
  details?: string;
  timestamp?: string;
  [key: string]: any;
}

type EventListener = (payload: SecurityAlertPayload) => void;
type StatusListener = (status: WebSocketConnectionStatus) => void;

class WebSocketService {
  private socket: WebSocket | null = null;
  private status: WebSocketConnectionStatus = "disconnected";
  private eventListeners: Map<string, Set<EventListener>> = new Map();
  private statusListeners: Set<StatusListener> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimeoutId: any = null;
  private isIntentionallyClosed = false;

  constructor() {
    this.eventListeners.set("*", new Set());
  }

  public getStatus(): WebSocketConnectionStatus {
    return this.status;
  }

  public connect(): void {
    if (typeof window === "undefined") return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isIntentionallyClosed = false;
    this.setStatus("connecting");

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    let wsHost = window.location.host;

    try {
      const parsedApiUrl = new URL(API_BASE_URL);
      const isApiSecure = parsedApiUrl.protocol === "https:";
      const targetProtocol = isApiSecure ? "wss:" : "ws:";
      const targetHost = parsedApiUrl.host;
      const wsUrl = `${targetProtocol}//${targetHost}/ws`;

      this.socket = new WebSocket(wsUrl);
    } catch {
      const fallbackUrl = `${wsProtocol}//${wsHost}/ws`;
      this.socket = new WebSocket(fallbackUrl);
    }

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus("connected");
      console.log("[MediSecure-WS] Real-time security alert pipeline connected.");
    };

    this.socket.onmessage = (event: MessageEvent) => {
      try {
        const payload: SecurityAlertPayload = JSON.parse(event.data);
        this.dispatchMessage(payload);
      } catch (err) {
        console.warn("[MediSecure-WS] Failed to parse message payload:", event.data, err);
      }
    };

    this.socket.onerror = (error) => {
      console.warn("[MediSecure-WS] Connection error:", error);
      this.setStatus("error");
    };

    this.socket.onclose = () => {
      this.socket = null;
      this.setStatus("disconnected");
      if (!this.isIntentionallyClosed) {
        this.scheduleReconnect();
      }
    };
  }

  public disconnect(): void {
    this.isIntentionallyClosed = true;
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.setStatus("disconnected");
  }

  public on(event: string, listener: EventListener): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);

    return () => {
      this.eventListeners.get(event)?.delete(listener);
    };
  }

  public onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private setStatus(status: WebSocketConnectionStatus): void {
    this.status = status;
    this.statusListeners.forEach((listener) => {
      try {
        listener(status);
      } catch (err) {
        console.error("[MediSecure-WS] Error in status listener:", err);
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn("[MediSecure-WS] Max reconnection attempts reached. Halting auto-reconnect.");
      return;
    }

    const backoffMs = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 15000);
    this.reconnectAttempts++;
    console.log(`[MediSecure-WS] Scheduling reconnect attempt ${this.reconnectAttempts} in ${backoffMs}ms...`);

    this.reconnectTimeoutId = setTimeout(() => {
      this.connect();
    }, backoffMs);
  }

  private dispatchMessage(payload: SecurityAlertPayload): void {
    // Notify specific event listeners
    if (payload.event && this.eventListeners.has(payload.event)) {
      this.eventListeners.get(payload.event)!.forEach((listener) => {
        try {
          listener(payload);
        } catch (err) {
          console.error(`[MediSecure-WS] Error in listener for ${payload.event}:`, err);
        }
      });
    }

    // Notify wildcard listeners
    this.eventListeners.get("*")?.forEach((listener) => {
      try {
        listener(payload);
      } catch (err) {
        console.error("[MediSecure-WS] Error in wildcard listener:", err);
      }
    });

    // Also dispatch to window for app-wide toasts
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("medisecure:alert", {
          detail: payload,
        })
      );
    }
  }
}

export const wsService = new WebSocketService();

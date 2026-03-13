import { getApiBaseUrl } from '$lib/config';
import { getAuthToken } from '$lib/utils/auth';

export interface SessionSummary {
  sessionId: string;
  service: string;
  firstEvent: string;
  lastEvent: string;
  durationMs: number;
  eventCount: number;
  errorCount: number;
}

export interface SessionsResponse {
  sessions: SessionSummary[];
  total: number;
}

export interface SessionEvent {
  id: string;
  time: string;
  service: string;
  level: string;
  message: string;
  metadata?: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
  sessionId?: string;
}

interface ListSessionsParams {
  projectId: string;
  from?: string;
  to?: string;
  hasErrors?: boolean;
  service?: string;
  limit?: number;
  offset?: number;
}

interface GetSessionEventsParams {
  projectId: string;
  sessionId: string;
  limit?: number;
}

class SessionsAPI {
  constructor(private getToken: () => string | null) {}

  private getHeaders(): HeadersInit {
    const token = this.getToken();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async listSessions(params: ListSessionsParams): Promise<SessionsResponse> {
    const qs = new URLSearchParams();
    qs.append('projectId', params.projectId);
    if (params.from) qs.append('from', params.from);
    if (params.to) qs.append('to', params.to);
    if (params.hasErrors !== undefined) qs.append('hasErrors', String(params.hasErrors));
    if (params.service) qs.append('service', params.service);
    if (params.limit) qs.append('limit', String(params.limit));
    if (params.offset) qs.append('offset', String(params.offset));

    const response = await fetch(`${getApiBaseUrl()}/sessions?${qs}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch sessions: ${response.statusText}`);
    }

    return response.json();
  }

  async getSessionEvents(params: GetSessionEventsParams): Promise<{ events: SessionEvent[] }> {
    const qs = new URLSearchParams();
    qs.append('projectId', params.projectId);
    if (params.limit) qs.append('limit', String(params.limit));

    const response = await fetch(
      `${getApiBaseUrl()}/sessions/${params.sessionId}/events?${qs}`,
      { headers: this.getHeaders() },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch session events: ${response.statusText}`);
    }

    return response.json();
  }
}

export const sessionsAPI = new SessionsAPI(getAuthToken);

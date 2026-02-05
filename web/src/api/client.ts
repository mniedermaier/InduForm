// API client for InduForm backend

import type { Project, ProjectResponse, ValidationReport, PolicyViolation, Zone, Conduit } from '../types/models';

const API_BASE = '/api';

// Token storage key (must match AuthContext)
const ACCESS_TOKEN_KEY = 'induform_access_token';

export interface FileInfo {
  name: string;
  path: string;
  project_name: string | null;
}

export interface ProjectResponseWithFile extends ProjectResponse {
  file_path: string;
}

// Custom error class with additional context
export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly isNetworkError: boolean;
  readonly isAuthError: boolean;
  readonly isValidationError: boolean;
  readonly validationErrors?: Array<{ field: string; message: string }>;

  constructor(options: {
    message: string;
    status?: number;
    statusText?: string;
    isNetworkError?: boolean;
    validationErrors?: Array<{ field: string; message: string }>;
  }) {
    super(options.message);
    this.name = 'ApiError';
    this.status = options.status || 0;
    this.statusText = options.statusText || '';
    this.isNetworkError = options.isNetworkError || false;
    this.isAuthError = this.status === 401;
    this.isValidationError = this.status === 422;
    this.validationErrors = options.validationErrors;
  }

  get isNotFound() {
    return this.status === 404;
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isServerError() {
    return this.status >= 500;
  }
}

// Get auth header if token exists
function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

// Event for auth errors (401)
type AuthErrorCallback = () => void;
let onAuthError: AuthErrorCallback | null = null;

export function setAuthErrorCallback(callback: AuthErrorCallback | null) {
  onAuthError = callback;
}

// Request timeout wrapper
function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 30000): Promise<Response> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new ApiError({
        message: 'Request timed out. Please check your connection and try again.',
        isNetworkError: true,
      }));
    }, timeoutMs);

    fetch(url, { ...options, signal: controller.signal })
      .then(response => {
        clearTimeout(timeoutId);
        resolve(response);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          reject(new ApiError({
            message: 'Request was cancelled.',
            isNetworkError: true,
          }));
        } else {
          reject(new ApiError({
            message: 'Unable to connect to the server. Please check your internet connection.',
            isNetworkError: true,
          }));
        }
      });
  });
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetchWithTimeout(`${API_BASE}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...options?.headers,
      },
    });
  } catch (error) {
    // Re-throw ApiErrors as-is
    if (error instanceof ApiError) {
      throw error;
    }
    // Wrap other errors
    throw new ApiError({
      message: 'Unable to connect to the server. Please check your internet connection.',
      isNetworkError: true,
    });
  }

  if (!response.ok) {
    // Handle 401 Unauthorized - trigger auth error callback
    if (response.status === 401 && onAuthError) {
      onAuthError();
    }

    const errorBody = await response.json().catch(() => ({ detail: response.statusText }));

    // Parse error.detail which can be a string or array of validation errors
    let errorMessage = 'API request failed';
    let validationErrors: Array<{ field: string; message: string }> | undefined;

    if (typeof errorBody.detail === 'string') {
      errorMessage = errorBody.detail;
    } else if (Array.isArray(errorBody.detail)) {
      // FastAPI validation errors come as array of {loc, msg, type}
      const errors = errorBody.detail.map((e: { loc?: string[]; msg?: string }) => ({
        field: e.loc ? e.loc.join('.') : 'unknown',
        message: e.msg || 'Validation error',
      }));
      validationErrors = errors;
      errorMessage = errors.map((e: { field: string; message: string }) => e.message).join('; ');
    } else if (errorBody.detail) {
      errorMessage = JSON.stringify(errorBody.detail);
    } else if (errorBody.message) {
      errorMessage = errorBody.message;
    }

    // Provide user-friendly messages for common errors
    if (response.status === 401) {
      errorMessage = 'Your session has expired. Please log in again.';
    } else if (response.status === 403) {
      errorMessage = 'You do not have permission to perform this action.';
    } else if (response.status === 404) {
      errorMessage = errorMessage || 'The requested resource was not found.';
    } else if (response.status >= 500) {
      errorMessage = 'The server encountered an error. Please try again later.';
    }

    throw new ApiError({
      message: errorMessage,
      status: response.status,
      statusText: response.statusText,
      validationErrors,
    });
  }

  return response.json();
}

export const api = {
  // File management
  async listFiles(): Promise<FileInfo[]> {
    return fetchJson('/files');
  },

  async getCurrentFile(): Promise<FileInfo> {
    return fetchJson('/files/current');
  },

  async openFile(fileInfo: FileInfo): Promise<ProjectResponseWithFile> {
    return fetchJson('/files/open', {
      method: 'POST',
      body: JSON.stringify(fileInfo),
    });
  },

  async newFile(filename: string): Promise<ProjectResponseWithFile> {
    return fetchJson('/files/new', {
      method: 'POST',
      body: JSON.stringify({ filename }),
    });
  },

  async saveAs(project: Project, filename: string): Promise<{ status: string; path: string; filename: string }> {
    return fetchJson('/files/save-as', {
      method: 'POST',
      body: JSON.stringify({ ...project, filename }),
    });
  },

  // Project operations
  async getProject(): Promise<ProjectResponseWithFile> {
    return fetchJson<ProjectResponseWithFile>('/project');
  },

  async saveProject(project: Project): Promise<{ status: string; path: string }> {
    return fetchJson('/project', {
      method: 'POST',
      body: JSON.stringify(project),
    });
  },

  // Validation
  async validate(project: Project): Promise<ValidationReport> {
    return fetchJson('/validate', {
      method: 'POST',
      body: JSON.stringify(project),
    });
  },

  async checkPolicies(project: Project): Promise<PolicyViolation[]> {
    return fetchJson('/policies', {
      method: 'POST',
      body: JSON.stringify(project),
    });
  },

  // Zone CRUD
  async listZones(): Promise<Zone[]> {
    return fetchJson('/zones');
  },

  async getZone(zoneId: string): Promise<Zone> {
    return fetchJson(`/zones/${zoneId}`);
  },

  async createZone(zone: Zone): Promise<Zone> {
    return fetchJson('/zones', {
      method: 'POST',
      body: JSON.stringify(zone),
    });
  },

  async updateZone(zoneId: string, zone: Zone): Promise<Zone> {
    return fetchJson(`/zones/${zoneId}`, {
      method: 'PUT',
      body: JSON.stringify(zone),
    });
  },

  async deleteZone(zoneId: string): Promise<{ status: string }> {
    return fetchJson(`/zones/${zoneId}`, {
      method: 'DELETE',
    });
  },

  // Conduit CRUD
  async listConduits(): Promise<Conduit[]> {
    return fetchJson('/conduits');
  },

  async getConduit(conduitId: string): Promise<Conduit> {
    return fetchJson(`/conduits/${conduitId}`);
  },

  async createConduit(conduit: Conduit): Promise<Conduit> {
    return fetchJson('/conduits', {
      method: 'POST',
      body: JSON.stringify(conduit),
    });
  },

  async updateConduit(conduitId: string, conduit: Conduit): Promise<Conduit> {
    return fetchJson(`/conduits/${conduitId}`, {
      method: 'PUT',
      body: JSON.stringify(conduit),
    });
  },

  async deleteConduit(conduitId: string): Promise<{ status: string }> {
    return fetchJson(`/conduits/${conduitId}`, {
      method: 'DELETE',
    });
  },

  // Generators
  async generate(
    project: Project,
    generator: 'firewall' | 'vlan' | 'report',
    options: Record<string, unknown> = {}
  ): Promise<{ generator: string; content: unknown }> {
    return fetchJson('/generate', {
      method: 'POST',
      body: JSON.stringify({
        ...project,
        generator,
        options,
      }),
    });
  },

  // Schema
  async getSchema(model: 'project' | 'zone' | 'conduit' | 'asset'): Promise<Record<string, unknown>> {
    return fetchJson(`/schema/${model}`);
  },

  // Risk Assessment
  async assessRisk(project: Project): Promise<RiskAssessment> {
    return fetchJson('/risk', {
      method: 'POST',
      body: JSON.stringify(project),
    });
  },

  // Templates
  async listTemplates(options?: { includeBuiltin?: boolean; includePublic?: boolean; category?: string }): Promise<TemplateInfo[]> {
    const params = new URLSearchParams();
    if (options?.includeBuiltin !== undefined) {
      params.set('include_builtin', String(options.includeBuiltin));
    }
    if (options?.includePublic !== undefined) {
      params.set('include_public', String(options.includePublic));
    }
    if (options?.category) {
      params.set('category', options.category);
    }
    const query = params.toString();
    return fetchJson(`/templates/${query ? `?${query}` : ''}`);
  },

  async getTemplate(templateId: string): Promise<TemplateDetail> {
    return fetchJson(`/templates/${templateId}`);
  },

  async createTemplate(data: CreateTemplateRequest): Promise<TemplateInfo> {
    return fetchJson('/templates/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateTemplate(templateId: string, data: { name?: string; description?: string; category?: string; is_public?: boolean }): Promise<TemplateInfo> {
    return fetchJson(`/templates/${templateId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteTemplate(templateId: string): Promise<{ message: string }> {
    return fetchJson(`/templates/${templateId}`, {
      method: 'DELETE',
    });
  },

  // Version History
  async listVersions(projectId: string, skip = 0, limit = 50): Promise<VersionSummary[]> {
    return fetchJson(`/projects/${projectId}/versions/?skip=${skip}&limit=${limit}`);
  },

  async getVersionCount(projectId: string): Promise<{ count: number }> {
    return fetchJson(`/projects/${projectId}/versions/count`);
  },

  async getVersion(projectId: string, versionId: string): Promise<VersionDetail> {
    return fetchJson(`/projects/${projectId}/versions/${versionId}`);
  },

  async createVersion(projectId: string, description?: string): Promise<VersionSummary> {
    return fetchJson(`/projects/${projectId}/versions/`, {
      method: 'POST',
      body: JSON.stringify({ description }),
    });
  },

  async restoreVersion(projectId: string, versionId: string): Promise<VersionSummary> {
    return fetchJson(`/projects/${projectId}/versions/${versionId}/restore`, {
      method: 'POST',
    });
  },

  async compareVersions(projectId: string, versionAId: string, versionBId: string): Promise<VersionDiff> {
    return fetchJson(`/projects/${projectId}/versions/${versionAId}/compare/${versionBId}`);
  },
};

// Risk Assessment types
export interface RiskFactors {
  sl_base_risk: number;
  asset_criticality_risk: number;
  exposure_risk: number;
  sl_gap_risk: number;
}

export interface ZoneRisk {
  score: number;
  level: 'critical' | 'high' | 'medium' | 'low' | 'minimal';
  factors: RiskFactors;
}

export interface RiskAssessment {
  zone_risks: Record<string, ZoneRisk>;
  overall_score: number;
  overall_level: 'critical' | 'high' | 'medium' | 'low' | 'minimal';
  recommendations: string[];
}

export interface TemplateInfo {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  owner_id: string;
  owner_username: string | null;
  is_public: boolean;
  is_builtin: boolean;
  zone_count: number;
  asset_count: number;
  conduit_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface TemplateDetail extends TemplateInfo {
  project: Project;
}

export interface CreateTemplateRequest {
  project_id: string;
  name: string;
  description?: string;
  category?: string;
  is_public?: boolean;
}

// Version History types
export interface VersionSummary {
  id: string;
  version_number: number;
  created_by: string;
  created_by_username: string | null;
  created_at: string;
  description: string | null;
}

export interface VersionDetail extends VersionSummary {
  snapshot: Record<string, unknown>;
}

export interface VersionDiff {
  zones: {
    added: Array<{ id: string; name: string; type: string; security_level_target: number }>;
    removed: Array<{ id: string; name: string; type: string; security_level_target: number }>;
    modified: Array<{ id: string; name: string; changes: Record<string, { from: unknown; to: unknown }> }>;
  };
  assets: {
    added: Array<{ zone_id: string; id: string; name: string; type: string }>;
    removed: Array<{ zone_id: string; id: string; name: string; type: string }>;
    modified: Array<{ zone_id: string; id: string; name: string; changes: Record<string, { from: unknown; to: unknown }> }>;
  };
  conduits: {
    added: Array<{ id: string; from_zone: string; to_zone: string }>;
    removed: Array<{ id: string; from_zone: string; to_zone: string }>;
    modified: Array<{ id: string; changes: Record<string, { from: unknown; to: unknown }> }>;
  };
  summary: Record<string, number>;
}

// API client for InduForm backend

import type { Project, ProjectResponse, ValidationReport, PolicyViolation, Zone, Conduit, Vulnerability, VulnerabilitySummary, GapAnalysisReport, MetricsDataPoint, AnalyticsSummary } from '../types/models';

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

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

// Comment type for API responses
export interface Comment {
  id: string;
  project_id: string;
  entity_type: string;
  entity_id: string;
  author_id: string;
  author_username: string | null;
  author_display_name: string | null;
  text: string;
  is_resolved: boolean;
  resolved_by: string | null;
  resolver_username: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectAccess {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_username: string | null;
  team_id: string | null;
  team_name: string | null;
  permission: string;
  granted_at: string;
}

export interface Team {
  id: string;
  name: string;
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

  // Attack Path Analysis
  async analyzeAttackPaths(project: Project): Promise<AttackPathAnalysis> {
    return fetchJson('/attack-paths', {
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

  // Vulnerabilities
  async listVulnerabilities(projectId: string, options?: { severity?: string; status?: string; zone_id?: string }): Promise<Vulnerability[]> {
    const params = new URLSearchParams();
    if (options?.severity) params.set('severity', options.severity);
    if (options?.status) params.set('vuln_status', options.status);
    if (options?.zone_id) params.set('zone_id', options.zone_id);
    const query = params.toString();
    return fetchJson(`/projects/${projectId}/vulnerabilities${query ? `?${query}` : ''}`);
  },

  async createVulnerability(projectId: string, zoneId: string, assetId: string, data: {
    cve_id: string;
    title: string;
    description?: string;
    severity: string;
    cvss_score?: number;
    status?: string;
  }): Promise<Vulnerability> {
    return fetchJson(`/projects/${projectId}/zones/${zoneId}/assets/${assetId}/vulnerabilities`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateVulnerability(projectId: string, vulnId: string, data: {
    status?: string;
    mitigation_notes?: string;
    severity?: string;
    cvss_score?: number;
    title?: string;
    description?: string;
  }): Promise<Vulnerability> {
    return fetchJson(`/projects/${projectId}/vulnerabilities/${vulnId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteVulnerability(projectId: string, vulnId: string): Promise<void> {
    return fetchJson(`/projects/${projectId}/vulnerabilities/${vulnId}`, {
      method: 'DELETE',
    });
  },

  async getVulnerabilitySummary(projectId: string): Promise<VulnerabilitySummary> {
    return fetchJson(`/projects/${projectId}/vulnerability-summary`);
  },

  // CVE Auto-Scan
  async lookupCve(projectId: string, cveId: string): Promise<CveLookupResponse> {
    return fetchJson(`/projects/${projectId}/cve-lookup/${cveId}`);
  },

  async scanAssetCves(projectId: string, zoneId: string, assetId: string): Promise<AssetScanResponse> {
    return fetchJson(`/projects/${projectId}/zones/${zoneId}/assets/${assetId}/scan-cves`, {
      method: 'POST',
    });
  },

  async scanAllCves(projectId: string): Promise<ScanStatusResponse> {
    return fetchJson(`/projects/${projectId}/scan-all-cves`, {
      method: 'POST',
    });
  },

  async getScanStatus(projectId: string, jobId: string): Promise<ScanStatusResponse> {
    return fetchJson(`/projects/${projectId}/scan-status/${jobId}`);
  },

  async exportAssetsCsv(projectId: string): Promise<Blob> {
    const token = localStorage.getItem('induform_access_token');
    const response = await fetch(`${API_BASE}/projects/${projectId}/export/assets-csv`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) throw new ApiError({ message: 'Failed to export assets CSV', status: response.status });
    return response.blob();
  },

  async downloadAssetsCsvTemplate(projectId: string): Promise<Blob> {
    const token = localStorage.getItem('induform_access_token');
    const response = await fetch(`${API_BASE}/projects/${projectId}/export/assets-csv-template`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) throw new ApiError({ message: 'Failed to download template', status: response.status });
    return response.blob();
  },

  // Admin
  async adminListProjects(options?: { skip?: number; limit?: number; search?: string }): Promise<AdminProject[]> {
    const params = new URLSearchParams();
    if (options?.skip !== undefined) params.set('skip', String(options.skip));
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    if (options?.search) params.set('search', options.search);
    const query = params.toString();
    return fetchJson(`/admin/projects${query ? `?${query}` : ''}`);
  },

  async adminArchiveProject(projectId: string, isArchived: boolean): Promise<AdminProject> {
    return fetchJson(`/admin/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_archived: isArchived }),
    });
  },

  async adminDeleteProject(projectId: string): Promise<void> {
    return fetchJson(`/admin/projects/${projectId}`, {
      method: 'DELETE',
    });
  },

  async adminListActivity(options?: { skip?: number; limit?: number; action?: string; user_id?: string }): Promise<AdminActivity[]> {
    const params = new URLSearchParams();
    if (options?.skip !== undefined) params.set('skip', String(options.skip));
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    if (options?.action) params.set('action', options.action);
    if (options?.user_id) params.set('user_id', options.user_id);
    const query = params.toString();
    return fetchJson(`/admin/activity${query ? `?${query}` : ''}`);
  },

  // Admin - enhanced
  async adminGetHealth(): Promise<AdminHealth> {
    return fetchJson('/admin/health');
  },

  async adminListSessions(): Promise<AdminSession[]> {
    return fetchJson('/admin/sessions');
  },

  async adminForceLogout(userId: string): Promise<void> {
    await fetchJson(`/admin/sessions/${userId}/revoke-all`, { method: 'POST' });
  },

  async adminTransferProject(projectId: string, newOwnerId: string): Promise<AdminProject> {
    return fetchJson(`/admin/projects/${projectId}/transfer`, {
      method: 'PATCH',
      body: JSON.stringify({ new_owner_id: newOwnerId }),
    });
  },

  async adminExportActivityCSV(): Promise<Blob> {
    const token = localStorage.getItem('induform_access_token');
    const response = await fetch(`${API_BASE}/admin/activity/export`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) throw new ApiError({ message: 'Failed to export activity CSV', status: response.status });
    return response.blob();
  },

  async adminBulkUpdateUsers(userIds: string[], updates: { is_active?: boolean; is_admin?: boolean }): Promise<{ updated_count: number }> {
    return fetchJson('/admin/users/bulk-update', {
      method: 'POST',
      body: JSON.stringify({ user_ids: userIds, ...updates }),
    });
  },

  async adminListLoginHistory(options?: { skip?: number; limit?: number; user_id?: string; success?: string }): Promise<AdminLoginAttempt[]> {
    const params = new URLSearchParams();
    if (options?.skip !== undefined) params.set('skip', String(options.skip));
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    if (options?.user_id) params.set('user_id', options.user_id);
    if (options?.success) params.set('success', options.success);
    const query = params.toString();
    return fetchJson(`/admin/login-history${query ? `?${query}` : ''}`);
  },

  async adminListUsers(options?: { skip?: number; limit?: number }): Promise<AdminUser[]> {
    const params = new URLSearchParams();
    if (options?.skip !== undefined) params.set('skip', String(options.skip));
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    const query = params.toString();
    return fetchJson(`/admin/users${query ? `?${query}` : ''}`);
  },

  // Password reset
  async forgotPassword(email: string): Promise<{ message: string; reset_token?: string }> {
    return fetchJson('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    return fetchJson('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password: newPassword }),
    });
  },

  // Gap Analysis
  async getGapAnalysis(projectId: string): Promise<GapAnalysisReport> {
    return fetchJson(`/projects/${projectId}/gap-analysis`);
  },

  // Analytics
  async getProjectAnalytics(projectId: string, days = 30): Promise<MetricsDataPoint[]> {
    return fetchJson(`/projects/${projectId}/analytics?days=${days}`);
  },

  async getAnalyticsSummary(projectId: string, days = 30): Promise<AnalyticsSummary> {
    return fetchJson(`/projects/${projectId}/analytics/summary?days=${days}`);
  },

  // Comments
  async listComments(projectId: string, options?: { entity_type?: string; entity_id?: string; include_resolved?: boolean }): Promise<Comment[]> {
    const params = new URLSearchParams();
    if (options?.entity_type) params.set('entity_type', options.entity_type);
    if (options?.entity_id) params.set('entity_id', options.entity_id);
    if (options?.include_resolved !== undefined) params.set('include_resolved', String(options.include_resolved));
    const query = params.toString();
    return fetchJson(`/projects/${projectId}/comments/${query ? `?${query}` : ''}`);
  },

  async createComment(projectId: string, data: { entity_type: string; entity_id: string; text: string }): Promise<Comment> {
    return fetchJson(`/projects/${projectId}/comments/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateComment(projectId: string, commentId: string, text: string): Promise<Comment> {
    return fetchJson(`/projects/${projectId}/comments/${commentId}`, {
      method: 'PUT',
      body: JSON.stringify({ text }),
    });
  },

  async deleteComment(projectId: string, commentId: string): Promise<void> {
    return fetchJson(`/projects/${projectId}/comments/${commentId}`, {
      method: 'DELETE',
    });
  },

  async resolveComment(projectId: string, commentId: string): Promise<Comment> {
    return fetchJson(`/projects/${projectId}/comments/${commentId}/resolve`, {
      method: 'POST',
    });
  },

  async unresolveComment(projectId: string, commentId: string): Promise<Comment> {
    return fetchJson(`/projects/${projectId}/comments/${commentId}/unresolve`, {
      method: 'POST',
    });
  },

  // Project access/sharing
  async listProjectAccess(projectId: string): Promise<ProjectAccess[]> {
    return fetchJson(`/projects/${projectId}/access`);
  },

  async grantAccess(projectId: string, data: { user_id?: string; team_id?: string; permission: string }): Promise<ProjectAccess> {
    return fetchJson(`/projects/${projectId}/access`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async revokeAccess(projectId: string, accessId: string): Promise<void> {
    return fetchJson(`/projects/${projectId}/access/${accessId}`, {
      method: 'DELETE',
    });
  },

  // Teams
  async listTeams(): Promise<Team[]> {
    return fetchJson('/teams/');
  },
};

// Risk Assessment types
export interface RiskFactors {
  sl_base_risk: number;
  asset_criticality_risk: number;
  exposure_risk: number;
  sl_gap_risk: number;
  vulnerability_risk: number;
}

export interface CveLookupResponse {
  cve_id: string;
  title: string;
  description: string | null;
  severity: string;
  cvss_score: number | null;
}

export interface AssetScanResponse {
  asset_id: string;
  asset_name: string;
  cves_found: number;
  cves_created: number;
  cves_skipped: number;
  vulnerabilities: Vulnerability[];
}

export interface ScanStatusResponse {
  job_id: string;
  status: string;
  total_assets: number;
  assets_scanned: number;
  total_cves_found: number;
  total_cves_created: number;
  errors: string[];
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

// Attack Path Analysis types
export interface ConduitWeakness {
  weakness_type: string;
  description: string;
  remediation: string;
  severity_contribution: number;
}

export interface AttackPathStep {
  conduit_id: string;
  from_zone_id: string;
  from_zone_name: string;
  to_zone_id: string;
  to_zone_name: string;
  traversal_cost: number;
  weaknesses: ConduitWeakness[];
}

export interface AttackPath {
  id: string;
  entry_zone_id: string;
  entry_zone_name: string;
  target_zone_id: string;
  target_zone_name: string;
  target_reason: string;
  steps: AttackPathStep[];
  total_cost: number;
  risk_score: number;
  risk_level: string;
  zone_ids: string[];
  conduit_ids: string[];
}

export interface AttackPathAnalysis {
  paths: AttackPath[];
  entry_points: string[];
  high_value_targets: string[];
  summary: string;
  counts: Record<string, number>;
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

// Admin types
export interface AdminProject {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  owner_username: string;
  is_archived: boolean;
  zone_count: number;
  conduit_count: number;
  asset_count: number;
  risk_score: number | null;
  compliance_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface AdminActivity {
  id: string;
  user_id: string;
  username: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  project_id: string;
  project_name: string | null;
  details: string | null;
  created_at: string;
}

export interface AdminHealth {
  db_status: string;
  uptime_seconds: number;
  table_counts: Record<string, number>;
}

export interface AdminSession {
  user_id: string;
  username: string;
  display_name: string | null;
  is_active: boolean;
  last_login_at: string | null;
}

export interface AdminLoginAttempt {
  id: string;
  user_id: string | null;
  username_attempted: string;
  ip_address: string | null;
  success: boolean;
  failure_reason: string | null;
  created_at: string;
}

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  display_name: string | null;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  project_count: number;
}

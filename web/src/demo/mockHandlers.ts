// MSW request handlers for demo mode

import { http, HttpResponse } from 'msw';
import {
  DEMO_USER,
  DEMO_USERS,
  DEMO_PROJECT_ID,
  DEMO_PROJECT,
  DEMO_PROJECT_2,
  DEMO_VALIDATION,
  DEMO_POLICY_VIOLATIONS,
  DEMO_RISK,
  DEMO_ATTACK_PATHS,
  DEMO_VULN_SUMMARY,
  DEMO_VULNERABILITIES,
  DEMO_GAP_ANALYSIS,
  DEMO_ANALYTICS,
  DEMO_ANALYTICS_SUMMARY,
  DEMO_VERSIONS,
  DEMO_ACTIVITY,
  DEMO_NOTIFICATIONS,
  DEMO_PROJECT_LIST,
  DEMO_ADMIN_STATS,
  DEMO_ADMIN_HEALTH,
  DEMO_ADMIN_SESSIONS,
  DEMO_LOGIN_HISTORY,
  DEMO_ADMIN_USERS,
} from './mockData';

// Map project IDs to their data for multi-project support
const projectMap: Record<string, { project: typeof DEMO_PROJECT; validation: typeof DEMO_VALIDATION; policy: typeof DEMO_POLICY_VIOLATIONS }> = {
  [DEMO_PROJECT_ID]: { project: DEMO_PROJECT, validation: DEMO_VALIDATION, policy: DEMO_POLICY_VIOLATIONS },
  'demo-project-002': {
    project: DEMO_PROJECT_2,
    validation: { valid: true, results: [
      { severity: 'warning' as const, code: 'SL_GAP', message: 'Substation LAN: capability (SL 2) below target (SL 3).', location: 'p2-zone-substation', recommendation: 'Deploy IEC 62351 security extensions.' },
      { severity: 'info' as const, code: 'NERC_CIP', message: 'NERC CIP compliance assessment requires ESP boundary definition.', location: 'global' },
    ], error_count: 0, warning_count: 1, info_count: 1 },
    policy: [
      { rule_id: 'POL-001', rule_name: 'Minimum Security Level', severity: 'high' as const, message: 'Substation LAN SL gap (target 3, capability 2).', affected_entities: ['p2-zone-substation'], remediation: 'Enable IEC 62351 on all IEC 61850 communication.' },
    ],
  },
};

export const handlers = [
  // ── Auth ──────────────────────────────────────────────
  http.get('/api/auth/me', () => HttpResponse.json(DEMO_USER)),

  http.post('/api/auth/login', () =>
    HttpResponse.json({
      access_token: 'demo-access-token',
      refresh_token: 'demo-refresh-token',
      token_type: 'bearer',
      expires_in: 86400,
    }),
  ),

  http.post('/api/auth/refresh', () =>
    HttpResponse.json({
      access_token: 'demo-access-token',
      refresh_token: 'demo-refresh-token',
      token_type: 'bearer',
      expires_in: 86400,
    }),
  ),

  http.post('/api/auth/register', () =>
    HttpResponse.json(DEMO_USER, { status: 201 }),
  ),

  http.post('/api/auth/logout', () =>
    new HttpResponse(null, { status: 204 }),
  ),

  http.post('/api/auth/revoke-all-sessions', () =>
    new HttpResponse(null, { status: 204 }),
  ),

  http.post('/api/auth/change-password', () =>
    new HttpResponse(null, { status: 204 }),
  ),

  http.post('/api/auth/forgot-password', () =>
    HttpResponse.json({
      message: 'If the email exists, a reset link has been generated.',
      reset_token: 'demo-reset-token',
    }),
  ),

  http.post('/api/auth/reset-password', () =>
    HttpResponse.json({ message: 'Password has been reset successfully' }),
  ),

  http.put('/api/auth/me', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ...DEMO_USER, ...body });
  }),

  // ── Projects ──────────────────────────────────────────
  http.get('/api/projects/', () => HttpResponse.json(DEMO_PROJECT_LIST)),

  http.get('/api/projects/:id', ({ params }) => {
    const entry = projectMap[params.id as string];
    if (!entry) {
      return HttpResponse.json({ detail: 'Not found' }, { status: 404 });
    }
    return HttpResponse.json({
      project: entry.project,
      validation: entry.validation,
      policy_violations: entry.policy,
      permission: 'owner',
    });
  }),

  http.put('/api/projects/:id', async ({ params, request }) => {
    const body = await request.json();
    const id = params.id as string;
    // Persist the saved project so subsequent GETs return updated data
    const entry = projectMap[id];
    if (entry) {
      entry.project = body as typeof entry.project;
    }
    return HttpResponse.json({ project: body, status: 'saved' });
  }),

  http.post('/api/projects/', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      id: 'demo-new-' + Date.now(),
      name: body.name,
      description: body.description,
      owner_id: DEMO_USER.id,
      owner_username: DEMO_USER.username,
      permission: 'owner',
      zone_count: 0,
      conduit_count: 0,
      asset_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }),

  http.post('/api/projects/:id/archive', () =>
    HttpResponse.json({ status: 'archived' }),
  ),

  http.post('/api/projects/:id/restore', () =>
    HttpResponse.json({ status: 'restored' }),
  ),

  http.post('/api/projects/:id/duplicate', () =>
    HttpResponse.json({
      id: 'demo-dup-' + Date.now(),
      name: 'Copy of Project',
      description: '',
      owner_id: DEMO_USER.id,
      owner_username: DEMO_USER.username,
      permission: 'owner',
      zone_count: 0,
      conduit_count: 0,
      asset_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  ),

  http.patch('/api/projects/:id', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json(body);
  }),

  http.delete('/api/projects/:id', () =>
    new HttpResponse(null, { status: 204 }),
  ),

  // ── Validation & Policies ─────────────────────────────
  http.post('/api/validate', () => HttpResponse.json(DEMO_VALIDATION)),
  http.post('/api/policies', () => HttpResponse.json(DEMO_POLICY_VIOLATIONS)),
  http.post('/api/risk', () => HttpResponse.json(DEMO_RISK)),
  http.post('/api/attack-paths', () => HttpResponse.json(DEMO_ATTACK_PATHS)),

  // ── Versions ──────────────────────────────────────────
  http.get('/api/projects/:id/versions/', () => HttpResponse.json(DEMO_VERSIONS)),
  http.get('/api/projects/:id/versions/count', () => HttpResponse.json({ count: DEMO_VERSIONS.length })),

  // Create version snapshot
  http.post('/api/projects/:id/versions/', () =>
    HttpResponse.json({
      id: 'ver-new-' + Date.now(),
      version_number: 6,
      created_by: 'demo-user',
      created_by_username: 'demo',
      created_at: new Date().toISOString(),
      description: 'Manual snapshot (demo mode)',
    }),
  ),

  // Restore version
  http.post('/api/projects/:id/versions/:versionId/restore', () =>
    HttpResponse.json({
      id: 'ver-restored',
      version_number: 7,
      created_by: 'demo-user',
      created_by_username: 'demo',
      created_at: new Date().toISOString(),
      description: 'Restored from snapshot (demo mode)',
    }),
  ),

  // Compare versions
  http.get('/api/projects/:id/versions/:versionA/compare/:versionB', () =>
    HttpResponse.json({
      version_a: { id: 'ver-004', version_number: 4, created_at: '2026-02-10T09:15:00Z' },
      version_b: { id: 'ver-005', version_number: 5, created_at: '2026-02-15T14:30:00Z' },
      zones: {
        added: [{ id: 'zone-safety', name: 'Safety Instrumented Systems', type: 'safety' }],
        removed: [],
        modified: [{ id: 'zone-field', name: 'Field Device Network', changes: { asset_count: { old: 4, new: 5 } } }],
      },
      conduits: {
        added: [{ id: 'conduit-field-safety', name: 'Field <> Safety' }],
        removed: [],
        modified: [],
      },
      assets: {
        added: [{ id: 'asset-sis', name: 'Safety Controller', zone_name: 'Safety Instrumented Systems' }, { id: 'asset-gas', name: 'Chlorine Gas Detector', zone_name: 'Safety Instrumented Systems' }],
        removed: [],
        modified: [],
      },
    }),
  ),

  // ── Templates ─────────────────────────────────────────
  http.get('/api/templates/', () => HttpResponse.json([
    { id: 'tpl-1', name: 'IEC 62443 Starter', description: 'Basic zone/conduit template with Enterprise, DMZ, and Control zones.', category: 'industrial', owner_id: 'system', owner_username: null, is_public: true, is_builtin: true, zone_count: 3, asset_count: 5, conduit_count: 2, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
    { id: 'tpl-2', name: 'Purdue Model Reference', description: 'Full Purdue model with all 6 levels from Enterprise to Safety.', category: 'reference', owner_id: 'system', owner_username: null, is_public: true, is_builtin: true, zone_count: 6, asset_count: 12, conduit_count: 7, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
    { id: 'tpl-3', name: 'NERC CIP Substation', description: 'Template for bulk electric system substation with ESP boundaries.', category: 'energy', owner_id: 'system', owner_username: null, is_public: true, is_builtin: true, zone_count: 4, asset_count: 8, conduit_count: 4, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
  ])),

  // Create template
  http.post('/api/templates/', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      id: 'tpl-new-' + Date.now(),
      ...body,
      owner_id: 'demo-user',
      owner_username: 'demo',
      is_public: false,
      is_builtin: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }),

  // Update template
  http.put('/api/templates/:id', async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ id: params.id, ...body, updated_at: new Date().toISOString() });
  }),

  // Delete template
  http.delete('/api/templates/:id', () =>
    HttpResponse.json({ status: 'deleted' }),
  ),

  // Instantiate template (create project from template)
  http.post('/api/templates/:id/instantiate', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      id: 'demo-from-tpl-' + Date.now(),
      name: body.name || 'New Project from Template',
      description: body.description || '',
      owner_id: 'demo-user',
      owner_username: 'demo',
      permission: 'owner',
      zone_count: 3,
      conduit_count: 2,
      asset_count: 5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }),

  // ── Users & Teams ─────────────────────────────────────
  http.get('/api/users/', () => HttpResponse.json(DEMO_USERS)),
  http.get('/api/teams/', () => HttpResponse.json([
    { id: 'team-1', name: 'OT Security', members: DEMO_USERS.slice(0, 3).map(u => ({ user_id: u.id, username: u.username, display_name: u.display_name, role: 'member' })) },
  ])),

  // ── Notifications ─────────────────────────────────────
  http.get('/api/notifications/', () => HttpResponse.json(DEMO_NOTIFICATIONS)),
  http.post('/api/notifications/mark-read', () => HttpResponse.json({ status: 'ok' })),
  http.delete('/api/notifications/:id', () =>
    HttpResponse.json({ message: 'Notification deleted' }),
  ),

  // ── Activity & Search ─────────────────────────────────
  http.get('/api/activity', () => HttpResponse.json(DEMO_ACTIVITY)),
  http.get('/api/search', ({ request }) => {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').toLowerCase();
    if (!q) return HttpResponse.json([]);
    // Simple search across projects and zones
    const results: Array<{ type: string; id: string; name: string; description: string; project_id?: string; project_name?: string }> = [];
    for (const p of DEMO_PROJECT_LIST) {
      if (p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)) {
        results.push({ type: 'project', id: p.id, name: p.name, description: p.description || '' });
      }
    }
    for (const z of DEMO_PROJECT.zones) {
      if (z.name.toLowerCase().includes(q) || (z.description || '').toLowerCase().includes(q)) {
        results.push({ type: 'zone', id: z.id, name: z.name, description: z.description || '', project_id: DEMO_PROJECT_ID, project_name: DEMO_PROJECT.project.name });
      }
      for (const a of z.assets) {
        if (a.name.toLowerCase().includes(q) || (a.vendor || '').toLowerCase().includes(q) || (a.model || '').toLowerCase().includes(q)) {
          results.push({ type: 'asset', id: a.id, name: a.name, description: `${a.vendor || ''} ${a.model || ''} in ${z.name}`.trim(), project_id: DEMO_PROJECT_ID, project_name: DEMO_PROJECT.project.name });
        }
      }
    }
    return HttpResponse.json(results.slice(0, 10));
  }),

  // ── Vulnerabilities ───────────────────────────────────
  http.get('/api/projects/:id/vulnerability-summary', () =>
    HttpResponse.json(DEMO_VULN_SUMMARY),
  ),
  http.get('/api/projects/:id/vulnerabilities', () =>
    HttpResponse.json(DEMO_VULNERABILITIES),
  ),

  // Add vulnerability
  http.post('/api/projects/:id/vulnerabilities', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      id: 'vuln-new-' + Date.now(),
      ...body,
      status: body.status || 'open',
      discovered_at: new Date().toISOString(),
      reporter_username: 'demo',
    });
  }),

  // Update vulnerability
  http.patch('/api/projects/:id/vulnerabilities/:vulnId', async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      id: params.vulnId,
      ...body,
      updated_at: new Date().toISOString(),
    });
  }),

  // Delete vulnerability
  http.delete('/api/projects/:id/vulnerabilities/:vulnId', () =>
    HttpResponse.json({ status: 'deleted' }),
  ),

  // ── CVE / Vulnerability Scanning ───────────────────────
  // CVE lookup
  http.get('/api/projects/:id/cve-lookup/:cveId', ({ params }) =>
    HttpResponse.json({
      cve_id: params.cveId,
      title: `Demo vulnerability for ${params.cveId}`,
      description: 'This is a simulated CVE lookup result in demo mode.',
      severity: 'high',
      cvss_score: 7.5,
      published: '2025-06-15T00:00:00Z',
      references: ['https://nvd.nist.gov/vuln/detail/' + params.cveId],
    }),
  ),

  // Scan single asset CVEs
  http.post('/api/projects/:id/zones/:zoneId/assets/:assetId/scan-cves', ({ params }) =>
    HttpResponse.json({
      asset_id: params.assetId as string,
      asset_name: 'Demo Asset',
      cves_found: 0,
      cves_created: 0,
      cves_skipped: 0,
      vulnerabilities: [],
    }),
  ),

  // Scan all project CVEs
  http.post('/api/projects/:id/scan-all-cves', () =>
    HttpResponse.json({
      job_id: 'demo-scan-' + Date.now(),
      status: 'completed',
      total_assets: 0,
      assets_scanned: 0,
      total_cves_found: 0,
      total_cves_created: 0,
      errors: [],
    }),
  ),

  // Scan status
  http.get('/api/projects/:id/scan-status/:jobId', ({ params }) =>
    HttpResponse.json({
      job_id: params.jobId as string,
      status: 'completed',
      total_assets: 0,
      assets_scanned: 0,
      total_cves_found: 0,
      total_cves_created: 0,
      errors: [],
    }),
  ),

  // ── Nmap Import ────────────────────────────────────────
  // Nmap scan upload
  http.post('/api/projects/:id/nmap/upload', () =>
    HttpResponse.json({
      scan_id: 'demo-nmap-' + Date.now(),
      hosts_found: 5,
      filename: 'demo_scan.xml',
      message: 'Nmap import simulated in demo mode.',
    }),
  ),

  // List nmap scans
  http.get('/api/projects/:id/nmap/scans', () =>
    HttpResponse.json([
      {
        id: 'nmap-scan-1',
        filename: 'network_scan_2026-02-15.xml',
        hosts_found: 12,
        imported_count: 8,
        created_at: '2026-02-15T09:30:00Z',
      },
    ]),
  ),

  // Get scan details
  http.get('/api/projects/:id/nmap/scans/:scanId', () =>
    HttpResponse.json({
      id: 'nmap-scan-1',
      filename: 'network_scan_2026-02-15.xml',
      hosts: [
        { ip: '10.20.1.10', hostname: 'scada-server', os: 'Windows Server 2019', ports: [4840, 5678] },
        { ip: '10.30.1.10', hostname: 'intake-plc', os: 'Siemens S7', ports: [102] },
      ],
      created_at: '2026-02-15T09:30:00Z',
    }),
  ),

  // Import hosts from scan
  http.post('/api/projects/:id/nmap/scans/:scanId/import', () =>
    HttpResponse.json({
      imported_count: 3,
      skipped_count: 2,
      message: 'Nmap host import simulated in demo mode.',
    }),
  ),

  // Delete nmap scan
  http.delete('/api/projects/:id/nmap/scans/:scanId', () =>
    new HttpResponse(null, { status: 204 }),
  ),

  // ── Project access ────────────────────────────────────
  http.get('/api/projects/:id/access', () => HttpResponse.json([
    { id: 'acc-1', user_id: 'user-alice', username: 'alice.chen', display_name: 'Alice Chen', permission: 'editor', granted_at: '2026-01-20T10:00:00Z' },
    { id: 'acc-2', user_id: 'user-bob', username: 'bob.mueller', display_name: 'Bob Mueller', permission: 'editor', granted_at: '2026-01-25T14:00:00Z' },
    { id: 'acc-3', user_id: 'user-carol', username: 'carol.tanaka', display_name: 'Carol Tanaka', permission: 'viewer', granted_at: '2026-02-01T09:00:00Z' },
  ])),

  // Grant access
  http.post('/api/projects/:id/access', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      id: 'acc-new-' + Date.now(),
      user_id: body.user_id,
      permission: body.permission || 'viewer',
      granted_at: new Date().toISOString(),
    });
  }),

  // Revoke access
  http.delete('/api/projects/:id/access/:userId', () =>
    HttpResponse.json({ status: 'revoked' }),
  ),

  // ── Analytics ─────────────────────────────────────────
  http.get('/api/projects/:id/analytics', () =>
    HttpResponse.json(DEMO_ANALYTICS),
  ),
  http.get('/api/projects/:id/analytics/summary', () =>
    HttpResponse.json(DEMO_ANALYTICS_SUMMARY),
  ),
  http.get('/api/projects/:id/gap-analysis', () =>
    HttpResponse.json(DEMO_GAP_ANALYSIS),
  ),

  // ── Presence ──────────────────────────────────────────
  http.post('/api/presence/heartbeat', () => HttpResponse.json({ status: 'ok' })),
  http.get('/api/presence/:id', () => HttpResponse.json([])),
  http.delete('/api/presence/leave', () => HttpResponse.json({ status: 'ok' })),

  // ── PDF Export ──────────────────────────────────────────
  http.post('/api/projects/:id/export/pdf', () => {
    // Minimal valid PDF: single blank page with "Demo Mode" text
    const MINIMAL_PDF = 'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNjEyIDc5Ml0vQ29udGVudHMgNCAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj4+ZW5kb2JqCjQgMCBvYmo8PC9MZW5ndGggNDQ+PgpzdHJlYW0KQlQgL0YxIDI0IFRmIDEwMCA0MDAgVGQgKERlbW8gTW9kZSkgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj5lbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjY2IDAwMDAwIG4gCjAwMDAwMDAzNjAgMDAwMDAgbiAKdHJhaWxlcjw8L1NpemUgNi9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjQzMAolJUVPRg==';
    return HttpResponse.json({
      pdf_base64: MINIMAL_PDF,
      filename: 'demo_project_report.pdf',
    });
  }),

  // YAML export
  http.post('/api/projects/:id/export/yaml', () =>
    HttpResponse.json({
      yaml_content: '# Demo YAML export\nversion: "1.0"\nproject:\n  name: Water Treatment Facility\n  compliance_standards:\n    - IEC62443\n    - NIST_CSF\nzones: []\nconduits: []\n',
      filename: 'demo_project.yaml',
    }),
  ),

  // JSON export
  http.post('/api/projects/:id/export/json', () =>
    HttpResponse.json({
      json_content: JSON.stringify({ version: '1.0', project: { name: 'Water Treatment Facility' }, zones: [], conduits: [] }, null, 2),
      filename: 'demo_project.json',
    }),
  ),

  // Excel export
  http.post('/api/projects/:id/export/excel', () =>
    HttpResponse.json({
      excel_base64: 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==',
      filename: 'demo_project.xlsx',
    }),
  ),

  // CSV assets export
  http.get('/api/projects/:id/export/assets-csv', () => {
    const csv = 'zone_id,zone_name,asset_id,asset_name,asset_type,ip_address,vendor,model,criticality\nzone-enterprise,Enterprise Network,asset-erp,SAP ERP Server,server,10.0.1.5,SAP,S/4HANA,3\n';
    return HttpResponse.json({ csv_content: csv, filename: 'demo_assets.csv' });
  }),

  // CSV template
  http.get('/api/projects/:id/export/assets-csv-template', () => {
    const csv = 'zone_id,zone_name,asset_name,asset_type,ip_address,vendor,model,criticality,description\n';
    return HttpResponse.json({ csv_content: csv, filename: 'assets_template.csv' });
  }),

  // YAML import
  http.post('/api/projects/import/yaml', () =>
    HttpResponse.json({
      id: 'demo-imported-' + Date.now(),
      name: 'Imported Project (Demo)',
      message: 'YAML import simulated in demo mode.',
    }),
  ),

  // ── Comments ──────────────────────────────────────────
  http.get('/api/projects/:id/comments/', () => HttpResponse.json([
    { id: 'cmt-1', user_id: 'user-alice', username: 'alice.chen', display_name: 'Alice Chen', content: 'The SL gap on the field device network is our top priority. I\'ve requested quotes for industrial IDS from Claroty and Nozomi.', created_at: '2026-02-14T10:30:00Z', zone_id: 'zone-field', is_resolved: false },
    { id: 'cmt-2', user_id: 'user-bob', username: 'bob.mueller', display_name: 'Bob Mueller', content: 'Added firewall rules for the Modbus traffic. Still need to test Profinet Security Class 1 with the S7-1500s during the next maintenance window.', created_at: '2026-02-12T15:00:00Z', conduit_id: 'conduit-ctrl-field', is_resolved: false },
    { id: 'cmt-3', user_id: 'demo-user', username: 'demo', display_name: 'Demo User', content: 'Safety zone looks good. HIMA controller is properly isolated and the hard-wired interlocks are documented.', created_at: '2026-02-15T16:00:00Z', zone_id: 'zone-safety', is_resolved: true },
  ])),

  http.get('/api/projects/:id/comments/count', () =>
    HttpResponse.json({ total: 3, unresolved: 2 }),
  ),

  http.post('/api/projects/:id/comments/', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      id: 'cmt-new-' + Date.now(),
      user_id: DEMO_USER.id,
      username: DEMO_USER.username,
      display_name: DEMO_USER.display_name,
      ...body,
      is_resolved: false,
      created_at: new Date().toISOString(),
    }, { status: 201 });
  }),

  http.put('/api/projects/:id/comments/:commentId', async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      id: params.commentId,
      ...body,
      updated_at: new Date().toISOString(),
    });
  }),

  http.delete('/api/projects/:id/comments/:commentId', () =>
    new HttpResponse(null, { status: 204 }),
  ),

  http.post('/api/projects/:id/comments/:commentId/resolve', ({ params }) =>
    HttpResponse.json({
      id: params.commentId,
      is_resolved: true,
      resolved_at: new Date().toISOString(),
    }),
  ),

  http.post('/api/projects/:id/comments/:commentId/unresolve', ({ params }) =>
    HttpResponse.json({
      id: params.commentId,
      is_resolved: false,
      resolved_at: null,
    }),
  ),

  // ── Admin ─────────────────────────────────────────────
  http.get('/api/admin/stats', () => HttpResponse.json(DEMO_ADMIN_STATS)),
  http.get('/api/admin/projects', () => HttpResponse.json(DEMO_PROJECT_LIST.map(p => ({
    id: p.id, name: p.name, description: p.description,
    owner_id: p.owner_id, owner_username: p.owner_username,
    is_archived: p.is_archived,
    zone_count: p.zone_count, conduit_count: p.conduit_count, asset_count: p.asset_count,
    risk_score: p.risk_score, compliance_score: p.compliance_score,
    created_at: p.created_at, updated_at: p.updated_at,
  })))),
  http.get('/api/admin/activity', () => HttpResponse.json(DEMO_ACTIVITY)),
  http.get('/api/admin/health', () => HttpResponse.json(DEMO_ADMIN_HEALTH)),
  http.get('/api/admin/sessions', () => HttpResponse.json(DEMO_ADMIN_SESSIONS)),
  http.get('/api/admin/users', () => HttpResponse.json(DEMO_ADMIN_USERS)),
  http.get('/api/admin/login-history', () => HttpResponse.json(DEMO_LOGIN_HISTORY)),
  http.post('/api/admin/make-first-admin', () => HttpResponse.json({ status: 'ok' })),

  // Update admin user
  http.patch('/api/admin/users/:userId', async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ id: params.userId, ...body, updated_at: new Date().toISOString() });
  }),

  // Revoke all sessions
  http.post('/api/admin/sessions/:userId/revoke-all', () =>
    HttpResponse.json({ status: 'ok', revoked_count: 1 }),
  ),

  // Export activity
  http.get('/api/admin/activity/export', () =>
    HttpResponse.json({ csv_content: 'timestamp,user,action,entity\n2026-02-17,demo,update_project,Water Treatment\n', filename: 'activity_export.csv' }),
  ),

  // Bulk update users
  http.post('/api/admin/users/bulk-update', () =>
    HttpResponse.json({ updated_count: 0, message: 'Bulk update simulated in demo mode.' }),
  ),

  // Transfer project
  http.patch('/api/admin/projects/:id/transfer', () =>
    HttpResponse.json({ status: 'ok', message: 'Transfer simulated in demo mode.' }),
  ),

  // ── Attack Paths (DB-backed) ───────────────────────────
  http.post('/api/projects/:id/attack-paths', () =>
    HttpResponse.json(DEMO_ATTACK_PATHS),
  ),
];

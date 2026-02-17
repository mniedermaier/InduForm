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

  http.put('/api/projects/:id', async ({ request }) => {
    const body = await request.json();
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

  // ── Validation & Policies ─────────────────────────────
  http.post('/api/validate', () => HttpResponse.json(DEMO_VALIDATION)),
  http.post('/api/policies', () => HttpResponse.json(DEMO_POLICY_VIOLATIONS)),
  http.post('/api/risk', () => HttpResponse.json(DEMO_RISK)),

  // ── Versions ──────────────────────────────────────────
  http.get('/api/projects/:id/versions/', () => HttpResponse.json(DEMO_VERSIONS)),
  http.get('/api/projects/:id/versions/count', () => HttpResponse.json({ count: DEMO_VERSIONS.length })),

  // ── Templates ─────────────────────────────────────────
  http.get('/api/templates/', () => HttpResponse.json([
    { id: 'tpl-1', name: 'IEC 62443 Starter', description: 'Basic zone/conduit template with Enterprise, DMZ, and Control zones.', category: 'industrial', owner_id: 'system', owner_username: null, is_public: true, is_builtin: true, zone_count: 3, asset_count: 5, conduit_count: 2, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
    { id: 'tpl-2', name: 'Purdue Model Reference', description: 'Full Purdue model with all 6 levels from Enterprise to Safety.', category: 'reference', owner_id: 'system', owner_username: null, is_public: true, is_builtin: true, zone_count: 6, asset_count: 12, conduit_count: 7, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
    { id: 'tpl-3', name: 'NERC CIP Substation', description: 'Template for bulk electric system substation with ESP boundaries.', category: 'energy', owner_id: 'system', owner_username: null, is_public: true, is_builtin: true, zone_count: 4, asset_count: 8, conduit_count: 4, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
  ])),

  // ── Users & Teams ─────────────────────────────────────
  http.get('/api/users/', () => HttpResponse.json(DEMO_USERS)),
  http.get('/api/teams/', () => HttpResponse.json([
    { id: 'team-1', name: 'OT Security', members: DEMO_USERS.slice(0, 3).map(u => ({ user_id: u.id, username: u.username, display_name: u.display_name, role: 'member' })) },
  ])),

  // ── Notifications ─────────────────────────────────────
  http.get('/api/notifications/', () => HttpResponse.json(DEMO_NOTIFICATIONS)),
  http.post('/api/notifications/mark-read', () => HttpResponse.json({ status: 'ok' })),

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

  // ── Project access ────────────────────────────────────
  http.get('/api/projects/:id/access', () => HttpResponse.json([
    { id: 'acc-1', user_id: 'user-alice', username: 'alice.chen', display_name: 'Alice Chen', permission: 'editor', granted_at: '2026-01-20T10:00:00Z' },
    { id: 'acc-2', user_id: 'user-bob', username: 'bob.mueller', display_name: 'Bob Mueller', permission: 'editor', granted_at: '2026-01-25T14:00:00Z' },
    { id: 'acc-3', user_id: 'user-carol', username: 'carol.tanaka', display_name: 'Carol Tanaka', permission: 'viewer', granted_at: '2026-02-01T09:00:00Z' },
  ])),

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

  // ── Comments ──────────────────────────────────────────
  http.get('/api/projects/:id/comments', () => HttpResponse.json([
    { id: 'cmt-1', user_id: 'user-alice', username: 'alice.chen', display_name: 'Alice Chen', content: 'The SL gap on the field device network is our top priority. I\'ve requested quotes for industrial IDS from Claroty and Nozomi.', created_at: '2026-02-14T10:30:00Z', zone_id: 'zone-field' },
    { id: 'cmt-2', user_id: 'user-bob', username: 'bob.mueller', display_name: 'Bob Mueller', content: 'Added firewall rules for the Modbus traffic. Still need to test Profinet Security Class 1 with the S7-1500s during the next maintenance window.', created_at: '2026-02-12T15:00:00Z', conduit_id: 'conduit-ctrl-field' },
    { id: 'cmt-3', user_id: 'demo-user', username: 'demo', display_name: 'Demo User', content: 'Safety zone looks good. HIMA controller is properly isolated and the hard-wired interlocks are documented.', created_at: '2026-02-15T16:00:00Z', zone_id: 'zone-safety' },
  ])),

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
];

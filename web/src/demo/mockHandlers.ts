// MSW request handlers for demo mode

import { http, HttpResponse } from 'msw';
import {
  DEMO_USER,
  DEMO_PROJECT_ID,
  DEMO_PROJECT,
  DEMO_VALIDATION,
  DEMO_RISK,
  DEMO_VULN_SUMMARY,
} from './mockData';

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
  http.get('/api/projects/', () =>
    HttpResponse.json([
      {
        id: DEMO_PROJECT_ID,
        name: DEMO_PROJECT.project.name,
        description: DEMO_PROJECT.project.description,
        owner_id: DEMO_USER.id,
        owner_username: DEMO_USER.username,
        permission: 'owner',
        zone_count: DEMO_PROJECT.zones.length,
        conduit_count: DEMO_PROJECT.conduits.length,
        asset_count: DEMO_PROJECT.zones.reduce((n, z) => n + z.assets.length, 0),
        risk_score: DEMO_RISK.overall_score,
        compliance_score: 72,
        is_archived: false,
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-06-01T14:30:00Z',
      },
    ]),
  ),

  http.get('/api/projects/:id', ({ params }) => {
    if (params.id !== DEMO_PROJECT_ID) {
      return HttpResponse.json({ detail: 'Not found' }, { status: 404 });
    }
    return HttpResponse.json({
      project: DEMO_PROJECT,
      validation: DEMO_VALIDATION,
      policy_violations: [],
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
      id: 'demo-new-project',
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
  http.post('/api/policies', () => HttpResponse.json([])),
  http.post('/api/risk', () => HttpResponse.json(DEMO_RISK)),

  // ── Versions ──────────────────────────────────────────
  http.get('/api/projects/:id/versions/', () => HttpResponse.json([])),
  http.get('/api/projects/:id/versions/count', () => HttpResponse.json({ count: 0 })),

  // ── Templates ─────────────────────────────────────────
  http.get('/api/templates/', () => HttpResponse.json([])),

  // ── Users & Teams ─────────────────────────────────────
  http.get('/api/users/', () => HttpResponse.json([DEMO_USER])),
  http.get('/api/teams/', () => HttpResponse.json([])),

  // ── Notifications ─────────────────────────────────────
  http.get('/api/notifications/', () => HttpResponse.json([])),
  http.post('/api/notifications/mark-read', () => HttpResponse.json({ status: 'ok' })),

  // ── Activity & Search ─────────────────────────────────
  http.get('/api/activity', () => HttpResponse.json([])),
  http.get('/api/search', () => HttpResponse.json([])),

  // ── Vulnerabilities ───────────────────────────────────
  http.get('/api/projects/:id/vulnerability-summary', () =>
    HttpResponse.json(DEMO_VULN_SUMMARY),
  ),
  http.get('/api/projects/:id/vulnerabilities', () => HttpResponse.json([])),

  // ── Project access ────────────────────────────────────
  http.get('/api/projects/:id/access', () => HttpResponse.json([])),

  // ── Analytics ─────────────────────────────────────────
  http.get('/api/projects/:id/analytics', () =>
    HttpResponse.json({ daily: [], total_actions: 0 }),
  ),
  http.get('/api/projects/:id/analytics/summary', () =>
    HttpResponse.json({ total_actions: 0, unique_users: 1, top_actions: [] }),
  ),
  http.get('/api/projects/:id/gap-analysis', () =>
    HttpResponse.json({ gaps: [], score: 72 }),
  ),

  // ── Presence ──────────────────────────────────────────
  http.post('/api/presence/heartbeat', () => HttpResponse.json({ status: 'ok' })),
  http.get('/api/presence/:id', () => HttpResponse.json([])),
  http.delete('/api/presence/leave', () => HttpResponse.json({ status: 'ok' })),

  // ── Comments ──────────────────────────────────────────
  http.get('/api/projects/:id/comments', () => HttpResponse.json([])),

  // ── Admin ─────────────────────────────────────────────
  http.get('/api/admin/stats', () =>
    HttpResponse.json({
      total_users: 1,
      total_projects: 1,
      active_sessions: 1,
      total_activity: 0,
    }),
  ),
  http.get('/api/admin/projects', () => HttpResponse.json([])),
  http.get('/api/admin/activity', () => HttpResponse.json([])),
  http.get('/api/admin/health', () =>
    HttpResponse.json({
      db_status: 'healthy',
      uptime_seconds: 3600,
      table_counts: { users: 1, projects: 1 },
    }),
  ),
  http.get('/api/admin/sessions', () => HttpResponse.json([])),
  http.get('/api/admin/users', () => HttpResponse.json([DEMO_USER])),
  http.get('/api/admin/login-history', () => HttpResponse.json([])),
  http.post('/api/admin/make-first-admin', () => HttpResponse.json({ status: 'ok' })),
];

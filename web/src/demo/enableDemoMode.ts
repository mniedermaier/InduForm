// Initialise MSW service worker and inject demo auth tokens

export async function enableDemoMode() {
  const { setupWorker } = await import('msw/browser');
  const { handlers } = await import('./mockHandlers');

  const worker = setupWorker(...handlers);

  await worker.start({
    quiet: true,
    onUnhandledRequest: 'bypass',
    serviceWorker: {
      // Must match the base path so GitHub Pages can find the script
      url: `${import.meta.env.BASE_URL}mockServiceWorker.js`,
    },
  });

  // Inject fake tokens so AuthContext considers us logged in
  localStorage.setItem('induform_access_token', 'demo-access-token');
  localStorage.setItem('induform_refresh_token', 'demo-refresh-token');
}

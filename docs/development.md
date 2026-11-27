# Local development

Use Node.js 22.13+ and npm. Windows PowerShell, macOS, and Linux can run the same npm commands; no shell-specific environment assignments are needed for the default workflow.

1. Clone your approved repository and change into its root.
2. Run npm ci. The committed lockfile pins dependencies.
3. Run npm run secrets:generate. This creates only ignored .dev.vars with random development keys and mock mode. It refuses to overwrite existing keys.
4. Run npm run db:migrate:local. Both migrations apply to local Miniflare storage, never remote D1.
5. Run npm run demo:local for a complete, isolated handler/Queue demonstration. Its database is ephemeral and separate from the development server.
6. Run npm run dev; check http://127.0.0.1:8787/healthz and /readyz. Ctrl+C stops the server.

The mock Telegram adapter stores messages in local D1; it does not send replies to a real Telegram client. The test harness supplies synthetic updates, OAuth callback, confirmation, metadata, playlist, and selection callbacks. npm run demo:export exports a sanitized transcript and viewer. See [demo](demo/README.md).

## Checks

npm run test:coverage runs every suite with mock providers. npm run evaluate reports the 64-case dataset separately. npm run lint, npm run format:check, npm run typecheck, npm run docs:check, npm run privacy:check, and npm run build provide static/build checks. Build means Wrangler deploy --dry-run, never deployment. npm audit includes development dependencies. The benchmark script reports local timings, never Cloudflare invocation CPU.

CI has no provider or production secrets, and no deployment job. Remote webhook scripts require explicit --execute-remote and operator-supplied credentials. Do not run remote commands during the mock workflow.

## Troubleshooting

- .dev.vars already exists: preserve it. To regenerate, deliberately move your development-only file aside first. Never copy a production secret store here.
- readyz is unavailable: check local migrations and bindings; healthz alone does not test database readiness.
- No Telegram message appears: mock mode records local output by design. Read the test transcript, not a live bot.
- Tests time out on a slow machine: workerd startup and local D1 make integration tests slower than pure unit tests. Use the documented supported Node version and retry an isolated failed suite before changing timeouts.
- Production validation reports placeholders: expected in the public template. Fill only your own values after reading [deployment](deployment.md).
- Windows native module startup fails: install the appropriate Node architecture and a supported Windows runtime, then repeat npm ci. Do not copy another machine's node_modules.

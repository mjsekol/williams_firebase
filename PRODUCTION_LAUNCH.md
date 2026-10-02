# Production Launch Brief: Problem Report

**Audience:** Back-end, DevOps, and release team  
**Goal:** Deploy the full web app (Google sign-in, Gmail report delivery, optional phone verification, and phone share-sheet handoff) to a public HTTPS URL.  
**Recommendation:** Deploy the existing Render Blueprint first. It already describes this Node.js service and its Redis session store.

## 1. What is being launched

This is a Node.js 20+ / Express web app. It serves its own front end and API from one process. Signed-in users can send a photo and description through the Gmail API using their own Google account, verify a phone number through Twilio Verify, or hand a report to the phone's native share sheet. The app does not send report texts itself.

The server accepts one image of up to 10 MB and holds it in memory while processing it. It does not persist report photos or descriptions. In production, Redis stores server-side sessions, including Google OAuth refresh tokens and any verified phone number. Session cookies expire after eight hours; signing out clears the app session.

## 2. Hosting recommendation and alternatives

| Platform | Fit and rationale | Estimated platform cost per month | Trade-offs |
|---|---|---:|---|
| **Render (recommended)** | Best fit for the current repository: [`render.yaml`](./render.yaml) defines the Node web service, Redis session store, `npm ci`, `npm start`, and `/healthz`. Deploy as a Blueprint to reduce manual setup. | **About $17–25** for one small paid web service plus starter Redis. | Least migration work. Confirm current service sizes/prices and Redis persistence/availability options when provisioning. |
| **Railway** | Good alternative for a small Node service plus Redis where a usage-based platform is preferred. Supports deploying both services in one project; configure a persistent Redis service and private service-to-service access. | **About $10–25** for a small always-on app and Redis, depending on resource use and plan minimums. | More usage-based billing; translate the Render Blueprint into Railway configuration and explicitly configure volumes/Redis durability, secrets, health checks, and domain settings. |
| **AWS (App Runner or ECS/Fargate + managed Redis)** | Best when the organization already operates in AWS and needs its IAM, networking, compliance, or observability controls. | **Roughly $50–150+** for a small always-on app, managed Redis, and basic network/logging resources. | Higher baseline cost and operational setup; estimate with the selected AWS region, Redis tier, network egress, and logging before approval. |

**Why Render:** It is the lowest-friction route that matches the checked-in deployment definition. Keep the service name `problem-report` if using the existing Render URL (`https://problem-report.onrender.com`). A custom domain is also supported; DNS and Google OAuth settings must then use that domain.

For all providers, run a persistent Node process (not a serverless function that can lose local session state), use a paid always-on tier suitable for production, and provide a managed Redis-compatible service. Do not use the in-memory Express session store in production. No application file volume or object storage is needed for the current report flow.

## 3. Required launch inputs and configuration

### Runtime and deployment

- Runtime: Node.js **20 or newer**; use a currently supported LTS release (for example Node 22) where the provider supports it.
- Install with `npm ci` from the committed lockfile.
- Start with `npm start` (`node server.js`).
- Bind to the provider-assigned `PORT`; do not hard-code an externally exposed port.
- Configure `/healthz` as the platform health check. It returns process health only; it does not prove that Redis, Google, or Twilio is reachable.
- Start with one web instance. The current rate limiters use process-local state; if horizontally scaling, move rate-limit state to a shared store (Redis or another distributed store) so limits are consistent across instances.
- The upload is buffered in memory (10 MB maximum per image). Monitor memory and concurrency; choose a plan with enough memory headroom and scale vertically before adding concurrency or instances.

### Environment variables

Set production values in the hosting provider's encrypted secret/configuration store, never in source control:

| Variable | Requirement |
|---|---|
| `NODE_ENV` | Set to `production`. |
| `APP_ORIGIN` | Public HTTPS origin only, e.g. `https://problem-report.onrender.com` (no path or trailing callback path). Set explicitly, including when the provider exposes an external URL. |
| `GOOGLE_CLIENT_ID` | Required for Google sign-in and Gmail delivery. |
| `GOOGLE_CLIENT_SECRET` | Required secret for the Google OAuth web client. |
| `GOOGLE_REDIRECT_URI` | Exact callback URL: `${APP_ORIGIN}/auth/google/callback`. Register the same exact URI in Google Cloud. |
| `SESSION_SECRET` | Required; use a randomly generated secret with at least 32 characters. Do not reuse a development value. |
| `REDIS_URL` | Required in production; use the private connection string and TLS (`rediss://`) when supported/required by the provider. Restrict network access and credentials. |
| `TRUST_PROXY` | Set to `1` only if the app is behind a trusted TLS-terminating proxy and the provider's proxy topology is understood. Otherwise leave unset/`0`. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Required only if phone-number verification is part of launch. Store the auth token as a secret. If omitted, phone verification is disabled, but the share sheet itself remains a client-side feature. |

The checked-in Render Blueprint generates `SESSION_SECRET` and wires `REDIS_URL`, but **does not** set `APP_ORIGIN`, `GOOGLE_REDIRECT_URI`, or the OAuth credentials. Add these in the Render service environment before opening the app to users. Keep Redis private and use the configured `noeviction` policy; Redis eviction or loss can invalidate sessions and force users to sign in again.

### Google Cloud / OAuth setup — release blocker

1. Use a production Google Cloud project, enable the Gmail API, and create an OAuth **Web application** client.
2. Add the exact production callback `${APP_ORIGIN}/auth/google/callback` as an authorized redirect URI. Add the production origin to authorized JavaScript origins if requested by the Google console.
3. Complete the OAuth consent screen, publish the app for the intended audience, and complete Google's verification steps before inviting users outside the test-user list. The app requests `openid`, `email`, `profile`, and `https://www.googleapis.com/auth/gmail.send`; the Gmail scope is sensitive and can require verification. Confirm current Google requirements and review timing with the project owner.
4. Add the public homepage, support contact, and privacy policy required for the consent-screen setup. Explain that users authorize the app to send reports from their own Gmail account, what session data is kept, and how to revoke access.
5. Test using a non-owner account that represents the target audience. Confirm the Google grant contains the expected Gmail send access and that a refresh token is returned. OAuth testing-mode grants/tokens may be restricted or expire; do not treat a test-mode deployment as a production launch.
6. Record the OAuth project owner, credential rotation process, and who can access production secrets.

The app sends messages using each signed-in user's Gmail identity; it does not require an app-owned SMTP account. Gmail API quota and policy requirements still apply.

### Twilio Verify setup — if phone verification is in scope

- Create a Verify service and configure all three Twilio variables above.
- Confirm supported destination countries, fraud controls, spending limits, and the expected SMS channel/recipient availability.
- Ensure support staff can distinguish Verify codes from report delivery: Twilio sends the verification code only; the app's text-report action opens the user's native share sheet.
- Test successful, invalid, expired, and rate-limited verification attempts.

## 4. Security, privacy, and operational requirements

- Serve the application only over HTTPS. Verify secure, HTTP-only, same-site session cookies after deployment.
- Use provider-managed secret storage, least-privilege access, MFA on hosting/Google/Twilio accounts, and documented secret rotation. Never put OAuth secrets, session secrets, Redis credentials, Twilio credentials, OAuth tokens, or verification codes in logs or tickets.
- Keep Redis on a private network or otherwise access-controlled endpoint; require TLS for remote connections where available. Use the Blueprint's no-eviction policy and monitor capacity/availability.
- Do not add photo/description request-body logging or persistent report storage without an explicit privacy/security review. The current app processes uploads in memory and relays email through Gmail.
- Preserve the current security headers, CSRF checks, OAuth state validation, file-type validation, upload bounds, and request rate limits. Do not disable them to work around proxy or deployment issues.
- Configure alerts for service downtime, repeated health-check failures, Redis errors/unavailability, memory pressure/restarts, and unusual hosting/SMS spend. Set provider budget alerts and review logs after the first production sends.
- Decide who owns incident response, OAuth consent/verification follow-up, user support, service billing, and provider account recovery.
- Back up/document configuration and recovery procedures. The app has no report database; a Redis loss primarily invalidates active sessions. Restore service by recovering Redis or allowing users to authenticate again, then verify sign-in and delivery.
- If a custom domain is used, configure DNS and HTTPS at the provider, then update `APP_ORIGIN`, `GOOGLE_REDIRECT_URI`, Google authorized origins/redirects, and any public privacy/support links together.

## 5. Release and acceptance checklist

### Before deploy

- [ ] Review and approve the provider, region, paid instance size, Redis tier, data location, and monthly spend cap.
- [ ] Confirm Google OAuth consent/verification status is approved for the intended audience.
- [ ] Provision production Redis and set all required environment variables/secrets.
- [ ] Confirm the chosen public origin and exact Google callback URL match in the app and Google Cloud.
- [ ] Run `npm ci`, `npm test`, and `npm run check` against the release commit.
- [ ] Confirm the production bundle contains no local `.env` file or credentials.

### Smoke test after deploy

- [ ] `GET /healthz` returns HTTP 200 over the public HTTPS URL.
- [ ] Open the root page and confirm static assets load without browser console or mixed-content errors.
- [ ] Complete Google sign-in as an intended end-user account; confirm callback succeeds and the session survives a page refresh/restart as expected.
- [ ] Send a test report with a valid image to an authorized recipient; verify sender, recipient, description, and attachment.
- [ ] Confirm an unsupported file, an image over 10 MB, and invalid report input are rejected safely.
- [ ] If enabled, verify a phone number via Twilio and test invalid/expired codes and throttling. Confirm the text action opens the native share flow and does not send an SMS from the server.
- [ ] Confirm sign-out clears the app session and the session cookie is secure/HTTP-only.
- [ ] Confirm provider logs do not contain photo content, OAuth credentials/tokens, verification codes, or session secrets.
- [ ] Confirm alerts, budget alerts, support ownership, and rollback instructions are in place.

## 6. Estimated operating cost

All figures are **USD planning estimates**, not quotes (pricing references reviewed October 2, 2026). They assume one small always-on web instance, one small Redis instance, low traffic, no dedicated outbound IP, no paid support, and no extraordinary bandwidth/log retention. Provider prices, resource sizes, taxes, regions, and plan minimums change; confirm the calculator/pricing page before approval.

| Cost item | Render estimate | Notes |
|---|---:|---|
| Node web service | ~$7/month | Small paid Starter-class service; choose enough memory for in-memory image processing. Larger memory/CPU increases the bill. |
| Redis session store | ~$10/month | Small paid Redis/Key Value tier; confirm available persistence, memory, and region for the selected plan. |
| Custom domain (optional) | ~$1–3/month amortized | Typical registration renewal budget of roughly $12–36/year; actual TLD/domain price varies. Provider HTTPS is generally included. |
| Google Gmail API | $0 expected at low volume | No separate Gmail API charge is expected for ordinary usage, but quotas and Google terms apply; check current project limits. |
| Twilio Verify | ~$0.05 per successful verification, plus applicable SMS/channel fees | Example planning variable: 100 successful verifications ≈ $5 base verification fees plus destination-dependent SMS fees; 1,000 ≈ $50 plus SMS fees. Failed attempts, fraud controls, and carrier/destination charges can affect the actual invoice. |
| Logs, bandwidth, add-ons | $0–variable | Estimate from actual traffic, retention, and provider plan. Dedicated outbound IPs are optional and excluded; Render requires a Pro workspace or higher and charges an additional fee. |
| **Typical Render baseline** | **~$17–25/month** | Web service + Redis, before domain, Twilio, optional observability, dedicated IPs, taxes, and overages. Budget **~$20–35/month plus verification usage** for a simple custom-domain launch. |

Alternative planning totals: Railway **~$10–25/month** for small always-on app + Redis, with usage/plan minimums to confirm; AWS **~$50–150+/month** for app + managed Redis and basic networking/logging, depending heavily on region and architecture. These estimates are for comparison only; obtain a provider calculator estimate before launch.

Cost references to verify before purchase:

- [Render pricing](https://render.com/pricing)
- [Railway pricing](https://railway.com/pricing)
- [Fly.io pricing](https://fly.io/docs/about/pricing/) (if separately evaluating Fly.io as a machine-hosting option; pair it with a Redis provider)
- [AWS Pricing Calculator](https://calculator.aws/)
- [Twilio Verify pricing](https://www.twilio.com/en-us/verify/pricing)
- [Gmail API quotas](https://developers.google.com/workspace/gmail/api/reference/quota)

---

**Launch decision requested:** Approve Render as the initial production platform, confirm whether Twilio phone verification is required on day one, and assign owners for Google OAuth verification, production credentials, billing alerts, and post-launch support.

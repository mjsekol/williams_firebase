# Problem Report

Mobile-first web app to email a problem photo and description from the signed-in user's Gmail account, or hand both to the phone's native share sheet for texting.

## Local setup

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env`.
3. Create a Google OAuth web client and set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in `.env`.
4. In the Google Cloud project, enable the Gmail API and add the callback URL (by default `http://localhost:3000/auth/google/callback`) to the OAuth client's authorized redirect URIs. Add your Google account as a test user while the consent screen is in testing.
5. Create a Twilio Verify service and set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID` in `.env` to enable phone-number verification.
6. Set a long random `SESSION_SECRET`.
7. Run `npm install`, then `npm start`, and open `http://localhost:3000`.

The app requests only OpenID identity, profile/email, and `gmail.send`. Each user grants Gmail send access during Google sign-in. Email reports are sent from that signed-in account and attach the selected image. Google may require OAuth app verification before users outside the test-user list can grant Gmail access.

Signed-in users can connect a phone number by entering it in E.164 international format (for example, `+14155552671`) and confirming the one-time code sent by Twilio Verify. The verified phone number is kept in the server-side app session. Twilio sends only the verification code; it does not send reports.

## Public web demo

The main app at `/` supports Google sign-in, direct Gmail delivery to an entered recipient, and phone share-sheet messaging. A separate static app is available at [https://thunder-byte.github.io/problem-report-demo/](https://thunder-byte.github.io/problem-report-demo/). Its source is in [`demo/`](./demo/) and a separate public repository, so the private backend and credentials are not exposed. That static version uses Firebase sign-in and the phone's native share sheet; it cannot send email directly. See [`demo/README.md`](./demo/README.md) for its setup.

For a live app with Google sign-in, Gmail delivery, phone verification, and persistent sessions, use the production hosting setup below. Hosting a live backend and Redis may incur charges.
See the [production launch brief](./PRODUCTION_LAUNCH.md) for deployment requirements, platform options, release checks, and estimated costs.

## Text-message sharing

Text reports are shared from the user's phone with the Web Share API. The app does not download the photo. The user chooses their messaging app and confirms the destination/send action. Browsers that cannot share image files show an error rather than downloading the image or silently switching delivery methods. Phone verification connects a number to the user's app session; it does not authorize the app to send SMS from that number in the background.

## Production

Serve the live app only over HTTPS. The included [`render.yaml`](./render.yaml) configures the app and Redis session store for Render deployment. Keep the Render web service name `problem-report` unchanged to keep its stable app URL: [https://problem-report.onrender.com](https://problem-report.onrender.com). Deploying code updates to that same service does not change the URL. Set `NODE_ENV=production`, `APP_ORIGIN` (or use the hosting provider's `RENDER_EXTERNAL_URL`), `GOOGLE_REDIRECT_URI`, `SESSION_SECRET` (at least 32 characters), and `REDIS_URL` for a persistent Redis service. Use TLS (`rediss://`) for remote Redis connections. If TLS is terminated by a reverse proxy, set `TRUST_PROXY=1` only when that proxy is trusted. Production sessions (including Gmail refresh tokens) are stored server-side in Redis; keep Redis private and access-controlled. The in-memory session store is used only for local development.

To give the app dedicated outbound IPs for external-service allowlisting, create an IP set in the Render Dashboard under **Networking → Dedicated IPs** and scope it to the app's environment and region. Render provisions the addresses; they are not specified in `render.yaml`. Dedicated IPs require a Pro workspace or higher and incur an additional monthly fee. After provisioning, copy all IPs in the set to the external service's allowlist.

Reports are relayed through Gmail's API and are not retained by this app. The connected Google grant can be revoked in the user's Google Account settings. Signing out clears the app session.

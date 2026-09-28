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

## Put the app on the web

The included `render.yaml` deploys the app to Render with HTTPS, a public web URL, and Redis-backed production sessions.

1. Push this project to a GitHub repository and connect that repository to Render.
2. In Render, create a new Blueprint from the repository and choose `render.yaml`. Use a paid Render web service and Redis instance for persistent production sessions.
3. In the web service's environment settings, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Set the Twilio Verify variables too if phone verification should be available: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID`.
4. After the first deploy, copy the service's public HTTPS URL from Render. In Google Cloud Console, add `https://YOUR-APP.onrender.com/auth/google/callback` as an authorized redirect URI for the OAuth client. The app builds its callback from Render's provided public URL, so no extra `APP_ORIGIN` setting is needed.
5. Redeploy, open the public URL in a browser, and share that URL with users.

The URL will be publicly reachable, but Google sign-in and Gmail sending still require the Google OAuth client and Gmail API setup described above. For local development, use the `localhost` instructions instead of the Render deployment.

## Text-message sharing

Text reports are shared from the user's phone with the Web Share API. The app does not download the photo. The user chooses their messaging app and confirms the destination/send action. Browsers that cannot share image files show an error rather than downloading the image or silently switching delivery methods. Phone verification connects a number to the user's app session; it does not authorize the app to send SMS from that number in the background.

## Production

Serve this app only over HTTPS. Set `NODE_ENV=production`, `APP_ORIGIN` (or use the hosting provider's `RENDER_EXTERNAL_URL`), `GOOGLE_REDIRECT_URI`, `SESSION_SECRET` (at least 32 characters), and `REDIS_URL` for a persistent Redis service. Use TLS (`rediss://`) for remote Redis connections. If TLS is terminated by a reverse proxy, set `TRUST_PROXY=1` only when that proxy is trusted. Production sessions (including Gmail refresh tokens) are stored server-side in Redis; keep Redis private and access-controlled. The in-memory session store is used only for local development.

Reports are relayed through Gmail's API and are not retained by this app. The connected Google grant can be revoked in the user's Google Account settings. Signing out clears the app session.

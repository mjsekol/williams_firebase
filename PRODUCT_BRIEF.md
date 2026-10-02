# Problem Report — Product Brief and Local MVP

**Audience:** Product stakeholders, design, engineering, and QA  
**Product stage:** Local MVP / pre-launch  
**Product objective:** Make it quick and clear for someone to document a problem and share it with the person who can help.

## 1. Stakeholder explanation

### Short version

Problem Report is a mobile-first web app that helps a user explain an issue with a photo and a short description, then share the report with the right contact. The user can email it from their own Gmail account or hand it to their phone's messaging app through the native share sheet.

### The problem it addresses

When people report a maintenance issue, damage, or another problem, they often need to explain what happened, where it is, and who needs to know. A text-only message can leave out important visual context, while assembling a photo and explanation in separate steps is inconvenient—especially on a phone.

### Product value

- **For the reporter:** A guided, mobile-friendly way to capture the issue, describe it, and choose how to share it.
- **For the recipient:** A single report containing the user's description and photo, delivered by email or shared through a messaging app.
- **For the organization:** A lightweight way to receive clearer reports without building a separate case-management system first.

The app does **not** currently create or track tickets, assign staff, store a report history, or send SMS messages itself. Email is sent through the reporter's connected Gmail account. Text sharing opens the phone's share sheet; the user chooses the messaging app/recipient and confirms sending. Optional phone verification verifies a number associated with the app session; it does not authorize background texting.

## 2. Primary users and stakeholders

| Person | Need |
|---|---|
| Reporter / end user | Record a problem quickly, include enough detail and a photo, and share it using a familiar channel. |
| Recipient / responder | Receive a readable report with the photo and enough context to understand what needs attention. |
| Product owner | Validate that users can complete the reporting flow and decide which channels and integrations are needed at launch. |
| Operations / support | Configure and support Google OAuth, email delivery, optional phone verification, and eventually production hosting. |

## 3. User stories

### Must have for the local MVP

1. **As a reporter,** I want to take or select a photo so that the recipient can see the problem.
2. **As a reporter,** I want to preview or remove my selected photo so that I can check it before sharing.
3. **As a reporter,** I want to describe the problem and see the character limit so that I can provide useful context without exceeding the supported length.
4. **As a reporter,** I want to sign in with Google and understand what access I am granting so that a report can be sent from my own Gmail account.
5. **As a reporter,** I want to email the report to a recipient I specify so that the person who can help receives the description and photo together.
6. **As a reporter,** I want clear success or error feedback so that I know whether the email was sent or what I should do next.
7. **As a reporter on a compatible phone,** I want to share the report through the phone's native share sheet so that I can use my messaging app and approve the final recipient/send action myself.
8. **As a reporter,** I want to sign out so that I can end my app session on a shared device.

### Optional / follow-on stories

9. **As a reporter,** I want to verify a phone number so that the app can associate that number with my current session.
10. **As an app operator,** I want to enable or disable phone verification with configuration so that local email development does not depend on a paid messaging integration.
11. **As an operator,** I want rate limits and upload validation so that accidental or abusive traffic is constrained.
12. **As an operator,** I want reports not to be retained by the app so that the initial product has a smaller data footprint.

## 4. Core use cases

### Use case A: Send a problem report by email

**Primary actor:** Reporter  
**Preconditions:** Local app is running; Google OAuth is configured; the reporter is an allowed OAuth test user (until the OAuth app is approved/published); Gmail API is enabled.

1. Reporter opens the app and signs in with Google.
2. Reporter grants the requested identity and Gmail send permission.
3. Reporter takes/selects a photo and previews it.
4. Reporter enters a description and recipient email address.
5. Reporter selects Email and submits the form.
6. The app validates the input and supported image, then sends the message through the reporter's Gmail account with the photo attached.
7. The app confirms success or presents an actionable error.

**Success outcome:** The recipient receives an email sent from the reporter's account, with the entered description and selected image. The app does not retain the report.

### Use case B: Share a report through the phone

**Primary actor:** Reporter on a browser/device that supports sharing image files  
**Preconditions:** Reporter is signed in; their browser supports the Web Share API with files.

1. Reporter selects a photo, enters a description and intended phone recipient.
2. Reporter selects Text message and submits.
3. The app passes the photo and report text to the operating system's share sheet.
4. Reporter selects their messaging app, checks/confirms the recipient, and sends—or cancels.

**Success outcome:** The user completes the send in their chosen app. The web app does not send an SMS. Unsupported browsers show a message rather than silently downloading the image or claiming it was sent.

### Use case C: Verify a phone number (optional)

1. Signed-in reporter enters a number in international E.164 format.
2. The app requests a code from Twilio Verify.
3. Reporter enters the received code.
4. The app confirms the number and keeps it in the server-side session.

**Success outcome:** The number is marked verified for that session. This does not change the sender or delivery mechanism of text reports.

## 5. What the end product looks like

The product is a responsive web app, optimized for a phone but usable on desktop:

1. A simple “Report a problem” header and short explanation.
2. A Google account card showing sign-in status and a sign-in/sign-out action.
3. Optionally, a phone connection card where the user can request and confirm a verification code.
4. A guided report form:
   - Photo capture/file selection, preview, and remove action.
   - Problem description with a 1,000-character maximum and live count.
   - Email or Text message choice.
   - A recipient field appropriate to the selected channel.
5. A clear submit action, privacy/delivery explanation, and accessible status messages.
6. For email, a success state naming the sender and recipient; for sharing, a state clarifying that the user must finish in the share sheet.

The present interface follows this flow in [`index.html`](./index.html) and [`app.js`](./app.js). It is not an admin console or a ticket-management dashboard.

## 6. Local MVP scope and definition of done

The goal is a working app on a developer's machine at `http://localhost:3000`, before introducing production hosting, production Redis, or public OAuth approval.

### MVP features

- Serve the app locally with Node.js 20+ and one command (`npm start`).
- Render the form and work on a desktop browser; validate photo capture/selection and share behavior on a compatible mobile browser/device.
- Allow a Google test user to sign in through a local OAuth web client and grant the Gmail send scope.
- Validate photo presence/type/size, description, recipient, and authenticated session on the server.
- Send a test report through the signed-in account's Gmail API and show success/failure.
- Support the share-sheet handoff on compatible browsers and explain unsupported/cancelled cases accurately.
- Use a local in-memory session store for local development. Production Redis is not a prerequisite for this local MVP.
- Keep Twilio phone verification optional; do not block email/report MVP completion on Twilio setup.
- Have automated tests for key server and phone-verification logic, and pass the repository's syntax check.

### Acceptance criteria

- [ ] `npm start` starts successfully and serves the app at `http://localhost:3000`.
- [ ] `GET /healthz` returns HTTP 200.
- [ ] Without Google credentials the app explains that sign-in is unavailable rather than appearing ready to send.
- [ ] With valid local OAuth credentials, a configured test user can sign in, and the authenticated session is reflected in the UI.
- [ ] A valid report email arrives at the chosen inbox from the signed-in Gmail account with the entered description and photo attached.
- [ ] Missing/invalid recipient, empty/over-limit description, unsupported file, and file larger than 10 MB are rejected with understandable feedback.
- [ ] Sign-out ends the app session; protected report sending no longer works until the user signs in again.
- [ ] On a supported mobile browser, the share sheet receives the chosen image and report text; canceling is not reported as success.
- [ ] On an unsupported browser, the user sees that direct sharing is unavailable and no file is downloaded as a fallback.
- [ ] `npm test` and `npm run check` pass.
- [ ] No report image, report body, OAuth secret/token, or verification code is written to application logs or retained by the app.

## 7. What needs to be built or completed before local MVP

Most core product functionality is already present in the repository. The first MVP milestone is therefore primarily **configuration, verification, and closing test gaps**, not a rewrite.

### Required setup

1. Install Node.js 20+ and run `npm ci`.
2. Copy `.env.example` to `.env` and configure:
   - `NODE_ENV=development`
   - `APP_ORIGIN=http://localhost:3000`
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback`
   - A local-only `SESSION_SECRET`
   - Twilio credentials only if testing phone verification
3. In Google Cloud, enable Gmail API, create an OAuth Web application client, register `http://localhost:3000/auth/google/callback`, configure the consent screen, and add the developer's Google account as a test user.
4. Start with `npm start` and open `http://localhost:3000`.
5. Complete the email flow and verify delivery using a real test inbox/account that the team controls.

Local mode uses an in-memory session store, so no Redis instance is needed. Do not use development secrets, test OAuth configuration, or the in-memory session store as production configuration.

### Engineering / QA tasks to close out

- [ ] Run and fix failures from `npm test` and `npm run check`.
- [ ] Add or confirm an end-to-end local OAuth and email-send smoke-test procedure that does not commit credentials.
- [ ] Test supported image types and upload/description/recipient boundaries.
- [ ] Exercise sign-in denial/cancellation, missing refresh token/scope, Gmail API failure, session expiry, and sign-out feedback.
- [ ] Test the native file share flow on target mobile browsers and record supported browser/device expectations.
- [ ] Decide whether phone verification belongs in the MVP; if yes, create a Twilio Verify service and test success, invalid code, provider failure, and rate limits. If no, leave it disabled for MVP acceptance.
- [ ] Confirm the product's intended recipient/use case and prepare plain-language privacy/support information before asking users to connect Gmail.

## 8. Deliberately out of scope for the local MVP

- Production hosting, custom domain, HTTPS termination, production Redis, backups, monitoring, and alerting (see [`PRODUCTION_LAUNCH.md`](./PRODUCTION_LAUNCH.md)).
- Google OAuth verification/public availability for users outside the configured test list.
- App-owned SMS delivery, automatic texting, or messaging without the user's final confirmation.
- Report database, ticket queue, staff assignment, status tracking, analytics, or admin dashboard.
- File storage, report history, multiple photos per report, and retries/deduplication beyond the current send flow.
- Organization accounts, non-Google identity providers, and production-scale load testing.

## 9. Product decisions for stakeholders

Before broadening the MVP, confirm:

1. Who is the first target reporter and who is the intended recipient (for example, a tenant and property manager, or a customer and support team)?
2. Is direct Gmail email plus user-confirmed share-sheet messaging sufficient, or is server-sent SMS a future requirement?
3. Is phone-number verification needed for the first user test, given its separate setup and per-verification cost?
4. Are reports intentionally transient, or will a later phase need a retained ticket/history and its corresponding privacy, access, and deletion requirements?
5. Which devices/browsers must be supported for photo sharing?

**Suggested MVP decision:** Validate the core photo + description + Gmail email workflow first. Treat Twilio phone verification as optional and native share-sheet behavior as a best-effort mobile capability, then decide whether users need a dedicated messaging integration based on feedback.

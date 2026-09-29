# Problem Report — Public Demo

This repository contains the public static Problem Report app. It supports Firebase Authentication with email/password or phone verification; those are separate sign-in methods. Signed-in users can pass the selected photo and description to the phone's native share sheet. The user chooses an email or messaging app, selects the recipient, and confirms sending. The site does not upload or store reports. Firebase processes account credentials and phone verification; the selected email/SMS app handles report delivery under its own privacy policy.

The Web Share API with image files requires a supporting browser and normally an HTTPS site. When a browser cannot share the photo, the app explains the limitation rather than downloading the image or pretending it was sent.

## Publish with GitHub Pages

The demo is published at [https://thunder-byte.github.io/problem-report-demo/](https://thunder-byte.github.io/problem-report-demo/). Commits to `main` are deployed by the included GitHub Actions workflow.

## Configure sign-in

1. Create a Firebase project and register a **Web app**.
2. In Firebase Console, enable **Authentication → Sign-in method → Email/Password** and **Phone**.
3. Under **Authentication → Settings → Authorized domains**, add `thunder-byte.github.io`. Keep the app's production HTTPS domain in this list if the site moves.
4. Copy the Firebase web-app `apiKey`, `authDomain`, `projectId`, and `appId` into `firebase-config.js`, replacing the empty values. This config is public browser configuration, not a server credential; never put service-account keys or private secrets in this repository.
5. Commit and push the updated config to `main`, then wait for the Pages deployment to finish.
6. In Firebase Authentication phone settings, configure SMS regions and abuse protections for the countries you plan to support. Test phone login on the deployed HTTPS site; Firebase uses reCAPTCHA to protect SMS sign-in.

The Firebase CLI is optional for this app's Console-based setup. To install it for Firebase command-line workflows, run:

```sh
npm install -g firebase-tools
```

## Deploy to Firebase Hosting

From the directory containing the app's `public` folder:

```sh
firebase login
firebase init hosting
```

During `firebase init hosting`, select the existing Firebase project/site, set the public directory to `public`, and do not configure a single-page rewrite for this static site. Put the app's deployable HTML, JavaScript, CSS, and `firebase-config.js` in that `public` directory.

To use `app2-1569c-8fc62` as both the Firebase Hosting site ID and the deploy target, first map the target to that site:

```sh
firebase target:apply hosting app2-1569c-8fc62 app2-1569c-8fc62
```

Then configure `firebase.json` with the target. `...` is only a placeholder and must not be included in the JSON:

```json
{
  "hosting": {
    "target": "app2-1569c-8fc62",
    "public": "public"
  }
}
```

Deploy only that Hosting target:

```sh
firebase deploy --only hosting:app2-1569c-8fc62
```

The `target` value is the local deploy-target name; the `firebase target:apply` command connects it to the Firebase Hosting site ID. The static public app does not include the authenticated Node.js backend from the private repository.

Email and phone sign-ins create/use their own Firebase authentication identities; they are not automatically linked together. Email account creation sends a verification message, and email users must verify before using the report form. Firebase keeps the sign-in session on the device until the user signs out or clears browser data. The report photo is only passed to the chosen device share sheet after sign-in and is not uploaded by this site.

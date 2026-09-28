const authSetup = document.querySelector("#auth-setup");
const authLoading = document.querySelector("#auth-loading");
const authControls = document.querySelector("#auth-controls");
const authSignedIn = document.querySelector("#auth-signed-in");
const authSetupMessage = document.querySelector("#auth-setup-message");
const authMessage = document.querySelector("#auth-message");
const signedInIdentity = document.querySelector("#signed-in-identity");
const emailVerificationRequired = document.querySelector("#email-verification-required");
const reportForm = document.querySelector("#report-form");
const emailAuthForm = document.querySelector("#email-auth-form");
const phoneAuthForm = document.querySelector("#phone-auth-form");
const phoneCodeForm = document.querySelector("#phone-code-form");
const emailPanel = document.querySelector("#email-panel");
const phonePanel = document.querySelector("#phone-panel");
const emailMethod = document.querySelector("#email-method");
const phoneMethod = document.querySelector("#phone-method");
const emailSubmit = document.querySelector("#email-submit");
const phoneSendCodeButton = document.querySelector("#phone-send-code");
const phoneVerifyCodeButton = document.querySelector("#phone-verify-code");
const emailModeButton = document.querySelector("#toggle-email-mode");
const passwordResetButton = document.querySelector("#reset-password");
const signOutButton = document.querySelector("#sign-out");
const resendCodeButton = document.querySelector("#resend-code");
const resendVerificationButton = document.querySelector("#resend-verification");
const refreshVerificationButton = document.querySelector("#refresh-verification");

let auth = null;
let emailMode = "signin";
let phoneConfirmation = null;
let recaptchaVerifier = null;
let phoneCodeRequested = false;

function setAuthMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.classList.toggle("error", isError);
}

function explainAuthError(error) {
  const code = error?.code || "";
  const messages = {
    "auth/email-already-in-use": "That email already has an account. Sign in instead.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/user-disabled": "This account is disabled. Contact the app owner.",
    "auth/user-not-found": "Could not sign in. Check the address and password, or create an account.",
    "auth/wrong-password": "Email or password is incorrect.",
    "auth/weak-password": "Choose a password with at least 8 characters.",
    "auth/missing-phone-number": "Enter a mobile number.",
    "auth/invalid-phone-number": "Enter a valid mobile number in international format, such as +14155552671.",
    "auth/invalid-verification-code": "That sign-in code was not accepted. Check it and try again.",
    "auth/code-expired": "That code has expired. Request a new one.",
    "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
    "auth/quota-exceeded": "Phone sign-in has reached its current quota. Try again later.",
    "auth/captcha-check-failed": "Phone verification could not be completed. Retry the code request.",
    "auth/network-request-failed": "Could not reach the sign-in service. Check your connection and try again.",
    "auth/operation-not-allowed": "This sign-in method is not enabled in Firebase yet.",
  };
  return messages[code] || "Sign-in could not be completed. Please try again.";
}

function setButtonBusy(button, busy, busyLabel) {
  if (busy) {
    button.dataset.idleLabel = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.idleLabel || button.textContent;
    button.disabled = false;
  }
}

function setEmailMode(mode) {
  emailMode = mode;
  const creatingAccount = mode === "create";
  emailSubmit.textContent = creatingAccount ? "Create email account" : "Sign in with email";
  document.querySelector("#login-password").autocomplete = creatingAccount ? "new-password" : "current-password";
  emailModeButton.textContent = creatingAccount ? "I already have an account" : "Create account";
  passwordResetButton.hidden = creatingAccount;
  setAuthMessage("");
}

function showAuthMethod(method) {
  const isEmail = method === "email";
  emailPanel.hidden = !isEmail;
  phonePanel.hidden = isEmail;
  emailMethod.classList.toggle("active", isEmail);
  phoneMethod.classList.toggle("active", !isEmail);
  emailMethod.setAttribute("aria-selected", String(isEmail));
  phoneMethod.setAttribute("aria-selected", String(!isEmail));
  setAuthMessage("");
}

function resetRecaptcha() {
  if (recaptchaVerifier) {
    recaptchaVerifier.clear();
    recaptchaVerifier = null;
  }
  document.querySelector("#recaptcha-container").replaceChildren();
}

function createRecaptchaVerifier() {
  resetRecaptcha();
  recaptchaVerifier = new firebase.auth.RecaptchaVerifier("recaptcha-container", {
    size: "invisible",
    callback: () => setAuthMessage("Phone verification passed. Sending your code…"),
    "expired-callback": () => setAuthMessage("Verification expired. Request a new code.", true),
  });
  return recaptchaVerifier;
}

function renderSignedInUser(user) {
  const identity = user.email || user.phoneNumber || "Signed-in account";
  authSetup.hidden = true;
  authLoading.hidden = true;
  authControls.hidden = true;
  authSignedIn.hidden = false;
  signedInIdentity.textContent = identity;
  const needsEmailVerification = Boolean(user.email && !user.emailVerified);
  emailVerificationRequired.hidden = !needsEmailVerification;
  reportForm.hidden = needsEmailVerification;
}

emailMethod.addEventListener("click", () => showAuthMethod("email"));
phoneMethod.addEventListener("click", () => showAuthMethod("phone"));
emailModeButton.addEventListener("click", () => {
  setEmailMode(emailMode === "signin" ? "create" : "signin");
});

emailAuthForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!emailAuthForm.reportValidity()) {
    return;
  }

  const email = document.querySelector("#login-email").value.trim();
  const password = document.querySelector("#login-password").value;
  setButtonBusy(emailSubmit, true, emailMode === "create" ? "Creating account…" : "Signing in…");
  try {
    if (emailMode === "create") {
      const credential = await auth.createUserWithEmailAndPassword(email, password);
      await credential.user.sendEmailVerification();
      setAuthMessage("Account created. A verification email was sent to your address.");
    } else {
      await auth.signInWithEmailAndPassword(email, password);
      setAuthMessage("");
    }
  } catch (error) {
    setAuthMessage(explainAuthError(error), true);
  } finally {
    setButtonBusy(emailSubmit, false);
  }
});

passwordResetButton.addEventListener("click", async () => {
  const email = document.querySelector("#login-email").value.trim();
  if (!email) {
    setAuthMessage("Enter your email address first, then choose Forgot password.", true);
    document.querySelector("#login-email").focus();
    return;
  }
  try {
    await auth.sendPasswordResetEmail(email);
    setAuthMessage("If an account exists for that address, a password-reset email has been sent.");
  } catch (error) {
    setAuthMessage(explainAuthError(error), true);
  }
});

async function sendPhoneCode() {
  const phone = document.querySelector("#login-phone").value.trim();
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    setAuthMessage("Enter a valid mobile number in international format, such as +14155552671.", true);
    document.querySelector("#login-phone").focus();
    return;
  }

  setButtonBusy(phoneSendCodeButton, true, "Sending code…");
  setButtonBusy(resendCodeButton, true, "Sending code…");
  try {
    const verifier = createRecaptchaVerifier();
    phoneConfirmation = await auth.signInWithPhoneNumber(phone, verifier);
    phoneCodeRequested = true;
    phoneAuthForm.hidden = true;
    phoneCodeForm.hidden = false;
    document.querySelector("#phone-code-hint").textContent = `Enter the code sent to ${phone}.`;
    document.querySelector("#login-code").focus();
    setAuthMessage("Verification code sent.");
  } catch (error) {
    resetRecaptcha();
    setAuthMessage(explainAuthError(error), true);
  } finally {
    setButtonBusy(phoneSendCodeButton, false);
    setButtonBusy(resendCodeButton, false);
  }
}

phoneAuthForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (phoneAuthForm.reportValidity()) {
    await sendPhoneCode();
  }
});

resendCodeButton.addEventListener("click", sendPhoneCode);

phoneCodeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!phoneCodeForm.reportValidity() || !phoneConfirmation) {
    return;
  }
  setButtonBusy(phoneVerifyCodeButton, true, "Verifying…");
  try {
    await phoneConfirmation.confirm(document.querySelector("#login-code").value.trim());
    phoneConfirmation = null;
    phoneCodeRequested = false;
    setAuthMessage("");
  } catch (error) {
    setAuthMessage(explainAuthError(error), true);
  } finally {
    setButtonBusy(phoneVerifyCodeButton, false);
  }
});

signOutButton.addEventListener("click", async () => {
  signOutButton.disabled = true;
  try {
    await auth.signOut();
    setAuthMessage("You have signed out.");
  } catch {
    setAuthMessage("Could not sign out. Please try again.", true);
  } finally {
    signOutButton.disabled = false;
  }
});

async resendVerificationButton.addEventListener("click", async () => {
  const user = auth?.currentUser;
  if (!user?.email || user.emailVerified) {
    return;
  }
  resendVerificationButton.disabled = true;
  try {
    await user.sendEmailVerification();
    setAuthMessage("A new verification email has been sent.");
  } catch (error) {
    setAuthMessage(explainAuthError(error), true);
  } finally {
    resendVerificationButton.disabled = false;
  }
});

refreshVerificationButton.addEventListener("click", async () => {
  const user = auth?.currentUser;
  if (!user?.email) {
    return;
  }
  refreshVerificationButton.disabled = true;
  try {
    await user.reload();
    const refreshedUser = auth.currentUser;
    if (refreshedUser?.emailVerified) {
      renderSignedInUser(refreshedUser);
      setAuthMessage("Email verified. You can now report a problem.");
    } else {
      setAuthMessage("Email is not verified yet. Open the verification link in your inbox first.", true);
    }
  } catch {
    setAuthMessage("Could not check email verification. Refresh the page and try again.", true);
  } finally {
    refreshVerificationButton.disabled = false;
  }
});

function initializeAuthentication() {
  const config = window.PROBLEM_REPORT_FIREBASE_CONFIG;
  const requiredConfig = ["apiKey", "authDomain", "projectId", "appId"];
  const configReady = config && requiredConfig.every((key) =>
    typeof config[key] === "string" && config[key].trim().length > 0,
  );

  if (!configReady) {
    authSetupMessage.textContent = "Sign-in is not configured yet. The app owner needs to add Firebase web-app settings.";
    authLoading.hidden = true;
    return;
  }
  if (!window.firebase?.auth) {
    authSetupMessage.textContent = "The sign-in service did not load. Check your internet connection and refresh the page.";
    authLoading.hidden = true;
    return;
  }

  try {
    const firebaseApp = firebase.apps.length
      ? firebase.app()
      : firebase.initializeApp(config);
    auth = firebaseApp.auth();
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    authSetup.hidden = true;
    authLoading.hidden = false;
    authControls.hidden = false;
    auth.onAuthStateChanged((user) => {
      authLoading.hidden = true;
      if (user) {
        renderSignedInUser(user);
        if (phoneCodeRequested) {
          phoneCodeRequested = false;
        }
      } else {
        authSignedIn.hidden = true;
        authControls.hidden = false;
        reportForm.hidden = true;
        phoneAuthForm.hidden = false;
        phoneCodeForm.hidden = true;
        phoneConfirmation = null;
      }
    }, () => {
      authLoading.hidden = true;
      authSetup.hidden = false;
      authSetup.textContent = "Could not check your sign-in status. Refresh the page to try again.";
    });
  } catch {
    authSetup.hidden = false;
    authLoading.hidden = true;
    authSetupMessage.textContent = "Firebase sign-in could not be initialized. Check the Firebase settings and authorized domain.";
  }
}

setEmailMode("signin");
showAuthMethod("email");
initializeAuthentication();

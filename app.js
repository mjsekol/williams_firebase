const form = document.querySelector("#report-form");
const photoInput = document.querySelector("#photo");
const photoPreview = document.querySelector("#photo-preview");
const photoPrompt = document.querySelector("#photo-prompt");
const removePhotoButton = document.querySelector("#remove-photo");
const descriptionInput = document.querySelector("#description");
const descriptionCount = document.querySelector("#description-count");
const recipientInput = document.querySelector("#recipient");
const recipientLabel = document.querySelector("#recipient-label");
const statusMessage = document.querySelector("#status-message");
const submitButton = form.querySelector('button[type="submit"]');
const accountStatus = document.querySelector("#account-status");
const googleLogin = document.querySelector("#google-login");
const logoutButton = document.querySelector("#logout-button");
const setupNote = document.querySelector("#setup-note");
const shareNote = document.querySelector("#share-note");
const phoneStatus = document.querySelector("#phone-status");
const phoneControls = document.querySelector("#phone-connect-controls");
const accountPhoneInput = document.querySelector("#account-phone");
const sendPhoneCodeButton = document.querySelector("#send-phone-code");
const phoneCodeControls = document.querySelector("#phone-code-controls");
const phoneCodeSentNote = document.querySelector("#phone-code-sent-note");
const phoneCodeInput = document.querySelector("#phone-code");
const verifyPhoneCodeButton = document.querySelector("#verify-phone-code");
const disconnectPhoneButton = document.querySelector("#disconnect-phone");

let previewUrl = null;
let sessionState = null;

function selectedContactMethod() {
  return form.querySelector('input[name="contact-method"]:checked').value;
}

function updateContactField() {
  const isEmail = selectedContactMethod() === "email";
  recipientLabel.textContent = isEmail ? "Send report to email address" : "Phone number to text";
  recipientInput.type = isEmail ? "email" : "tel";
  recipientInput.autocomplete = isEmail ? "email" : "tel";
  recipientInput.placeholder = isEmail ? "name@example.com" : "+1 555 123 4567";
  recipientInput.value = "";
  shareNote.textContent = isEmail
    ? "The report and photo will be sent directly from your connected Gmail account."
    : "Choose your messaging app in the share sheet, confirm the phone number, and tap Send.";
}

function showPhoto(file) {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }
  previewUrl = URL.createObjectURL(file);
  photoPreview.src = previewUrl;
  photoPreview.hidden = false;
  photoPrompt.hidden = true;
  removePhotoButton.hidden = false;
  statusMessage.textContent = "";
}

function clearPhoto() {
  photoInput.value = "";
  photoPreview.removeAttribute("src");
  photoPreview.hidden = true;
  photoPrompt.hidden = false;
  removePhotoButton.hidden = true;
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
}

function renderSession(state) {
  sessionState = state;
  submitButton.disabled = !state.authenticated;
  googleLogin.hidden = state.authenticated || !state.configured;
  logoutButton.hidden = !state.authenticated;
  setupNote.hidden = state.configured;
  phoneControls.hidden = !state.authenticated || !state.phoneConfigured;
  disconnectPhoneButton.hidden = !state.authenticated || !state.verifiedPhone;

  if (!state.configured) {
    accountStatus.textContent = "Google sign-in is not configured.";
  } else {
    accountStatus.textContent = state.authenticated
      ? `Signed in as ${state.email}`
      : "Sign in to send reports from your Gmail account.";
  }

  if (!state.authenticated) {
    phoneStatus.textContent = "Sign in with Google to connect a phone number.";
    return;
  }
  if (!state.phoneConfigured) {
    phoneStatus.textContent = "Phone verification is not configured yet. The app owner needs to add Twilio Verify credentials.";
    return;
  }

  accountPhoneInput.value = state.verifiedPhone || state.pendingPhone || "";
  accountPhoneInput.disabled = Boolean(state.verifiedPhone);
  sendPhoneCodeButton.hidden = Boolean(state.verifiedPhone);
  phoneCodeControls.hidden = !state.pendingPhone || Boolean(state.verifiedPhone);
  phoneStatus.textContent = state.verifiedPhone
    ? `Verified phone: ${state.verifiedPhone}`
    : state.pendingPhone
      ? "Enter the verification code sent to your phone."
      : "No phone number connected.";
  phoneCodeSentNote.textContent = state.pendingPhone
    ? `Code sent to ${state.pendingPhone}.`
    : "";
}

async function loadSession() {
  try {
    const response = await fetch("/api/session", { credentials: "same-origin" });
    if (!response.ok) {
      throw new Error("Could not check your sign-in status.");
    }
    renderSession(await response.json());
  } catch (error) {
    accountStatus.textContent = "Could not check sign-in status. Refresh the page to try again.";
    submitButton.disabled = true;
    statusMessage.textContent = error.message;
  }
}

function createMessage(description, recipient) {
  return [
    "Problem report",
    `Intended recipient: ${recipient}`,
    `From: ${sessionState.email}`,
    "",
    "Description:",
    description,
  ].join("\n");
}

async function sendEmailReport(file, description, recipient) {
  const formData = new FormData();
  formData.append("photo", file, file.name || "problem-photo");
  formData.append("description", description);
  formData.append("recipient", recipient);

  const response = await fetch("/api/reports", {
    method: "POST",
    body: formData,
    credentials: "same-origin",
    headers: { "X-CSRF-Token": sessionState.csrfToken },
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      await loadSession();
    }
    throw new Error(result.error || "The report email could not be sent.");
  }
  statusMessage.textContent = `Report sent from ${result.sender} to ${result.recipient}.`;
}

async function postPhoneAction(path, body) {
  if (!sessionState?.csrfToken) {
    throw new Error("Refresh the page before connecting your phone.");
  }
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": sessionState.csrfToken,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "The phone number could not be verified.");
  }
  return result;
}

sendPhoneCodeButton.addEventListener("click", async () => {
  const phone = accountPhoneInput.value.trim();
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    phoneStatus.textContent = "Enter a valid phone number in international format, such as +14155552671.";
    accountPhoneInput.focus();
    return;
  }

  sendPhoneCodeButton.disabled = true;
  try {
    await postPhoneAction("/api/phone/start", { phone });
    await loadSession();
    phoneCodeInput.value = "";
    phoneCodeInput.focus();
    statusMessage.textContent = "Verification code sent by text.";
  } catch (error) {
    phoneStatus.textContent = error.message;
  } finally {
    sendPhoneCodeButton.disabled = false;
  }
});

verifyPhoneCodeButton.addEventListener("click", async () => {
  const code = phoneCodeInput.value.trim();
  if (!/^\d{4,10}$/.test(code)) {
    phoneStatus.textContent = "Enter the numeric code from your text message.";
    phoneCodeInput.focus();
    return;
  }

  verifyPhoneCodeButton.disabled = true;
  try {
    await postPhoneAction("/api/phone/check", { code });
    await loadSession();
    statusMessage.textContent = "Your phone number is connected and verified.";
  } catch (error) {
    phoneStatus.textContent = error.message;
  } finally {
    verifyPhoneCodeButton.disabled = false;
  }
});

disconnectPhoneButton.addEventListener("click", async () => {
  disconnectPhoneButton.disabled = true;
  try {
    await postPhoneAction("/api/phone/disconnect");
    await loadSession();
    statusMessage.textContent = "Phone number disconnected.";
  } catch (error) {
    phoneStatus.textContent = error.message;
  } finally {
    disconnectPhoneButton.disabled = false;
  }
});

async function shareTextReport(file, description, recipient) {
  if (!navigator.share || !navigator.canShare) {
    statusMessage.textContent = "This browser cannot share photos directly. Try a supported mobile browser; no file was downloaded.";
    return;
  }

  const shareData = {
    title: "Problem report",
    text: createMessage(description, recipient),
    files: [file],
  };
  if (!navigator.canShare(shareData)) {
    statusMessage.textContent = "This browser cannot share this photo directly. Try another mobile browser; no file was downloaded.";
    return;
  }

  try {
    await navigator.share(shareData);
    statusMessage.textContent = "Share sheet opened. Confirm the recipient and send the report in your messaging app.";
  } catch (error) {
    statusMessage.textContent = error.name === "AbortError"
      ? "Sharing was cancelled; nothing was sent."
      : "The phone’s share sheet could not be opened. No file was downloaded.";
  }
}

photoInput.addEventListener("change", () => {
  const file = photoInput.files[0];
  if (file) {
    showPhoto(file);
  }
});

removePhotoButton.addEventListener("click", clearPhoto);
descriptionInput.addEventListener("input", () => {
  descriptionCount.textContent = String(descriptionInput.value.length);
});
form.querySelectorAll('input[name="contact-method"]').forEach((input) => {
  input.addEventListener("change", updateContactField);
});

logoutButton.addEventListener("click", async () => {
  if (!sessionState?.csrfToken) {
    statusMessage.textContent = "Refresh the page before signing out.";
    return;
  }
  logoutButton.disabled = true;
  try {
    const response = await fetch("/api/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-CSRF-Token": sessionState.csrfToken },
    });
    if (!response.ok) {
      throw new Error("Could not sign out. Please refresh and try again.");
    }
    await loadSession();
    statusMessage.textContent = "You have signed out of this app.";
  } catch (error) {
    statusMessage.textContent = error.message;
  } finally {
    logoutButton.disabled = false;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusMessage.textContent = "";

  if (!form.reportValidity()) {
    return;
  }
  if (!sessionState?.authenticated) {
    statusMessage.textContent = "Sign in with Google before sending a report.";
    return;
  }

  const file = photoInput.files[0];
  const imageName = file?.name || "";
  if (!file || (
    !file.type.startsWith("image/")
    && !/\.(avif|gif|heic|heif|jpe?g|png|webp)$/i.test(imageName)
  )) {
    statusMessage.textContent = "Please choose an image for your report.";
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    statusMessage.textContent = "Choose a photo that is 10 MB or smaller.";
    return;
  }

  const description = descriptionInput.value.trim();
  const recipient = recipientInput.value.trim();
  if (
    selectedContactMethod() === "sms"
    && !/^\+?[0-9][0-9 ().-]{5,18}[0-9]$/.test(recipient)
  ) {
    statusMessage.textContent = "Enter a valid phone number before sharing.";
    recipientInput.focus();
    return;
  }

  submitButton.disabled = true;
  try {
    if (selectedContactMethod() === "email") {
      await sendEmailReport(file, description, recipient);
    } else {
      await shareTextReport(file, description, recipient);
    }
  } catch (error) {
    statusMessage.textContent = error.message;
  } finally {
    submitButton.disabled = !sessionState?.authenticated;
  }
});

const authResult = new URLSearchParams(window.location.search).get("auth");
if (authResult === "cancelled") {
  statusMessage.textContent = "Google sign-in was cancelled.";
} else if (authResult === "error") {
  statusMessage.textContent = "Google sign-in did not complete. Please try again.";
}

updateContactField();
loadSession();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("Service worker registration failed:", error);
    });
  });
}

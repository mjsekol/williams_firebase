const form = document.querySelector("#report-form");
const photoInput = document.querySelector("#photo");
const photoPreview = document.querySelector("#photo-preview");
const photoPrompt = document.querySelector("#photo-prompt");
const removePhotoButton = document.querySelector("#remove-photo");
const descriptionInput = document.querySelector("#description");
const descriptionCount = document.querySelector("#description-count");
const statusMessage = document.querySelector("#status-message");
const submitButton = form.querySelector('button[type="submit"]');

let previewUrl = null;

function updateContactField() {
  const isEmail = form.querySelector('input[name="contact-method"]:checked').value === "email";
  const methodLabel = isEmail ? "email" : "text message";
  submitButton.querySelector("span").textContent = `Share by ${methodLabel}`;
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

function createMessage(description, method) {
  return [
    "Problem report",
    `Preferred contact method: ${method === "email" ? "Email" : "Text message"}`,
    "",
    "Description:",
    description,
  ].join("\n");
}

photoInput.addEventListener("change", () => {
  const file = photoInput.files[0];
  if (!file) {
    return;
  }
  const validImage = file.type.startsWith("image/")
    || /\.(avif|gif|heic|heif|jpe?g|png|webp)$/i.test(file.name);
  if (!validImage) {
    statusMessage.textContent = "Choose an image file to preview.";
    clearPhoto();
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    statusMessage.textContent = "Choose a photo that is 10 MB or smaller.";
    clearPhoto();
    return;
  }
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }
  previewUrl = URL.createObjectURL(file);
  photoPreview.src = previewUrl;
  photoPreview.hidden = false;
  photoPrompt.hidden = true;
  removePhotoButton.hidden = false;
  statusMessage.textContent = "";
});

removePhotoButton.addEventListener("click", clearPhoto);
descriptionInput.addEventListener("input", () => {
  descriptionCount.textContent = String(descriptionInput.value.length);
});
form.querySelectorAll('input[name="contact-method"]').forEach((input) => {
  input.addEventListener("change", updateContactField);
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.reportValidity()) {
    return;
  }
  const file = photoInput.files[0];
  if (!file) {
    statusMessage.textContent = "Choose a photo before sharing your report.";
    return;
  }
  const method = form.querySelector('input[name="contact-method"]:checked').value;
  if (!navigator.share || !navigator.canShare) {
    statusMessage.textContent = "This browser cannot share a photo directly. Open this page on a supported phone browser. No file was downloaded.";
    return;
  }

  const shareData = {
    title: "Problem report",
    text: createMessage(descriptionInput.value.trim(), method),
    files: [file],
  };
  if (!navigator.canShare(shareData)) {
    statusMessage.textContent = "This browser cannot share this photo directly. Try a supported phone browser. No file was downloaded.";
    return;
  }

  submitButton.disabled = true;
  navigator.share(shareData)
    .then(() => {
      statusMessage.textContent = "Share sheet opened. Choose your email or messaging app and recipient, then confirm sending.";
    })
    .catch((error) => {
      statusMessage.textContent = error.name === "AbortError"
        ? "Sharing was cancelled; nothing was sent."
        : "The share sheet could not be opened. No file was downloaded.";
    })
    .finally(() => {
      submitButton.disabled = false;
    });
});

updateContactField();

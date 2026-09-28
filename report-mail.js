import { randomBytes } from "node:crypto";

export function validEmail(email) {
  return typeof email === "string"
    && email.length <= 254
    && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);
}

function encodeBase64Lines(value) {
  return Buffer.from(value, "utf8").toString("base64").match(/.{1,76}/g).join("\r\n");
}

export function createRawEmail({ sender, recipient, description, attachment, mimeType, filename }) {
  const boundary = `report_${randomBytes(18).toString("hex")}`;
  const body = [
    "Problem report",
    "",
    `From: ${sender}`,
    "",
    "Description:",
    description,
  ].join("\n");
  const encodedAttachment = attachment.toString("base64").match(/.{1,76}/g).join("\r\n");
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const message = [
    `From: ${sender}`,
    `To: ${recipient}`,
    "Subject: Problem report",
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodeBase64Lines(body),
    `--${boundary}`,
    `Content-Type: ${mimeType}; name="${safeFilename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${safeFilename}"`,
    "",
    encodedAttachment,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return Buffer.from(message, "utf8").toString("base64url");
}

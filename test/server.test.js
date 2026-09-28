import assert from "node:assert/strict";
import test from "node:test";
import { createRawEmail, validEmail } from "../report-mail.js";

test("validEmail accepts normal addresses and rejects header injection", () => {
  assert.equal(validEmail("person@example.com"), true);
  assert.equal(validEmail("not-an-address"), false);
  assert.equal(validEmail("person@example.com\r\nBcc: victim@example.com"), false);
});

test("createRawEmail includes the description and the photo attachment", () => {
  const raw = createRawEmail({
    sender: "reporter@example.com",
    recipient: "recipient@example.com",
    description: "The light is broken.",
    attachment: Buffer.from("photo payload"),
    mimeType: "image/jpeg",
    filename: "problem-photo.jpg",
  });
  const message = Buffer.from(raw, "base64url").toString("utf8");

  assert.match(message, /From: reporter@example\.com/);
  assert.match(message, /To: recipient@example\.com/);
  assert.match(message, /Content-Disposition: attachment; filename="problem-photo\.jpg"/);
  const encodedBody = message
    .split("Content-Transfer-Encoding: base64\r\n\r\n")[1]
    .split("\r\n--")[0]
    .replace(/\r\n/g, "");
  assert.ok(Buffer.from(encodedBody, "base64").toString("utf8").includes("The light is broken."));
  assert.ok(message.includes(Buffer.from("photo payload").toString("base64")));
});

test("createRawEmail sanitizes attachment filenames", () => {
  const raw = createRawEmail({
    sender: "reporter@example.com",
    recipient: "recipient@example.com",
    description: "A report.",
    attachment: Buffer.from("photo"),
    mimeType: "image/png",
    filename: '../../unsafe"photo.png',
  });
  const message = Buffer.from(raw, "base64url").toString("utf8");

  assert.match(message, /filename="\.\._\.\._unsafe_photo\.png"/);
  assert.doesNotMatch(message, /filename="\.\.\//);
});

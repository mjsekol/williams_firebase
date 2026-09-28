import assert from "node:assert/strict";
import test from "node:test";
import {
  checkPhoneVerification,
  isE164PhoneNumber,
  PhoneVerificationError,
  startPhoneVerification,
} from "../phone-verification.js";

const config = {
  accountSid: "AC123",
  authToken: "test-secret",
  serviceSid: "VA456",
};

test("isE164PhoneNumber accepts international numbers and rejects invalid formats", () => {
  assert.equal(isE164PhoneNumber("+14155552671"), true);
  assert.equal(isE164PhoneNumber("+442071838750"), true);
  assert.equal(isE164PhoneNumber("4155552671"), false);
  assert.equal(isE164PhoneNumber("+0123456789"), false);
  assert.equal(isE164PhoneNumber("+123"), false);
});

test("startPhoneVerification calls Twilio Verify with the SMS channel", async () => {
  let request;
  const fetchStub = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ status: "pending" }) };
  };

  const result = await startPhoneVerification("+14155552671", config, fetchStub);

  assert.equal(result.status, "pending");
  assert.equal(request.url, "https://verify.twilio.com/v2/Services/VA456/Verifications");
  assert.equal(request.options.method, "POST");
  assert.equal(new URLSearchParams(request.options.body).get("To"), "+14155552671");
  assert.equal(new URLSearchParams(request.options.body).get("Channel"), "sms");
  assert.equal(
    request.options.headers.Authorization,
    `Basic ${Buffer.from("AC123:test-secret").toString("base64")}`,
  );
});

test("checkPhoneVerification reports only approved codes as verified", async () => {
  const fetchStub = async (_url, options) => {
    assert.equal(new URLSearchParams(options.body).get("Code"), "123456");
    return { ok: true, json: async () => ({ status: "approved" }) };
  };
  assert.equal(await checkPhoneVerification("+14155552671", "123456", config, fetchStub), true);
});

test("Twilio rate limits are returned as a specific verification error", async () => {
  const fetchStub = async () => ({ ok: false, status: 429 });
  await assert.rejects(
    startPhoneVerification("+14155552671", config, fetchStub),
    (error) => error instanceof PhoneVerificationError && error.status === 429,
  );
});

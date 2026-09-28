export class PhoneVerificationError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "PhoneVerificationError";
    this.status = status;
  }
}

export function isE164PhoneNumber(phone) {
  return typeof phone === "string" && /^\+[1-9]\d{7,14}$/.test(phone);
}

async function requestTwilioVerify(path, fields, config, fetchImpl) {
  const { accountSid, authToken, serviceSid } = config;
  if (!accountSid || !authToken || !serviceSid) {
    throw new PhoneVerificationError("Phone verification is not configured yet.", 503);
  }

  let response;
  try {
    response = await fetchImpl(
      `https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(fields),
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    throw new PhoneVerificationError("Could not reach the phone verification service. Try again.");
  }

  if (!response.ok) {
    throw new PhoneVerificationError(
      response.status === 429
        ? "Too many verification requests. Wait a few minutes and try again."
        : "The verification service could not process this request. Check the number and try again.",
      response.status === 429 ? 429 : 502,
    );
  }
  return response.json();
}

export async function startPhoneVerification(phone, config, fetchImpl = fetch) {
  return requestTwilioVerify(
    "Verifications",
    { To: phone, Channel: "sms" },
    config,
    fetchImpl,
  );
}

export async function checkPhoneVerification(phone, code, config, fetchImpl = fetch) {
  const result = await requestTwilioVerify(
    "VerificationCheck",
    { To: phone, Code: code },
    config,
    fetchImpl,
  );
  return result.status === "approved";
}

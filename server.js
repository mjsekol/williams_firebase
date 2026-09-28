import "dotenv/config";
import { randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import session from "express-session";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { RedisStore } from "connect-redis";
import { createClient } from "redis";
import { google } from "googleapis";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createRawEmail, validEmail } from "./report-mail.js";
import {
  checkPhoneVerification,
  isE164PhoneNumber,
  PhoneVerificationError,
  startPhoneVerification,
} from "./phone-verification.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const APP_ORIGIN = new URL(
  process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`,
).origin;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${APP_ORIGIN}/auth/google/callback`;
const GOOGLE_CONFIGURED = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
const SESSION_SECRET = process.env.SESSION_SECRET;
const REDIS_URL = process.env.REDIS_URL;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;
const PHONE_VERIFICATION_CONFIGURED = Boolean(
  TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_VERIFY_SERVICE_SID,
);
const isProduction = process.env.NODE_ENV === "production";

if (isProduction && (!SESSION_SECRET || SESSION_SECRET.length < 32)) {
  throw new Error("SESSION_SECRET must be set to at least 32 characters in production.");
}
if (!isProduction && !SESSION_SECRET) {
  console.warn("SESSION_SECRET is not set; using a temporary development-only session secret.");
}
if (!GOOGLE_CONFIGURED) {
  console.warn("Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
}
if (!PHONE_VERIFICATION_CONFIGURED) {
  console.warn("Phone verification is not configured. Set the Twilio Verify credentials to enable it.");
}
if (!isProduction) {
  console.warn("The in-memory session store is for local development only.");
}
if (isProduction && !REDIS_URL) {
  throw new Error("REDIS_URL must point to a persistent Redis service in production.");
}

const sessionSecret = SESSION_SECRET || randomBytes(32).toString("hex");
const redisClient = isProduction ? createClient({ url: REDIS_URL }) : null;
if (redisClient) {
  redisClient.on("error", (error) => console.error("Redis session store error:", error));
}
const oauthClient = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID || "local-development-client",
  GOOGLE_CLIENT_SECRET || "local-development-secret",
  GOOGLE_REDIRECT_URI,
);
const app = express();
const cookieName = isProduction ? "__Host-problem-report" : "problem-report";

if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      "img-src": ["'self'", "blob:", "data:"],
      "connect-src": ["'self'"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'none'"],
    },
  },
}));
app.use(express.json({ limit: "2kb" }));
app.use(session({
  name: cookieName,
  secret: sessionSecret,
  ...(redisClient ? { store: new RedisStore({ client: redisClient, prefix: "problem-report:sess:" }) } : {}),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  },
}));

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const reportRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const phoneSendRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const phoneCheckRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 2, fieldSize: 1200 },
});
const allowedImageTypes = new Set([
  "image/avif",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function requireConfiguredGoogle(_req, res, next) {
  if (!GOOGLE_CONFIGURED) {
    res.status(503).send("Google OAuth is not configured. Follow the setup instructions in README.md.");
    return;
  }
  next();
}

function requireUser(req, res, next) {
  if (!req.session.user || !req.session.googleTokens?.refresh_token) {
    res.status(401).json({ error: "Sign in with Google before sending a report." });
    return;
  }
  next();
}

function ensureCsrfToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomBytes(32).toString("hex");
  }
  next();
}

function verifyCsrf(req, res, next) {
  const expected = req.session.csrfToken;
  const supplied = req.get("x-csrf-token");
  if (
    typeof expected !== "string"
    || typeof supplied !== "string"
    || expected.length !== supplied.length
    || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
  ) {
    res.status(403).json({ error: "Your session has expired. Refresh the page and try again." });
    return;
  }
  next();
}

function validateDescription(value) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 1000;
}

function twilioConfig() {
  return {
    accountSid: TWILIO_ACCOUNT_SID,
    authToken: TWILIO_AUTH_TOKEN,
    serviceSid: TWILIO_VERIFY_SERVICE_SID,
  };
}

app.get("/api/session", ensureCsrfToken, (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    configured: GOOGLE_CONFIGURED,
    authenticated: Boolean(req.session.user && req.session.googleTokens?.refresh_token),
    email: req.session.user?.email || null,
    phoneConfigured: PHONE_VERIFICATION_CONFIGURED,
    verifiedPhone: req.session.verifiedPhone || null,
    pendingPhone: req.session.pendingPhone || null,
    csrfToken: req.session.csrfToken,
  });
});

app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/auth/google", authRateLimit, requireConfiguredGoogle, (req, res) => {
  const state = randomBytes(32).toString("hex");
  req.session.oauthState = state;
  const authorizationUrl = oauthClient.generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    prompt: "consent select_account",
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    state,
  });
  res.redirect(authorizationUrl);
});

app.get("/auth/google/callback", authRateLimit, requireConfiguredGoogle, async (req, res, next) => {
  try {
    if (req.query.error || typeof req.query.code !== "string" || typeof req.query.state !== "string") {
      res.redirect("/?auth=cancelled");
      return;
    }

    const expectedState = req.session.oauthState;
    const returnedState = req.query.state;
    delete req.session.oauthState;
    if (
      typeof expectedState !== "string"
      || expectedState.length !== returnedState.length
      || !timingSafeEqual(Buffer.from(expectedState), Buffer.from(returnedState))
    ) {
      res.status(400).send("Google sign-in could not be verified. Go back and try again.");
      return;
    }

    const { tokens } = await oauthClient.getToken(req.query.code);
    if (!tokens.refresh_token || !tokens.id_token) {
      res.status(401).send("Google did not grant the required account access. Please sign in again and approve Gmail sending.");
      return;
    }
    if (!tokens.scope?.split(" ").includes("https://www.googleapis.com/auth/gmail.send")) {
      res.status(401).send("Gmail sending permission was not granted. Sign in again and approve that permission.");
      return;
    }

    const ticket = await oauthClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID,
    });
    const profile = ticket.getPayload();
    if (!profile?.sub || !profile.email || profile.email_verified !== true) {
      res.status(401).send("A verified Google email account is required.");
      return;
    }

    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => error ? reject(error) : resolve());
    });
    req.session.user = { sub: profile.sub, email: profile.email };
    req.session.googleTokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      scope: tokens.scope,
      token_type: tokens.token_type,
    };
    req.session.csrfToken = randomBytes(32).toString("hex");
    await new Promise((resolve, reject) => {
      req.session.save((error) => error ? reject(error) : resolve());
    });
    res.redirect("/");
  } catch (error) {
    next(error);
  }
});

app.post("/api/logout", verifyCsrf, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) {
      next(error);
      return;
    }
    res.clearCookie(cookieName, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/",
    });
    res.json({ ok: true });
  });
});

app.post("/api/phone/start", phoneSendRateLimit, requireUser, verifyCsrf, async (req, res, next) => {
  const phone = req.body?.phone;
  if (!isE164PhoneNumber(phone)) {
    res.status(400).json({ error: "Enter a valid phone number in international format, such as +14155552671." });
    return;
  }

  try {
    const result = await startPhoneVerification(phone, twilioConfig());
    if (result.status !== "pending") {
      res.status(502).json({ error: "The verification code could not be sent. Try again." });
      return;
    }
    req.session.pendingPhone = phone;
    res.json({ ok: true, phone });
  } catch (error) {
    if (error instanceof PhoneVerificationError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    next(error);
  }
});

app.post("/api/phone/check", phoneCheckRateLimit, requireUser, verifyCsrf, async (req, res, next) => {
  const code = req.body?.code;
  const phone = req.session.pendingPhone;
  if (!phone) {
    res.status(400).json({ error: "Request a verification code before entering it." });
    return;
  }
  if (typeof code !== "string" || !/^\d{4,10}$/.test(code)) {
    res.status(400).json({ error: "Enter the numeric verification code from your text message." });
    return;
  }

  try {
    const approved = await checkPhoneVerification(phone, code, twilioConfig());
    if (!approved) {
      res.status(400).json({ error: "That code was not accepted. Check it and try again." });
      return;
    }
    req.session.verifiedPhone = phone;
    delete req.session.pendingPhone;
    res.json({ ok: true, verifiedPhone: phone });
  } catch (error) {
    if (error instanceof PhoneVerificationError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    next(error);
  }
});

app.post("/api/phone/disconnect", requireUser, verifyCsrf, (req, res) => {
  delete req.session.verifiedPhone;
  delete req.session.pendingPhone;
  res.json({ ok: true });
});

app.post(
  "/api/reports",
  reportRateLimit,
  requireUser,
  verifyCsrf,
  upload.single("photo"),
  async (req, res, next) => {
    try {
      const description = req.body.description;
      const recipient = req.body.recipient;
      if (!validateDescription(description)) {
        res.status(400).json({ error: "Add a description of 1 to 1000 characters." });
        return;
      }
      if (!validEmail(recipient)) {
        res.status(400).json({ error: "Enter a valid recipient email address." });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "Choose a problem photo to attach." });
        return;
      }

      const detected = await fileTypeFromBuffer(req.file.buffer);
      if (!detected || !allowedImageTypes.has(detected.mime)) {
        res.status(415).json({ error: "The selected file is not a supported image." });
        return;
      }

      const gmailAuth = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI,
      );
      gmailAuth.setCredentials(req.session.googleTokens);
      const gmail = google.gmail({ version: "v1", auth: gmailAuth });
      const raw = createRawEmail({
        sender: req.session.user.email,
        recipient: recipient.trim(),
        description: description.trim(),
        attachment: req.file.buffer,
        mimeType: detected.mime,
        filename: `problem-photo.${detected.ext}`,
      });
      await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw },
      });

      res.json({ ok: true, sender: req.session.user.email, recipient: recipient.trim() });
    } catch (error) {
      if (error?.code === 401 || error?.code === 403 || error?.response?.data?.error === "invalid_grant") {
        res.status(502).json({
          error: "Gmail could not send this report. Sign out and reconnect Google to renew Gmail permission.",
        });
        return;
      }
      next(error);
    }
  },
);

app.get("/", (_req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

for (const asset of ["app.js", "styles.css", "manifest.webmanifest", "icon.svg", "sw.js"]) {
  app.get(`/${asset}`, (_req, res) => {
    res.sendFile(path.join(ROOT, asset));
  });
}

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === "LIMIT_FILE_SIZE";
    res.status(tooLarge ? 413 : 400).json({
      error: tooLarge ? "The photo must be 10 MB or smaller." : "The photo upload could not be processed.",
    });
    return;
  }

  console.error("Request failed:", error instanceof Error ? error.name : "Unknown error");
  if (res.headersSent) {
    return;
  }
  res.status(500).json({ error: "The request could not be completed. Please try again." });
});

async function startServer() {
  if (redisClient) {
    await redisClient.connect();
  }
  app.listen(PORT, () => {
    console.log(`Problem Report is available at ${APP_ORIGIN}`);
  });
}

startServer().catch((error) => {
  console.error("Could not start the app server:", error);
  process.exitCode = 1;
});

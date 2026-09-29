import { google, type Auth } from "googleapis";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { config } from "../config.js";
import { AppError } from "../middleware/errors.js";
import { googleDriveConnectionRepository } from "../repositories/google-drive-connection.repository.js";

const oauthScopes = [
  "https://www.googleapis.com/auth/drive.file",
  "openid",
  "email",
];
const tokenKey = createHash("sha256")
  .update("odan-google-drive-token-v1\0")
  .update(config.GOOGLE_CLIENT_SECRET)
  .digest();
type OAuthState = { userId: string; expiresAt: number; nonce: string };

function oauth2Client() {
  return new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_REDIRECT_URI,
  );
}
function signature(payload: string) {
  return createHmac("sha256", config.GOOGLE_CLIENT_SECRET)
    .update(payload)
    .digest("base64url");
}
export function createOAuthState(userId: string, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      expiresAt: now + 10 * 60 * 1000,
      nonce: randomBytes(16).toString("hex"),
    } satisfies OAuthState),
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function verifyOAuthState(state: string, now = Date.now()): OAuthState {
  const [payload, provided, extra] = state.split(".");
  if (!payload || !provided || extra)
    throw new AppError(400, "Invalid Google authorization state");
  const expected = signature(payload);
  if (
    Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  )
    throw new AppError(400, "Invalid Google authorization state");
  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<OAuthState>;
    if (
      typeof decoded.userId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(decoded.userId) ||
      typeof decoded.expiresAt !== "number" ||
      decoded.expiresAt < now ||
      typeof decoded.nonce !== "string"
    )
      throw new Error("invalid");
    return decoded as OAuthState;
  } catch {
    throw new AppError(400, "Invalid Google authorization state");
  }
}
export function encryptGoogleToken(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}
export function decryptGoogleToken(value: string): string {
  const [version, iv, tag, encrypted, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted || extra)
    throw new AppError(500, "Stored Google authorization is invalid");
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      tokenKey,
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AppError(500, "Stored Google authorization is invalid");
  }
}
export function getGoogleAuthUrl(userId: string) {
  return oauth2Client().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: oauthScopes,
    state: createOAuthState(userId),
  });
}
export async function connectGoogleDrive(code: string, state: string) {
  const { userId } = verifyOAuthState(state);
  const client = oauth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const profile = await google.oauth2({ version: "v2", auth: client }).userinfo.get();
  const email = profile.data.email?.trim().toLowerCase();
  if (!email) throw new AppError(400, "Google account email was not provided");
  const existing = await googleDriveConnectionRepository.findByEmail(email);
  const refreshToken =
    tokens.refresh_token ??
    (existing ? decryptGoogleToken(existing.refreshToken) : null);
  if (!refreshToken)
    throw new AppError(
      400,
      "Google did not provide offline authorization; reconnect and grant access",
    );
  await googleDriveConnectionRepository.upsert(
    {
      email,
      accessToken: tokens.access_token
        ? encryptGoogleToken(tokens.access_token)
        : null,
      refreshToken: encryptGoogleToken(refreshToken),
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
    userId,
  );
  return { connected: true as const, email };
}
export async function googleDriveStatus() {
  const connection = await googleDriveConnectionRepository.latest();
  return connection
    ? { connected: true as const, email: connection.email }
    : { connected: false as const };
}
export async function disconnectGoogleDrive(actorId: string) {
  await googleDriveConnectionRepository.disconnect(actorId);
}
export function getDriveClient(tokens: Auth.Credentials) {
  const client = oauth2Client();
  client.setCredentials(tokens);
  return google.drive({ version: "v3", auth: client });
}

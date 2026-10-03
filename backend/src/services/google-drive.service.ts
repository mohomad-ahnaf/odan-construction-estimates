import { google, type Auth, type drive_v3 } from "googleapis";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { Readable } from "node:stream";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { AppError } from "../middleware/errors.js";
import { googleDriveConnectionRepository } from "../repositories/google-drive-connection.repository.js";

const oauthScopes = [
  "https://www.googleapis.com/auth/drive.file",
  "openid",
  "email",
];
type OAuthState = { userId: string; expiresAt: number; nonce: string };
export const driveFolderNames = [
  "Drawings",
  "Images",
  "Contracts",
  "BOQ",
  "Reports",
  "Other",
] as const;
export type DriveFolderName = (typeof driveFolderNames)[number];

function tokenKey() {
  return createHash("sha256")
    .update("odan-google-drive-token-v1\0")
    .update(config.GOOGLE_CLIENT_SECRET)
    .digest();
}

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
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
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
      tokenKey(),
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

function googleStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as {
    code?: unknown;
    response?: { status?: unknown };
  };
  const value = candidate.response?.status ?? candidate.code;
  return typeof value === "number" ? value : undefined;
}

function driveFailure(error: unknown, action: string): never {
  const status = googleStatus(error);
  if (status === 404) throw new AppError(404, "Google Drive file was not found");
  logger.warn({ googleStatus: status, action }, "Google Drive operation failed");
  throw new AppError(502, `Google Drive could not ${action}`);
}

export async function getAuthenticatedDriveClient() {
  const connection = await googleDriveConnectionRepository.latestWithTokens();
  if (!connection)
    throw new AppError(409, "Google Drive is not connected");

  const client = oauth2Client();
  client.setCredentials({
    access_token: connection.accessToken
      ? decryptGoogleToken(connection.accessToken)
      : undefined,
    refresh_token: decryptGoogleToken(connection.refreshToken),
    expiry_date: connection.expiresAt?.getTime(),
  });
  client.on("tokens", (tokens) => {
    const update: {
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: Date | null;
    } = {};
    if (tokens.access_token)
      update.accessToken = encryptGoogleToken(tokens.access_token);
    if (tokens.refresh_token)
      update.refreshToken = encryptGoogleToken(tokens.refresh_token);
    if (tokens.expiry_date !== undefined)
      update.expiresAt = tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : null;
    if (Object.keys(update).length)
      void googleDriveConnectionRepository
        .updateTokens(connection.id, update)
        .catch(() =>
          logger.warn(
            { connectionId: connection.id },
            "Could not persist refreshed Google Drive authorization",
          ),
        );
  });
  return google.drive({ version: "v3", auth: client });
}

function escapeDriveQuery(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

export async function createDriveFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId?: string,
) {
  const clauses = [
    `name = '${escapeDriveQuery(name)}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    `'${escapeDriveQuery(parentId ?? "root")}' in parents`,
  ];
  try {
    const existing = await drive.files.list({
      q: clauses.join(" and "),
      spaces: "drive",
      fields: "files(id,name)",
      pageSize: 1,
    });
    const existingId = existing.data.files?.[0]?.id;
    if (existingId) return existingId;
    const created = await drive.files.create({
      requestBody: {
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId ?? "root"],
      },
      fields: "id",
    });
    if (!created.data.id)
      throw new Error("Google Drive returned no folder ID");
    return created.data.id;
  } catch (error) {
    driveFailure(error, "create the required folder");
  }
}

export async function ensureProjectDriveFolders(
  drive: drive_v3.Drive,
  projectCode: string,
  projectName: string,
) {
  const rootId = await createDriveFolder(drive, "Odan Construction ERP");
  const projectsId = await createDriveFolder(drive, "Projects", rootId);
  const projectId = await createDriveFolder(
    drive,
    `${projectCode} - ${projectName}`,
    projectsId,
  );
  const categories = {} as Record<DriveFolderName, string>;
  for (const name of driveFolderNames)
    categories[name] = await createDriveFolder(drive, name, projectId);
  return { rootId, projectsId, projectId, categories };
}

export async function uploadDriveFile(
  drive: drive_v3.Drive,
  input: {
    folderId: string;
    fileName: string;
    mimeType: string;
    buffer: Buffer;
  },
) {
  try {
    const result = await drive.files.create({
      requestBody: { name: input.fileName, parents: [input.folderId] },
      media: {
        mimeType: input.mimeType,
        body: Readable.from(input.buffer),
      },
      fields:
        "id,name,mimeType,size,createdTime,modifiedTime,webViewLink,webContentLink",
    });
    if (!result.data.id) throw new Error("Google Drive returned no file ID");
    return result.data;
  } catch (error) {
    driveFailure(error, "upload the file");
  }
}

export async function deleteDriveFile(
  drive: drive_v3.Drive,
  fileId: string,
) {
  try {
    await drive.files.delete({ fileId });
    return true;
  } catch (error) {
    if (googleStatus(error) === 404) return false;
    driveFailure(error, "delete the file");
  }
}

export async function setDriveFileTrashed(
  drive: drive_v3.Drive,
  fileId: string,
  trashed: boolean,
) {
  try {
    await drive.files.update({ fileId, requestBody: { trashed }, fields: "id,trashed" });
    return true;
  } catch (error) {
    if (googleStatus(error) === 404 && trashed) return false;
    driveFailure(error, trashed ? "trash the file" : "restore the file");
  }
}

export async function getDriveFileMetadata(
  drive: drive_v3.Drive,
  fileId: string,
) {
  try {
    const result = await drive.files.get({
      fileId,
      fields:
        "id,name,mimeType,size,createdTime,modifiedTime,webViewLink,webContentLink,trashed",
    });
    return result.data;
  } catch (error) {
    driveFailure(error, "retrieve file information");
  }
}

export async function getDriveFileContent(
  drive: drive_v3.Drive,
  fileId: string,
) {
  try {
    const result = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" },
    );
    return result.data as unknown as Readable;
  } catch (error) {
    driveFailure(error, "retrieve the file content");
  }
}

export function generateDriveLinks(fileId: string) {
  const encoded = encodeURIComponent(fileId);
  return {
    viewUrl: `https://drive.google.com/file/d/${encoded}/view`,
    downloadUrl: `https://drive.google.com/uc?export=download&id=${encoded}`,
  };
}

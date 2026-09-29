import { describe, expect, it, vi } from "vitest";
import { AppError } from "../middleware/errors.js";
import {
  createOAuthState,
  createDriveFolder,
  decryptGoogleToken,
  encryptGoogleToken,
  verifyOAuthState,
} from "./google-drive.service.js";

const userId = "11111111-1111-4111-8111-111111111111";

describe("Google Drive OAuth security", () => {
  it("signs a short-lived state bound to the initiating administrator", () => {
    const now = Date.now();
    const state = createOAuthState(userId, now);
    expect(verifyOAuthState(state, now + 1000).userId).toBe(userId);
    expect(() => verifyOAuthState(`${state}x`, now + 1000)).toThrow(AppError);
    expect(() => verifyOAuthState(state, now + 10 * 60 * 1000 + 1)).toThrow(
      "Invalid Google authorization state",
    );
  });

  it("encrypts stored tokens with authenticated encryption", () => {
    const token = "example-token-value";
    const encrypted = encryptGoogleToken(token);
    expect(encrypted).not.toContain(token);
    expect(decryptGoogleToken(encrypted)).toBe(token);
    const parts = encrypted.split(".");
    parts[3] = `${parts[3]}x`;
    expect(() => decryptGoogleToken(parts.join("."))).toThrow(
      "Stored Google authorization is invalid",
    );
  });
});

describe("Google Drive folder management", () => {
  it("reuses an existing folder under the requested parent", async () => {
    const list = vi.fn().mockResolvedValue({
      data: { files: [{ id: "existing-folder", name: "Projects" }] },
    });
    const create = vi.fn();
    const drive = { files: { list, create } };

    await expect(
      createDriveFolder(drive as never, "Projects", "root-folder"),
    ).resolves.toBe("existing-folder");
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        q: expect.stringContaining("'root-folder' in parents"),
      }),
    );
    expect(create).not.toHaveBeenCalled();
  });
});

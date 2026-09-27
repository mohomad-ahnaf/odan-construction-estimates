import { createInterface, emitKeypressEvents } from "node:readline";
import { z } from "zod";
import { db } from "../src/db.js";
import { authRepository } from "../src/repositories/auth.repository.js";
import { hashPassword } from "../src/services/auth.service.js";
import { newPasswordSchema } from "../src/validation.js";

function readEmail(): Promise<string> {
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    terminal.question("Existing account email: ", (answer) => {
      terminal.close();
      resolve(answer);
    });
  });
}

function readHidden(label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = "";
    process.stdout.write(label);
    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const finish = () => {
      process.stdin.removeListener("keypress", onKeypress);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const onKeypress = (
      sequence: string,
      key: { name?: string; ctrl?: boolean; meta?: boolean },
    ) => {
      if (key.ctrl && key.name === "c") {
        finish();
        reject(new Error("Recovery cancelled"));
      } else if (key.name === "return" || key.name === "enter") {
        finish();
        resolve(value);
      } else if (key.name === "backspace") {
        if (value.length) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else if (
        !key.ctrl &&
        !key.meta &&
        sequence &&
        !/\p{Cc}/u.test(sequence)
      ) {
        value += sequence;
        process.stdout.write("*");
      }
    };
    process.stdin.on("keypress", onKeypress);
  });
}

try {
  if (
    !process.stdin.isTTY ||
    !process.stdout.isTTY ||
    process.argv.length !== 2
  )
    throw new Error("Interactive terminal required");
  const email = z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase())
    .safeParse(await readEmail());
  if (!email.success)
    throw new Error("Account recovery could not be completed");
  const password = await readHidden("New password (16–128 characters): ");
  const confirmation = await readHidden("Confirm new password: ");
  if (password !== confirmation) throw new Error("Passwords do not match");
  if (!newPasswordSchema.safeParse(password).success)
    throw new Error("Password must contain 16 to 128 characters");
  const user = await authRepository.user(email.data);
  if (!user) throw new Error("Account recovery could not be completed");
  const changed = await authRepository.replacePassword({
    userId: user.id,
    expectedHash: user.passwordHash,
    newHash: await hashPassword(password),
    action: "AUTH_PASSWORD_RECOVERED",
  });
  if (!changed) throw new Error("Account recovery could not be completed");
  process.stdout.write("Password reset. All sessions have been revoked.\n");
} catch (error) {
  const message =
    error instanceof Error &&
    [
      "Interactive terminal required",
      "Recovery cancelled",
      "Passwords do not match",
      "Password must contain 16 to 128 characters",
    ].includes(error.message)
      ? error.message
      : "Account recovery could not be completed";
  process.stderr.write(`${message}.\n`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}

import { it, expect } from "vitest";
import {
  encrypt,
  decrypt,
  playlistId,
  safeEqual,
} from "../../src/infrastructure/security";
import { config } from "../../src/infrastructure/config";
import { testConfig } from "../helpers";
import { extractMetadata, updateSchema } from "../../src/integrations/telegram";
it("authenticated encryption binds user and detects tampering", async () => {
  const value = await encrypt(
    { access_token: "synthetic" },
    testConfig.TOKEN_ENCRYPTION_KEY,
    "123",
  );
  expect(value).not.toContain("synthetic");
  expect(await decrypt(value, testConfig.TOKEN_ENCRYPTION_KEY, "123")).toEqual({
    access_token: "synthetic",
  });
  await expect(
    decrypt(value, testConfig.TOKEN_ENCRYPTION_KEY, "456"),
  ).rejects.toThrow();
  await expect(
    decrypt(
      value.slice(0, -4) + "AAAA",
      testConfig.TOKEN_ENCRYPTION_KEY,
      "123",
    ),
  ).rejects.toThrow();
});
it("secret comparison", async () => {
  expect(await safeEqual("a", "a")).toBe(true);
  expect(await safeEqual("a", "b")).toBe(false);
});
it.each([
  "P".repeat(22),
  "spotify:playlist:" + "P".repeat(22),
  "https://open.spotify.com/playlist/" + "P".repeat(22) + "?si=example",
])("playlist format %s", (input) =>
  expect(playlistId(input)).toBe("P".repeat(22)),
);
it.each([
  "https://evil.test/playlist/" + "P".repeat(22),
  "https://open.spotify.com.evil.test/playlist/" + "P".repeat(22),
  "file:///etc/passwd",
  "';DROP TABLE users;--",
  "spotify:track:" + "P".repeat(22),
])("rejects unsafe playlist %s", (input) =>
  expect(() => playlistId(input)).toThrow(),
);
it("production fails closed", () => {
  expect(() => config({ ...testConfig, APP_ENV: "production" })).toThrow();
  expect(() => config({ ...testConfig, APP_MODE: "live" })).toThrow();
  expect(() =>
    config({ ...testConfig, ALLOWED_TELEGRAM_USER_IDS: "" }),
  ).toThrow();
});
it("audio metadata has priority over filename", () => {
  const u = updateSchema.parse({
    update_id: 1,
    message: {
      message_id: 1,
      chat: { id: 123, type: "private" },
      audio: {
        file_id: "f",
        file_unique_id: "u",
        title: "Title",
        performer: "Artist",
        duration: 20,
        file_name: "Wrong - Name.mp3",
      },
    },
  });
  expect(extractMetadata(u)).toMatchObject({
    title: "Title",
    artist: "Artist",
    durationSeconds: 20,
  });
});
it("unsupported document is ignored", () => {
  const u = updateSchema.parse({
    update_id: 1,
    message: {
      message_id: 1,
      chat: { id: 123, type: "private" },
      document: {
        file_id: "f",
        file_unique_id: "u",
        file_name: "report.pdf",
        mime_type: "application/pdf",
      },
    },
  });
  expect(extractMetadata(u)).toBeNull();
});
it("rejects oversized metadata", () =>
  expect(
    updateSchema.safeParse({
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 1, type: "private" },
        text: "x".repeat(2001),
      },
    }).success,
  ).toBe(false));

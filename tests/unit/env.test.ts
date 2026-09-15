import { expect, test, describe } from "bun:test";
import { z } from "zod";

const testSchema = z.object({
  URL: z.string().url(),
  KEY: z.string().min(1),
});

describe("Environment Validation System", () => {
  test("should validate correct environment variables", () => {
    const mockEnv = {
      URL: "https://example.supabase.co",
      KEY: "sb_publishable_123",
    };
    const result = testSchema.safeParse(mockEnv);
    expect(result.success).toBe(true);
  });

  test("should fail on invalid URL", () => {
    const mockEnv = {
      URL: "invalid-url",
      KEY: "sb_publishable_123",
    };
    const result = testSchema.safeParse(mockEnv);
    expect(result.success).toBe(false);
  });
});

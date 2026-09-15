import { createServerFn } from "@tanstack/react-start";

export const checkHealth = createServerFn({ method: "GET" })
  .handler(async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  });

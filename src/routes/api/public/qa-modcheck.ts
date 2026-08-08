import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/qa-modcheck")({
  server: {
    handlers: {
      GET: async () => {
        const results: Record<string, string> = {};
        const targets: Record<string, () => Promise<unknown>> = {
          admin: () => import("@/lib/admin.functions"),
          backups: () => import("@/lib/backups.functions"),
          adminConsole: () => import("@/lib/admin-console.functions"),
        };
        for (const [key, load] of Object.entries(targets)) {
          try {
            await load();
            results[key] = "ok";
          } catch (error) {
            results[key] =
              error instanceof Error ? `${error.name}: ${error.message}` : String(error);
          }
        }
        return Response.json(results);
      },
    },
  },
});

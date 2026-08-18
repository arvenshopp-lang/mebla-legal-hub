/**
 * مسار معالجة استجابة تفويض مايكروسوفت ون درايف (Microsoft OneDrive OAuth Callback)
 * GET /api/integrations/onedrive/callback?code=...&state=...
 */
import { createFileRoute } from "@tanstack/react-router";
import { exchangeOneDriveCode } from "@/lib/storage/onedrive.server";
import {
  getHybridStorageSettings,
  saveHybridStorageSettings,
} from "@/lib/storage/hybrid-storage.server";

export const Route = createFileRoute("/api/integrations/onedrive/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state") || "";
        const error = url.searchParams.get("error");

        if (error || !code) {
          return Response.redirect(
            `${url.origin}/settings?onedrive_error=${encodeURIComponent(error || "missing_code")}`,
            302,
          );
        }

        try {
          const parts = state.split(":");
          const orgId = parts[2] || "00000000-0000-0000-0000-000000000001";
          const userId = parts[3] || "usr-default-lawyer";

          const tokens = await exchangeOneDriveCode(code);
          if (!tokens) {
            return Response.redirect(`${url.origin}/settings?onedrive_error=token_exchange_failed`, 302);
          }

          const currentSettings = await getHybridStorageSettings(orgId, userId);
          setCloudAccessToken(orgId, userId, "onedrive", tokens.accessToken);
          await saveHybridStorageSettings(orgId, userId, {
            onedrive: {
              ...currentSettings.onedrive,
              isConnected: true,
              status: "connected",
              lastSyncAt: new Date().toISOString(),
            },
          });

          return Response.redirect(`${url.origin}/settings?onedrive_connected=true`, 302);
        } catch (err) {
          console.error("[onedrive-callback]", err);
          return Response.redirect(
            `${url.origin}/settings?onedrive_error=${encodeURIComponent("connection_failed")}`,
            302,
          );
        }
      },
    },
  },
});

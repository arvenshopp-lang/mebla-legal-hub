/**
 * دوال الخادم للتقويم الموحد والمزامنة (TanStack Start Server Functions)
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getCalendarSyncSettings,
  rotateCalendarToken,
  getCalendarEvents,
  triggerManualCalendarSync,
} from "./calendar.server";
import { getGoogleAuthUrl } from "./google-calendar.server";
import { getOutlookAuthUrl } from "./outlook-calendar.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export const getCalendarSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { organizationId?: string; userId?: string } | undefined) => d || {})
  .handler(async ({ data }) => {
    const orgId = data.organizationId || DEFAULT_ORG_ID;
    const userId = data.userId || "usr-default-lawyer";
    const settings = await getCalendarSyncSettings(orgId, userId);

    const googleAuthUrl = getGoogleAuthUrl(`state:google:${orgId}:${userId}`);
    const outlookAuthUrl = getOutlookAuthUrl(`state:outlook:${orgId}:${userId}`);

    return {
      settings,
      googleAuthUrl,
      outlookAuthUrl,
    };
  });

export const rotateCalendarTokenFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { organizationId?: string; userId?: string }) => d)
  .handler(async ({ data }) => {
    const orgId = data.organizationId || DEFAULT_ORG_ID;
    const userId = data.userId || "usr-default-lawyer";
    const settings = await rotateCalendarToken(orgId, userId);
    return { settings };
  });

export const getCalendarEventsListFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (
      d:
        | {
            organizationId?: string;
            includeHearings?: boolean;
            includeTasks?: boolean;
            fromDate?: string;
            toDate?: string;
          }
        | undefined,
    ) => d || {},
  )
  .handler(async ({ data }) => {
    const orgId = data.organizationId || DEFAULT_ORG_ID;
    const events = await getCalendarEvents(orgId, {
      includeHearings: data.includeHearings,
      includeTasks: data.includeTasks,
      fromDate: data.fromDate,
      toDate: data.toDate,
    });
    return { events };
  });

export const triggerManualSyncFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: { organizationId?: string; userId?: string; provider: "google" | "outlook" }) => d,
  )
  .handler(async ({ data }) => {
    const orgId = data.organizationId || DEFAULT_ORG_ID;
    const userId = data.userId || "usr-default-lawyer";
    const result = await triggerManualCalendarSync(orgId, userId, data.provider);
    return { result };
  });

/**
 * دوال الخادم للتخزين الهجين (TanStack Start Server Functions)
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getHybridStorageSettings,
  saveHybridStorageSettings,
  dispatchDocumentUpload,
} from "./hybrid-storage.server";
import { getOneDriveAuthUrl } from "./onedrive.server";
import { getGoogleDriveAuthUrl } from "./googledrive.server";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export const getHybridStorageSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { organizationId?: string; userId?: string } | undefined) => d || {})
  .handler(async ({ data }) => {
    const orgId = data.organizationId || DEFAULT_ORG_ID;
    const userId = data.userId || "usr-default-lawyer";

    const settings = await getHybridStorageSettings(orgId, userId);
    const onedriveAuthUrl = getOneDriveAuthUrl(`state:onedrive:${orgId}:${userId}`);
    const googledriveAuthUrl = getGoogleDriveAuthUrl(`state:googledrive:${orgId}:${userId}`);

    return {
      settings,
      onedriveAuthUrl,
      googledriveAuthUrl,
    };
  });

export const saveHybridStorageSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      organizationId?: string;
      userId?: string;
      defaultDestination?: "vault" | "onedrive" | "both";
      defaultClientUploadDestination?: "vault" | "onedrive" | "both";
      autoSyncToCloud?: boolean;
    }) => d,
  )
  .handler(async ({ data }) => {
    const orgId = data.organizationId || DEFAULT_ORG_ID;
    const userId = data.userId || "usr-default-lawyer";

    const settings = await saveHybridStorageSettings(orgId, userId, {
      defaultDestination: data.defaultDestination,
      defaultClientUploadDestination: data.defaultClientUploadDestination,
      autoSyncToCloud: data.autoSyncToCloud,
    });

    return { settings };
  });

export const uploadCaseDocumentHybridFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      organizationId?: string;
      caseId?: string;
      caseNumber?: string;
      caseTitle?: string;
      destination: "vault" | "onedrive" | "both";
      documentCategory?: string;
      fileName: string;
      fileBase64: string;
      contentType: string;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const orgId = data.organizationId || DEFAULT_ORG_ID;
    const userId = context.userId;

    const buffer = Buffer.from(data.fileBase64, "base64");

    const result = await dispatchDocumentUpload({
      organizationId: orgId,
      userId,
      destination: data.destination,
      caseId: data.caseId,
      caseNumber: data.caseNumber,
      caseTitle: data.caseTitle,
      documentCategory: data.documentCategory,
      fileName: data.fileName,
      fileBuffer: buffer,
      contentType: data.contentType,
      source: "lawyer_upload",
    });

    return { result };
  });

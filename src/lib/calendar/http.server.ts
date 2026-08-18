/**
 * ناقل الاتصال الآمن لمزودي التقويم (جوجل / مايكروسوفت).
 */
import { createProviderFetch } from "@/lib/integrations/provider-fetch.server";

export const calendarFetch = createProviderFetch([
  "accounts.google.com",
  "oauth2.googleapis.com",
  "www.googleapis.com",
  "login.microsoftonline.com",
  "graph.microsoft.com",
]);

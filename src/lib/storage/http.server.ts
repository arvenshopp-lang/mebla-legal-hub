/**
 * ناقل الاتصال الآمن لمزودي التخزين السحابي (جوجل درايف / ون درايف).
 */
import { createProviderFetch } from "@/lib/integrations/provider-fetch.server";

export const storageFetch = createProviderFetch([
  "accounts.google.com",
  "oauth2.googleapis.com",
  "www.googleapis.com",
  "login.microsoftonline.com",
  "graph.microsoft.com",
]);

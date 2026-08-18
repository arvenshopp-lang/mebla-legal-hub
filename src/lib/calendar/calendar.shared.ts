/**
 * النماذج والأنواع المشتركة لموديول التقويم الموحد والمزامنة الثنائية
 * Unified Calendar & 2-Way Sync Models
 */

export type CalendarEventCategory = "hearing" | "deadline" | "task" | "consultation";

export interface CalendarEventModel {
  id: string;
  sourceType: "hearing" | "task";
  sourceId: string;
  title: string;
  description: string;
  category: CalendarEventCategory;
  startDate: string; // ISO 8601
  endDate: string;   // ISO 8601
  allDay?: boolean;
  courtName?: string | null;
  judicialCircuit?: string | null;
  location?: string | null;
  remoteLink?: string | null;
  caseId?: string | null;
  caseNumber?: string | null;
  caseTitle?: string | null;
  clientName?: string | null;
  status: string;
  priority?: "low" | "medium" | "high" | "urgent";
  assignedToName?: string | null;
  url: string;
}

export interface CalendarSyncSettings {
  organizationId: string;
  userId: string;
  icsToken: string;
  icsFeedUrl: string;
  webcalFeedUrl: string;
  includeHearings: boolean;
  includeDeadlines: boolean;
  includeTasks: boolean;
  
  // Google Calendar Integration
  googleConnected: boolean;
  googleEmail?: string | null;
  googleCalendarId?: string | null;
  googleCalendarName?: string | null;
  googleLastSyncAt?: string | null;
  googleSyncStatus?: "idle" | "syncing" | "success" | "error";
  googleErrorMessage?: string | null;

  // Microsoft Outlook Integration
  outlookConnected: boolean;
  outlookEmail?: string | null;
  outlookCalendarId?: string | null;
  outlookCalendarName?: string | null;
  outlookLastSyncAt?: string | null;
  outlookSyncStatus?: "idle" | "syncing" | "success" | "error";
  outlookErrorMessage?: string | null;

  // Sync Preferences
  autoSyncEnabled: boolean;
  alarmMinutesBefore: number[]; // e.g. [1440, 120] (24h, 2h)
  updatedAt: string;
}

export interface CalendarSyncResult {
  success: boolean;
  provider: "google" | "outlook" | "ics";
  eventsPushed: number;
  eventsUpdated: number;
  eventsDeleted: number;
  lastSyncAt: string;
  errorMessage?: string;
}

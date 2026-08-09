# PLAN 3 — جرد لوحة إدارة مِهلة (/mehla-admin)

- إجمالي المسارات: **38**
- إجمالي عناصر الإجراء التفاعلية (onClick/onSubmit): **214**
- إجمالي دوال الخادم المستخدمة من الواجهة: **150**
- عناصر تحكم ميتة مكتشَفة: **0**

| المسار | أزرار | نوافذ | حقول | معالجات | تبويبات | بحث | فلترة | ترقيم | تصدير | دوال خادم | إجراءات خطرة | ميتة |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/mehla-admin/activity` | 6 | 1 | 0 | 7 | 0 | ✔ | ✔ | ✔ | ✔ | 1 | 0 | — |
| `/mehla-admin/analytics` | 2 | 0 | 0 | 2 | 0 | — | ✔ | — | — | 1 | 0 | — |
| `/mehla-admin/backups` | 14 | 4 | 11 | 14 | 0 | — | ✔ | — | — | 7 | 0 | — |
| `/mehla-admin/billing/:id` | 7 | 0 | 2 | 6 | 0 | ✔ | — | — | — | 7 | 0 | — |
| `/mehla-admin/billing` | 0 | 0 | 0 | 1 | 0 | ✔ | — | ✔ | — | 1 | 0 | — |
| `/mehla-admin/content` | 4 | 1 | 5 | 7 | 0 | — | ✔ | ✔ | — | 3 | 1 | — |
| `/mehla-admin/crm` | 0 | 0 | 0 | 1 | 0 | — | — | — | — | 0 | 0 | — |
| `/mehla-admin/design` | 10 | 0 | 0 | 12 | 0 | ✔ | ✔ | ✔ | — | 6 | 1 | — |
| `/mehla-admin/email` | 4 | 1 | 10 | 6 | 0 | — | — | — | — | 5 | 1 | — |
| `/mehla-admin/failures` | 0 | 1 | 0 | 2 | 0 | ✔ | ✔ | ✔ | — | 2 | 0 | — |
| `/mehla-admin/flags` | 6 | 2 | 8 | 11 | 0 | — | ✔ | — | — | 8 | 2 | — |
| `/mehla-admin/hr` | 1 | 0 | 0 | 4 | 0 | ✔ | ✔ | ✔ | — | 5 | 0 | — |
| `/mehla-admin` | 3 | 0 | 2 | 4 | 0 | — | — | — | — | 6 | 0 | — |
| `/mehla-admin/integrations` | 11 | 3 | 2 | 12 | 0 | — | ✔ | — | — | 7 | 1 | — |
| `/mehla-admin/jobs` | 2 | 0 | 0 | 2 | 0 | — | — | — | — | 2 | 0 | — |
| `/mehla-admin/logs` | 3 | 2 | 0 | 4 | 0 | ✔ | ✔ | ✔ | ✔ | 4 | 0 | — |
| `/mehla-admin/mail` | 10 | 3 | 4 | 17 | 0 | ✔ | ✔ | — | — | 17 | 2 | — |
| `/mehla-admin/marketing` | 0 | 0 | 0 | 1 | 0 | — | — | — | — | 1 | 0 | — |
| `/mehla-admin/monitoring` | 1 | 0 | 0 | 1 | 0 | — | — | — | — | 2 | 0 | — |
| `/mehla-admin/notifications` | 1 | 0 | 6 | 1 | 0 | — | ✔ | — | — | 2 | 0 | — |
| `/mehla-admin/organizations` | 11 | 3 | 14 | 11 | 0 | ✔ | ✔ | ✔ | — | 9 | 2 | — |
| `/mehla-admin/plans` | 3 | 1 | 11 | 5 | 0 | — | ✔ | — | — | 0 | 0 | — |
| `/mehla-admin/rbac` | 2 | 0 | 0 | 3 | 0 | — | — | — | — | 1 | 0 | — |
| `/mehla-admin/revenue` | 0 | 0 | 0 | 0 | 0 | — | — | — | — | 1 | 0 | — |
| `/mehla-admin/roles` | 0 | 0 | 0 | 0 | 0 | — | — | — | — | 0 | 0 | — |
| `/mehla-admin (layout)` | 0 | 0 | 0 | 0 | 0 | ✔ | — | — | — | 0 | 0 | — |
| `/mehla-admin/sales/:id` | 25 | 6 | 12 | 25 | 0 | ✔ | ✔ | — | — | 13 | 2 | — |
| `/mehla-admin/sales` | 2 | 0 | 0 | 3 | 0 | ✔ | ✔ | ✔ | ✔ | 2 | 0 | — |
| `/mehla-admin/security` | 0 | 0 | 0 | 6 | 0 | — | — | — | ✔ | 6 | 1 | — |
| `/mehla-admin/seo` | 1 | 0 | 10 | 1 | 0 | ✔ | ✔ | — | — | 2 | 0 | — |
| `/mehla-admin/services` | 1 | 0 | 0 | 1 | 0 | — | — | — | — | 1 | 0 | — |
| `/mehla-admin/settings` | 1 | 0 | 13 | 1 | 0 | — | — | — | — | 2 | 0 | — |
| `/mehla-admin/sms` | 2 | 0 | 0 | 2 | 0 | — | ✔ | — | — | 3 | 0 | — |
| `/mehla-admin/staff` | 3 | 1 | 5 | 4 | 0 | — | ✔ | — | — | 2 | 0 | — |
| `/mehla-admin/subscriptions` | 5 | 3 | 10 | 11 | 0 | ✔ | ✔ | — | — | 6 | 2 | — |
| `/mehla-admin/support` | 3 | 1 | 2 | 4 | 0 | ✔ | ✔ | — | ✔ | 1 | 0 | — |
| `/mehla-admin/support/:ticketId` | 15 | 2 | 17 | 16 | 0 | ✔ | ✔ | — | — | 14 | 0 | — |
| `/mehla-admin/users` | 6 | 1 | 1 | 6 | 0 | ✔ | ✔ | ✔ | — | 8 | 1 | — |

## دوال الخادم لكل مسار

### `/mehla-admin/activity`

`getActivityFeed`

### `/mehla-admin/analytics`

`getGrowthSeries`

### `/mehla-admin/backups`

`decideBackupRestore` · `listBackupSnapshots` · `listRestoreRequests` · `recordBackupRestoreExecution` · `recordBackupSnapshot` · `requestBackupRestore` · `verifyBackupSnapshot`

### `/mehla-admin/billing/:id`

`billingAddNote` · `billingInvoiceDetail` · `billingInvoicePdf` · `billingQuotePdf` · `billingReceiptPdf` · `billingSendInvoiceEmail` · `billingStatementPdf`

### `/mehla-admin/billing`

`billingListSettings`

### `/mehla-admin/content`

`deleteContentPage` · `listContentPages` · `saveContentPage`

### `/mehla-admin/design`

`getDesignStudio` · `publishDesign` · `resetDesignPage` · `restoreDesignVersion` · `rollbackDesign` · `saveDesignDraft`

### `/mehla-admin/email`

`deleteEmailTemplate` · `getPlatformSettings` · `listEmailTemplates` · `saveEmailTemplate` · `savePlatformSettings`

### `/mehla-admin/failures`

`listSystemFailures` · `type SystemFailureRow`

### `/mehla-admin/flags`

`deleteFeatureFlag` · `deleteNotificationRule` · `listFeatureFlags` · `listNotificationRules` · `saveFeatureFlag` · `saveNotificationRule` · `type FeatureFlag` · `type NotificationRule`

### `/mehla-admin/hr`

`createHrEmployee` · `listHrDepartments` · `listHrEmployees` · `listUnlinkedPlatformStaff` · `updateHrEmployee`

### `/mehla-admin`

`getActivityOverview` · `getGrowthSeries` · `getJobsOverview` · `getPlatformMetrics` · `getServiceHealth` · `getSystemHealth`

### `/mehla-admin/integrations`

`activateIntegration` · `getIntegrationsHub` · `removeIntegration` · `saveIntegrationConfig` · `sendIntegrationTestMessage` · `setIntegrationEnabledState` · `testIntegrationConnection`

### `/mehla-admin/jobs`

`getJobsOverview` · `retryEmailJob`

### `/mehla-admin/logs`

`exportAuditLogs` · `listAuditFacets` · `listAuditLogs` · `type AuditLogRow`

### `/mehla-admin/mail`

`addMailNote` · `checkMailRecipients` · `deleteMailAttachment` · `deleteMailLabel` · `discardMailDraft` · `getMailAttachmentUrl` · `getMailThread` · `getMailWorkspace` · `liftMailRecipientBlock` · `listMailThreads` · `retryMailMessage` · `saveMailDraft` · `saveMailLabel` · `sendMailMessage` · `updateMailThread` · `updateMailbox` · `uploadMailAttachment`

### `/mehla-admin/marketing`

`getMarketingPerformanceSummary`

### `/mehla-admin/monitoring`

`getMonitoringSnapshot` · `getSystemHealth`

### `/mehla-admin/notifications`

`listBroadcasts` · `sendBroadcast`

### `/mehla-admin/organizations`

`deleteOrganization` · `listOrganizationMembers` · `listOrganizations` · `listSupportAccessGrants` · `requestSupportAccess` · `revokeSupportAccess` · `setOrganizationActive` · `type AdminOrgRow` · `updateOrganization`

### `/mehla-admin/rbac`

`getRbacOverview`

### `/mehla-admin/revenue`

`getRevenueSummary`

### `/mehla-admin/sales/:id`

`salesActivate` · `salesConvertToInvoice` · `salesConvertToSubscription` · `salesDecideApproval` · `salesDeleteDraft` · `salesDetail` · `salesDocumentPdf` · `salesOptions` · `salesRecordDecision` · `salesRequestApproval` · `salesSend` · `salesSign` · `salesTerminate`

### `/mehla-admin/sales`

`salesExportCsv` · `salesList`

### `/mehla-admin/security`

`registerEncryptionKeyVersion` · `retireEncryptionKeyVersion` · `runReencryptionBatch` · `securityCenterOverview` · `securityDocumentDenials` · `securityRevealFeed`

### `/mehla-admin/seo`

`getPlatformSettings` · `savePlatformSettings`

### `/mehla-admin/services`

`getServiceHealth`

### `/mehla-admin/settings`

`getPlatformSettings` · `savePlatformSettings`

### `/mehla-admin/sms`

`getSmsSettingsAdmin` · `sendTestSmsAdmin` · `updateSmsSettingsAdmin`

### `/mehla-admin/staff`

`createStaffMember` · `updateStaffMember`

### `/mehla-admin/subscriptions`

`activateSubscription` · `cancelSubscription` · `getSubscriptionAdminDetail` · `resumeSubscription` · `setSubscriptionAutoRenew` · `suspendSubscription`

### `/mehla-admin/support`

`replyToTicket`

### `/mehla-admin/support/:ticketId`

`addSupportNote` · `assignSupportTicket` · `escalateSupportTicket` · `getSupportTicket` · `getSupportWorkspace` · `listSupportTickets` · `mergeSupportTickets` · `replySupportTicket` · `requestSupportCsat` · `reviewSupportIdentity` · `setSupportTicketTags` · `splitSupportTicket` · `transitionSupportTicket` · `updateSupportTicket`

### `/mehla-admin/users`

`addUserNote` · `deletePlatformUser` · `listPlatformUsers` · `listUserNotes` · `resendUserVerification` · `sendUserPasswordReset` · `setUserActive` · `type AdminUserRow`

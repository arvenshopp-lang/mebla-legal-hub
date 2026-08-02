import type { AppRole } from "@/hooks/use-auth";

/**
 * Feature-level permissions for document intelligence and voice notes.
 * Enforced on the server (server functions) and mirrored in the UI so the
 * office role decides what a user may do — never the client alone.
 */
export type DocumentPermission =
  | "documents.search"
  | "documents.view_extracted_text"
  | "documents.run_ocr"
  | "documents.retry_ocr"
  | "documents.edit_extracted_text"
  | "voice_notes.create"
  | "voice_notes.listen"
  | "voice_notes.transcribe"
  | "voice_notes.edit_transcript"
  | "voice_notes.delete";

const MATRIX: Record<DocumentPermission, AppRole[]> = {
  "documents.search": ["owner", "admin", "lawyer", "legal_assistant", "viewer"],
  "documents.view_extracted_text": ["owner", "admin", "lawyer", "legal_assistant", "viewer"],
  "documents.run_ocr": ["owner", "admin", "lawyer", "legal_assistant"],
  "documents.retry_ocr": ["owner", "admin", "lawyer", "legal_assistant"],
  "documents.edit_extracted_text": ["owner", "admin", "lawyer"],
  "voice_notes.create": ["owner", "admin", "lawyer", "legal_assistant"],
  "voice_notes.listen": ["owner", "admin", "lawyer", "legal_assistant"],
  "voice_notes.transcribe": ["owner", "admin", "lawyer", "legal_assistant"],
  "voice_notes.edit_transcript": ["owner", "admin", "lawyer"],
  "voice_notes.delete": ["owner", "admin"],
};

export const DOCUMENT_PERMISSION_LABELS: Record<DocumentPermission, string> = {
  "documents.search": "البحث في المستندات",
  "documents.view_extracted_text": "عرض النص المستخرج",
  "documents.run_ocr": "تشغيل القراءة الضوئية",
  "documents.retry_ocr": "إعادة محاولة المعالجة",
  "documents.edit_extracted_text": "تعديل النص المستخرج",
  "voice_notes.create": "تسجيل ملاحظة صوتية",
  "voice_notes.listen": "الاستماع للتسجيلات",
  "voice_notes.transcribe": "تحويل الصوت إلى نص",
  "voice_notes.edit_transcript": "تعديل النص الصوتي",
  "voice_notes.delete": "حذف التسجيلات",
};

export function canDo(role: AppRole | null | undefined, permission: DocumentPermission): boolean {
  if (!role) return false;
  return MATRIX[permission].includes(role);
}

/** رسالة الرفض الموحّدة عند غياب الصلاحية. */
export function permissionDeniedMessage(permission: DocumentPermission): string {
  return `لا تملك صلاحية «${DOCUMENT_PERMISSION_LABELS[permission]}» داخل هذا المكتب.`;
}

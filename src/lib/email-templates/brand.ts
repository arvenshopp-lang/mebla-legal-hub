import { EMAIL_LOGO_HEIGHT, EMAIL_LOGO_WIDTH } from "@/config/brand-logo-sizing";

// هوية مِهلة البصرية لرسائل البريد (قيم مضمّنة inline لأن عملاء البريد لا يدعمون CSS خارجي)
export const BRAND = {
  green: "#123C32",
  gold: "#C9A961",
  ink: "#1A1A1A",
  muted: "#5F6B66",
  border: "#E6E2D8",
  surface: "#F5F3EE",
} as const;

const FONT_STACK = "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif";

export const styles = {
  main: {
    backgroundColor: "#ffffff",
    fontFamily: FONT_STACK,
    margin: "0",
    padding: "24px 0",
  },
  container: {
    maxWidth: "520px",
    margin: "0 auto",
    padding: "32px 28px",
    backgroundColor: BRAND.surface,
    border: `1px solid ${BRAND.border}`,
    borderRadius: "14px",
    textAlign: "right" as const,
  },
  brand: {
    fontSize: "20px",
    fontWeight: 700 as const,
    color: BRAND.green,
    letterSpacing: "0.5px",
    margin: "0 0 4px",
  },
  logo: {
    display: "block",
    height: `${EMAIL_LOGO_HEIGHT}px`,
    width: `${EMAIL_LOGO_WIDTH}px`,
    margin: "0 0 6px",
  },
  rule: {
    // عملاء البريد يطبّقون border الافتراضي لعنصر <hr> من react-email، لذا
    // نصرّح بالحد العلوي كاملاً (عرض + نمط + لون) حتى لا يسقط الفاصل الذهبي.
    border: "none",
    borderTop: `2px solid ${BRAND.gold}`,
    width: "48px",
    margin: "0 0 24px auto",
  },
  h1: {
    fontSize: "21px",
    fontWeight: 700 as const,
    color: BRAND.ink,
    margin: "0 0 16px",
    lineHeight: "1.5",
  },
  text: {
    fontSize: "15px",
    color: BRAND.muted,
    lineHeight: "1.9",
    margin: "0 0 20px",
  },
  button: {
    backgroundColor: BRAND.green,
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: 600 as const,
    borderRadius: "10px",
    padding: "13px 26px",
    textDecoration: "none",
    display: "inline-block",
  },
  link: { color: BRAND.green, textDecoration: "underline" },
  code: {
    fontFamily: "'SFMono-Regular', Consolas, monospace",
    fontSize: "26px",
    fontWeight: 700 as const,
    letterSpacing: "6px",
    color: BRAND.green,
    backgroundColor: "#ffffff",
    border: `1px solid ${BRAND.border}`,
    borderRadius: "10px",
    padding: "14px 18px",
    margin: "0 0 24px",
    textAlign: "center" as const,
    direction: "ltr" as const,
  },
  footer: {
    fontSize: "12px",
    color: "#8A928E",
    lineHeight: "1.8",
    margin: "28px 0 0",
    paddingTop: "16px",
    borderTop: `1px solid ${BRAND.border}`,
  },
};

/**
 * سجل الموصلات — نقطة واحدة تربط `adapter_type` بموصله.
 * إضافة مزوّد جاهز جديد = صنف موصل واحد + صف في `integration_definitions`،
 * دون أي تعديل في صفحات المنصة أو منطق OTP.
 */
import type { AdapterType } from "../integrations.shared";
import type { OtpProviderConnector } from "./base.server";
import { InfobipOtpConnector } from "./infobip.server";
import { TwilioVerifyConnector } from "./twilio.server";
import { UnifonicOtpConnector } from "./unifonic.server";
import { CustomRestOtpConnector } from "./custom-rest.server";

const CONNECTORS: Record<AdapterType, OtpProviderConnector> = {
  infobip: new InfobipOtpConnector(),
  twilio: new TwilioVerifyConnector(),
  unifonic: new UnifonicOtpConnector(),
  custom_rest: new CustomRestOtpConnector(),
};

export function getConnector(adapterType: string): OtpProviderConnector {
  const connector = CONNECTORS[adapterType as AdapterType];
  if (!connector) throw new Error("نوع الموصل غير مدعوم.");
  return connector;
}

export function connectorExists(adapterType: string): boolean {
  return Boolean(CONNECTORS[adapterType as AdapterType]);
}

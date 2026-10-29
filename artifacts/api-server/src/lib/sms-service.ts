import { logger } from "./logger";

function config() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  return accountSid && authToken && from ? { accountSid, authToken, from } : null;
}

export function isSmsConfigured(): boolean {
  return config() !== null;
}

export async function sendSms(to: string, body: string): Promise<void> {
  const cfg = config();
  if (!cfg) {
    logger.error({ event: "sms.delivery.failed", provider: "twilio", reason: "not_configured" }, "SMS delivery is not configured");
    throw new Error("SMS delivery is not configured.");
  }
  if (!/^\+[1-9]\d{7,14}$/.test(to)) throw new Error("Phone number must be in international E.164 format.");
  const url = "https://api.twilio.com/2010-04-01/Accounts/" + encodeURIComponent(cfg.accountSid) + "/Messages.json";
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(cfg.accountSid + ":" + cfg.authToken).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: cfg.from, Body: body.slice(0, 1500) }).toString(),
    });
    if (!response.ok) {
      logger.error({ event: "sms.delivery.failed", provider: "twilio", status: response.status }, "SMS provider rejected delivery request");
      throw new Error("SMS provider rejected the delivery request.");
    }
    logger.info({ event: "sms.delivery.succeeded", provider: "twilio", status: response.status }, "SMS accepted by provider");
  } catch (error) {
    if (!(error instanceof Error && error.message === "SMS provider rejected the delivery request.")) {
      logger.error({ event: "sms.delivery.failed", provider: "twilio", reason: error instanceof Error ? error.message.slice(0, 200) : "network_error" }, "SMS provider request failed");
    }
    throw error;
  }
}

export async function sendWhatsApp(to: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim();
  if (!accountSid || !authToken || !from) {
    logger.error({ event: "whatsapp.delivery.failed", provider: "twilio", reason: "not_configured" }, "WhatsApp delivery is not configured");
    throw new Error("WhatsApp delivery is not configured. Set TWILIO_WHATSAPP_FROM with the approved WhatsApp sender.");
  }
  if (!/^\\+[1-9]\\d{7,14}$/.test(to)) throw new Error("Phone number must be in international E.164 format.");
  const normalizedFrom = from.startsWith("whatsapp:") ? from : "whatsapp:" + from;
  const normalizedTo = "whatsapp:" + to;
  const url = "https://api.twilio.com/2010-04-01/Accounts/" + encodeURIComponent(accountSid) + "/Messages.json";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(accountSid + ":" + authToken).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: normalizedTo, From: normalizedFrom, Body: body.slice(0, 1500) }).toString(),
  });
  if (!response.ok) {
    logger.error({ event: "whatsapp.delivery.failed", provider: "twilio", status: response.status }, "WhatsApp provider rejected delivery request");
    throw new Error("WhatsApp provider rejected the delivery request.");
  }
  logger.info({ event: "whatsapp.delivery.succeeded", provider: "twilio", status: response.status }, "WhatsApp message accepted by provider");
}

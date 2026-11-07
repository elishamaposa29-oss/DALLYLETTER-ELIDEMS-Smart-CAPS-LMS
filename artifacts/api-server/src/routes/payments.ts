// Payments routes — track and manage school fee payments
import { Router, type IRouter } from "express";
import { eq, inArray, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { db, paymentsTable, usersTable, activityLogTable, notificationsTable } from "@workspace/db";
import { RecordPaymentBody, GetPaymentParams } from "@workspace/api-zod";
import { requireAuth, requireTeacherOrOwner, isOwnerRole } from "../lib/auth-middleware";

const router: IRouter = Router();

function paynowHash(values: Record<string, string>, key: string): string {
  const raw = Object.entries(values)
    .filter(([name]) => name.toLowerCase() !== "hash")
    .map(([, value]) => value ?? "")
    .join("") + key;
  return crypto.createHash("sha512").update(raw, "utf8").digest("hex").toUpperCase();
}

function isValidPaynowHash(values: Record<string, string>, key: string): boolean {
  const supplied = String(values.hash ?? "").toUpperCase();
  const expected = paynowHash(values, key);
  if (!/^[A-F0-9]{128}$/.test(supplied)) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied, "ascii"), Buffer.from(expected, "ascii"));
}

function parsePaynow(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(text)) out[key.toLowerCase()] = value;
  return out;
}

let paymentTransactionSchemaReady: Promise<void> | null = null;
async function ensurePaymentTransactionSchema(): Promise<void> {
  if (!paymentTransactionSchemaReady) {
    paymentTransactionSchemaReady = (async () => {
      await db.execute(sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount_paid numeric(10,2) NOT NULL DEFAULT 0`);
      await db.execute(sql`UPDATE payments SET amount_paid=amount WHERE lower(status)='paid' AND COALESCE(amount_paid,0)=0`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS payment_transactions (
          id bigserial PRIMARY KEY,
          payment_id integer NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
          provider text NOT NULL,
          reference text NOT NULL UNIQUE,
          amount numeric(10,2) NOT NULL CHECK (amount > 0),
          status text NOT NULL DEFAULT 'pending',
          provider_reference text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_manual_receipt_unique ON payment_transactions(payment_id,provider,provider_reference) WHERE provider LIKE 'manual:%' AND provider_reference IS NOT NULL`);
    })().catch(error => { paymentTransactionSchemaReady = null; throw error; });
  }
  await paymentTransactionSchemaReady;
}

async function markPaynowAttempt(reference: string, status: "failed" | "cancelled", detail: string): Promise<void> {
  await db.execute(sql`
    UPDATE payments
    SET notes = CONCAT(replace(COALESCE(notes, ''), ${"Paynow reference " + reference}, ''), ' | Paynow ', CAST(${status} AS TEXT), ': ', CAST(${detail} AS TEXT)),
        updated_at = now()
    WHERE notes LIKE ${"%Paynow reference " + reference + "%"}
      AND status IN ('pending','overdue','partially_paid')
  `);
}

// Public capability check: UI visibility must reflect the same server-side requirements as checkout.
router.get("/payments/paynow/status", (_req, res): void => {
  const integrationId = process.env.PAYNOW_INTEGRATION_ID?.trim();
  const integrationKey = process.env.PAYNOW_INTEGRATION_KEY?.trim();
  const publicBase = process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL || "";
  const publicApi = process.env.PUBLIC_API_URL || "";
  const validPublicUrl = (value: string): boolean => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" || process.env.NODE_ENV !== "production";
    } catch {
      return false;
    }
  };
  const configured = Boolean(
    integrationId && integrationKey &&
    validPublicUrl(publicBase) && validPublicUrl(publicApi)
  );
  res.setHeader("Cache-Control", "no-store");
  res.json({ configured, provider: "paynow" });
});


function paypalBase(): string {
  return (process.env.PAYPAL_API_BASE?.trim() || (process.env.PAYPAL_ENVIRONMENT === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com")).replace(/\/$/, "");
}

async function getPayPalAccessToken(): Promise<string | null> {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const response = await fetch(paypalBase() + "/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) return null;
  const data = await response.json() as { access_token?: string };
  return data.access_token || null;
}

router.get("/payments/paypal/status", (_req, res): void => {
  const publicBase = process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL || "";
  const publicApi = process.env.PUBLIC_API_URL || "";
  let securePublicBase = false;
  let securePublicApi = false;
  try { const protocol = new URL(publicBase).protocol; securePublicBase = protocol === "https:" || process.env.NODE_ENV !== "production"; } catch { securePublicBase = false; }
  try { const protocol = new URL(publicApi).protocol; securePublicApi = protocol === "https:" || process.env.NODE_ENV !== "production"; } catch { securePublicApi = false; }
  const configured = Boolean(
    process.env.PAYPAL_CLIENT_ID?.trim() &&
    process.env.PAYPAL_CLIENT_SECRET?.trim() &&
    process.env.PAYPAL_WEBHOOK_ID?.trim() &&
    securePublicBase && securePublicApi
  );
  res.setHeader("Cache-Control", "no-store");
  res.json({ configured, provider: "paypal" });
});

// Create a PayPal order on the server so each checkout has a verifiable reference.
router.post("/payments/paypal/create", requireAuth, async (req, res): Promise<void> => {
  await ensurePaymentTransactionSchema();
  const user = req.currentUser!;
  if (user.role !== "student") { res.status(403).json({ error: "Learner access required." }); return; }
  const publicBase = process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL || "";
  const publicApi = process.env.PUBLIC_API_URL || "";
  try {
    const parsedBase = new URL(publicBase);
    const parsedApi = new URL(publicApi);
    if (process.env.NODE_ENV === "production" && (parsedBase.protocol !== "https:" || parsedApi.protocol !== "https:")) throw new Error("HTTPS required");
  } catch {
    res.status(503).json({ error: "Valid public application and API URLs are required for PayPal." }); return;
  }
  let returnUrl = publicBase.replace(/\/$/, "") + "/student/payments?paypal=return";
  let cancelUrl = publicBase.replace(/\/$/, "") + "/student/payments?paypal=cancel";
  if (req.body?.returnUrl) {
    try {
      const mobileReturn = new URL(String(req.body.returnUrl));
      if (mobileReturn.protocol !== "dallyletter:" || mobileReturn.hostname !== "payments" || mobileReturn.pathname !== "/return") {
        res.status(400).json({ error: "Unsupported PayPal return destination." }); return;
      }
      returnUrl = mobileReturn.toString();
      cancelUrl = mobileReturn.toString() + "?cancel=1";
    } catch {
      res.status(400).json({ error: "Invalid PayPal return destination." }); return;
    }
  }
  if (!process.env.PAYPAL_WEBHOOK_ID?.trim()) {
    res.status(503).json({ error: "PayPal webhook verification is not configured; checkout is disabled." }); return;
  }
  const requestedAmount = req.body?.amount === undefined ? undefined : Number(req.body.amount);
  if (req.body?.amount !== undefined && (!Number.isFinite(requestedAmount) || requestedAmount! <= 0 || requestedAmount! > 100000 || Math.round(requestedAmount! * 100) !== requestedAmount! * 100)) {
    res.status(400).json({ error: "Enter a valid payment amount." }); return;
  }
  let payment: { id: number; amount: string; amount_paid: string | number; month: string; year: number } | undefined;
  const reservation = "PayPal checkout in progress " + crypto.randomBytes(12).toString("hex");
  try {
    const claimed = await db.execute(sql`
      WITH candidate AS (
        SELECT id FROM payments
        WHERE student_id = ${user.id}
          AND status IN ('pending', 'overdue', 'partially_paid')
          AND COALESCE(notes, '') NOT LIKE '%PayPal order %'
          AND COALESCE(notes, '') NOT LIKE '%PayPal checkout in progress%'
        ORDER BY created_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE payments p SET notes = CONCAT(COALESCE(p.notes, ''), ' | ', CAST(${reservation} AS TEXT)), updated_at = now()
      FROM candidate WHERE p.id = candidate.id
      RETURNING p.id, p.amount, p.amount_paid, p.month, p.year
    `);
    const claimedRows = (claimed as unknown as { rows?: Array<{ id: number; amount: string; amount_paid: string | number; month: string; year: number }> }).rows ?? [];
    payment = claimedRows[0];
    if (!payment) { res.status(409).json({ error: "No unpaid fee record is available for checkout, or another checkout is already in progress." }); return; }
    const invoiceAmount = Number(payment.amount);
    const amountPaid = Number(payment.amount_paid || 0);
    const outstandingBalance = Math.max(0, invoiceAmount - amountPaid);
    const amount = requestedAmount ?? outstandingBalance;
    if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0 || outstandingBalance <= 0 ||
        !Number.isFinite(amount) || amount <= 0 || amount > 100000) throw new Error("Invalid fee record amount");
    const accessToken = await getPayPalAccessToken();
    if (!accessToken) { throw new Error("PayPal API credentials are not configured"); }
    const reference = "DLP-" + user.id + "-" + payment.id + "-" + Date.now() + "-" + crypto.randomBytes(4).toString("hex");
    const response = await fetch(paypalBase() + "/v2/checkout/orders", {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json", "PayPal-Request-Id": reference },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: reference, custom_id: reference, invoice_id: reference,
          description: "DallyLetter school fees: " + payment.month + " " + payment.year,
          amount: { currency_code: "USD", value: amount.toFixed(2) },
        }],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: "DallyLetter Elidems",
              user_action: "PAY_NOW",
              shipping_preference: "NO_SHIPPING",
              return_url: returnUrl,
              cancel_url: cancelUrl,
            },
          },
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
    const order = await response.json() as { id?: string; links?: Array<{ rel?: string; href?: string }> };
    const approvalUrl = order.links?.find(link => link.rel === "approve" || link.rel === "payer-action")?.href;
    if (!response.ok || !order.id || !approvalUrl) throw new Error("PayPal could not create a checkout order");
    await db.execute(sql`
      INSERT INTO payment_transactions (payment_id, provider, reference, amount, status)
      VALUES (${payment.id}, 'paypal', ${reference}, ${amount.toFixed(2)}, 'pending')
    `);
    await db.execute(sql`
      UPDATE payments SET notes = CONCAT(COALESCE(notes, ''), ' | PayPal order ', CAST(${order.id} AS TEXT), ' reference ', CAST(${reference} AS TEXT)),
        updated_at = now()
      WHERE id = ${payment.id} AND student_id = ${user.id} AND status IN ('pending', 'overdue', 'partially_paid')
        AND notes LIKE ${"%" + reservation + "%"}
    `);
    res.status(201).json({ reference, checkoutUrl: approvalUrl, amount, invoiceAmount, amountAlreadyPaid: amountPaid, outstandingBalance, month: payment.month, year: payment.year });
  } catch (error) {
    if (payment) {
      await db.execute(sql`
        UPDATE payments SET notes = replace(COALESCE(notes, ''), ${" | " + reservation}, ''), updated_at = now()
        WHERE id = ${payment.id} AND student_id = ${user.id} AND status IN ('pending', 'overdue')
      `).catch(() => undefined);
    }
    res.status(503).json({ error: error instanceof Error ? error.message : "PayPal checkout could not be initialized." });
  }
});

// The payer returns with PayPal's order token; only the authenticated owner of the fee row can capture it.
router.post("/payments/paypal/capture", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "student") { res.status(403).json({ error: "Learner access required." }); return; }
  const orderId = String(req.body?.orderId || "").trim();
  if (!/^[A-Z0-9-]{8,64}$/i.test(orderId)) { res.status(400).json({ error: "Invalid PayPal order reference." }); return; }
  try {
    const accessToken = await getPayPalAccessToken();
    if (!accessToken) { res.status(503).json({ error: "PayPal API credentials are not configured." }); return; }
    const orderResponse = await fetch(paypalBase() + "/v2/checkout/orders/" + encodeURIComponent(orderId), {
      headers: { Authorization: "Bearer " + accessToken }, signal: AbortSignal.timeout(15000),
    });
    if (!orderResponse.ok) { res.status(502).json({ error: "Could not retrieve PayPal order." }); return; }
    const order = await orderResponse.json() as { id?: string; status?: string; purchase_units?: Array<{ custom_id?: string; invoice_id?: string; amount?: { currency_code?: string; value?: string } }> };
    const unit = order.purchase_units?.[0];
    const reference = String(unit?.custom_id || unit?.invoice_id || "");
    const match = reference.match(/^DLP-(\d+)-(\d+)-\d+-[a-f0-9]{8}$/i);
    if (!match || Number(match[1]) !== user.id || order.id !== orderId) { res.status(403).json({ error: "This PayPal order does not belong to this learner." }); return; }
    const feeRow = await db.execute(sql`
      SELECT p.id, p.amount, p.amount_paid, p.status, t.amount AS checkout_amount, t.status AS transaction_status
      FROM payments p JOIN payment_transactions t ON t.payment_id=p.id
      WHERE p.id = ${Number(match[2])} AND p.student_id = ${user.id}
        AND t.provider='paypal' AND t.reference=${reference}
        AND p.notes LIKE ${"%PayPal order " + orderId + " reference " + reference + "%"}
      LIMIT 1
    `);
    const feeRows = (feeRow as unknown as { rows?: Array<{ id: number; amount: string | number; amount_paid: string | number; status: string; checkout_amount: string | number; transaction_status: string }> }).rows ?? [];
    const fee = feeRows[0];
    if (!fee) { res.status(409).json({ error: "The school-fee checkout record could not be found." }); return; }
    if (unit?.amount?.currency_code !== "USD" || Number(unit.amount.value) !== Number(fee.checkout_amount)) {
      res.status(400).json({ error: "PayPal order amount does not match this signed checkout." }); return;
    }
    if (order.status === "COMPLETED") {
      res.json({ captured: true, alreadyCompleted: fee.transaction_status === "paid", awaitingWebhook: fee.transaction_status !== "paid" });
      return;
    }
    if (!["pending","overdue","partially_paid"].includes(fee.status) || fee.transaction_status !== "pending") {
      res.status(409).json({ error: "This school-fee record is no longer eligible for payment." }); return;
    }
    if (order.status !== "APPROVED") { res.status(409).json({ error: "PayPal has not approved this order yet." }); return; }
    const captureResponse = await fetch(paypalBase() + "/v2/checkout/orders/" + encodeURIComponent(orderId) + "/capture", {
      method: "POST", headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
      body: "{}", signal: AbortSignal.timeout(20000),
    });
    const captured = await captureResponse.json() as { status?: string };
    if (!captureResponse.ok || captured.status !== "COMPLETED") { res.status(502).json({ error: "PayPal did not confirm a completed capture." }); return; }
    res.json({ captured: true });
  } catch {
    res.status(502).json({ error: "PayPal capture could not be completed." });
  }
});

// Only a PayPal-verified CAPTURE.COMPLETED event can mark this checkout paid.
router.post("/payments/paypal/webhook", async (req, res): Promise<void> => {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (!webhookId) { res.status(503).json({ error: "PayPal webhook verification is not configured." }); return; }
  try {
    const accessToken = await getPayPalAccessToken();
    if (!accessToken) { res.status(503).json({ error: "PayPal API credentials are not configured." }); return; }
    const headers = {
      auth_algo: req.header("paypal-auth-algo"),
      cert_url: req.header("paypal-cert-url"),
      transmission_id: req.header("paypal-transmission-id"),
      transmission_sig: req.header("paypal-transmission-sig"),
      transmission_time: req.header("paypal-transmission-time"),
    };
    if (Object.values(headers).some(value => !value)) { res.status(400).json({ error: "PayPal signature headers are incomplete." }); return; }
    const verification = await fetch(paypalBase() + "/v1/notifications/verify-webhook-signature", {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({ ...headers, webhook_id: webhookId, webhook_event: req.body }),
      signal: AbortSignal.timeout(15000),
    });
    const verified = await verification.json().catch(() => ({})) as { verification_status?: string };
    if (!verification.ok || verified.verification_status !== "SUCCESS") {
      res.status(401).json({ error: "PayPal webhook signature is invalid." }); return;
    }
    const eventType = String(req.body?.event_type || "");
    if (eventType !== "PAYMENT.CAPTURE.COMPLETED") { res.json({ received: true, updated: false }); return; }
    const resource = req.body?.resource || {};
    const orderId = String(resource?.supplementary_data?.related_ids?.order_id || "");
    if (!orderId) { res.status(400).json({ error: "PayPal capture is missing its order reference." }); return; }
    const orderResponse = await fetch(paypalBase() + "/v2/checkout/orders/" + encodeURIComponent(orderId), {
      headers: { Authorization: "Bearer " + accessToken },
      signal: AbortSignal.timeout(15000),
    });
    if (!orderResponse.ok) { res.status(502).json({ error: "Could not verify the PayPal order details." }); return; }
    const order = await orderResponse.json() as { status?: string; purchase_units?: Array<{ invoice_id?: string; custom_id?: string; amount?: { currency_code?: string; value?: string }; payments?: { captures?: Array<{ id?: string; status?: string; amount?: { currency_code?: string; value?: string } }> } }> };
    const unit = order.purchase_units?.[0];
    const reference = String(unit?.invoice_id || unit?.custom_id || "");
    const capture = unit?.payments?.captures?.find(item => String(item.id || "") === String(resource.id || ""));
    const capturedAmount = Number(resource?.amount?.value);
    const orderAmount = Number(unit?.amount?.value);
    if (order.status !== "COMPLETED" || capture?.status !== "COMPLETED" ||
        !/^DLP-\d+-\d+-\d+-[a-f0-9]{8}$/i.test(reference) ||
        resource?.amount?.currency_code !== "USD" || unit?.amount?.currency_code !== "USD" ||
        capture?.amount?.currency_code !== "USD" || !Number.isFinite(capturedAmount) ||
        capturedAmount <= 0 || capturedAmount !== orderAmount || Number(capture.amount?.value) !== capturedAmount) {
      res.status(400).json({ error: "PayPal capture does not match a valid school-fee order." }); return;
    }
    const refMatch = reference.match(/^DLP-(\d+)-(\d+)-\d+-[a-f0-9]{8}$/i);
    if (!refMatch) { res.status(400).json({ error: "PayPal reference is malformed." }); return; }
    const settled = await db.transaction(async (tx) => {
      const transaction = await tx.execute(sql`
        UPDATE payment_transactions
        SET status='paid', updated_at=now()
        WHERE provider='paypal' AND reference=${reference} AND status='pending'
          AND amount::numeric=${capturedAmount}
          AND payment_id=${Number(refMatch[2])}
        RETURNING payment_id, amount
      `);
      const transactionRows = (transaction as unknown as { rows?: Array<{ payment_id: number; amount: string | number }> }).rows ?? [];
      if (!transactionRows.length) return { studentId: null as number | null };
      const transactionAmount = Number(transactionRows[0].amount);
      const updated = await tx.execute(sql`
        UPDATE payments
        SET amount_paid=COALESCE(amount_paid,0)+${transactionAmount},
            status=CASE
              WHEN COALESCE(amount_paid,0)+${transactionAmount} >= amount THEN 'paid'
              ELSE 'partially_paid'
            END,
            notes=CONCAT(replace(COALESCE(notes,''), ${"PayPal order " + orderId + " reference " + reference}, ''),' | PayPal verified capture ',CAST(${String(resource.id || "")} AS TEXT),' amount ',CAST(${transactionAmount.toFixed(2)} AS TEXT)),
            updated_at=now()
        WHERE id=${Number(transactionRows[0].payment_id)}
          AND student_id=${Number(refMatch[1])}
          AND notes LIKE ${"%PayPal order " + orderId + " reference " + reference + "%"}
          AND status IN ('pending','overdue','partially_paid','paid')
        RETURNING student_id
      `);
      const rows = (updated as unknown as { rows?: Array<{ student_id: number }> }).rows ?? [];
      if (!rows.length) throw new Error("Verified PayPal transaction no longer matches its fee invoice");
      return { studentId: Number(rows[0].student_id) };
    });
    if (settled.studentId !== null) {
      await db.update(usersTable).set({ lastPaymentDate: new Date().toISOString() }).where(eq(usersTable.id, settled.studentId));
    }
    res.json({ received: true, updated: settled.studentId !== null });
  } catch {
    res.status(502).json({ error: "PayPal webhook verification could not be completed." });
  }
});

router.post("/payments/paynow/create", requireAuth, async (req, res): Promise<void> => {
  await ensurePaymentTransactionSchema();
  const user = req.currentUser!;
  if (user.role !== "student") { res.status(403).json({ error: "Learner access required" }); return; }
  const requestedAmount = req.body?.amount === undefined ? undefined : Number(req.body.amount);
  if (req.body?.amount !== undefined && (!Number.isFinite(requestedAmount) || requestedAmount! <= 0 || requestedAmount! > 100000 || Math.round(requestedAmount! * 100) !== requestedAmount! * 100)) {
    res.status(400).json({ error: "Enter a valid payment amount." });
    return;
  }
  const integrationId = process.env.PAYNOW_INTEGRATION_ID?.trim();
  const integrationKey = process.env.PAYNOW_INTEGRATION_KEY?.trim();
  const publicBaseValue = (process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL || "").trim();
  const publicApiValue = (process.env.PUBLIC_API_URL || "").trim();
  const validPublicUrl = (value: string): boolean => {
    try {
      const parsed = new URL(value);
      return (parsed.protocol === "https:" || process.env.NODE_ENV !== "production") && Boolean(parsed.host);
    } catch { return false; }
  };
  if (!integrationId || !integrationKey || !validPublicUrl(publicBaseValue) || !validPublicUrl(publicApiValue)) {
    res.status(503).json({ error: "Live Paynow checkout is not configured. Add valid PAYNOW_INTEGRATION_ID, PAYNOW_INTEGRATION_KEY, PUBLIC_APP_URL and PUBLIC_API_URL server secrets." });
    return;
  }
  const publicBase = new URL(publicBaseValue).toString().replace(/\/$/, "");
  const publicApi = new URL(publicApiValue).toString().replace(/\/$/, "");
  const reference = "DL-" + user.id + "-" + Date.now() + "-" + crypto.randomBytes(4).toString("hex");
  const claimed = await db.execute(sql`
    WITH candidate AS (
      SELECT id FROM payments
      WHERE student_id = ${user.id}
        AND status IN ('pending', 'overdue', 'partially_paid')
        AND COALESCE(notes, '') NOT LIKE '%Paynow reference %'
      ORDER BY created_at ASC, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE payments p
    SET notes = CONCAT(COALESCE(p.notes, ''), ' | Paynow reference ', CAST(${reference} AS TEXT)), updated_at = now()
    FROM candidate WHERE p.id = candidate.id
    RETURNING p.id, p.amount, p.amount_paid, p.month, p.year
  `);
  const claimedRows = (claimed as unknown as { rows?: Array<{ id: number; amount: string | number; amount_paid: string | number; month: string; year: number }> }).rows ?? [];
  const payment = claimedRows[0];
  if (!payment) { res.status(409).json({ error: "No unpaid school-fee record is available for Paynow checkout." }); return; }
  const invoiceAmount = Number(payment.amount);
  const alreadyPaid = Number(payment.amount_paid || 0);
  const outstandingBalance = Math.max(0, invoiceAmount - alreadyPaid);
  if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0 || invoiceAmount > 100000 || outstandingBalance <= 0) {
    await markPaynowAttempt(reference, "failed", "Invalid or settled school-fee amount");
    res.status(409).json({ error: "The school-fee record has no valid outstanding balance." });
    return;
  }
  // The learner may pay less, exactly the balance, or more. The callback is
  // validated against this immutable checkout amount, not against the invoice total.
  const checkoutAmount = requestedAmount ?? outstandingBalance;
  if (!Number.isFinite(checkoutAmount) || checkoutAmount <= 0 || checkoutAmount > 100000) {
    await markPaynowAttempt(reference, "failed", "Invalid requested payment amount");
    res.status(400).json({ error: "Enter a payment amount greater than zero." });
    return;
  }
  await db.execute(sql`
    INSERT INTO payment_transactions (payment_id, provider, reference, amount, status)
    VALUES (${payment.id}, 'paynow', ${reference}, ${checkoutAmount.toFixed(2)}, 'pending')
  `);

  const fields: Record<string, string> = {
    id: integrationId, reference, amount: checkoutAmount.toFixed(2),
    additionalinfo: "DallyLetter Elidems school fees: " + payment.month + " " + payment.year + " (invoice " + payment.id + ")",
    returnurl: publicBase + "/student/payments?reference=" + encodeURIComponent(reference),
    resulturl: publicApi + "/api/payments/paynow/result",
    authemail: user.email, status: "Message",
  };
  fields.hash = paynowHash(fields, integrationKey);

  try {
    const response = await fetch("https://www.paynow.co.zw/interface/initiatetransaction", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
      signal: AbortSignal.timeout(15000),
    });
    const parsed = parsePaynow(await response.text());
    if (!response.ok || parsed.status?.toLowerCase() === "error" || !parsed.browserurl) {
      const reason = parsed.error || (response.ok ? "Paynow did not return a checkout URL" : "Paynow HTTP " + response.status);
      await db.execute(sql`UPDATE payment_transactions SET status='failed', updated_at=now() WHERE reference=${reference} AND status='pending'`).catch(() => undefined);
      await markPaynowAttempt(reference, "failed", reason.slice(0, 300));
      res.status(502).json({ error: reason });
      return;
    }
    res.status(201).json({ reference, checkoutUrl: parsed.browserurl, amount: checkoutAmount, invoiceAmount, amountAlreadyPaid: alreadyPaid, outstandingBalance, status: parsed.status || "ok" });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Paynow is unavailable";
    await db.execute(sql`UPDATE payment_transactions SET status='failed', updated_at=now() WHERE reference=${reference} AND status='pending'`).catch(() => undefined);
    await markPaynowAttempt(reference, "failed", reason.slice(0, 300));
    res.status(502).json({ error: "Paynow checkout could not be initialized" });
  }
});

router.post("/payments/paynow/result", async (req, res): Promise<void> => {
  const integrationKey = process.env.PAYNOW_INTEGRATION_KEY;
  if (!integrationKey) { res.status(503).send("Paynow integration is not configured"); return; }

  const body: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.body ?? {})) body[String(key).toLowerCase()] = String(value ?? "");
  if (!isValidPaynowHash(body, integrationKey)) { res.status(400).send("Invalid hash"); return; }

  const reference = body.reference ?? "";
  if (!/^DL-\d+-\d+-[a-f0-9]{8}$/i.test(reference)) { res.status(400).send("Invalid reference"); return; }
  const providerStatus = (body.status ?? "").trim().toLowerCase();
  const normalizedStatus =
    providerStatus === "paid" ? "paid" :
    providerStatus === "refunded" ? "refunded" :
    providerStatus === "cancelled" || providerStatus === "canceled" ? "cancelled" :
    providerStatus === "failed" || providerStatus === "error" ? "failed" :
    providerStatus === "created" || providerStatus === "sent" || providerStatus === "pending" || providerStatus === "awaiting delivery" || providerStatus === "delivered" || providerStatus === "disputed" ? "pending" :
    null;
  if (!normalizedStatus) { res.status(400).send("Unsupported Paynow status"); return; }

  const callbackAmount = Number(body.amount);
  if (!Number.isFinite(callbackAmount) || callbackAmount <= 0) {
    res.status(400).send("Invalid payment amount");
    return;
  }

  // Resolve the signed reference and compare its authoritative invoice amount before
  // entering the settlement transaction. A mismatched callback is a client/provider
  // validation error (400), not a failed database transaction (500).
  await ensurePaymentTransactionSchema();
  const transactionResult = await db.execute(sql`
    SELECT id, payment_id, amount, status FROM payment_transactions
    WHERE provider='paynow' AND reference=${reference} LIMIT 1
  `);
  const transactionRows = (transactionResult as unknown as { rows?: Array<{ id: number; payment_id: number; amount: string | number; status: string }> }).rows ?? [];
  const paymentAttempt = transactionRows[0];
  if (!paymentAttempt) { res.status(404).send("Payment reference not found"); return; }
  if (Number(paymentAttempt.amount) !== callbackAmount) {
    res.status(400).send("Payment amount does not match this checkout");
    return;
  }
  if (paymentAttempt.status === "paid" && normalizedStatus !== "refunded") { res.status(200).send("OK"); return; }

  if (normalizedStatus === "failed" || normalizedStatus === "cancelled") {
    await db.execute(sql`
      UPDATE payment_transactions SET status=${normalizedStatus}, updated_at=now()
      WHERE id=${paymentAttempt.id} AND status='pending'
    `);
    await db.execute(sql`
      UPDATE payments
      SET notes=CONCAT(replace(COALESCE(notes,''), ${"Paynow reference " + reference}, ''),' | Paynow callback: ',CAST(${providerStatus} AS TEXT)), updated_at=now()
      WHERE id=${paymentAttempt.payment_id}
    `);
    res.status(200).send("OK");
    return;
  }
  if (normalizedStatus === "refunded") {
    await db.transaction(async (tx) => {
      const refunded = await tx.execute(sql`
        UPDATE payment_transactions SET status='refunded', updated_at=now()
        WHERE id=${paymentAttempt.id} AND status='paid'
        RETURNING payment_id, amount
      `);
      const refundedRows = (refunded as unknown as { rows?: Array<{ payment_id: number; amount: string | number }> }).rows ?? [];
      if (!refundedRows.length) return;
      const refundAmount = Number(refundedRows[0].amount);
      await tx.execute(sql`
        UPDATE payments
        SET amount_paid=GREATEST(0,COALESCE(amount_paid,0)-${refundAmount}),
            status=CASE
              WHEN GREATEST(0,COALESCE(amount_paid,0)-${refundAmount}) >= amount THEN 'paid'
              WHEN GREATEST(0,COALESCE(amount_paid,0)-${refundAmount}) > 0 THEN 'partially_paid'
              ELSE 'pending'
            END,
            notes=CONCAT(COALESCE(notes,''),' | Paynow refund ',CAST(${reference} AS TEXT),' amount ',CAST(${refundAmount.toFixed(2)} AS TEXT)),
            updated_at=now()
        WHERE id=${Number(refundedRows[0].payment_id)}
      `);
    });
    res.status(200).send("OK");
    return;
  }
  if (normalizedStatus !== "paid") { res.status(200).send("OK"); return; }

  const result = await db.transaction(async (tx) => {
    const settled = await tx.execute(sql`
      UPDATE payment_transactions SET status='paid', updated_at=now()
      WHERE id=${paymentAttempt.id} AND status='pending'
      RETURNING payment_id, amount
    `);
    const settledRows = (settled as unknown as { rows?: Array<{ payment_id: number; amount: string | number }> }).rows ?? [];
    if (!settledRows.length) return { updated: false };
    const updated = await tx.execute(sql`
      UPDATE payments
      SET amount_paid=COALESCE(amount_paid,0)+${Number(settledRows[0].amount)},
          status=CASE
            WHEN COALESCE(amount_paid,0)+${Number(settledRows[0].amount)} >= amount THEN 'paid'
            ELSE 'partially_paid'
          END,
          notes=CONCAT(replace(COALESCE(notes,''), ${"Paynow reference " + reference}, ''),' | Paynow verified payment ',CAST(${reference} AS TEXT),' amount ',CAST(${Number(settledRows[0].amount).toFixed(2)} AS TEXT)),
          updated_at=now()
      WHERE id=${Number(settledRows[0].payment_id)}
      RETURNING student_id, status
    `);
    const rows = (updated as unknown as { rows?: Array<{ student_id: number; status: string }> }).rows ?? [];
    if (rows.length && rows[0].status === "paid") {
      await tx.update(usersTable).set({ lastPaymentDate: new Date().toISOString() }).where(eq(usersTable.id, Number(rows[0].student_id)));
    }
    return { updated: rows.length > 0 };
  });
  // Repeated provider notifications are idempotent: the transaction row can settle once.
  if (!result.updated && paymentAttempt.status !== "paid") {
    const current = await db.execute(sql`SELECT status FROM payment_transactions WHERE id=${paymentAttempt.id}`);
    const currentRows = (current as unknown as { rows?: Array<{ status: string }> }).rows ?? [];
    if (!currentRows.length) { res.status(404).send("Payment reference not found"); return; }
  }
  res.status(200).send("OK");
});

// GET /payments — List payments (owner sees all, student sees own)
router.get("/payments", requireAuth, async (req, res): Promise<void> => {
  await ensurePaymentTransactionSchema();
  const currentUser = req.currentUser!;

  let payments;
  if (isOwnerRole(currentUser.role) || currentUser.role === "teacher") {
    // Owner/teacher sees all payments
    payments = await db.select().from(paymentsTable).orderBy(paymentsTable.createdAt);
  } else {
    // Student sees only their own payments
    payments = await db.select().from(paymentsTable)
      .where(eq(paymentsTable.studentId, currentUser.id))
      .orderBy(paymentsTable.createdAt);
  }

  res.json(payments.map(p => {
    const amount = Number(p.amount);
    const amountPaid = Number(p.amountPaid || 0);
    return {
      ...p,
      amount,
      amountPaid,
      balance: Math.max(0, amount - amountPaid),
      credit: Math.max(0, amountPaid - amount),
      createdAt: p.createdAt.toISOString(),
    };
  }));
});

// POST /payments — Record a payment (teacher/owner only)
router.post("/payments", requireAuth, requireTeacherOrOwner, async (req, res): Promise<void> => {
  await ensurePaymentTransactionSchema();
  const currentUser = req.currentUser!;

  const parsed = RecordPaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (Math.round(parsed.data.amount * 100) !== parsed.data.amount * 100) {
    res.status(400).json({ error: "Payment amount must use no more than two decimal places." });
    return;
  }

  // Get student name
  const [student] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.studentId));
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const [payment] = await db.insert(paymentsTable).values({
    ...parsed.data,
    studentName: student.name,
    recordedBy: currentUser.id,
    amount: String(parsed.data.amount),
    amountPaid: parsed.data.status === "paid" ? String(parsed.data.amount) : "0",
  }).returning();

  // Update student's lastPaymentDate if status is paid
  if (parsed.data.status === "paid") {
    await db.update(usersTable)
      .set({ lastPaymentDate: new Date().toISOString() })
      .where(eq(usersTable.id, parsed.data.studentId));
  }

  // Log activity
  await db.insert(activityLogTable).values({
    type: "payment_recorded",
    description: `Payment of $${parsed.data.amount} recorded for ${student.name} (${parsed.data.month} ${parsed.data.year})`,
    actorName: currentUser.name,
  });

  // If overdue, send notification
  if (parsed.data.status === "overdue") {
    await db.insert(notificationsTable).values({
      recipientId: parsed.data.studentId,
      title: "Payment Overdue",
      message: `Your payment for ${parsed.data.month} ${parsed.data.year} is overdue. Please pay your school fees to avoid account suspension.`,
      type: "payment_overdue",
      isRead: false,
    });
  }

  res.status(201).json({
    ...payment,
    amount: Number(payment.amount),
    createdAt: payment.createdAt.toISOString(),
  });
});

// POST /payments/notify-admin — Student self-reports a payment, notifies all owners
router.post("/payments/notify-admin", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;

  if (!["student","learner","prefect"].includes(String(currentUser.role).toLowerCase())) {
    res.status(403).json({ error: "Only students can report payments" });
    return;
  }

  const amount = Number(req.body?.amount);
  const method = String(req.body?.method || "other").trim().toLowerCase();
  const providerReference = typeof req.body?.providerReference === "string" ? req.body.providerReference.trim() : "";
  if (!["ecocash","bank_transfer","crypto","cash","other"].includes(method)) { res.status(400).json({error:"Choose a supported manual payment method."}); return; }
  if (method !== "cash" && providerReference.length > 120) { res.status(400).json({error:"Receipt reference is too long."}); return; }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000 || Math.round(amount*100)!==amount*100) {
    res.status(400).json({ error: "Enter a valid payment amount greater than zero." });
    return;
  }

  const owners = await db.select({ id: usersTable.id }).from(usersTable)
    .where(inArray(usersTable.role, ["owner", "platform_owner"]));
  if (!owners.length) {
    res.status(503).json({ error: "No Owner account is available to receive payment reports." });
    return;
  }
  const amountStr = `$${amount.toFixed(2)}`;

  // Record all Owner notifications and the audit activity as one database transaction.
  await db.transaction(async (tx) => {
    for (const owner of owners) {
      await tx.insert(notificationsTable).values({
        recipientId: owner.id,
        title: "💳 Payment Reported by Learner",
        message: `${currentUser.name} reported a payment of ${amountStr} using ${method.replace("_"," ")}.${providerReference ? " Receipt/reference: " + providerReference + "." : ""} The payment method has not been independently verified; please check the transaction and update the ledger.`,
        type: "payment_overdue",
        isRead: false,
      });
    }
    await tx.insert(activityLogTable).values({
      type: "payment_recorded",
      description: `${currentUser.name} self-reported a ${method} payment of ${amountStr}. Awaiting Owner verification.`,
      actorName: currentUser.name,
    });
  });

  res.json({ success: true, notifiedOwners: owners.length });
});

// Owner confirms a manually received EcoCash, bank, cash or wallet payment against an existing invoice.
router.post("/payments/:id/manual-settlement", requireAuth, async (req, res): Promise<void> => {
  const actor=req.currentUser!;
  if(!isOwnerRole(actor.role)){res.status(403).json({error:"Only the Owner can verify manually received school-fee payments."});return;}
  const paymentId=Number(req.params.id), amount=Number(req.body?.amount);
  const method=String(req.body?.method||"").trim().toLowerCase();
  const providerReference=typeof req.body?.providerReference==="string"?req.body.providerReference.trim():"";
  const note=typeof req.body?.note==="string"?req.body.note.trim().slice(0,500):"";
  if(!Number.isSafeInteger(paymentId)||paymentId<=0||!Number.isFinite(amount)||amount<=0||amount>100000||Math.round(amount*100)!==amount*100||!["ecocash","bank_transfer","crypto","cash","other"].includes(method)){
    res.status(400).json({error:"Choose a valid invoice, amount and manual payment method."});return;
  }
  if(providerReference.length>120){res.status(400).json({error:"Receipt reference must be no longer than 120 characters."});return;}
  if(method!=="cash"&&providerReference.length<3){res.status(400).json({error:"Enter the receipt or transaction reference so the manual payment can be audited."});return;}
  await ensurePaymentTransactionSchema();
  const internalReference="DLM-"+actor.id+"-"+paymentId+"-"+Date.now()+"-"+crypto.randomBytes(4).toString("hex");
  try{
    const result=await db.transaction(async(tx)=>{
      const locked=await tx.execute(sql`SELECT id,student_id,amount,amount_paid,status FROM payments WHERE id=${paymentId} FOR UPDATE`);
      const rows=(locked as unknown as {rows?:Array<{id:number;student_id:number;amount:string|number;amount_paid:string|number;status:string}>}).rows??[];
      const invoice=rows[0];
      if(!invoice)throw Object.assign(new Error("School-fee invoice not found."),{statusCode:404});
      if(!["pending","overdue","partially_paid","paid"].includes(String(invoice.status)))throw Object.assign(new Error("This invoice is not eligible for a manual payment."),{statusCode:409});
      if(providerReference){
        const duplicate=await tx.execute(sql`SELECT id FROM payment_transactions WHERE payment_id=${paymentId} AND provider=${"manual:"+method} AND provider_reference=${providerReference} LIMIT 1`);
        const duplicateRows=(duplicate as unknown as {rows?:Array<{id:number}>}).rows??[];
        if(duplicateRows.length)throw Object.assign(new Error("This receipt reference has already been recorded for this invoice."),{statusCode:409});
      }
      await tx.execute(sql`INSERT INTO payment_transactions(payment_id,provider,reference,amount,status,provider_reference) VALUES(${paymentId},${"manual:"+method},${internalReference},${amount.toFixed(2)},'paid',${providerReference||null})`);
      const updated=await tx.execute(sql`
        UPDATE payments SET amount_paid=COALESCE(amount_paid,0)+${amount},
          status=CASE WHEN COALESCE(amount_paid,0)+${amount}>=amount THEN 'paid' ELSE 'partially_paid' END,
          notes=CONCAT(COALESCE(notes,''),' | Owner-verified ',CAST(${method} AS TEXT),' payment ',CAST(${internalReference} AS TEXT),' amount ',CAST(${amount.toFixed(2)} AS TEXT),CASE WHEN ${providerReference}='' THEN '' ELSE ' receipt '||CAST(${providerReference} AS TEXT) END,CASE WHEN ${note}='' THEN '' ELSE ' note '||CAST(${note} AS TEXT) END),
          updated_at=now()
        WHERE id=${paymentId} RETURNING student_id,amount,amount_paid,status
      `);
      const updatedRows=(updated as unknown as {rows?:Array<{student_id:number;amount:string|number;amount_paid:string|number;status:string}>}).rows??[];
      if(!updatedRows.length)throw new Error("The school-fee ledger could not be updated.");
      const settled=updatedRows[0],balance=Math.max(0,Number(settled.amount)-Number(settled.amount_paid)),credit=Math.max(0,Number(settled.amount_paid)-Number(settled.amount));
      if(settled.status==="paid")await tx.update(usersTable).set({lastPaymentDate:new Date().toISOString()}).where(eq(usersTable.id,Number(settled.student_id)));
      await tx.insert(activityLogTable).values({type:"payment_recorded",description:"Owner verified "+method+" payment of $"+amount.toFixed(2)+" for invoice #"+paymentId+"; remaining balance $"+balance.toFixed(2)+", credit $"+credit.toFixed(2)+".",actorName:actor.name});
      await tx.insert(notificationsTable).values({recipientId:Number(settled.student_id),title:"School payment verified",message:"The Owner verified your "+method+" payment of USD "+amount.toFixed(2)+". Remaining invoice balance: USD "+balance.toFixed(2)+". Credit: USD "+credit.toFixed(2)+".",type:"system",isRead:false});
      return {paymentId,studentId:Number(settled.student_id),status:settled.status,amountPaid:Number(settled.amount_paid),balance,credit,reference:internalReference};
    });
    res.status(200).json({success:true,...result});
  }catch(error){
    const code=(error as {code?:string})?.code;
    const status=Number((error as {statusCode?:number})?.statusCode)||(code==="23505"?409:500);
    const message=code==="23505"?"This receipt reference has already been recorded for this invoice.":status===500?"The manual payment could not be recorded. No settlement was confirmed.":error instanceof Error?error.message:"Manual payment failed.";
    res.status(status).json({error:message});
  }
});

// GET /payments/:id — Get payment by ID
router.get("/payments/:id", requireAuth, async (req, res): Promise<void> => {
  await ensurePaymentTransactionSchema();
  const params = GetPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, params.data.id));
  if (!payment || (!["owner", "teacher"].includes(String(req.currentUser!.role).toLowerCase()) && Number(payment.studentId) !== Number(req.currentUser!.id))) {
    // Do not reveal whether another learner's payment ID exists.
    res.status(404).json({ error: "Payment not found" });
    return;
  }

  res.json({
    ...payment,
    amount: Number(payment.amount),
    createdAt: payment.createdAt.toISOString(),
  });
});

export default router;

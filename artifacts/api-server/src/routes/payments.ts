// Payments routes — track and manage school fee payments
import { Router, type IRouter } from "express";
import { eq, inArray, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { db, paymentsTable, usersTable, activityLogTable, notificationsTable } from "@workspace/db";
import { RecordPaymentBody, GetPaymentParams } from "@workspace/api-zod";
import { requireAuth, requireTeacherOrOwner } from "../lib/auth-middleware";

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

async function markPaynowAttempt(reference: string, status: "failed" | "cancelled", detail: string): Promise<void> {
  await db.execute(sql`
    UPDATE payments
    SET status = ${status},
        notes = CONCAT(COALESCE(notes, ''), ' | Paynow ', CAST(${status} AS TEXT), ': ', CAST(${detail} AS TEXT)),
        updated_at = now()
    WHERE notes LIKE ${"%Paynow reference " + reference + "%"}
      AND status = 'pending'
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
  return (process.env.PAYPAL_API_BASE?.trim() || (process.env.PAYPAL_ENVIRONMENT === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com")).replace(/\\/$/, "");
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
  try { securePublicBase = new URL(publicBase).protocol === "https:"; } catch { securePublicBase = false; }
  try { securePublicApi = new URL(publicApi).protocol === "https:"; } catch { securePublicApi = false; }
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
  const user = req.currentUser!;
  if (user.role !== "student") { res.status(403).json({ error: "Learner access required." }); return; }
  const publicBase = process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL || "";
  try {
    const parsedBase = new URL(publicBase);
    if (parsedBase.protocol !== "https:" && process.env.NODE_ENV === "production") throw new Error("HTTPS required");
  } catch {
    res.status(503).json({ error: "A valid public application URL is required for PayPal." }); return;
  }
  if (!process.env.PAYPAL_WEBHOOK_ID?.trim()) {
    res.status(503).json({ error: "PayPal webhook verification is not configured; checkout is disabled." }); return;
  }
  let payment: { id: number; amount: string; month: string; year: number } | undefined;
  const reservation = "PayPal checkout in progress " + crypto.randomBytes(12).toString("hex");
  try {
    const claimed = await db.execute(sql`
      WITH candidate AS (
        SELECT id FROM payments
        WHERE student_id = ${user.id}
          AND status IN ('pending', 'overdue')
          AND COALESCE(notes, '') NOT LIKE '%PayPal order %'
          AND COALESCE(notes, '') NOT LIKE '%PayPal checkout in progress%'
        ORDER BY created_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE payments p SET notes = CONCAT(COALESCE(p.notes, ''), ' | ', ${reservation}), updated_at = now()
      FROM candidate WHERE p.id = candidate.id
      RETURNING p.id, p.amount, p.month, p.year
    `);
    const claimedRows = (claimed as unknown as { rows?: Array<{ id: number; amount: string; month: string; year: number }> }).rows ?? [];
    payment = claimedRows[0];
    if (!payment) { res.status(409).json({ error: "No unpaid fee record is available for checkout, or another checkout is already in progress." }); return; }
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid fee record amount");
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
        application_context: {
          brand_name: "DallyLetter Elidems", user_action: "PAY_NOW",
          return_url: publicBase.replace(/\/$/, "") + "/student/payments?paypal=return",
          cancel_url: publicBase.replace(/\/$/, "") + "/student/payments?paypal=cancel",
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
    const order = await response.json() as { id?: string; links?: Array<{ rel?: string; href?: string }> };
    const approvalUrl = order.links?.find(link => link.rel === "approve")?.href;
    if (!response.ok || !order.id || !approvalUrl) throw new Error("PayPal could not create a checkout order");
    await db.execute(sql`
      UPDATE payments SET notes = CONCAT(COALESCE(notes, ''), ' | PayPal order ', ${order.id}, ' reference ', ${reference}),
        updated_at = now()
      WHERE id = ${payment.id} AND student_id = ${user.id} AND status IN ('pending', 'overdue')
        AND notes LIKE ${"%" + reservation + "%"}
    `);
    res.status(201).json({ reference, checkoutUrl: approvalUrl, amount, month: payment.month, year: payment.year });
  } catch (error) {
    if (payment) {
      await db.execute(sql`
        UPDATE payments SET notes = regexp_replace(COALESCE(notes, ''), ${'\\s*\\|\\s*' + reservation}, '', 'g'), updated_at = now()
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
    if (order.status === "COMPLETED") { res.json({ captured: true, alreadyCompleted: true }); return; }
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
        !/^DLP-\d+-\d+-[a-f0-9]{8}$/i.test(reference) ||
        resource?.amount?.currency_code !== "USD" || unit?.amount?.currency_code !== "USD" ||
        capture?.amount?.currency_code !== "USD" || !Number.isFinite(capturedAmount) ||
        capturedAmount <= 0 || capturedAmount !== orderAmount || Number(capture.amount?.value) !== capturedAmount) {
      res.status(400).json({ error: "PayPal capture does not match a valid school-fee order." }); return;
    }
    const updated = await db.execute(sql`
      UPDATE payments SET status = 'paid',
        notes = CONCAT(COALESCE(notes, ''), ' | PayPal verified capture ', CAST(${String(resource.id || "")} AS TEXT)),
        updated_at = now()
      WHERE notes LIKE ${"%PayPal order " + orderId + " reference " + reference + "%"}
        AND amount::numeric = ${capturedAmount}
        AND status = 'pending'
      RETURNING student_id
    `);
    const rows = (updated as unknown as { rows?: Array<{ student_id: number }> }).rows ?? [];
    if (rows.length) {
      await db.update(usersTable).set({ lastPaymentDate: new Date().toISOString() }).where(eq(usersTable.id, Number(rows[0].student_id)));
    }
    res.json({ received: true, updated: rows.length > 0 });
  } catch {
    res.status(502).json({ error: "PayPal webhook verification could not be completed." });
  }
});

router.post("/payments/paynow/create", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "student") { res.status(403).json({ error: "Learner access required" }); return; }
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
    res.status(400).json({ error: "Enter a valid payment amount" });
    return;
  }

  const integrationId = process.env.PAYNOW_INTEGRATION_ID;
  const integrationKey = process.env.PAYNOW_INTEGRATION_KEY;
  const publicBase = (process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const publicApi = (process.env.PUBLIC_API_URL || "").replace(/\/$/, "");
  if (!integrationId || !integrationKey || !publicBase || !publicApi) {
    res.status(503).json({ error: "Live Paynow payments are not configured yet. Add PAYNOW_INTEGRATION_ID, PAYNOW_INTEGRATION_KEY, PUBLIC_APP_URL and PUBLIC_API_URL to the server secrets." });
    return;
  }

  const reference = "DL-" + user.id + "-" + Date.now() + "-" + crypto.randomBytes(4).toString("hex");
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long" });
  await db.insert(paymentsTable).values({
    studentId: user.id, studentName: user.name, amount: amount.toFixed(2),
    month, year: now.getUTCFullYear(), status: "pending",
    notes: "Paynow reference " + reference, recordedBy: user.id,
  });

  const fields: Record<string, string> = {
    id: integrationId, reference, amount: amount.toFixed(2),
    additionalinfo: "DallyLetter Elidems school payment",
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
      await markPaynowAttempt(reference, "failed", reason.slice(0, 300));
      res.status(502).json({ error: reason });
      return;
    }
    res.status(201).json({ reference, checkoutUrl: parsed.browserurl, status: parsed.status || "ok" });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Paynow is unavailable";
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

  const result = await db.transaction(async (tx) => {
    const updated = await tx.execute(sql`
      UPDATE payments
      SET status = ${normalizedStatus},
          notes = CONCAT(COALESCE(notes, ''), ' | Paynow callback: ', CAST(${providerStatus} AS TEXT)),
          updated_at = now()
      WHERE notes LIKE ${"%Paynow reference " + reference + "%"}
        AND amount::numeric = ${callbackAmount}
        AND (status = 'pending' OR (CAST(${normalizedStatus} AS TEXT) = 'refunded' AND status = 'paid'))
      RETURNING student_id
    `);
    const rows = (updated as unknown as { rows?: Array<{ student_id: number }> }).rows ?? [];
    if (rows.length > 0 && normalizedStatus === "paid") {
      await tx.update(usersTable)
        .set({ lastPaymentDate: new Date().toISOString() })
        .where(eq(usersTable.id, Number(rows[0].student_id)));
    }
    return { updated: rows.length > 0 };
  });

  if (!result.updated) {
    const existing = await db.execute(sql`
      SELECT id, amount FROM payments
      WHERE notes LIKE ${"%Paynow reference " + reference + "%"}
      LIMIT 1
    `);
    const existingRows = (existing as unknown as { rows?: Array<{ id: number; amount: string | number }> }).rows ?? [];
    if (existingRows.length === 0) { res.status(404).send("Payment reference not found"); return; }
    if (Number(existingRows[0].amount) !== callbackAmount) { res.status(400).send("Payment amount does not match reference"); return; }
    // Duplicate or out-of-order callbacks cannot reopen or reverse a terminal payment.
  }
  res.status(200).send("OK");
});

// GET /payments — List payments (owner sees all, student sees own)
router.get("/payments", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;

  let payments;
  if (currentUser.role === "owner" || currentUser.role === "teacher") {
    // Owner/teacher sees all payments
    payments = await db.select().from(paymentsTable).orderBy(paymentsTable.createdAt);
  } else {
    // Student sees only their own payments
    payments = await db.select().from(paymentsTable)
      .where(eq(paymentsTable.studentId, currentUser.id))
      .orderBy(paymentsTable.createdAt);
  }

  res.json(payments.map(p => ({
    ...p,
    amount: Number(p.amount),
    createdAt: p.createdAt.toISOString(),
  })));
});

// POST /payments — Record a payment (teacher/owner only)
router.post("/payments", requireAuth, requireTeacherOrOwner, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;

  const parsed = RecordPaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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

  if (currentUser.role !== "student") {
    res.status(403).json({ error: "Only students can report payments" });
    return;
  }

  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
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
        message: `${currentUser.name} reported a payment of ${amountStr}. The payment method has not been independently verified; please check the transaction and update the ledger.`,
        type: "payment_overdue",
        isRead: false,
      });
    }
    await tx.insert(activityLogTable).values({
      type: "payment_recorded",
      description: `${currentUser.name} self-reported a payment of ${amountStr}. Awaiting Owner verification.`,
      actorName: currentUser.name,
    });
  });

  res.json({ success: true, notifiedOwners: owners.length });
});

// GET /payments/:id — Get payment by ID
router.get("/payments/:id", requireAuth, async (req, res): Promise<void> => {
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

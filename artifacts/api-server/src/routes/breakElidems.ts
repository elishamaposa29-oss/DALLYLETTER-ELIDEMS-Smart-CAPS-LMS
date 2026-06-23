import { Router } from "express";
import { db, breakElidemEventsTable, breakElidemVolunteersTable, usersTable, auditLogsTable, notificationsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";

const router = Router();

// GET /break-elidems — list all events
router.get("/break-elidems", requireAuth, async (_req, res): Promise<void> => {
  const events = await db.select().from(breakElidemEventsTable).orderBy(desc(breakElidemEventsTable.eventDate));
  res.json(events);
});

// GET /break-elidems/today — get today's event
router.get("/break-elidems/today", requireAuth, async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const [event] = await db.select().from(breakElidemEventsTable).where(eq(breakElidemEventsTable.eventDate, today));
  if (!event) { res.json(null); return; }

  const volunteers = await db.select({
    id: breakElidemVolunteersTable.id,
    role: breakElidemVolunteersTable.role,
    isSelected: breakElidemVolunteersTable.isSelected,
    details: breakElidemVolunteersTable.details,
    createdAt: breakElidemVolunteersTable.createdAt,
    userName: usersTable.name,
    userId: usersTable.id,
  }).from(breakElidemVolunteersTable)
    .leftJoin(usersTable, eq(breakElidemVolunteersTable.userId, usersTable.id))
    .where(eq(breakElidemVolunteersTable.eventId, event.id));

  res.json({ ...event, volunteers });
});

// POST /break-elidems — create event (owner only)
router.post("/break-elidems", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "owner") { res.status(403).json({ error: "Owner only" }); return; }
  const { title, description, eventDate, startTime, endTime, meetLink, tempBenefitsConfig } = req.body as {
    title: string; description?: string; eventDate: string; startTime: string; endTime: string; meetLink?: string; tempBenefitsConfig?: string;
  };
  if (!title || !eventDate || !startTime || !endTime) { res.status(400).json({ error: "title, eventDate, startTime, endTime required" }); return; }

  const [event] = await db.insert(breakElidemEventsTable).values({ title, description, eventDate, startTime, endTime, meetLink, tempBenefitsConfig, createdBy: user.id, status: "scheduled" }).returning();

  // Broadcast notification
  await db.insert(notificationsTable).values({
    title: `BREAK-ELIDEMS: ${title}`,
    message: `A new community event is scheduled for ${eventDate} from ${startTime} to ${endTime}. ${description ?? ""}`,
    type: "class_starting",
    recipientId: null,
  });

  await db.insert(auditLogsTable).values({ action: `Created BREAK-ELIDEMS event: ${title}`, category: "admin", performedBy: user.id, targetType: "break_elidems", targetId: event.id });
  res.status(201).json(event);
});

// GET /break-elidems/:id — get event with volunteers
router.get("/break-elidems/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [event] = await db.select().from(breakElidemEventsTable).where(eq(breakElidemEventsTable.id, id));
  if (!event) { res.status(404).json({ error: "Not found" }); return; }

  const volunteers = await db.select({
    id: breakElidemVolunteersTable.id,
    role: breakElidemVolunteersTable.role,
    isSelected: breakElidemVolunteersTable.isSelected,
    details: breakElidemVolunteersTable.details,
    createdAt: breakElidemVolunteersTable.createdAt,
    userName: usersTable.name,
    userId: usersTable.id,
  }).from(breakElidemVolunteersTable)
    .leftJoin(usersTable, eq(breakElidemVolunteersTable.userId, usersTable.id))
    .where(eq(breakElidemVolunteersTable.eventId, id));

  res.json({ ...event, volunteers });
});

// PATCH /break-elidems/:id — update event (owner only)
router.patch("/break-elidems/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "owner") { res.status(403).json({ error: "Owner only" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { status, title, startTime, endTime, meetLink, description } = req.body as Record<string, string>;
  const update: Record<string, unknown> = {};
  if (status) update.status = status;
  if (title) update.title = title;
  if (startTime) update.startTime = startTime;
  if (endTime) update.endTime = endTime;
  if (meetLink !== undefined) update.meetLink = meetLink;
  if (description !== undefined) update.description = description;

  const [updated] = await db.update(breakElidemEventsTable).set(update).where(eq(breakElidemEventsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  if (status === "active") {
    await db.insert(notificationsTable).values({ title: `BREAK-ELIDEMS is LIVE! 🎉`, message: `The ${updated.title} event has started! Join now: ${updated.meetLink ?? "Link coming soon"}`, type: "class_starting", recipientId: null });
  }
  await db.insert(auditLogsTable).values({ action: `Updated BREAK-ELIDEMS event #${id} status: ${status ?? "updated"}`, category: "admin", performedBy: user.id, targetType: "break_elidems", targetId: id });
  res.json(updated);
});

// DELETE /break-elidems/:id
router.delete("/break-elidems/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "owner") { res.status(403).json({ error: "Owner only" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(breakElidemEventsTable).where(eq(breakElidemEventsTable.id, id));
  res.sendStatus(204);
});

// POST /break-elidems/:id/volunteer — volunteer for event
router.post("/break-elidems/:id/volunteer", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role === "student" && !user.isPrefect) { res.status(403).json({ error: "Only teachers and prefects may volunteer" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(breakElidemVolunteersTable)
    .where(and(eq(breakElidemVolunteersTable.eventId, id), eq(breakElidemVolunteersTable.userId, user.id)));
  if (existing) { res.status(400).json({ error: "Already volunteered" }); return; }

  const role = user.role === "teacher" ? "teacher" : "prefect";
  const { details } = req.body as { details?: string };
  const [vol] = await db.insert(breakElidemVolunteersTable).values({ eventId: id, userId: user.id, role, details, isSelected: false }).returning();
  res.status(201).json(vol);
});

// PATCH /break-elidems/:id/volunteers/:volId — select/deselect volunteer (owner only)
router.patch("/break-elidems/:id/volunteers/:volId", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "owner") { res.status(403).json({ error: "Owner only" }); return; }
  const volId = parseInt(String(req.params.volId));
  if (isNaN(volId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { isSelected } = req.body as { isSelected: boolean };
  const [updated] = await db.update(breakElidemVolunteersTable).set({ isSelected }).where(eq(breakElidemVolunteersTable.id, volId)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

export default router;

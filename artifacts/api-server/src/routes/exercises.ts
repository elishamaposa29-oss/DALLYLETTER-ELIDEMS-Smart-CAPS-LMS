import { Router } from "express";
import multer from "multer";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  exercisesTable, exerciseAnswersTable, exerciseOptionsTable, exerciseQuestionsTable,
  exerciseSubmissionsTable, lessonsTable, auditLogsTable,
} from "@workspace/db/schema";
import { requireAuth, canManageAcademicContent, isOwnerRole } from "../lib/auth-middleware";
import { getAIProvider } from "../lib/ai-provider";
import { createMediaStorageKey, ensureMediaDirectory, getMediaDirectory, isAllowedMediaType, MAX_MEDIA_SIZE_BYTES } from "../lib/media-storage";

const router = Router();
const learnerRole = "student";
const questionTypes = new Set(["input", "poll", "drawbox"]);
const exerciseAnswerMediaUpload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, callback) => {
      try { await ensureMediaDirectory(); callback(null, getMediaDirectory()); }
      catch (error) { callback(error as Error, ""); }
    },
    filename: (_req, _file, callback) => callback(null, createMediaStorageKey()),
  }),
  limits: { fileSize: MAX_MEDIA_SIZE_BYTES },
  fileFilter: (_req, file, callback) => callback(null, isAllowedMediaType(file.mimetype)),
});

router.post("/answer-media", requireAuth, (req,res):void => {
  if (req.currentUser?.role !== learnerRole) { res.status(403).json({error:"Student access required"}); return; }
  exerciseAnswerMediaUpload.single("file")(req,res,(error) => {
    if (error instanceof multer.MulterError) { res.status(400).json({error:"A supported answer file up to 250 MB is required"}); return; }
    if (error) { res.status(400).json({error:"A supported answer file is required"}); return; }
    if (!req.file) { res.status(400).json({error:"A supported answer file is required"}); return; }
    res.status(201).json({ mediaUrl: `/api/lessons/media/${req.file.filename}?type=${encodeURIComponent(req.file.mimetype)}`, storageKey: req.file.filename, fileName: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size });
  });
});

function parseId(value: unknown): number | null { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }
function canEditExercise(user: NonNullable<Express.Request["currentUser"]>, createdBy: number): boolean {
  return isOwnerRole(user.role) || (canManageAcademicContent(user) && createdBy === user.id);
}
async function writeAudit(userId: number, action: string, targetId: number, details: Record<string, unknown>) {
  await db.insert(auditLogsTable).values({ action, category: "exercise", performedBy: userId, targetType: "exercise", targetId, details: JSON.stringify(details) });
}

router.get("/lessons/:lessonId/exercises", requireAuth, async (req,res):Promise<void> => {
  const lessonId=parseId(req.params.lessonId); if(!lessonId){res.status(400).json({error:"Invalid lesson id"});return;}
  const published=await db.select().from(exercisesTable).where(and(eq(exercisesTable.lessonId,lessonId),eq(exercisesTable.status,"published"))).orderBy(desc(exercisesTable.createdAt));
  if(canManageAcademicContent(req.currentUser!)) { const own=await db.select().from(exercisesTable).where(eq(exercisesTable.lessonId,lessonId)).orderBy(desc(exercisesTable.createdAt)); res.json(own); return; }
  const learnerId=req.currentUser?.role===learnerRole ? req.currentUser.id : null;
  if(!learnerId){res.json(published);return;}
  const withStatus=await Promise.all(published.map(async exercise=>{ const [submission]=await db.select({attemptNumber:exerciseSubmissionsTable.attemptNumber,status:exerciseSubmissionsTable.status,totalScore:exerciseSubmissionsTable.totalScore,percentage:exerciseSubmissionsTable.percentage,submittedAt:exerciseSubmissionsTable.submittedAt,returnedAt:exerciseSubmissionsTable.returnedAt}).from(exerciseSubmissionsTable).where(and(eq(exerciseSubmissionsTable.exerciseId,exercise.id),eq(exerciseSubmissionsTable.learnerId,learnerId))).orderBy(desc(exerciseSubmissionsTable.attemptNumber)).limit(1); return {...exercise, submissionStatus:submission?.status??"not_started", submission:submission??null}; }));
  res.json(withStatus);
});

router.get("/:id",requireAuth,async(req,res):Promise<void>=>{
  const exerciseId=parseId(req.params.id);if(!exerciseId){res.status(400).json({error:"Invalid exercise id"});return;}
  const [exercise]=await db.select().from(exercisesTable).where(eq(exercisesTable.id,exerciseId)); if(!exercise){res.status(404).json({error:"Exercise not found"});return;}
  if(exercise.status!=="published"&&!canEditExercise(req.currentUser!,exercise.createdBy)){res.status(404).json({error:"Exercise not found"});return;}
  const questions=await db.select().from(exerciseQuestionsTable).where(eq(exerciseQuestionsTable.exerciseId,exercise.id)).orderBy(asc(exerciseQuestionsTable.position));
  const allOptionRows=questions.length?(await Promise.all(questions.map(q=>db.select().from(exerciseOptionsTable).where(eq(exerciseOptionsTable.questionId,q.id))))).flat():[];
  res.json({exercise,questions,options:allOptionRows.map(({isCorrect:_isCorrect,...option})=>option)});
});

// Teacher/manager content-management routes below use the same centralized guard.
router.post("/lessons/:lessonId/exercises",requireAuth,async(req,res):Promise<void>=>{
  const user=req.currentUser!; if(!canManageAcademicContent(user)){res.status(403).json({error:"Teacher or manager access required"});return;}
  const lessonId=parseId(req.params.lessonId);if(!lessonId){res.status(400).json({error:"Invalid lesson id"});return;}
  const [lesson]=await db.select({id:lessonsTable.id}).from(lessonsTable).where(eq(lessonsTable.id,lessonId));if(!lesson){res.status(404).json({error:"Lesson not found"});return;}
  const {title,instructions,grade,stream,layout}=req.body??{}; if(typeof title!=="string"||!title.trim()||title.length>300){res.status(400).json({error:"title is required"});return;}
  const [exercise]=await db.insert(exercisesTable).values({lessonId,createdBy:user.id,title:title.trim(),instructions:typeof instructions==="string"?instructions:null,grade:typeof grade==="string"&&grade.trim()?grade.trim():null,stream:typeof stream==="string"&&stream.trim()?stream.trim():null,layout:layout&&typeof layout==="object"?layout:{version:1,page:"book"}}).returning(); res.status(201).json(exercise);
});

router.post("/:id/questions",requireAuth,async(req,res):Promise<void>=>{
  const user=req.currentUser!;if(!canManageAcademicContent(user)){res.status(403).json({error:"Teacher or manager access required"});return;}
  const exerciseId=parseId(req.params.id);if(!exerciseId){res.status(400).json({error:"Invalid exercise id"});return;}
  const [exercise]=await db.select().from(exercisesTable).where(eq(exercisesTable.id,exerciseId));if(!exercise){res.status(404).json({error:"Exercise not found"});return;} if(!canEditExercise(user,exercise.createdBy)){res.status(403).json({error:"You can only edit your own exercise"});return;}
  const {prompt,type,marksAllocated,position,config,options}=req.body??{}; const marks=Number(marksAllocated??1); if(typeof prompt!=="string"||!prompt.trim()||!questionTypes.has(type)||!Number.isFinite(marks)||marks<0||marks>10000||Math.round(marks*2)!==marks*2){res.status(400).json({error:"prompt, type (input|poll|drawbox), and marksAllocated in 0.5 increments are required"});return;}
  let rows:{label:string;value:string;position:number;isCorrect:boolean}[]=[]; if(type==="poll"){if(!Array.isArray(options)||options.length<2){res.status(400).json({error:"Poll questions require at least two options"});return;} rows=options.map((item,index)=>({label:typeof item?.label==="string"?item.label.trim():"",value:typeof item?.value==="string"?item.value.trim():"",position:index,isCorrect:Boolean(item?.isCorrect)})); if(rows.some(r=>!r.label||!r.value)||!rows.some(r=>r.isCorrect)){res.status(400).json({error:"Poll requires at least two non-empty options and one correct option"});return;}}
  const [question]=await db.insert(exerciseQuestionsTable).values({exerciseId,prompt:prompt.trim(),type,marksAllocated:marks.toString(),position:Number.isInteger(position)&&position>=0?position:0,config:config&&typeof config==="object"?config:{}}).returning(); if(type==="poll") await db.insert(exerciseOptionsTable).values(rows.map(r=>({...r,questionId:question.id}))); res.status(201).json(question);
});

router.post("/:id/publish",requireAuth,async(req,res):Promise<void>=>{
  const user=req.currentUser!;if(!canManageAcademicContent(user)){res.status(403).json({error:"Teacher or manager access required"});return;}
  const exerciseId=parseId(req.params.id);if(!exerciseId){res.status(400).json({error:"Invalid exercise id"});return;}
  const [exercise]=await db.select().from(exercisesTable).where(eq(exercisesTable.id,exerciseId));if(!exercise){res.status(404).json({error:"Exercise not found"});return;} if(!canEditExercise(user,exercise.createdBy)){res.status(403).json({error:"You can only publish your own exercise"});return;}
  const questions=await db.select().from(exerciseQuestionsTable).where(eq(exerciseQuestionsTable.exerciseId,exercise.id));if(!questions.length){res.status(409).json({error:"Add at least one question before publishing"});return;}
  for(const q of questions){if(q.type==="poll"){const opts=await db.select().from(exerciseOptionsTable).where(eq(exerciseOptionsTable.questionId,q.id));if(opts.length<2||!opts.some(o=>o.isCorrect)){res.status(409).json({error:`Poll question ${q.position+1} needs at least two options and one correct option`});return;}}}
  const totalMarks=questions.reduce((sum,q)=>sum+Number(q.marksAllocated),0); const requestedAI=req.body?.aiMarking&&typeof req.body.aiMarking==="object"?req.body.aiMarking as {enabled?:boolean;approved?:boolean}:{};
  if(requestedAI.enabled){if(!requestedAI.approved){res.status(409).json({error:"AI marking must be explicitly approved after the readiness check before publishing"});return;} const currentLayout=exercise.layout&&typeof exercise.layout==="object"?exercise.layout as Record<string,unknown>:{}; const aiLayout={...currentLayout,aiMarking:{enabled:true,approved:true,approvedAt:new Date().toISOString()}}; const [updated]=await db.update(exercisesTable).set({status:"published",totalMarks:totalMarks.toString(),publishedAt:new Date(),layout:aiLayout}).where(eq(exercisesTable.id,exercise.id)).returning(); await writeAudit(user.id,"exercise_published",exercise.id,{totalMarks,aiMarking:true,teacherClarification:typeof req.body?.teacherClarification==="string"?req.body.teacherClarification.slice(0,1000):null});res.json(updated);return;}
  const [updated]=await db.update(exercisesTable).set({status:"published",totalMarks:totalMarks.toString(),publishedAt:new Date()}).where(eq(exercisesTable.id,exercise.id)).returning(); await writeAudit(user.id,"exercise_published",exercise.id,{totalMarks});res.json(updated);
});

export default router;

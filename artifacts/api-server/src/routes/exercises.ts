import { Router } from "express";
import multer from "multer";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  exercisesTable, exerciseAnswersTable, exerciseOptionsTable, exerciseQuestionsTable,
  exerciseSubmissionsTable, lessonsTable, auditLogsTable,
} from "@workspace/db/schema";
import { canManageAcademicContent, isOwnerRole, requireAuth } from "../lib/auth-middleware";
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
    res.status(201).json({
      mediaUrl: `/api/lessons/media/${req.file.filename}?type=${encodeURIComponent(req.file.mimetype)}`,
      storageKey: req.file.filename,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  });
});

function parseId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
function canEditExercise(user: NonNullable<Express.Request["currentUser"]>, createdBy: number): boolean {
  return isOwnerRole(user.role) || user.isManager === true || (user.role === "teacher" && createdBy === user.id);
}
async function writeAudit(userId: number, action: string, targetId: number, details: Record<string, unknown>) {
  await db.insert(auditLogsTable).values({ action, category: "exercise", performedBy: userId, targetType: "exercise", targetId, details: JSON.stringify(details) });
}

router.get("/lessons/:lessonId/exercises", requireAuth, async (req,res):Promise<void> => {
  const lessonId=parseId(req.params.lessonId);
  if(!lessonId){res.status(400).json({error:"Invalid lesson id"});return;}
  const published=await db.select().from(exercisesTable).where(and(eq(exercisesTable.lessonId,lessonId),eq(exercisesTable.status,"published"))).orderBy(desc(exercisesTable.createdAt));
  if(req.currentUser && canManageAcademicContent(req.currentUser)){
    const own=await db.select().from(exercisesTable).where(eq(exercisesTable.lessonId,lessonId)).orderBy(desc(exercisesTable.createdAt));res.json(own);return;
  }
  const learnerId=req.currentUser?.role===learnerRole ? req.currentUser.id : null;
  if(!learnerId){res.json(published);return;}
  const withStatus=await Promise.all(published.map(async exercise=>{
    const [submission]=await db.select({attemptNumber:exerciseSubmissionsTable.attemptNumber,status:exerciseSubmissionsTable.status,totalScore:exerciseSubmissionsTable.totalScore,percentage:exerciseSubmissionsTable.percentage,submittedAt:exerciseSubmissionsTable.submittedAt,returnedAt:exerciseSubmissionsTable.returnedAt}).from(exerciseSubmissionsTable).where(and(eq(exerciseSubmissionsTable.exerciseId,exercise.id),eq(exerciseSubmissionsTable.learnerId,learnerId))).orderBy(desc(exerciseSubmissionsTable.attemptNumber)).limit(1);
    return {...exercise, submissionStatus:submission?.status??"not_started", submission:submission??null};
  }));
  res.json(withStatus);
});

router.get("/:id",requireAuth,async(req,res):Promise<void>=>{
  const exerciseId=parseId(req.params.id);if(!exerciseId){res.status(400).json({error:"Invalid exercise id"});return;}
  const [exercise]=await db.select().from(exercisesTable).where(eq(exercisesTable.id,exerciseId));
  if(!exercise){res.status(404).json({error:"Exercise not found"});return;}
  if(exercise.status!=="published"&&!canEditExercise(req.currentUser!,exercise.createdBy)){res.status(404).json({error:"Exercise not found"});return;}
  const questions=await db.select().from(exerciseQuestionsTable).where(eq(exerciseQuestionsTable.exerciseId,exercise.id)).orderBy(asc(exerciseQuestionsTable.position));
  const allOptionRows=questions.length?(await Promise.all(questions.map(q=>db.select().from(exerciseOptionsTable).where(eq(exerciseOptionsTable.questionId,q.id))))).flat():[];
  res.json({exercise,questions,options:allOptionRows.map(({isCorrect:_isCorrect,...option})=>option)});
});

router.post("/lessons/:lessonId/exercises",requireAuth,async(req,res):Promise<void>=>{
  const user=req.currentUser!;if(!canManageAcademicContent(user)){res.status(403).json({error:"Teacher or owner access required"});return;}
  const lessonId=parseId(req.params.lessonId);if(!lessonId){res.status(400).json({error:"Invalid lesson id"});return;}
  const [lesson]=await db.select({id:lessonsTable.id}).from(lessonsTable).where(eq(lessonsTable.id,lessonId));if(!lesson){res.status(404).json({error:"Lesson not found"});return;}
  const {title,instructions,grade,stream,layout}=req.body??{};
  if(typeof title!=="string"||!title.trim()||title.length>300){res.status(400).json({error:"title is required"});return;}
  const [exercise]=await db.insert(exercisesTable).values({lessonId,createdBy:user.id,title:title.trim(),instructions:typeof instructions==="string"?instructions:null,grade:typeof grade==="string"&&grade.trim()?grade.trim():null,stream:typeof stream==="string"&&stream.trim()?stream.trim():null,layout:layout&&typeof layout==="object"?layout:{version:1,page:"book"}}).returning();
  res.status(201).json(exercise);
});

router.post("/:id/questions",requireAuth,async(req,res):Promise<void>=>{
  const user=req.currentUser!;if(!canManageAcademicContent(user)){res.status(403).json({error:"Teacher or owner access required"});return;}
  const exerciseId=parseId(req.params.id);if(!exerciseId){res.status(400).json({error:"Invalid exercise id"});return;}
  const [exercise]=await db.select().from(exercisesTable).where(eq(exercisesTable.id,exerciseId));if(!exercise){res.status(404).json({error:"Exercise not found"});return;}
  if(!canEditExercise(user,exercise.createdBy)){res.status(403).json({error:"You can only edit your own exercise"});return;}
  const {prompt,type,marksAllocated,position,config,options}=req.body??{};
  const marks=Number(marksAllocated??1);
  if(typeof prompt!=="string"||!prompt.trim()||!questionTypes.has(type)||!Number.isFinite(marks)||marks<0||marks>10000||Math.round(marks*2)!==marks*2){res.status(400).json({error:"prompt, type (input|poll|drawbox), and marksAllocated in 0.5 increments are required"});return;}
  let rows:{label:string;value:string;position:number;isCorrect:boolean}[]=[];
  if(type==="poll"){
    if(!Array.isArray(options)||options.length<2){res.status(400).json({error:"Poll questions require at least two options"});return;}
    rows=options.map((item,index)=>({label:typeof item?.label==="string"?item.label.trim():"",value:typeof item?.value==="string"?item.value.trim():"",position:index,isCorrect:Boolean(item?.isCorrect)}));
    if(rows.some(r=>!r.label||!r.value)||!rows.some(r=>r.isCorrect)){res.status(400).json({error:"Poll requires at least two non-empty options and one correct option"});return;}
  }
  const [question]=await db.insert(exerciseQuestionsTable).values({exerciseId,prompt:prompt.trim(),type,marksAllocated:marks.toString(),position:Number.isInteger(position)&&position>=0?position:0,config:config&&typeof config==="object"?config:{}}).returning();
  if(type==="poll") await db.insert(exerciseOptionsTable).values(rows.map(r=>({...r,questionId:question.id})));
  res.status(201).json(question);
});

router.post("/:id/publish",requireAuth,async(req,res):Promise<void>=>{
  const user=req.currentUser!;if(!canManageAcademicContent(user)){res.status(403).json({error:"Teacher or owner access required"});return;}
  const exerciseId=parseId(req.params.id);if(!exerciseId){res.status(400).json({error:"Invalid exercise id"});return;}
  const [exercise]=await db.select().from(exercisesTable).where(eq(exercisesTable.id,exerciseId));if(!exercise){res.status(404).json({error:"Exercise not found"});return;}
  if(!canEditExercise(user,exercise.createdBy)){res.status(403).json({error:"You can only publish your own exercise"});return;}
  const questions=await db.select().from(exerciseQuestionsTable).where(eq(exerciseQuestionsTable.exerciseId,exercise.id));
  if(!questions.length){res.status(409).json({error:"Add at least one question before publishing"});return;}
  for(const q of questions){if(q.type==="poll"){const opts=await db.select().from(exerciseOptionsTable).where(eq(exerciseOptionsTable.questionId,q.id));if(opts.length<2||!opts.some(o=>o.isCorrect)){res.status(409).json({error:`Poll question ${q.position+1} needs at least two options and one correct option`});return;}}}
  const totalMarks=questions.reduce((sum,q)=>sum+Number(q.marksAllocated),0);
  const requestedAI=req.body?.aiMarking&&typeof req.body.aiMarking==="object"?req.body.aiMarking as {enabled?:boolean;approved?:boolean}:{};
  if(requestedAI.enabled){
    if(!requestedAI.approved){res.status(409).json({error:"AI marking must be explicitly approved after the readiness check before publishing"});return;}
    const currentLayout=exercise.layout&&typeof exercise.layout==="object"?exercise.layout as Record<string,unknown>:{};
    const aiLayout={...currentLayout,aiMarking:{enabled:true,approved:true,approvedAt:new Date().toISOString()}};
    const [updated]=await db.update(exercisesTable).set({status:"published",totalMarks:totalMarks.toString(),publishedAt:new Date(),layout:aiLayout}).where(eq(exercisesTable.id,exercise.id)).returning();
    await writeAudit(user.id,"exercise_published",exercise.id,{totalMarks,aiMarking:true,teacherClarification:typeof req.body?.teacherClarification==="string"?req.body.teacherClarification.slice(0,1000):null});res.json(updated);return;
  }
  const [updated]=await db.update(exercisesTable).set({status:"published",totalMarks:totalMarks.toString(),publishedAt:new Date()}).where(eq(exercisesTable.id,exercise.id)).returning();
  await writeAudit(user.id,"exercise_published",exercise.id,{totalMarks});res.json(updated);
});

router.post("/:id/ai-marking/check",requireAuth,async(req,res):Promise<void>=>{
  const user=req.currentUser!;
  if(!canManageAcademicContent(user)){res.status(403).json({error:"Teacher or owner access required"});return;}
  const exerciseId=parseId(req.params.id);if(!exerciseId){res.status(400).json({error:"Invalid exercise id"});return;}
  const [exercise]=await db.select().from(exercisesTable).where(eq(exercisesTable.id,exerciseId));
  if(!exercise||!canEditExercise(user,exercise.createdBy)){res.status(404).json({error:"Exercise not found"});return;}
  const questions=await db.select().from(exerciseQuestionsTable).where(eq(exerciseQuestionsTable.exerciseId,exerciseId)).orderBy(asc(exerciseQuestionsTable.position));
  if(!questions.length){res.status(409).json({error:"Add at least one question before checking AI marking"});return;}
  const teacherClarification=typeof req.body?.teacherClarification==="string"?req.body.teacherClarification.trim():"";
  const ai=await getAIProvider();
  if(ai.name==="mock"){res.json({provider:"mock",configured:false,canMark:false,clarifications:["No live AI provider is configured yet. Add a Gemini, OpenAI, or Anthropic API key before enabling AI marking."]});return;}
  const payload=[];
  for(const q of questions){
    const options=q.type==="poll"?await db.select().from(exerciseOptionsTable).where(eq(exerciseOptionsTable.questionId,q.id)):[];
    payload.push({id:q.id,type:q.type,prompt:q.prompt,marksAllocated:q.marksAllocated,options:options.map(o=>({label:o.label,value:o.value,isCorrect:o.isCorrect}))});
  }
  try{
    const raw=await ai.chat([{role:"user",content:`Assess whether you can reliably mark this educational exercise. Do not mark learner work yet. Identify any question types, wording, diagrams, rubrics, or missing information that would require teacher clarification. If the teacher has supplied a clarification, use it to reassess the concern. Return ONLY JSON: {"canMark":true|false,"clarifications":["specific questions for the teacher"],"reason":"brief reason"}\\nExercise:\\n${JSON.stringify(payload)}\\nTeacher clarification:\\n${teacherClarification || "(none)"}`}]);
    const match=raw.match(/\{[\s\S]*\}/);if(!match)throw new Error("AI readiness response was not valid JSON");
    const result=JSON.parse(match[0]) as {canMark?:boolean;clarifications?:string[];reason?:string};
    res.json({provider:ai.name,configured:true,canMark:Boolean(result.canMark),clarifications:Array.isArray(result.clarifications)?result.clarifications.filter(x=>typeof x==="string"):[],reason:result.reason??null});
  }catch(err){res.status(502).json({error:err instanceof Error?err.message:"AI readiness check failed",provider:ai.name});}
});

router.post("/:id/ai-marking/:submissionId/run",requireAuth,async(req,res):Promise<void>=>{
  const user=req.currentUser!;
  if(!canManageAcademicContent(user)){res.status(403).json({error:"Teacher or owner access required"});return;}
  const exerciseId=parseId(req.params.id),submissionId=parseId(req.params.submissionId);
  if(!exerciseId||!submissionId){res.status(400).json({error:"Invalid exercise or submission id"});return;}
  const [exercise]=await db.select().from(exercisesTable).where(eq(exercisesTable.id,exerciseId));
  if(!exercise||!canEditExercise(user,exercise.createdBy)){res.status(404).json({error:"Exercise not found"});return;}
  const aiConfig=(exercise.layout&&typeof exercise.layout==="object"?(exercise.layout as Record<string,unknown>).aiMarking:null) as {enabled?:boolean;approved?:boolean}|null;
  if(!aiConfig?.enabled||!aiConfig?.approved){res.status(409).json({error:"AI marking is not enabled and approved for this exercise"});return;}
  const [submission]=await db.select().from(exerciseSubmissionsTable).where(and(eq(exerciseSubmissionsTable.id,submissionId),eq(exerciseSubmissionsTable.exerciseId,exerciseId)));
  if(!submission){res.status(404).json({error:"Submission not found"});return;}
  if(submission.status==="marked"){res.status(409).json({error:"This submission has already been returned to the learner"});return;}if(!["submitted","ai_partial"].includes(submission.status)){res.status(409).json({error:"This submission is not in an AI-reviewable state"});return;}
  const ai=await getAIProvider();if(ai.name==="mock"){res.status(409).json({error:"AI marking is not available until a live AI provider is configured"});return;}
  const questions=await db.select().from(exerciseQuestionsTable).where(eq(exerciseQuestionsTable.exerciseId,exerciseId)).orderBy(asc(exerciseQuestionsTable.position));
  const answers=await db.select().from(exerciseAnswersTable).where(eq(exerciseAnswersTable.submissionId,submissionId));
  const optionsByQuestion=new Map<number,unknown[]>();
  for(const q of questions) optionsByQuestion.set(q.id,q.type==="poll"?await db.select().from(exerciseOptionsTable).where(eq(exerciseOptionsTable.questionId,q.id)):[]);
  const packet=questions.map(q=>({question:{id:q.id,type:q.type,prompt:q.prompt,marksAllocated:q.marksAllocated,options:optionsByQuestion.get(q.id)??[]},answer:answers.find(a=>a.questionId===q.id)||null}));
  try{
    const raw=await ai.chat([{role:"user",content:`Mark this learner exercise conservatively. Never invent evidence. Use only the question, allocation, rubric/configuration, and learner answer supplied. For drawings, if the image/strokes are ambiguous or you cannot reliably interpret them, set needsReview=true and awardedMarks=0 rather than guessing. Return ONLY JSON: {"marks":[{"answerId":1,"awardedMarks":0,"needsReview":false,"confidence":0.99,"correctionNotes":"..."}],"overallNotes":"..."}\\nExercise submission:\\n${JSON.stringify(packet)}`}]);
    const match=raw.match(/\{[\s\S]*\}/);if(!match)throw new Error("AI marking response was not valid JSON");
    const result=JSON.parse(match[0]) as {marks?:Array<{answerId?:number;awardedMarks?:number;needsReview?:boolean;confidence?:number;correctionNotes?:string}>;overallNotes?:string};
    const proposals=Array.isArray(result.marks)?result.marks:[];
    let needsReview=false;
    for(const p of proposals){
      const answerId=parseId(p.answerId);if(!answerId)continue;
      const answer=answers.find(a=>a.id===answerId);if(!answer)continue;
      const q=questions.find(x=>x.id===answer.questionId);if(!q)continue;
      const review=Boolean(p.needsReview)||Number(p.confidence??0)<0.75;needsReview ||= review;
      const awarded=review?Number(answer.awardedMarks):Math.max(0,Math.min(Number(q.marksAllocated),Math.round(Number(p.awardedMarks??0)*2)/2));
      await db.update(exerciseAnswersTable).set({awardedMarks:String(awarded),correctionNotes:typeof p.correctionNotes==="string"?p.correctionNotes:null,markedBy:user.id,markedAt:new Date()}).where(eq(exerciseAnswersTable.id,answerId));
    }
    const status=needsReview?"ai_partial":"ai_marked_pending_return";
    await db.update(exerciseSubmissionsTable).set({status}).where(eq(exerciseSubmissionsTable.id,submissionId));
    await writeAudit(user.id,"exercise_ai_marking",exercise.id,{submissionId,status,provider:ai.name,overallNotes:result.overallNotes??null});
    res.json({submissionId,status,needsReview,overallNotes:result.overallNotes??null,proposals});
  }catch(err){res.status(502).json({error:err instanceof Error?err.message:"AI marking failed",provider:ai.name});}
});

router.post("/:id/submit",requireAuth,async(req,res):Promise<void>=>{
  const user=req.currentUser!;if(user.role!==learnerRole){res.status(403).json({error:"Student access required"});return;}
  const exerciseId=parseId(req.params.id);if(!exerciseId){res.status(400).json({error:"Invalid exercise id"});return;}
  const [exercise]=await db.select().from(exercisesTable).where(eq(exercisesTable.id,exerciseId));if(!exercise||exercise.status!=="published"){res.status(404).json({error:"Exercise not found"});return;}
  const answers=Array.isArray(req.body?.answers)?req.body.answers:[];
  const startNewAttempt=Boolean(req.body?.newAttempt);
  const [existing]=await db.select().from(exerciseSubmissionsTable).where(and(eq(exerciseSubmissionsTable.exerciseId,exercise.id),eq(exerciseSubmissionsTable.learnerId,user.id))).orderBy(desc(exerciseSubmissionsTable.attemptNumber)).limit(1);
  if(existing && existing.status!=="marked" && startNewAttempt){res.status(409).json({error:"Finish the current attempt before starting another attempt"});return;}
  if(existing && !startNewAttempt && ["submitted","ai_partial","ai_marked_pending_return"].includes(existing.status)){res.status(409).json({error:"This attempt is already submitted and is awaiting marking"});return;}
  const nextAttempt=(existing?.attemptNumber??0)+1;
  const createNew=Boolean(startNewAttempt||!existing);
  const [submission]=createNew?await db.insert(exerciseSubmissionsTable).values({exerciseId:exercise.id,learnerId:user.id,attemptNumber:nextAttempt,status:"submitted"}).returning():await db.update(exerciseSubmissionsTable).set({status:"submitted",submittedAt:new Date(),markedAt:null,returnedAt:null,totalScore:"0",percentage:null}).where(eq(exerciseSubmissionsTable.id,existing!.id)).returning();
  for(const answer of answers){const questionId=parseId(answer?.questionId);if(!questionId)continue;const [question]=await db.select({id:exerciseQuestionsTable.id}).from(exerciseQuestionsTable).where(and(eq(exerciseQuestionsTable.id,questionId),eq(exerciseQuestionsTable.exerciseId,exercise.id)));if(!question)continue;const values={textAnswer:typeof answer.textAnswer==="string"?answer.textAnswer:null,selectedValue:typeof answer.selectedValue==="string"?answer.selectedValue:null,drawData:answer.drawData&&typeof answer.drawData==="object"?answer.drawData:null,mediaReference:typeof answer.mediaReference==="string"?answer.mediaReference:null};const [existingAnswer]=await db.select().from(exerciseAnswersTable).where(and(eq(exerciseAnswersTable.submissionId,submission.id),eq(exerciseAnswersTable.questionId,questionId)));if(existingAnswer)await db.update(exerciseAnswersTable).set(values).where(eq(exerciseAnswersTable.id,existingAnswer.id));else await db.insert(exerciseAnswersTable).values({submissionId:submission.id,questionId,...values});}
  await writeAudit(user.id,"exercise_submitted",exercise.id,{submissionId:submission.id,attemptNumber:submission.attemptNumber,answerCount:answers.length});res.status(createNew?201:200).json({submissionId:submission.id,status:submission.status});
});

router.get("/:id/submissions",requireAuth,async(req,res):Promise<void>=>{
  const user=req.currentUser!;if(!canManageAcademicContent(user)){res.status(403).json({error:"Teacher or owner access required"});return;}const exerciseId=parseId(req.params.id);if(!exerciseId){res.status(400).json({error:"Invalid exercise id"});return;}const [exercise]=await db.select().from(exercisesTable).where(eq(exercisesTable.id,exerciseId));if(!exercise){res.status(404).json({error:"Exercise not found"});return;}if(!canEditExercise(user,exercise.createdBy)){res.status(403).json({error:"You can only view your own exercise submissions"});return;}res.json(await db.select().from(exerciseSubmissionsTable).where(eq(exerciseSubmissionsTable.exerciseId,exercise.id)).orderBy(desc(exerciseSubmissionsTable.submittedAt)));
});
router.get("/:id/submissions/:submissionId",requireAuth,async(req,res):Promise<void>=>{
  const user=req.currentUser!;if(!canManageAcademicContent(user)){res.status(403).json({error:"Teacher or owner access required"});return;}const exerciseId=parseId(req.params.id),submissionId=parseId(req.params.submissionId);if(!exerciseId||!submissionId){res.status(400).json({error:"Invalid exercise or submission id"});return;}const [exercise]=await db.select().from(exercisesTable).where(eq(exercisesTable.id,exerciseId));if(!exercise||!canEditExercise(user,exercise.createdBy)){res.status(404).json({error:"Exercise not found"});return;}const [submission]=await db.select().from(exerciseSubmissionsTable).where(and(eq(exerciseSubmissionsTable.id,submissionId),eq(exerciseSubmissionsTable.exerciseId,exerciseId)));if(!submission){res.status(404).json({error:"Submission not found"});return;}res.json({submission,answers:await db.select().from(exerciseAnswersTable).where(eq(exerciseAnswersTable.submissionId,submissionId))});
});
router.post("/:id/submissions/:submissionId/mark",requireAuth,async(req,res):Promise<void>=>{
  const user=req.currentUser!;if(!canManageAcademicContent(user)){res.status(403).json({error:"Teacher or owner access required"});return;}const exerciseId=parseId(req.params.id),submissionId=parseId(req.params.submissionId);if(!exerciseId||!submissionId){res.status(400).json({error:"Invalid exercise or submission id"});return;}const [exercise]=await db.select().from(exercisesTable).where(eq(exercisesTable.id,exerciseId));if(!exercise||!canEditExercise(user,exercise.createdBy)){res.status(404).json({error:"Exercise not found"});return;}const [submission]=await db.select().from(exerciseSubmissionsTable).where(and(eq(exerciseSubmissionsTable.id,submissionId),eq(exerciseSubmissionsTable.exerciseId,exerciseId)));if(!submission){res.status(404).json({error:"Submission not found"});return;}if(submission.status==="marked"){res.status(409).json({error:"This submission has already been returned. Start a new attempt if a correction is needed."});return;}const marks=Array.isArray(req.body?.marks)?req.body.marks:[];const questions=await db.select().from(exerciseQuestionsTable).where(eq(exerciseQuestionsTable.exerciseId,exerciseId));const allocation=new Map(questions.map(q=>[q.id,Number(q.marksAllocated)]));for(const item of marks){const answerId=parseId(item?.answerId),awarded=Number(item?.awardedMarks);if(!answerId||!Number.isFinite(awarded))continue;const [answer]=await db.select().from(exerciseAnswersTable).where(and(eq(exerciseAnswersTable.id,answerId),eq(exerciseAnswersTable.submissionId,submissionId)));if(!answer)continue;const max=allocation.get(answer.questionId)??0;const safeMarks=Math.max(0,Math.min(max,Math.round(awarded*2)/2));await db.update(exerciseAnswersTable).set({awardedMarks:safeMarks.toString(),correctionNotes:typeof item.correctionNotes==="string"?item.correctionNotes:null,markedBy:user.id,markedAt:new Date()}).where(eq(exerciseAnswersTable.id,answerId));}const updatedAnswers=await db.select().from(exerciseAnswersTable).where(eq(exerciseAnswersTable.submissionId,submissionId));const totalScore=updatedAnswers.reduce((sum,a)=>sum+Number(a.awardedMarks),0);const percentage=Number(exercise.totalMarks)>0?(totalScore/Number(exercise.totalMarks))*100:0;const returnedAt=new Date();const [updatedSubmission]=await db.update(exerciseSubmissionsTable).set({totalScore:totalScore.toFixed(2),percentage:percentage.toFixed(2),status:"marked",markedAt:returnedAt,returnedAt}).where(eq(exerciseSubmissionsTable.id,submissionId)).returning();await writeAudit(user.id,"exercise_marked",exercise.id,{submissionId,totalScore,percentage});await writeAudit(user.id,"exercise_returned",exercise.id,{submissionId,totalScore,percentage});res.json({submission:updatedSubmission,answers:updatedAnswers});
});
router.get("/:id/result",requireAuth,async(req,res):Promise<void>=>{
  const user=req.currentUser!;if(user.role!==learnerRole){res.status(403).json({error:"Student access required"});return;}const exerciseId=parseId(req.params.id);if(!exerciseId){res.status(400).json({error:"Invalid exercise id"});return;}const [submission]=await db.select().from(exerciseSubmissionsTable).where(and(eq(exerciseSubmissionsTable.exerciseId,exerciseId),eq(exerciseSubmissionsTable.learnerId,user.id))).orderBy(desc(exerciseSubmissionsTable.attemptNumber)).limit(1);if(!submission){res.status(404).json({error:"No submission yet"});return;}res.json({submission,answers:await db.select().from(exerciseAnswersTable).where(eq(exerciseAnswersTable.submissionId,submission.id))});
});
export default router;
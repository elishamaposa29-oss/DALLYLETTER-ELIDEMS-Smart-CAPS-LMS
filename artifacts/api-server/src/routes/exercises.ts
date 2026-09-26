import { Router } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  exercisesTable, exerciseAnswersTable, exerciseOptionsTable, exerciseQuestionsTable,
  exerciseSubmissionsTable, lessonsTable, auditLogsTable,
} from "@workspace/db/schema";
import { requireAuth } from "../lib/auth-middleware";

const router = Router();
const teacherRoles = ["teacher", "owner", "admin"];
const learnerRole = "student";
const questionTypes = new Set(["input", "poll", "drawbox"]);

function parseId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
function canEditExercise(user: NonNullable<Express.Request["currentUser"]>, createdBy: number): boolean {
  return user.role === "owner" || user.role === "admin" || (user.role === "teacher" && createdBy === user.id);
}
async function writeAudit(userId: number, action: string, targetId: number, details: Record<string, unknown>) {
  await db.insert(auditLogsTable).values({ action, category: "exercise", performedBy: userId, targetType: "exercise", targetId, details: JSON.stringify(details) });
}

router.get("/lessons/:lessonId/exercises", requireAuth, async (req,res):Promise<void> => {
  const lessonId=parseId(req.params.lessonId);
  if(!lessonId){res.status(400).json({error:"Invalid lesson id"});return;}
  const published=await db.select().from(exercisesTable).where(and(eq(exercisesTable.lessonId,lessonId),eq(exercisesTable.status,"published"))).orderBy(desc(exercisesTable.createdAt));
  if(req.currentUser && teacherRoles.includes(req.currentUser.role)){
    const own=await db.select().from(exercisesTable).where(eq(exercisesTable.lessonId,lessonId)).orderBy(desc(exercisesTable.createdAt));res.json(own);return;
  }
  const learnerId=req.currentUser?.role===learnerRole ? req.currentUser.id : null;
  if(!learnerId){res.json(published);return;}
  const withStatus=await Promise.all(published.map(async exercise=>{
    const [submission]=await db.select({status:exerciseSubmissionsTable.status,totalScore:exerciseSubmissionsTable.totalScore,percentage:exerciseSubmissionsTable.percentage,submittedAt:exerciseSubmissionsTable.submittedAt,returnedAt:exerciseSubmissionsTable.returnedAt}).from(exerciseSubmissionsTable).where(and(eq(exerciseSubmissionsTable.exerciseId,exercise.id),eq(exerciseSubmissionsTable.learnerId,learnerId)));
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
  const user=req.currentUser!;if(!teacherRoles.includes(user.role)){res.status(403).json({error:"Teacher or owner access required"});return;}
  const lessonId=parseId(req.params.lessonId);if(!lessonId){res.status(400).json({error:"Invalid lesson id"});return;}
  const [lesson]=await db.select({id:lessonsTable.id}).from(lessonsTable).where(eq(lessonsTable.id,lessonId));if(!lesson){res.status(404).json({error:"Lesson not found"});return;}
  const {title,instructions,grade,stream,layout}=req.body??{};
  if(typeof title!=="string"||!title.trim()||title.length>300){res.status(400).json({error:"title is required"});return;}
  const [exercise]=await db.insert(exercisesTable).values({lessonId,createdBy:user.id,title:title.trim(),instructions:typeof instructions==="string"?instructions:null,grade:typeof grade==="string"&&grade.trim()?grade.trim():null,stream:typeof stream==="string"&&stream.trim()?stream.trim():null,layout:layout&&typeof layout==="object"?layout:{version:1,page:"book"}}).returning();
  res.status(201).json(exercise);
});

router.post("/:id/questions",requireAuth,async(req,res):Promise<void>=>{
  const user=req.currentUser!;if(!teacherRoles.includes(user.role)){res.status(403).json({error:"Teacher or owner access required"});return;}
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
  const user=req.currentUser!;if(!teacherRoles.includes(user.role)){res.status(403).json({error:"Teacher or owner access required"});return;}
  const exerciseId=parseId(req.params.id);if(!exerciseId){res.status(400).json({error:"Invalid exercise id"});return;}
  const [exercise]=await db.select().from(exercisesTable).where(eq(exercisesTable.id,exerciseId));if(!exercise){res.status(404).json({error:"Exercise not found"});return;}
  if(!canEditExercise(user,exercise.createdBy)){res.status(403).json({error:"You can only publish your own exercise"});return;}
  const questions=await db.select().from(exerciseQuestionsTable).where(eq(exerciseQuestionsTable.exerciseId,exercise.id));
  if(!questions.length){res.status(409).json({error:"Add at least one question before publishing"});return;}
  for(const q of questions){if(q.type==="poll"){const opts=await db.select().from(exerciseOptionsTable).where(eq(exerciseOptionsTable.questionId,q.id));if(opts.length<2||!opts.some(o=>o.isCorrect)){res.status(409).json({error:`Poll question ${q.position+1} needs at least two options and one correct option`});return;}}}
  const totalMarks=questions.reduce((sum,q)=>sum+Number(q.marksAllocated),0);
  const [updated]=await db.update(exercisesTable).set({status:"published",totalMarks:totalMarks.toString(),publishedAt:new Date()}).where(eq(exercisesTable.id,exercise.id)).returning();
  await writeAudit(user.id,"exercise_published",exercise.id,{totalMarks});res.json(updated);
});

router.post("/:id/submit",requireAuth,async(req,res):Promise<void>=>{
  const user=req.currentUser!;if(user.role!==learnerRole){res.status(403).json({error:"Student access required"});return;}
  const exerciseId=parseId(req.params.id);if(!exerciseId){res.status(400).json({error:"Invalid exercise id"});return;}
  const [exercise]=await db.select().from(exercisesTable).where(eq(exercisesTable.id,exerciseId));if(!exercise||exercise.status!=="published"){res.status(404).json({error:"Exercise not found"});return;}
  const answers=Array.isArray(req.body?.answers)?req.body.answers:[];
  const [existing]=await db.select().from(exerciseSubmissionsTable).where(and(eq(exerciseSubmissionsTable.exerciseId,exercise.id),eq(exerciseSubmissionsTable.learnerId,user.id)));
  const [submission]=existing?await db.update(exerciseSubmissionsTable).set({status:"submitted",submittedAt:new Date(),markedAt:null,returnedAt:null}).where(eq(exerciseSubmissionsTable.id,existing.id)).returning():await db.insert(exerciseSubmissionsTable).values({exerciseId:exercise.id,learnerId:user.id}).returning();
  for(const answer of answers){const questionId=parseId(answer?.questionId);if(!questionId)continue;const [question]=await db.select({id:exerciseQuestionsTable.id}).from(exerciseQuestionsTable).where(and(eq(exerciseQuestionsTable.id,questionId),eq(exerciseQuestionsTable.exerciseId,exercise.id)));if(!question)continue;const values={textAnswer:typeof answer.textAnswer==="string"?answer.textAnswer:null,selectedValue:typeof answer.selectedValue==="string"?answer.selectedValue:null,drawData:answer.drawData&&typeof answer.drawData==="object"?answer.drawData:null,mediaReference:typeof answer.mediaReference==="string"?answer.mediaReference:null};const [existingAnswer]=await db.select().from(exerciseAnswersTable).where(and(eq(exerciseAnswersTable.submissionId,submission.id),eq(exerciseAnswersTable.questionId,questionId)));if(existingAnswer)await db.update(exerciseAnswersTable).set(values).where(eq(exerciseAnswersTable.id,existingAnswer.id));else await db.insert(exerciseAnswersTable).values({submissionId:submission.id,questionId,...values});}
  await writeAudit(user.id,"exercise_submitted",exercise.id,{submissionId:submission.id,answerCount:answers.length});res.status(existing?200:201).json({submissionId:submission.id,status:submission.status});
});

router.get("/:id/submissions",requireAuth,async(req,res):Promise<void>=>{
  const user=req.currentUser!;if(!teacherRoles.includes(user.role)){res.status(403).json({error:"Teacher or owner access required"});return;}const exerciseId=parseId(req.params.id);if(!exerciseId){res.status(400).json({error:"Invalid exercise id"});return;}const [exercise]=await db.select().from(exercisesTable).where(eq(exercisesTable.id,exerciseId));if(!exercise){res.status(404).json({error:"Exercise not found"});return;}if(!canEditExercise(user,exercise.createdBy)){res.status(403).json({error:"You can only view your own exercise submissions"});return;}res.json(await db.select().from(exerciseSubmissionsTable).where(eq(exerciseSubmissionsTable.exerciseId,exercise.id)).orderBy(desc(exerciseSubmissionsTable.submittedAt)));
});
router.get("/:id/submissions/:submissionId",requireAuth,async(req,res):Promise<void>=>{
  const user=req.currentUser!;if(!teacherRoles.includes(user.role)){res.status(403).json({error:"Teacher or owner access required"});return;}const exerciseId=parseId(req.params.id),submissionId=parseId(req.params.submissionId);if(!exerciseId||!submissionId){res.status(400).json({error:"Invalid exercise or submission id"});return;}const [exercise]=await db.select().from(exercisesTable).where(eq(exercisesTable.id,exerciseId));if(!exercise||!canEditExercise(user,exercise.createdBy)){res.status(404).json({error:"Exercise not found"});return;}const [submission]=await db.select().from(exerciseSubmissionsTable).where(and(eq(exerciseSubmissionsTable.id,submissionId),eq(exerciseSubmissionsTable.exerciseId,exerciseId)));if(!submission){res.status(404).json({error:"Submission not found"});return;}res.json({submission,answers:await db.select().from(exerciseAnswersTable).where(eq(exerciseAnswersTable.submissionId,submissionId))});
});
router.post("/:id/submissions/:submissionId/mark",requireAuth,async(req,res):Promise<void>=>{
  const user=req.currentUser!;if(!teacherRoles.includes(user.role)){res.status(403).json({error:"Teacher or owner access required"});return;}const exerciseId=parseId(req.params.id),submissionId=parseId(req.params.submissionId);if(!exerciseId||!submissionId){res.status(400).json({error:"Invalid exercise or submission id"});return;}const [exercise]=await db.select().from(exercisesTable).where(eq(exercisesTable.id,exerciseId));if(!exercise||!canEditExercise(user,exercise.createdBy)){res.status(404).json({error:"Exercise not found"});return;}const [submission]=await db.select().from(exerciseSubmissionsTable).where(and(eq(exerciseSubmissionsTable.id,submissionId),eq(exerciseSubmissionsTable.exerciseId,exerciseId)));if(!submission){res.status(404).json({error:"Submission not found"});return;}const marks=Array.isArray(req.body?.marks)?req.body.marks:[];const questions=await db.select().from(exerciseQuestionsTable).where(eq(exerciseQuestionsTable.exerciseId,exerciseId));const allocation=new Map(questions.map(q=>[q.id,Number(q.marksAllocated)]));for(const item of marks){const answerId=parseId(item?.answerId),awarded=Number(item?.awardedMarks);if(!answerId||!Number.isFinite(awarded))continue;const [answer]=await db.select().from(exerciseAnswersTable).where(and(eq(exerciseAnswersTable.id,answerId),eq(exerciseAnswersTable.submissionId,submissionId)));if(!answer)continue;const max=allocation.get(answer.questionId)??0;const safeMarks=Math.max(0,Math.min(max,Math.round(awarded*2)/2));await db.update(exerciseAnswersTable).set({awardedMarks:safeMarks.toString(),correctionNotes:typeof item.correctionNotes==="string"?item.correctionNotes:null,markedBy:user.id,markedAt:new Date()}).where(eq(exerciseAnswersTable.id,answerId));}const updatedAnswers=await db.select().from(exerciseAnswersTable).where(eq(exerciseAnswersTable.submissionId,submissionId));const totalScore=updatedAnswers.reduce((sum,a)=>sum+Number(a.awardedMarks),0);const percentage=Number(exercise.totalMarks)>0?(totalScore/Number(exercise.totalMarks))*100:0;const returnedAt=new Date();const [updatedSubmission]=await db.update(exerciseSubmissionsTable).set({totalScore:totalScore.toFixed(2),percentage:percentage.toFixed(2),status:"marked",markedAt:returnedAt,returnedAt}).where(eq(exerciseSubmissionsTable.id,submissionId)).returning();await writeAudit(user.id,"exercise_marked",exercise.id,{submissionId,totalScore,percentage});await writeAudit(user.id,"exercise_returned",exercise.id,{submissionId,totalScore,percentage});res.json({submission:updatedSubmission,answers:updatedAnswers});
});
router.get("/:id/result",requireAuth,async(req,res):Promise<void>=>{
  const user=req.currentUser!;if(user.role!==learnerRole){res.status(403).json({error:"Student access required"});return;}const exerciseId=parseId(req.params.id);if(!exerciseId){res.status(400).json({error:"Invalid exercise id"});return;}const [submission]=await db.select().from(exerciseSubmissionsTable).where(and(eq(exerciseSubmissionsTable.exerciseId,exerciseId),eq(exerciseSubmissionsTable.learnerId,user.id)));if(!submission){res.status(404).json({error:"No submission yet"});return;}res.json({submission,answers:await db.select().from(exerciseAnswersTable).where(eq(exerciseAnswersTable.submissionId,submission.id))});
});
export default router;
type VerifiedQualification = { title?: string | null; institution?: string | null; year?: number | string | null };
type TeacherCvProfile = {
  name?: string | null;
  email?: string | null;
  subject?: string | null;
  grade?: string | null;
  cv?: Record<string, unknown> | null;
  subjects?: string[] | null;
  qualifications?: VerifiedQualification[] | null;
  generatedAt?: Date;
};

function pdfText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapText(value: unknown, width = 88): string[] {
  const source = String(value ?? "").replace(/\r/g, "");
  if (!source.trim()) return [];
  const lines: string[] = [];
  for (const paragraph of source.split("\n")) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let line = "";
    for (const word of words) {
      if (!line) line = word;
      else if ((line + " " + word).length <= width) line += " " + word;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export function buildTeacherCvPdf(profile: TeacherCvProfile): Buffer {
  const cv = profile.cv ?? {};
  const qualifications = Array.isArray(profile.qualifications) ? profile.qualifications : [];
  const subjects = Array.isArray(profile.subjects) ? profile.subjects.filter(Boolean) : [];
  const generated = profile.generatedAt ?? new Date();
  const lines: string[] = [
    "DALLYLETTER ELIDEMS - TEACHER CURRICULUM VITAE",
    "VERIFIED QUALIFICATIONS | CONFIDENTIAL PROFILE DOCUMENT",
    "Generated: " + generated.toISOString().slice(0, 10),
    "",
    "PERSONAL AND TEACHING PROFILE",
    "Name: " + (profile.name || "Not provided"),
    "Account email: " + (profile.email || "Not provided"),
    "Role: Teacher",
    "Primary subject: " + (profile.subject || "Not recorded"),
    "Grade: " + (profile.grade || "Not recorded"),
    "Subjects: " + (subjects.length ? subjects.join(", ") : String(cv.subjects || "Not recorded")),
    "",
    "VERIFIED QUALIFICATIONS",
  ];
  if (qualifications.length) {
    qualifications.forEach((item, index) => {
      lines.push((index + 1) + ". " + (item.title || "Qualification") +
        (item.institution ? " - " + item.institution : "") +
        (item.year ? " (" + item.year + ")" : ""));
    });
  } else {
    lines.push("No verified qualifications are currently recorded.");
  }
  lines.push(
    "",
    "TEACHER-PROVIDED DETAILS - NOT INDEPENDENTLY VERIFIED",
    "Professional summary:",
    ...wrapText(cv.professionalSummary),
    "",
    "Education:",
    ...wrapText(cv.education),
    "",
    "Teaching experience:",
    ...wrapText(cv.experience),
    "",
    "Additional certifications (self-reported):",
    ...wrapText(cv.certifications),
    "",
    "Languages:",
    ...wrapText(cv.languages),
    "",
    "Professional location:",
    ...wrapText(cv.address),
    "",
    "References:",
    ...wrapText(cv.references),
    "",
    "VERIFICATION NOTICE",
    "Only qualifications listed in the verified section above have a school verification status of verified.",
    "Other CV details are teacher-provided and must not be treated as independently verified.",
    "This document is private. Share it only with the teacher and authorized school reviewers.",
  );

  const pageSize = 46;
  const pageLines: string[][] = [];
  for (let i = 0; i < lines.length; i += pageSize) pageLines.push(lines.slice(i, i + pageSize));
  if (!pageLines.length) pageLines.push(["DALLYLETTER ELIDEMS - TEACHER CURRICULUM VITAE"]);

  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  const pageObjectIds: number[] = [];
  for (let pageIndex = 0; pageIndex < pageLines.length; pageIndex++) {
    const contentId = 4 + pageIndex * 2;
    const pageId = contentId + 1;
    pageObjectIds.push(pageId);
    const pageContent = [
      "q 0.92 g 0.707 0.707 -0.707 0.707 180 330 cm BT /F1 30 Tf 0 0 Td (DALLYLETTER VERIFIED QUALIFICATIONS) Tj ET Q",
      "BT /F1 13 Tf 48 752 Td (" + pdfText("DALLYLETTER ELIDEMS - TEACHER CV") + ") Tj ET",
      "BT /F1 8 Tf 48 738 Td (" + pdfText("VERIFIED QUALIFICATIONS | CONFIDENTIAL") + ") Tj ET",
      ...pageLines[pageIndex].map((line, index) =>
        "BT /F1 9 Tf 48 " + (710 - index * 14) + " Td (" + pdfText(line) + ") Tj ET"
      ),
      "BT /F1 7 Tf 48 28 Td (" + pdfText("Verified qualifications only; remaining CV details are teacher-provided and not independently verified.") + ") Tj ET",
      "BT /F1 7 Tf 540 28 Td (" + (pageIndex + 1) + "/" + pageLines.length + ") Tj ET",
    ].join("\n");
    objects[contentId] = "<< /Length " + Buffer.byteLength(pageContent, "binary") + " >>\nstream\n" + pageContent + "\nendstream";
    objects[pageId] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents " + contentId + " 0 R >>";
  }
  objects[2] = "<< /Type /Pages /Kids [" + pageObjectIds.map(id => id + " 0 R").join(" ") + "] /Count " + pageObjectIds.length + " >>";

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(pdf, "binary");
    pdf += id + " 0 obj\n" + objects[id] + "\nendobj\n";
  }
  const xrefOffset = Buffer.byteLength(pdf, "binary");
  pdf += "xref\n0 " + objects.length + "\n0000000000 65535 f \n";
  for (let id = 1; id < objects.length; id++) pdf += String(offsets[id]).padStart(10, "0") + " 00000 n \n";
  pdf += "trailer\n<< /Size " + objects.length + " /Root 1 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF";
  return Buffer.from(pdf, "binary");
}

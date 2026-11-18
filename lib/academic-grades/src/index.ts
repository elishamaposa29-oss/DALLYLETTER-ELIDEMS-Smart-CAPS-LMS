/** Canonical Dallyletter learner grade/form options.
 * Labels retain the platform's existing Grade/Form naming so stored grade strings
 * remain readable across web, mobile, lessons, classes and assessment activities.
 */
export const ACADEMIC_GRADE_OPTIONS = [
  "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7",
  "Grade 8 / Form 1", "Grade 9 / Form 2", "Grade 10 / Form 3",
  "Grade 11 / Form 4", "Grade 12 / Form 5", "Grade 12 / Form 6",
] as const;

export type AcademicGrade = typeof ACADEMIC_GRADE_OPTIONS[number];

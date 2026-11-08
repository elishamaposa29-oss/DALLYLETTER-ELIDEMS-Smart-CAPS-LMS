import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../artifacts/dallyletter/src/components/ProtectedRoute.tsx", import.meta.url),
  "utf8"
);

if (!source.includes("allowedRoles.includes(role)")) {
  throw new Error("ProtectedRoute must enforce explicit allowedRoles membership.");
}

const implicitJuniorManagerGrant =
  /role\s*===\s*["']junior_manager["']\s*&&\s*allowedRoles\.some\s*\(/;

if (implicitJuniorManagerGrant.test(source)) {
  throw new Error("Junior managers must not inherit manager/senior-manager route access implicitly.");
}

console.log("Role route guard verified: junior-manager access requires explicit route allowance.");

const login = await readFile(
  new URL("../artifacts/dallyletter/src/pages/Login.tsx", import.meta.url),
  "utf8"
);
const registration = await readFile(
  new URL("../artifacts/dallyletter/src/pages/Register.tsx", import.meta.url),
  "utf8"
);

if (!source.includes("encodeURIComponent(location)")) {
  throw new Error("ProtectedRoute must preserve the requested route when redirecting to sign-in.");
}
if (!login.includes("safeNext") || !login.includes('!requestedNext.startsWith("//")') || !login.includes("setLocation(safeNext)")) {
  throw new Error("Login must safely honor only same-site relative return destinations.");
}
if (!login.includes('["manager", "senior_manager", "junior_manager"]') || !login.includes('setLocation("/manager")')) {
  throw new Error("All manager role variants must have a role-appropriate fallback destination.");
}
if (!registration.includes('setLocation("/teacher/qualifications")') || !registration.includes('setLocation("/student")')) {
  throw new Error("Registration must route new teachers to qualification setup and learners to the learner workspace.");
}
if (!registration.includes('enteredPhone.startsWith("+")') || registration.includes('"OTHER"')) {
  throw new Error("Registration must preserve explicit E.164 phone input and avoid an unsupported country option.");
}

console.log("Authentication continuation and role-appropriate registration destinations verified.");


import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../artifacts/dallyletter/src/components/ProtectedRoute.tsx", import.meta.url),
  "utf8"
);
const login = await readFile(
  new URL("../artifacts/dallyletter/src/pages/Login.tsx", import.meta.url),
  "utf8"
);
const registration = await readFile(
  new URL("../artifacts/dallyletter/src/pages/Register.tsx", import.meta.url),
  "utf8"
);

if (!source.includes("allowedRoles.includes(role)")) {
  throw new Error("ProtectedRoute must enforce explicit allowedRoles membership.");
}
if (/role\s*===\s*["']junior_manager["']\s*&&\s*allowedRoles\.some\s*\(/.test(source)) {
  throw new Error("Junior managers must not inherit manager/senior-manager route access implicitly.");
}
if (!source.includes("encodeURIComponent(location)")) {
  throw new Error("ProtectedRoute must preserve the requested route when redirecting to sign-in.");
}

if (!login.includes('requestedNext.startsWith("/")') ||
    !login.includes('!requestedNext.startsWith("//")') ||
    !/requestedNext\.includes\(["']\\\\["']\)/.test(login) ||
    !login.includes("setLocation(safeNext)")) {
  throw new Error("Login must safely honor same-site relative return destinations only.");
}
if (!login.includes('["manager", "senior_manager", "junior_manager"]') ||
    !login.includes('setLocation("/manager")')) {
  throw new Error("All manager role variants must have a role-appropriate fallback destination.");
}

if (!registration.includes('"OTHER"') ||
    !registration.includes('enteredPhone.startsWith("+")') ||
    !registration.includes('setLocation("/teacher/qualifications")') ||
    !registration.includes('setLocation("/student")')) {
  throw new Error("Registration must support international phone entry and role-appropriate destinations.");
}

console.log("Role guards, safe login continuation and international registration verified.");

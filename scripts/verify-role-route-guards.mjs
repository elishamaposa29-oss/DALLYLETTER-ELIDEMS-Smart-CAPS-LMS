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

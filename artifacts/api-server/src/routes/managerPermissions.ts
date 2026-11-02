import { Router, type IRouter } from "express";
import { requireAuth, canAccessManager, isOwnerRole } from "../lib/auth-middleware";
import {
  normalizeRole,
  isSeniorManager,
  isJuniorManager,
  canManageAcademicContent,
  canReviewAcademicTransfer,
  canApproveAchievementAwards,
  canRecommendAchievementAwards,
} from "../lib/role-access";

const router: IRouter = Router();

/**
 * Reports capabilities derived from the authenticated server-side account.
 * This endpoint never trusts role/permission values supplied by the client.
 * It exposes only capabilities backed by the existing authorization policy.
 */
router.get("/me", requireAuth, (req, res): void => {
  const user = req.currentUser!;
  const owner = isOwnerRole(user.role);
  const seniorManager = isSeniorManager(user);
  const juniorManager = isJuniorManager(user);
  const managerAccess = canAccessManager(user);

  res.setHeader("Cache-Control", "no-store");
  res.json({
    userId: user.id,
    role: normalizeRole(user.role),
    managerLevel: owner ? "owner" : seniorManager ? "senior" : juniorManager ? "junior" : null,
    isOwner: owner,
    isSeniorManager: seniorManager,
    isJuniorManager: juniorManager,
    permissions: {
      accessManagerTools: managerAccess,
      manageUsers: owner,
      manageManagerPermissions: owner,
      manageAcademicContent: canManageAcademicContent(user),
      reviewAcademicTransfers: canReviewAcademicTransfer(user),
      recommendAchievementAwards: canRecommendAchievementAwards(user),
      approveAchievementAwards: canApproveAchievementAwards(user),
    },
  });
});

export default router;

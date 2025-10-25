// approvalsRoutes.js
const express = require('express');
const router = express.Router();
const approvalsController = require('../controllers/approvalsController');
const { requireAuth, requireBudget, requireAccounting, requireMo, requireIcs } = require('../middlewares/authMiddleware');

// Route to show all approvals
router.get('/approvals', requireAuth, approvalsController.showApprovalsPage);

// Update routes with correct middleware
router.post('/approvals/:pr_id/budget', requireAuth, requireBudget, approvalsController.updateBudgetApproval);
router.post('/approvals/:pr_id/treasury', requireAuth, requireAccounting, approvalsController.updateTreasuryApproval);
router.post('/approvals/:pr_id/mayor', requireAuth, requireMo, approvalsController.updateMayorApproval);
router.post('/approvals/:pr_id/gso', requireAuth, requireIcs, approvalsController.updateGSOApproval);

module.exports = router;
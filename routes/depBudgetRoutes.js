const express = require('express');
const router = express.Router();
const budgetController = require('../controllers/depBudgetController');
const { requireAuth, requireAdmin } = require('../middlewares/authMiddleware');

// Get admin budgets view
router.get('/admin', requireAuth, requireAdmin, budgetController.getAdminBudgetsView);

// Set/Update budget
router.post('/admin/set', requireAuth, requireAdmin, budgetController.setBudget);

// Add to existing budget
router.post('/admin/add', requireAuth, requireAdmin, budgetController.addToBudget);

// User budget view (if needed)
router.get('/view', requireAuth, budgetController.getBudgetView);

module.exports = router;
const express = require('express');
const router = express.Router();
const conditionController = require('../controllers/conditionController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

// Display Conditions page
router.get('/conditions', requireAuth, requireRole(['superadmin']), conditionController.renderConditionsPage);

// Display Add Condition page
router.get('/add-condition', requireAuth, requireRole(['superadmin']), conditionController.renderAddConditionPage);

// Add a new condition
router.post('/add-condition', requireAuth, requireRole(['superadmin']),conditionController.addCondition);

// Update a condition
router.post('/conditions/edit/:id', requireAuth, requireRole(['superadmin']),conditionController.updateCondition);

// Archive a condition
router.post('/conditions/archive/:id', requireAuth, requireRole(['superadmin']),conditionController.archiveCondition);

module.exports = router;
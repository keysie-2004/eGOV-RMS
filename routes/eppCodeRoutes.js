const express = require('express');
const router = express.Router();
const eppCodeController = require('../controllers/eppCodeController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

// Display EPP Codes page
router.get('/epp-codes', requireAuth, requireRole(['superadmin']), eppCodeController.renderEppCodesPage);

// Display Add EPP Code page
router.get('/add-epp-code', requireAuth, requireRole(['superadmin']), eppCodeController.renderAddEppCodePage);

// Add a new EPP code
router.post('/add-epp-code', requireAuth, requireRole(['superadmin']), eppCodeController.addEppCode);

// Update an EPP code
router.post('/epp-codes/edit/:id', requireAuth, requireRole(['superadmin']), eppCodeController.updateEppCode);

// Archive an EPP code
router.post('/epp-codes/archive/:id', requireAuth, requireRole(['superadmin']), eppCodeController.archiveEppCode);

module.exports = router;
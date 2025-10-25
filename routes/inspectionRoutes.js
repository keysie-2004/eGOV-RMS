const express = require('express');
const router = express.Router();
const inspectionController = require('../controllers/inspectionController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

router.get('/inspection', requireAuth, requireRole(['superadmin', 'bac']), inspectionController.showInspectionPage);
router.get('/inspection-form/:pr_id', requireAuth, requireRole(['superadmin', 'bac']), inspectionController.showInspectionForm);
router.post('/inspection-report/:pr_id/save', requireAuth, requireRole(['superadmin', 'bac']), inspectionController.saveInspectionReport);
router.get('/inspection-report/:pr_id/view', requireAuth, requireRole(['superadmin', 'bac']), inspectionController.showInspectionReport);

module.exports = router;
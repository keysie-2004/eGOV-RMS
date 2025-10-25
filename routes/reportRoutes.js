const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

router.get('/reports', requireAuth, requireRole(['superadmin']), reportController.viewReports);
router.get('/filter-reports', requireAuth, requireRole(['superadmin']), reportController.filterReports);

module.exports = router;
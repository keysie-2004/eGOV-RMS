const express = require('express');
const router = express.Router();
const OutgoingReportsController = require('../controllers/outgoingReportsController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

// Display all outgoing reports
router.get('/outgoing-reports', requireAuth, requireRole(['superadmin', 'ics']), OutgoingReportsController.displayOutgoingReports);

// Update an outgoing report
router.post('/outgoing-reports/update', requireAuth, requireRole(['superadmin', 'ics']), OutgoingReportsController.updateReport);

// Archive an outgoing report
router.post('/outgoing-reports/archive/:outgoing_id', requireAuth, requireRole(['superadmin', 'ics']), OutgoingReportsController.archiveReport);

// Unarchive an outgoing report
router.post('/outgoing-reports/unarchive/:outgoing_id', requireAuth, requireRole(['superadmin', 'ics']), OutgoingReportsController.unarchiveReport);

// Get archived reports
router.get('/outgoing-reports/archived', requireAuth, requireRole(['superadmin', 'ics']), OutgoingReportsController.displayArchivedReports);

module.exports = router;
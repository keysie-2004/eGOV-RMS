const express = require('express');
const router = express.Router();
const IncomingReportsController = require('../controllers/incomingReportsController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

// Display all incoming reports
router.get('/incoming-reports', requireAuth, requireRole(['superadmin', 'ics']), IncomingReportsController.displayIncomingReports);

// Update a report
router.post('/update', requireAuth, requireRole(['superadmin', 'ics']), IncomingReportsController.updateReport);

// Archive a report
router.post('/archive/:incoming_id', requireAuth, requireRole(['superadmin', 'ics']), IncomingReportsController.archiveReport);

// Unarchive a report
router.post('/unarchive/:incoming_id', requireAuth, requireRole(['superadmin', 'ics']), IncomingReportsController.unarchiveReport);

// Sync ICS Data
router.post('/sync-ics', requireAuth, requireRole(['superadmin', 'ics']), IncomingReportsController.syncICSData);

// Sync individual report to ICS
router.post('/sync-ics/:incoming_id', requireAuth, requireRole(['superadmin', 'ics']), IncomingReportsController.syncSingleICSData);

module.exports = router;
const express = require('express');
const router = express.Router();
const signatureController = require('../controllers/signatureController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

// Signature Management Routes
router.get('/signatures', requireAuth, requireRole(['superadmin']), signatureController.getSignatures);
router.get('/signatures/archived', requireAuth, requireRole(['superadmin']), signatureController.getArchivedSignatures);
router.get('/signatures/add', requireAuth, requireRole(['superadmin']), signatureController.getAddSignature);
router.post('/signatures/add', requireAuth, requireRole(['superadmin']), signatureController.createSignature);
router.post('/signatures/edit/:id', requireAuth, requireRole(['superadmin']), signatureController.updateSignature);
router.post('/signatures/archive/:id', requireAuth, requireRole(['superadmin']), signatureController.archiveSignature);
router.post('/signatures/unarchive', requireAuth, requireRole(['superadmin']), signatureController.unarchiveSignature);

module.exports = router;
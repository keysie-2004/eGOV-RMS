const express = require('express');
const router = express.Router();
const requestsController = require('../controllers/requestsController');
const notificationController = require('../controllers/notificationController');
const { requireAuth, requireRole, authenticateSupplier } = require('../middlewares/authMiddleware');

router.get('/add-requests', requireAuth, requestsController.renderAddRequestForm);
router.get('/api/requests', requireAuth, requestsController.getRequests);
router.get('/requests', requireAuth, requireRole(['superadmin', 'admin', 'bac', 'budget', 'accounting', 'mo', 'inout', 'ics', 'par', 'user']), requestsController.getRequests);
router.get('/my-requests', requireAuth, requestsController.getRequests);
router.get('/archived-requests', requireAuth, requireRole(['superadmin', 'admin']), requestsController.getArchivedRequests);
router.get('/requests/:id', requireAuth, requestsController.getRequestById);
router.get('/print-request/:id', requireAuth, requestsController.printRequest);
router.get('/sign-request/:id', requireAuth, requestsController.showSignRequest);
router.get('/requests/:id/qrcode', requireAuth, requestsController.generateQRCode);
router.post('/requests', requireAuth, requestsController.createRequest);
router.post('/requests/:id/update', requireAuth, requestsController.updateRequest);
router.post('/update-request', requireAuth, requestsController.updateFullRequest);
router.post('/requests/:id/delete', requireAuth, requestsController.deleteRequest);
router.post('/requests/:id/archive', requireAuth, requestsController.archiveRequest);
router.post('/requests/:id/restore', requireAuth, requireRole(['superadmin', 'admin']), requestsController.restoreRequest);
router.post('/update-status/:id', requireAuth, requireRole(['superadmin']), requestsController.updateStatus);
router.post('/requests/:id/review', requireAuth, requestsController.processSignature);
router.post('/requests/:prId/post', requireAuth, requireRole(['superadmin', 'bac']), requestsController.postRequest);
router.get('/posted-requests', authenticateSupplier, requestsController.getPostedRequests);
router.post('/requests/:prId/post', requireAuth, requireRole(['superadmin', 'bac']), requestsController.postRequestForBidding);

module.exports = router;
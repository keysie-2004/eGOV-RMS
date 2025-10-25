const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAuth, requireSuperadmin } = require('../middlewares/authMiddleware');

// Bidding management routes (superadmin only)
router.get('/biddings/data', requireAuth, requireSuperadmin, adminController.getBiddingsData);
router.get('/biddings/:biddingId/details', requireAuth, requireSuperadmin, adminController.getBiddingDetailsForModal);
router.post('/biddings/:biddingId/update', requireAuth, requireSuperadmin, adminController.updateBiddingFromModal);
router.post('/biddings/:biddingId/archive', requireAuth, requireSuperadmin, adminController.archiveBidding);
router.post('/biddings/:biddingId/unarchive', requireAuth, requireSuperadmin, adminController.unarchiveBidding);
router.post('/biddings/:biddingId/status', requireAuth, requireSuperadmin, adminController.updateBiddingStatus);
router.post('/biddings/:biddingId/award/:bidId', requireAuth, requireSuperadmin, adminController.awardBid);
router.get('/biddings/:biddingId/export', requireAuth, requireSuperadmin, adminController.exportBids);
router.get('/biddings/:prId/received', requireAuth, requireSuperadmin, adminController.listReceivedBids);

// This general route should come AFTER all specific routes
router.get('/biddings/:biddingId', requireAuth, requireSuperadmin, adminController.getBiddingDetails);
router.get('/biddings', requireAuth, requireSuperadmin, adminController.listBiddings);

// Bid comparison and management routes
router.get('/bids/pr/:prId/compare', requireAuth, requireSuperadmin, adminController.compareBids);
router.get('/bids/:bidId/details', requireAuth, requireSuperadmin, adminController.getBidDetails);
router.get('/bids/:bidId/items', requireAuth, adminController.getBidItems);
router.get('/bids/:bidId/receiving-items', requireAuth, adminController.getBidItemsForReceiving);
router.post('/bids/:bidId/decline', requireAuth, requireSuperadmin, adminController.declineBid);
router.post('/bids/:bidId/mark-received', requireAuth, adminController.markAsReceived);
router.post('/bids/:bidId/rate', requireAuth, adminController.rateSupplier);

// Supplier management routes (superadmin only) - FIXED ROUTES
router.get('/suppliers/data', requireAuth, requireSuperadmin, adminController.getSuppliersData);
router.get('/suppliers/:id/details', requireAuth, requireSuperadmin, adminController.getSupplierDetails);
router.get('/suppliers/:id/history', requireAuth, requireSuperadmin, adminController.getSupplierHistory);
router.post('/suppliers/:id/status', requireAuth, requireSuperadmin, adminController.updateSupplierStatus);
router.get('/suppliers/:id', requireAuth, requireSuperadmin, adminController.getSupplierDetails);
router.get('/suppliers', requireAuth, requireSuperadmin, adminController.listSuppliers);
router.get('/supplierList', adminController.listSuppliers);

// Received bids route
router.get('/received', requireAuth, adminController.listAllReceivedBids);

// Legacy routes - REMOVED DUPLICATES AND CONFLICTS
router.get('/api/admin/biddings/data', requireAuth, requireSuperadmin, adminController.getBiddingsData);
router.get('/export/bids/:biddingId', adminController.exportBids);

module.exports = router;
const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplierController');
const authMiddleware = require('../middlewares/authMiddleware');
const upload = require('../middlewares/upload');

// Authentication routes (public)
router.get('/login', authMiddleware.supplierGuest, supplierController.renderLogin);
router.post('/login', supplierController.login);
router.get('/register', authMiddleware.supplierGuest, supplierController.renderRegister);
router.post('/register', upload.fields([
    { name: 'permit_file', maxCount: 1 },
    { name: 'profile_image', maxCount: 1 }
]), supplierController.register);
router.get('/logout', supplierController.logout);

// Protected supplier routes
router.get('/dashboard', authMiddleware.authenticateSupplier, supplierController.renderDashboard);
router.get('/profile', authMiddleware.authenticateSupplier, supplierController.getProfile);
router.put('/profile', authMiddleware.authenticateSupplier, upload.single('profile_image'), supplierController.updateProfile);
router.get('/biddings', authMiddleware.authenticateSupplier, supplierController.getOpenBiddings);
router.get('/biddings/:biddingId', authMiddleware.authenticateSupplier, supplierController.getBiddingDetails);
router.post('/bids', authMiddleware.authenticateSupplier, supplierController.submitBid);
router.get('/bids', authMiddleware.authenticateSupplier, supplierController.getMyBids);
router.get('/bids/:bidId', authMiddleware.authenticateSupplier, supplierController.getBidDetails);

// Admin routes
router.get('/admin/suppliers', authMiddleware.authenticateAdmin, supplierController.getAllSuppliers);
router.put('/admin/suppliers/:supplierId/approve', authMiddleware.authenticateAdmin, supplierController.approveSupplier);
router.put('/admin/suppliers/:supplierId/ban', authMiddleware.authenticateAdmin, supplierController.banSupplier);
router.post('/admin/biddings', authMiddleware.authenticateAdmin, supplierController.postBidding);
router.get('/admin/biddings/:biddingId/bids', authMiddleware.authenticateAdmin, supplierController.getBiddingBids);
router.put('/admin/biddings/:biddingId/award/:bidId', authMiddleware.authenticateAdmin, supplierController.awardBid);
router.post('/admin/bids/:bidId/rate', authMiddleware.authenticateAdmin, supplierController.rateSupplier);
router.get('/admin/suppliers/:supplierId/ratings', authMiddleware.authenticateAdmin, supplierController.getSupplierRatings);
router.get('/my-bids', authMiddleware.authenticateSupplier, supplierController.renderMyBids);
router.get('/bids-report', authMiddleware.authenticateSupplier, supplierController.renderBidsReport);
router.get('/bids-report/pdf', authMiddleware.authenticateSupplier, supplierController.exportBidsReportPDF);
router.get('/bids-report/csv', authMiddleware.authenticateSupplier, supplierController.exportBidsReportCSV);

router.get('/profile-settings', authMiddleware.authenticateSupplier, supplierController.renderProfileSettings);
router.post('/profile-settings', authMiddleware.authenticateSupplier, supplierController.updateProfile);
router.get('/profile-settings/ratings-pdf', authMiddleware.authenticateSupplier, supplierController.exportRatingsPDF);
router.get('/profile-settings/ratings-csv', authMiddleware.authenticateSupplier, supplierController.exportRatingsCSV);
module.exports = router;
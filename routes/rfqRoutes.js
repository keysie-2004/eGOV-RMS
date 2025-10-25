const express = require('express');
const router = express.Router();
const rfqController = require('../controllers/rfqController');
const multer = require('multer');
const { requireAuth } = require('../middlewares/authMiddleware');

// Configure multer to handle form data (no file uploads)
const upload = multer();

// ✅ Apply requireAuth to all routes below this line
router.use(requireAuth);

// RFQ routes
router.get('/rfq', requireAuth, rfqController.showRfqPage);
router.get('/rfqForm/:token', rfqController.showRfqForm);
router.post('/save-supplier-quotes', upload.none(), rfqController.saveSupplierQuotes);
router.get('/supplier-quote/:pr_id/:supplier_name/:item_id', rfqController.getSupplierQuoteByPrIdAndSupplier);
router.post('/update-supplier-quote', upload.none(), rfqController.updateSupplierQuote);

// Abstract and acceptance routes
router.get('/abstract/:token', rfqController.showAbstractForm);
router.get('/acceptance/:token', rfqController.showAcceptance);
router.get('/get-abstract/:pr_id', rfqController.getAbstractByPrId);
router.post('/save-abstract', upload.none(), rfqController.saveOrUpdateAbstract);
router.post('/save-acceptance', upload.none(), rfqController.saveAcceptance);
router.post('/edit-acceptance', rfqController.editAcceptance);

// Purchase order routes
router.get('/purchase-order/:token', rfqController.showPurchaseOrder);
router.post('/save-purchase-order', upload.none(), rfqController.savePurchaseOrder);
module.exports = router;

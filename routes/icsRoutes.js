const express = require('express');
const router = express.Router();
const ICSController = require('../controllers/icsController');
const { requireAuth } = require('../middlewares/authMiddleware');

// Scanner page
router.get('/scanner', ICSController.showScanner);

// Handle scan submission
router.post('/scan', ICSController.handleScan);

// Get statistics
router.get('/statistics', ICSController.getStatistics);

// Get item details
router.get('/item/:id', ICSController.getItemDetails);

// Show inventory
router.get('/ics', requireAuth, ICSController.showInventory);

// Generate QR code for a single item
router.post('/item/:id/generate-qr', ICSController.generateQRCode);

// Generate all missing QR codes
router.post('/generate-all-qr-codes', ICSController.generateAllMissingQRCodes);

// Get items by classification for DataTables
router.post('/api/items/:classification', ICSController.getItemsByClassification);

// Update item (inline editing)
router.patch('/item/:id', ICSController.updateItem);

// Archive item
router.post('/item/:id/archive', ICSController.archiveItem);

module.exports = router;
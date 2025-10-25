const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { requireAuth } = require('../middlewares/authMiddleware');

// Display inventory page
router.get('/inventory', requireAuth, inventoryController.getAllInventory);

// Display the Add Inventory page
router.get('/add-inventory', requireAuth, inventoryController.renderAddInventoryPage);

// Add a new inventory item
router.post('/inventory/add', requireAuth, inventoryController.addInventory);

// Update an inventory item
router.post('/inventory/edit/:id', requireAuth, inventoryController.updateInventory);

// Delete an inventory item
router.post('/inventory/delete/:id', requireAuth, inventoryController.deleteInventory);

module.exports = router;
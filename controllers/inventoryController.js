const Inventory = require('../models/inventoryModel');
const Department = require('../models/departmentModel');

// Render the Add Inventory page
const renderAddInventoryPage = (req, res) => {
    Department.getAll((err, departments) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error fetching departments' });
        }
        res.render('add-inventory', { departments, error: null }); // Pass departments and error
    });
};

// Add a new inventory item
const addInventory = (req, res) => {
    const { item_name, quantity, requested_by, received_by, department_id, date_received } = req.body;
    const inventoryData = { item_name, quantity, requested_by, received_by, department_id, date_received };

    Inventory.create(inventoryData, (err, result) => {
        if (err) {
            Department.getAll((err, departments) => {
                if (err) {
                    return res.status(500).json({ success: false, message: 'Error fetching departments' });
                }
                // Render the add-inventory view with an error message
                res.render('add-inventory', { departments, error: 'Error adding inventory item' });
            });
        } else {
            res.redirect('/inventory');
        }
    });
};

// Get all inventory items and departments
const getAllInventory = (req, res) => {
    Inventory.getAll((err, inventory) => {
        if (err) return res.status(500).json({ success: false, message: 'Error fetching inventory' });

        Department.getAll((err, departments) => {  // Fetch departments
            if (err) return res.status(500).json({ success: false, message: 'Error fetching departments' });

            res.render('inventory', { inventory, departments, error: null });
        });
    });
};

// Update an inventory item
const updateInventory = (req, res) => {
    const id = req.params.id;
    const { item_name, quantity, requested_by, received_by, department_id, date_received } = req.body;
    const inventoryData = { item_name, quantity, requested_by, received_by, department_id, date_received };

    Inventory.update(id, inventoryData, (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Error updating inventory item' });
        res.redirect('/inventory');
    });
};

// Delete an inventory item
const deleteInventory = (req, res) => {
    const id = req.params.id;

    Inventory.delete(id, (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Error deleting inventory item' });
        res.redirect('/inventory');
    });
};

module.exports = {
    renderAddInventoryPage,
    addInventory,
    getAllInventory,
    updateInventory,
    deleteInventory
};
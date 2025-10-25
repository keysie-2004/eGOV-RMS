const db = require('../config/db');

const Inventory = {
    // Get all inventory items
    getAll: (callback) => {
        const sql = `
            SELECT inventory.*, departments.department_name 
            FROM inventory 
            INNER JOIN departments ON inventory.department_id = departments.department_id
        `;
        db.query(sql, (err, results) => {
            if (err) return callback(err, null);
            callback(null, results);
        });
    },

    // Add a new inventory item
    create: (inventoryData, callback) => {
        const sql = `
            INSERT INTO inventory 
            (item_name, quantity, requested_by, received_by, department_id, date_received) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const values = [
            inventoryData.item_name,
            inventoryData.quantity,
            inventoryData.requested_by,
            inventoryData.received_by,
            inventoryData.department_id,
            inventoryData.date_received
        ];
        db.query(sql, values, (err, result) => {
            if (err) return callback(err, null);
            callback(null, result);
        });
    },

    // Update an inventory item
    update: (id, inventoryData, callback) => {
        const sql = `
            UPDATE inventory 
            SET item_name = ?, quantity = ?, requested_by = ?, received_by = ?, department_id = ?, date_received = ? 
            WHERE inventory_id = ?
        `;
        const values = [
            inventoryData.item_name,
            inventoryData.quantity,
            inventoryData.requested_by,
            inventoryData.received_by,
            inventoryData.department_id,
            inventoryData.date_received,
            id
        ];
        db.query(sql, values, (err, result) => {
            if (err) return callback(err, null);
            callback(null, result);
        });
    },

    // Delete an inventory item
    delete: (id, callback) => {
        const sql = `DELETE FROM inventory WHERE inventory_id = ?`;
        db.query(sql, [id], (err, result) => {
            if (err) return callback(err, null);
            callback(null, result);
        });
    }
};

module.exports = Inventory;
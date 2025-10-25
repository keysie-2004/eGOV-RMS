const db = require('../config/db');

const Condition = {
    // Get all conditions (excluding archived ones)
    getAll: (callback) => {
        const sql = `SELECT * FROM conditions WHERE is_archived = 0`;
        db.query(sql, (err, results) => {
            if (err) return callback(err, null);
            callback(null, results);
        });
    },

    // Add a new condition
    create: (conditionData, callback) => {
        const sql = `INSERT INTO conditions (condition_code, condition_desc) VALUES (?, ?)`;
        const values = [conditionData.condition_code, conditionData.condition_desc];
        db.query(sql, values, (err, result) => {
            if (err) return callback(err, null);
            callback(null, result);
        });
    },

    // Update a condition
    update: (id, conditionData, callback) => {
        const sql = `UPDATE conditions SET condition_code = ?, condition_desc = ? WHERE id = ?`;
        const values = [conditionData.condition_code, conditionData.condition_desc, id];
        db.query(sql, values, (err, result) => {
            if (err) return callback(err, null);
            callback(null, result);
        });
    },

    // Archive a condition (soft delete)
    archive: (id, callback) => {
        const sql = `UPDATE conditions SET is_archived = 1 WHERE id = ?`;
        db.query(sql, [id], (err, result) => {
            if (err) return callback(err, null);
            callback(null, result);
        });
    }
};

module.exports = Condition;
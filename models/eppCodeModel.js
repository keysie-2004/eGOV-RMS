const db = require('../config/db');

const EppCode = {
    // Get all EPP codes (excluding archived ones)
    getAll: (callback) => {
        const sql = `SELECT * FROM epp_code WHERE is_archived = 0`;
        db.query(sql, (err, results) => {
            if (err) return callback(err, null);
            callback(null, results);
        });
    },

    getEppCodes: (callback) => {
    const sql = `SELECT epp_code, epp_name FROM epp_code WHERE is_archived = 0`;
    db.query(sql, (err, results) => {
      if (err) return callback(err, null);
      callback(null, results);
    });
  },

    // Add a new EPP code
    create: (eppCodeData, callback) => {
        const sql = `INSERT INTO epp_code (epp_type, epp_name, epp_code) VALUES (?, ?, ?)`;
        const values = [eppCodeData.epp_type, eppCodeData.epp_name, eppCodeData.epp_code];
        db.query(sql, values, (err, result) => {
            if (err) return callback(err, null);
            callback(null, result);
        });
    },

    // Update an EPP code
    update: (id, eppCodeData, callback) => {
        const sql = `UPDATE epp_code SET epp_type = ?, epp_name = ?, epp_code = ? WHERE epp_code_id = ?`;
        const values = [eppCodeData.epp_type, eppCodeData.epp_name, eppCodeData.epp_code, id];
        db.query(sql, values, (err, result) => {
            if (err) return callback(err, null);
            callback(null, result);
        });
    },

    // Archive an EPP code (soft delete)
    archive: (id, callback) => {
        const sql = `UPDATE epp_code SET is_archived = 1 WHERE epp_code_id = ?`;
        db.query(sql, [id], (err, result) => {
            if (err) return callback(err, null);
            callback(null, result);
        });
    }
};

module.exports = EppCode;
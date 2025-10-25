const db = require('../config/db');

const acceptanceModel = {
    getLowestPriceItems: (pr_id, callback) => {
        const sql = `
            SELECT 
                pri.item_id, 
                pri.item_description, 
                pri.unit, 
                pri.quantity AS qty, 
                MIN(sq.unit_cost) AS unit_price, 
                MIN(sq.unit_cost) * pri.quantity AS total_price, 
                sq.supplier_name, 
                sq.philgeps_reg_no
            FROM 
                purchase_request_items pri
            JOIN 
                supplier_quotes sq ON pri.item_id = sq.item_id
            WHERE 
                pri.pr_id = ?
            GROUP BY 
                pri.item_id
        `;
        db.query(sql, [pr_id], (err, results) => {
            if (err) return callback(err, null);
            callback(null, results);
        });
    }
};

module.exports = acceptanceModel;
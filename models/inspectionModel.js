const db = require('../config/db');

const inspectionModel = {
  getInspectionItems: (callback) => {
    const sql = `
      SELECT 
        po.pr_id, 
        GROUP_CONCAT(poi.item_description SEPARATOR '; ') AS items,
        GROUP_CONCAT(poi.unit SEPARATOR '; ') AS units,
        GROUP_CONCAT(poi.quantity SEPARATOR '; ') AS quantities,
        MAX(ap.gso_date) AS gso_date
      FROM purchase_order_items poi
      JOIN purchase_orders po ON poi.po_id = po.po_id
      JOIN approvals ap ON po.pr_id = ap.pr_id
      WHERE ap.gso_status = 'Approved' || ap.gso_status = 0
      GROUP BY po.pr_id
    `;

    db.query(sql, (err, results) => {
      if (err) {
        console.error('Database error in getInspectionItems:', err);
        return callback(err, null);
      }
      callback(null, results);
    });
  },

getInspectionData: (pr_id, callback) => {
  const sql = `
    SELECT 
      pr.pr_id, 
      ir.requisitioning_office,
      ir.po_no,
      ir.po_date,
      ir.fund,
      ir.air_no,
      ir.air_date,
      ir.invoice_no,
      ir.invoice_date,
      ir.date_received,
      ir.acceptance_status,
      ir.notes,
      ir.date_inspected,
      po.po_id,
      po.company_name AS supplier,
      poi.stock_property_no,
      poi.item_description,
      poi.unit,
      poi.quantity,
      emp1.employee_name AS inspector_name,
      emp1.position AS inspector_position,
      emp2.employee_name AS receiver_name,
      emp2.position AS receiver_position
    FROM purchase_requests pr
    LEFT JOIN inspection_reports ir ON pr.pr_id = ir.pr_id
    LEFT JOIN purchase_orders po ON pr.pr_id = po.pr_id
    LEFT JOIN purchase_order_items poi ON po.po_id = poi.po_id
    LEFT JOIN employees emp1 ON emp1.position = 'City General Services Officer' AND emp1.status = 1
    LEFT JOIN employees emp2 ON emp2.position = 'Supervising Administrative Officer' AND emp2.status = 1
    WHERE pr.pr_id = ?
  `;
  
  db.query(sql, [pr_id], (err, results) => {
    if (err) {
      console.error('SQL Error:', err);
      return callback(err);
    }
    callback(null, results);
  });
},

  saveInspectionReport: (data, callback) => {
    console.log('Model received data:', data);
    
    const checkSql = `SELECT * FROM inspection_reports WHERE pr_id = ?`;
    
    db.query(checkSql, [data.pr_id], (err, results) => {
      if (err) {
        console.error('Error checking existing report:', err);
        return callback(err);
      }
      
      if (results.length > 0) {
        // Update existing report
        const updateSql = `
          UPDATE inspection_reports SET
            po_no = ?,
            po_date = ?,
            requisitioning_office = ?,
            fund = ?,
            air_no = ?,
            air_date = ?,
            invoice_no = ?,
            invoice_date = ?,
            date_received = ?,
            acceptance_status = ?,
            notes = ?,
            date_inspected = ?
          WHERE pr_id = ?
        `;
        
        const values = [
          data.po_no || null,
          data.po_date || null,
          data.requisitioning_office || null,
          data.fund || null,
          data.air_no || null,
          data.air_date || null,
          data.invoice_no || null,
          data.invoice_date || null,
          data.date_received || null,
          data.acceptance_status || 'complete', // Ensure this is never null
          data.notes || null,
          data.date_inspected || null,
          data.pr_id
        ];
        
        console.log('Update SQL:', updateSql);
        console.log('Update values:', values);
        
        db.query(updateSql, values, (err, result) => {
          if (err) {
            console.error('Update error:', err);
          }
          callback(err, result);
        });
        
      } else {
        // Insert new report
        const insertSql = `
          INSERT INTO inspection_reports (
            pr_id, po_id, po_no, po_date, requisitioning_office, fund,
            air_no, air_date, invoice_no, invoice_date, date_received,
            acceptance_status, notes, date_inspected
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const values = [
          data.pr_id,
          data.po_id || null,
          data.po_no || null,
          data.po_date || null,
          data.requisitioning_office || null,
          data.fund || null,
          data.air_no || null,
          data.air_date || null,
          data.invoice_no || null,
          data.invoice_date || null,
          data.date_received || null,
          data.acceptance_status || 'complete', // Ensure this is never null
          data.notes || null,
          data.date_inspected || null
        ];
        
        console.log('Insert SQL:', insertSql);
        console.log('Insert values:', values);
        
        db.query(insertSql, values, (err, result) => {
          if (err) {
            console.error('Insert error:', err);
            console.error('SQL that failed:', insertSql);
            console.error('Values that caused failure:', values);
          }
          callback(err, result);
        });
      }
    });
  }
};

module.exports = inspectionModel;
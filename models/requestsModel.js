const db = require('../config/db');

const RequestsModel = {
  getAll: (callback) => {
    const sql = `SELECT * FROM purchase_requests`;
    db.query(sql, (err, results) => {
      if (err) return callback(err, null);
      callback(null, results);
    });
  },

  getById: (pr_id, callback) => {
    const sql = `SELECT * FROM purchase_requests WHERE pr_id = ?`;
    db.query(sql, [pr_id], (err, result) => {
      if (err) return callback(err, null);
      callback(null, result[0]);
    });
  },

  getCashAvailability: (callback) => {
    const sql = `SELECT employee_name FROM employees WHERE bac_position = 'City Treasurer' LIMIT 1`;
    db.query(sql, (err, result) => {
      if (err) return callback(err, null);
      callback(null, result[0]?.employee_name || 'Not Assigned');
    });
  },

  getApprovedBy: (callback) => {
    const sql = `SELECT employee_name FROM employees WHERE bac_position = 'City Mayor' LIMIT 1`;
    db.query(sql, (err, result) => {
      if (err) return callback(err, null);
      callback(null, result[0]?.employee_name || 'Not Assigned');
    });
  },

  create: (requestData, callback) => {
    const sql = `
      INSERT INTO purchase_requests 
      (lgu, fund, department, section, fpp, date_requested, total, purpose, requested_by, cash_availability, approved_by, status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
      requestData.lgu,
      requestData.fund,
      requestData.department,
      requestData.section,
      requestData.fpp,
      requestData.date_requested,
      requestData.total,
      requestData.purpose,
      requestData.requested_by,
      requestData.cash_availability,
      requestData.approved_by,
      requestData.status || 'pending'
    ];

    db.query(sql, values, (err, result) => {
      if (err) return callback(err, null);
      callback(null, result);
    });
  },

  getCashAvailability: (searchTerm = '', callback) => {
    const sql = `
      SELECT employee_name 
      FROM employees 
      WHERE bac_position LIKE ?
      LIMIT 1
    `;
    db.query(sql, [`%${searchTerm}%cash availability%`], (err, results) => {
      if (err) return callback(err, null);
      callback(null, results[0]?.employee_name || '');
    });
  },

  getApprovedBy: (searchTerm = '', callback) => {
    const sql = `
      SELECT employee_name, position 
      FROM employees 
      WHERE position LIKE ?
      LIMIT 1
    `;
    db.query(sql, [`%${searchTerm}%approving%`], (err, results) => {
      if (err) return callback(err, null);
      callback(null, results[0]?.employee_name || '');
    });
  },

  createItem: (itemData, callback) => {
    const sql = `
      INSERT INTO purchase_request_items 
      (pr_id, item_no, unit, item_description, quantity, unit_cost, total_cost) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
      itemData.pr_id,
      itemData.item_no,
      itemData.unit,
      itemData.item_description,
      itemData.quantity,
      itemData.unit_cost,
      itemData.total_cost
    ];
    db.query(sql, values, (err, result) => {
      if (err) return callback(err, null);
      callback(null, result);
    });
  },

  update: (pr_id, requestData, callback) => {
    const sql = `
      UPDATE purchase_requests 
      SET lgu = ?, fund = ?, department = ?, section = ?, fpp = ?, date_requested = ?, 
          total = ?, purpose = ?, requested_by = ?, cash_availability = ?, approved_by = ?, status = ? 
      WHERE pr_id = ?
    `;
    const values = [
      requestData.lgu,
      requestData.fund,
      requestData.department,
      requestData.section,
      requestData.fpp,
      requestData.date_requested,
      requestData.total,
      requestData.purpose,
      requestData.requested_by,
      requestData.cash_availability,
      requestData.approved_by,
      requestData.status,
      pr_id
    ];
    db.query(sql, values, (err, result) => {
      if (err) return callback(err, null);
      callback(null, result);
    });
  },

  updateStatus: (pr_id, status, callback) => {
    const sql = `UPDATE purchase_requests SET status = ? WHERE pr_id = ?`;
    db.query(sql, [status, pr_id], (err, result) => {
      if (err) return callback(err, null);
      callback(null, result);
    });
  },

  delete: (pr_id, callback) => {
    const sql = `DELETE FROM purchase_requests WHERE pr_id = ?`;
    db.query(sql, [pr_id], (err, result) => {
      if (err) return callback(err, null);
      callback(null, result);
    });
  },

  getByStatus: (status, callback) => {
    const sql = `SELECT * FROM purchase_requests WHERE status = ?`;
    db.query(sql, [status], (err, results) => {
      if (err) return callback(err, null);
      callback(null, results);
    });
  },

  archive: (pr_id, callback) => {
    const sql = `UPDATE purchase_requests SET is_archived = 1 WHERE pr_id = ?`;
    db.query(sql, [pr_id], (err, result) => {
      if (err) return callback(err, null);
      callback(null, result);
    });
  },

  getByIdWithItems: (pr_id, callback) => {
    const sql = `
      SELECT 
        pr.*, 
        pri.item_no, pri.unit, pri.item_description, pri.quantity, pri.unit_cost, pri.total_cost,
        db.budget_amount, db.remaining_budget, d.department_name
      FROM purchase_requests pr
      LEFT JOIN purchase_request_items pri ON pr.pr_id = pri.pr_id
      LEFT JOIN departments d ON pr.department = d.department_id
      LEFT JOIN department_budgets db ON d.department_id = db.department_id
      WHERE pr.pr_id = ?
    `;
    db.query(sql, [pr_id], (err, results) => {
      if (err) {
        console.error('Error fetching request with items and budget:', err);
        return callback(err, null);
      }

      if (results.length === 0) {
        return callback(null, null);
      }

      const request = {
        ...results[0],
        items: results
          .filter(row => row.item_no)
          .map(row => ({
            item_no: row.item_no,
            unit: row.unit,
            item_description: row.item_description,
            quantity: row.quantity,
            unit_cost: row.unit_cost,
            total_cost: row.total_cost
          })),
        budget: {
          budget_amount: results[0].budget_amount ? parseFloat(results[0].budget_amount) : 0,
          remaining_budget: results[0].remaining_budget ? parseFloat(results[0].remaining_budget) : 0,
          department_name: results[0].department_name || null
        }
      };

      callback(null, request);
    });
  },

  getArchived: (callback) => {
    const sql = `SELECT * FROM purchase_requests WHERE is_archived = 1`;
    db.query(sql, (err, results) => {
      if (err) return callback(err, null);
      callback(null, results);
    });
  },

  softDelete: (pr_id, callback) => {
    const sql = `UPDATE purchase_requests SET is_archived = 1 WHERE pr_id = ?`;
    db.query(sql, [pr_id], (err, result) => {
      if (err) return callback(err, null);
      callback(null, result);
    });
  },

  restore: (pr_id, callback) => {
    const sql = `UPDATE purchase_requests SET is_archived = 0 WHERE pr_id = ?`;
    db.query(sql, [pr_id], (err, result) => {
      if (err) return callback(err, null);
      callback(null, result);
    });
  },

  getBacMembers: (callback) => {
    const sql = `SELECT * FROM employees WHERE bac_position IS NOT NULL ORDER BY bac_position`;
    db.query(sql, (err, results) => {
      if (err) return callback(err, null);
      callback(null, results);
    });
  },

  addSignature: (pr_id, employee_id, signatureData, callback) => {
    const checkBacSql = `SELECT bac_position FROM employees WHERE employee_id = ?`;
    db.query(checkBacSql, [employee_id], (err, result) => {
      if (err) return callback(err);

      if (result[0]?.bac_position) {
        const insertSql = `INSERT INTO request_signatures 
          (pr_id, employee_id, signature, position) 
          VALUES (?, ?, ?, ?)`;
        db.query(insertSql, 
          [pr_id, employee_id, signatureData.signature, result[0].bac_position], 
          callback);
      } else {
        const updateSql = `UPDATE purchase_requests SET 
          ${signatureData.field} = ? 
          WHERE pr_id = ?`;
        db.query(updateSql, [signatureData.signature, pr_id], callback);
      }
    });
  },

  getSignatures: (pr_id, callback) => {
    const sql = `
      SELECT rs.*, e.employee_name, e.bac_position 
      FROM request_signatures rs
      JOIN employees e ON rs.employee_id = e.employee_id
      WHERE rs.pr_id = ?
      ORDER BY e.bac_position`;
    db.query(sql, [pr_id], (err, signatures) => {
      if (err) return callback(err, null);
      callback(null, signatures);
    });
  },

  updateStatusWithQR: (pr_id, status, qr_code, callback) => {
    const sql = `UPDATE purchase_requests SET status = ?, qr_code = ? WHERE pr_id = ?`;
    db.query(sql, [status, qr_code, pr_id], callback);
  },

  getBacId: (pr_id, callback) => {
    const sql = `
      SELECT pr_id, lgu, fund, department, section, fpp, date_requested, total, purpose, 
             requested_by, cash_availability, approved_by, status, qr_code, is_archived,
             requested_by_status, cash_availability_status, approved_by_status,
             bac_1_status, bac_2_status, bac_3_status, 
             bac_vice_status, bac_chairman_status, bac_secretariat_status, 
             comments
      FROM purchase_requests 
      WHERE pr_id = ?
    `;
    db.query(sql, [pr_id], (err, result) => {
      if (err) return callback(err, null);
      callback(null, result[0]);
    });
  },

  updateBacStatus: (pr_id, employee_id, bac_position, approval_status, comment, callback) => {
    const bacStatusFields = {
      'BAC Member 1': 'bac_1_status',
      'BAC Member 2': 'bac_2_status',
      'BAC Member 3': 'bac_3_status',
      'BAC Vice Chairman': 'bac_vice_status',
      'BAC Chairman': 'bac_chairman_status',
      'BAC Secretariat': 'bac_secretariat_status',
      'City Treasurer': 'cash_availability_status',
      'City Mayor': 'approved_by_status',
      'Requested By': 'requested_by_status',
      'BAC Member': 'bac_1_status' 
    };

    const statusField = bacStatusFields[bac_position];
    if (!statusField) {
      return callback(new Error(`Invalid BAC position: ${bac_position}`), null);
    }

    let sql = `UPDATE purchase_requests SET ${statusField} = ?`;
    const values = [approval_status, pr_id];

    if (approval_status === 'declined' && comment) {
      sql += `, comments = JSON_ARRAY_APPEND(IFNULL(comments, '[]'), '$', JSON_OBJECT('employee_id', ?, 'bac_position', ?, 'comment', ?))`;
      values.unshift(comment, bac_position, employee_id);
    }

    sql += ` WHERE pr_id = ?`;

    db.query(sql, values, (err, result) => {
      if (err) return callback(err, null);
      callback(null, result);
    });
  },

  checkAllSignaturesComplete: (pr_id, callback) => {
    const query = `
      SELECT 
        bac_1_status, bac_2_status, bac_3_status, 
        bac_vice_status, bac_chairman_status, bac_secretariat_status,
        cash_availability_status, approved_by_status, requested_by_status
      FROM purchase_requests 
      WHERE pr_id = ?
    `;
    db.query(query, [pr_id], (err, results) => {
      if (err) return callback(err, null);
      if (!results[0]) return callback(new Error('Request not found'), null);

      const statuses = results[0];
      const allApproved = Object.values(statuses).every(
        (status) => status === 'approved' || status === null
      );

      callback(null, { allApproved, statuses });
    });
  },

  updateStatus: (pr_id, status, callback) => {
    const sql = `UPDATE purchase_requests SET status = ? WHERE pr_id = ?`;
    db.query(sql, [status, pr_id], (err, result) => {
      if (err) return callback(err, null);
      callback(null, result);
    });
  },

  createBidding: (biddingData, callback) => {
    const sql = `
      INSERT INTO biddings 
      (bidding_id, pr_id, posted_by, posted_at, deadline, status) 
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const values = [
      biddingData.bidding_id,
      biddingData.pr_id,
      biddingData.posted_by,
      biddingData.posted_at,
      biddingData.deadline,
      biddingData.status
    ];
    db.query(sql, values, (err, result) => {
      if (err) return callback(err, null);
      callback(null, result);
    });
  },

  // In RequestsModel
getDepartmentBudget: (department_id, callback) => {
  const sql = `SELECT remaining_budget FROM department_budgets WHERE department_id = ?`;
  db.query(sql, [department_id], (err, result) => {
    if (err) return callback(err, null);
    callback(null, result[0]);
  });
},

updateDepartmentBudget: (department_id, amount, callback) => {
  const sql = `UPDATE department_budgets SET remaining_budget = remaining_budget - ? WHERE department_id = ?`;
  db.query(sql, [amount, department_id], (err, result) => {
    if (err) return callback(err, null);
    callback(null, result);
  });
},
};

module.exports = RequestsModel;
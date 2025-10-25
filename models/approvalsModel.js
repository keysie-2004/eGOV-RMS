const db = require('../config/db');

const approvalsModel = {
getAllPurchaseOrderApprovals: (department, callback) => {
  let sql = `
    SELECT 
      po.pr_id, 
      pr.department,
      COALESCE(ap.budget_status, 'Pending') AS budget_status, 
      ap.budget_date, 
      ap.budget_approver,
      COALESCE(ap.treasury_status, 'Pending') AS treasury_status, 
      ap.treasury_date,
      ap.treasury_approver,
      COALESCE(ap.mayor_status, 'Pending') AS mayor_status, 
      ap.mayor_date,
      ap.mayor_approver,
      COALESCE(ap.gso_status, 'Pending') AS gso_status, 
      ap.gso_date,
      ap.gso_approver
    FROM purchase_orders po
    LEFT JOIN approvals ap ON po.pr_id = ap.pr_id
    LEFT JOIN purchase_requests pr ON po.pr_id = pr.pr_id
  `;
  
  // Add department filter if provided
  if (department) {
    sql += ` WHERE pr.department = ?`;
    return db.query(sql, [department], callback);
  }
  
  sql += ` GROUP BY po.pr_id`;
  db.query(sql, callback);
},

  updateApproval: (data, callback) => {
    const sql = `
      INSERT INTO approvals (pr_id, budget_status, budget_date, budget_approver, 
                            treasury_status, treasury_date, treasury_approver,
                            mayor_status, mayor_date, mayor_approver,
                            gso_status, gso_date, gso_approver)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        budget_status = COALESCE(VALUES(budget_status), budget_status),
        budget_date = COALESCE(VALUES(budget_date), budget_date),
        budget_approver = COALESCE(VALUES(budget_approver), budget_approver),
        treasury_status = COALESCE(VALUES(treasury_status), treasury_status),
        treasury_date = COALESCE(VALUES(treasury_date), treasury_date),
        treasury_approver = COALESCE(VALUES(treasury_approver), treasury_approver),
        mayor_status = COALESCE(VALUES(mayor_status), mayor_status),
        mayor_date = COALESCE(VALUES(mayor_date), mayor_date),
        mayor_approver = COALESCE(VALUES(mayor_approver), mayor_approver),
        gso_status = COALESCE(VALUES(gso_status), gso_status),
        gso_date = COALESCE(VALUES(gso_date), gso_date),
        gso_approver = COALESCE(VALUES(gso_approver), gso_approver)
    `;
    const values = [
      data.pr_id,
      data.budget_status || null,
      data.budget_date || null,
      data.budget_approver || null,
      data.treasury_status || null,
      data.treasury_date || null,
      data.treasury_approver || null,
      data.mayor_status || null,
      data.mayor_date || null,
      data.mayor_approver || null,
      data.gso_status || null,
      data.gso_date || null,
      data.gso_approver || null,
    ];
    db.query(sql, values, callback);
  },
};

module.exports = approvalsModel;
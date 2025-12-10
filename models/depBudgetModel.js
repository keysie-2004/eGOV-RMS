const db = require('../config/db');

const DepBudgetModel = {
  // Create or update department budget
  setBudget: (department_id, budget_amount, callback) => {
    const sql = `
      INSERT INTO department_budgets (department_id, budget_amount, remaining_budget)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE 
      budget_amount = ?, 
      remaining_budget = remaining_budget + ? - budget_amount
    `;
    const values = [department_id, budget_amount, budget_amount, budget_amount, budget_amount];
    db.query(sql, values, callback);
  },

  // Add to existing budget
  addToBudget: (department_id, additional_amount, new_budget_amount, callback) => {
    const sql = `
      UPDATE department_budgets 
      SET budget_amount = ?, 
          remaining_budget = remaining_budget + ?
      WHERE department_id = ?
    `;
    const values = [new_budget_amount, additional_amount, department_id];
    db.query(sql, values, callback);
  },

  // Get budget by department
getBudgetByDepartment: (department_id, callback) => {
  const sql = `
    SELECT db.department_id, db.budget_amount, db.remaining_budget, db.created_at, db.updated_at, d.department_name 
    FROM department_budgets db
    LEFT JOIN departments d ON db.department_id = d.department_id
    WHERE db.department_id = ?
  `;
  db.query(sql, [department_id], (err, result) => {
    if (err) {
      console.error('Database error in getBudgetByDepartment:', err);
      return callback(err, null);
    }
    console.log('Budget query result for department_id', department_id, ':', result);
    if (!result || result.length === 0) {
      console.log(`No budget found for department_id: ${department_id}`);
      const deptSql = `SELECT department_name FROM departments WHERE department_id = ?`;
      db.query(deptSql, [department_id], (deptErr, deptResult) => {
        if (deptErr) {
          console.error('Error checking department existence:', deptErr);
          return callback(deptErr, null);
        }
        const department_name = deptResult.length > 0 ? deptResult[0].department_name : 'Unknown Department';
        return callback(null, {
          department_id,
          budget_amount: 0,
          remaining_budget: 0,
          department_name
        });
      });
    } else {
      callback(null, result[0]);
    }
  });
},
  // Get all budgets for admin view
  getAllBudgets: (callback) => {
    const sql = `
      SELECT db.*, d.department_name 
      FROM department_budgets db
      JOIN departments d ON db.department_id = d.department_id
    `;
    db.query(sql, callback);
  },

  // Get all departments for dropdown
  getAllDepartments: (callback) => {
    const sql = `
      SELECT department_id, department_name 
      FROM departments
      ORDER BY department_name
    `;
    db.query(sql, (err, results) => {
      if (err) return callback(err, null);
      callback(null, results);
    });
  },

  // Update remaining budget after purchase request
  updateRemainingBudget: (department_id, amount, callback) => {
    const sql = `
      UPDATE department_budgets 
      SET remaining_budget = remaining_budget - ?
      WHERE department_id = ?
    `;
    db.query(sql, [amount, department_id], callback);
  },

getBudgetHistory: (department_id, callback) => {
  const sql = `
    SELECT 
      pr.pr_id, 
      pr.total, 
      pr.purpose, 
      pr.date_requested, 
      pr.status, 
      d.department_name
    FROM purchase_requests pr
    INNER JOIN departments d ON pr.department = d.department_name
    WHERE d.department_id = ? AND pr.status = 'approved'
    ORDER BY pr.date_requested DESC
  `;
  
  db.query(sql, [department_id], callback);
},};

module.exports = DepBudgetModel;
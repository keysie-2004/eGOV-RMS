const db = require('../config/db');

const dashboardModel = {
  // Fetch pending requests
  fetchPendingRequests: (department, callback) => {
    let sql = 'SELECT COUNT(*) AS pending_requests FROM purchase_requests WHERE status = "pending"';
    if (department) {
      sql += ` AND department = ?`;
    }
    console.log('Pending Requests Query:', sql, 'Params:', department || 'none');
    db.query(sql, department ? [department] : [], (err, results) => {
      if (err) {
        console.error('Pending Requests Error:', err);
        callback(err, null);
      } else {
        callback(null, results);
      }
    });
  },

  // Fetch total spent on Property Small (items < 5k)
  fetchPropertySmall: (department, callback) => {
    let sql = `
      SELECT COALESCE(SUM(unit_of_value), 0) AS property_small 
      FROM ics i
      JOIN departments d ON i.dept = d.department_id
      WHERE unit_of_value < 5000
        AND condemned = 0 AND disposed = 0
        AND date_acq IS NOT NULL
    `;
    if (department) {
      sql += ` AND d.department_name = ?`;
    }
    console.log('Property Small Query:', sql, 'Params:', department || 'none');
    db.query(sql, department ? [department] : [], (err, results) => {
      if (err) {
        console.error('Property Small Error:', err);
        callback(err, null);
      } else {
        callback(null, results);
      }
    });
  },

  // Fetch total ICS spent (items < 50k)
  fetchIcsBelow50k: (department, callback) => {
    let sql = `
      SELECT COALESCE(SUM(unit_of_value), 0) AS ics_below_50k 
      FROM ics i
      JOIN departments d ON i.dept = d.department_id
      WHERE unit_of_value < 50000
        AND condemned = 0 AND disposed = 0
        AND date_acq IS NOT NULL
    `;
    if (department) {
      sql += ` AND d.department_name = ?`;
    }
    console.log('ICS Below 50k Query:', sql, 'Params:', department || 'none');
    db.query(sql, department ? [department] : [], (err, results) => {
      if (err) {
        console.error('ICS Below 50k Error:', err);
        callback(err, null);
      } else {
        callback(null, results);
      }
    });
  },

  // Fetch total PAR spent (items >= 50k)
  fetchParAbove50k: (department, callback) => {
    let sql = `
      SELECT COALESCE(SUM(unit_of_value), 0) AS par_above_50k 
      FROM ics i
      JOIN departments d ON i.dept = d.department_id
      WHERE unit_of_value >= 50000
        AND condemned = 0 AND disposed = 0
        AND date_acq IS NOT NULL
    `;
    if (department) {
      sql += ` AND d.department_name = ?`;
    }
    console.log('PAR Above 50k Query:', sql, 'Params:', department || 'none');
    db.query(sql, department ? [department] : [], (err, results) => {
      if (err) {
        console.error('PAR Above 50k Error:', err);
        callback(err, null);
      } else {
        callback(null, results);
      }
    });
  },

  // Fetch total spent
  fetchTotalSpent: (department, callback) => {
    let sql = `
      SELECT COALESCE(SUM(unit_of_value), 0) AS total_spent
      FROM ics i
      JOIN departments d ON i.dept = d.department_id
      WHERE condemned = 0 AND disposed = 0
        AND date_acq IS NOT NULL
    `;
    if (department) {
      sql += ` AND d.department_name = ?`;
    }
    console.log('Total Spent Query:', sql, 'Params:', department || 'none');
    db.query(sql, department ? [department] : [], (err, results) => {
      if (err) {
        console.error('Total Spent Error:', err);
        callback(err, null);
      } else {
        callback(null, results);
      }
    });
  },

  // Fetch total employees
  fetchTotalEmployees: (department, callback) => {
    let sql = `
      SELECT COUNT(*) AS total_employees 
      FROM emp_info 
      WHERE is_archived = 0
    `;
    if (department) {
      sql += ` AND department_id = (SELECT department_id FROM departments WHERE department_name = ?)`;
    }
    console.log('Total Employees Query:', sql, 'Params:', department || 'none');
    db.query(sql, department ? [department] : [], (err, results) => {
      if (err) {
        console.error('Total Employees Error:', err);
        callback(err, null);
      } else {
        callback(null, results);
      }
    });
  },

  // Fetch yearly forecast data
  fetchYearlyForecastData: (department, callback) => {
    let sql = `
      SELECT 
        YEAR(date_acq) as year,
        COALESCE(SUM(unit_of_value), 0) as total_spent
      FROM ics i
      JOIN departments d ON i.dept = d.department_id
      WHERE date_acq >= DATE_SUB(CURDATE(), INTERVAL 5 YEAR)
        AND date_acq IS NOT NULL
        AND condemned = 0 AND disposed = 0
    `;
    if (department) {
      sql += ` AND d.department_name = ?`;
    }
    sql += ` GROUP BY YEAR(date_acq) ORDER BY year`;
    console.log('Yearly Forecast Query:', sql, 'Params:', department || 'none');
    db.query(sql, department ? [department] : [], (err, results) => {
      if (err) {
        console.error('Yearly Forecast Error:', err);
        callback(err, null);
      } else {
        console.log('Yearly Forecast Results:', results);
        callback(null, results);
      }
    });
  },

  // Fetch department distribution data from department_budgets
  fetchDepartmentDistributionData: (department, callback) => {
    let sql = `
      SELECT 
        d.department_name AS department,
        COALESCE(SUM(db.budget_amount), 0) as total_spent
      FROM department_budgets db
      JOIN departments d ON db.department_id = d.department_id
      WHERE db.created_at >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
    `;
    if (department) {
      sql += ` AND d.department_name = ?`;
    }
    sql += ` GROUP BY d.department_name ORDER BY total_spent DESC LIMIT 5`;
    console.log('Department Distribution Query:', sql, 'Params:', department || 'none');
    db.query(sql, department ? [department] : [], (err, results) => {
      if (err) {
        console.error('Department Distribution Error:', err);
        callback(err, null);
      } else {
        console.log('Department Distribution Results:', results);
        callback(null, results);
      }
    });
  },

  // Fetch monthly spending data
  fetchMonthlySpendingData: (department, callback) => {
    let sql = `
      SELECT 
        MONTH(date_acq) as month,
        COALESCE(SUM(CASE WHEN unit_of_value < 50000 THEN unit_of_value ELSE 0 END), 0) as ics_spending,
        COALESCE(SUM(CASE WHEN unit_of_value >= 50000 THEN unit_of_value ELSE 0 END), 0) as par_spending
      FROM ics i
      JOIN departments d ON i.dept = d.department_id
      WHERE YEAR(date_acq) = YEAR(CURDATE())
        AND date_acq IS NOT NULL
        AND condemned = 0 AND disposed = 0
    `;
    if (department) {
      sql += ` AND d.department_name = ?`;
    }
    sql += ` GROUP BY MONTH(date_acq) ORDER BY month`;
    console.log('Monthly Spending Query:', sql, 'Params:', department || 'none');
    db.query(sql, department ? [department] : [], (err, results) => {
      if (err) {
        console.error('Monthly Spending Error:', err);
        callback(err, null);
      } else {
        console.log('Monthly Spending Results:', results);
        callback(null, results);
      }
    });
  }
};

module.exports = dashboardModel;
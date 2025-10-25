const db = require('../config/db');
const bcrypt = require('bcryptjs');

const Employee = {
    create: (employeeData, callback) => {
        const sql = `INSERT INTO employees (email, employee_name, position, password, status, department_id) VALUES (?, ?, ?, ?, ?, ?)`;
        const values = [
            employeeData.email,
            employeeData.employee_name,
            employeeData.position,
            employeeData.password,
            0, // Default status is 0 (not approved)
            employeeData.department_id
        ];

        db.query(sql, values, (err, result) => {
            if (err) return callback(err, null);
            callback(null, result);
        });
    },

update: async (id, employeeData, callback) => {
  try {
    let hashedPassword = employeeData.password;
    if (employeeData.password) {
      hashedPassword = await bcrypt.hash(employeeData.password, 10);
    }
    const sql = `UPDATE employees SET employee_name = ?, position = ?, email = ?, user_type = ?, password = ? WHERE employee_id = ?`;
    const values = [
      employeeData.employee_name,
      employeeData.position || '', 
      employeeData.email,
      employeeData.user_type,
      hashedPassword,
      id,
    ];
    db.query(sql, values, (err, result) => {
      if (err) return callback(err, null);
      callback(null, result);
    });
  } catch (err) {
    callback(err, null);
  }
},

    getById: (id, callback) => {
        const sql = `
            SELECT e.*, d.department_name 
            FROM employees e
            LEFT JOIN departments d ON e.department_id = d.department_id
            WHERE e.employee_id = ?
        `;
        db.query(sql, [id], (err, results) => {
            if (err) return callback(err, null);
            if (results.length === 0) return callback(null, null);
            callback(null, results[0]);
        });
    },

    getAll: (callback) => {
        const sql = `SELECT * FROM employees WHERE status = 1 || status = 0 ORDER BY employee_name`;
        db.query(sql, (err, results) => {
            if (err) return callback(err, null);
            callback(null, results);
        });
    },

getAllActive: (callback) => {
    const sql = `
        SELECT e.*, d.department_name 
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.department_id
        WHERE e.status = 1
        ORDER BY e.employee_name
    `;
    db.query(sql, (err, results) => {
        if (err) return callback(err, null);
        callback(null, results);
    });
},

    getUserByEmail: (email, callback) => {
        const sql = `
            SELECT e.*, d.department_name 
            FROM employees e
            LEFT JOIN departments d ON e.department_id = d.department_id
            WHERE e.email = ?
        `;
        db.query(sql, [email], (err, results) => {
            if (err) return callback(err, null);
            if (results.length === 0) return callback(null, null);
            callback(null, results[0]);
        });
    },

    updateUser: (employee_id, updatedFields, callback) => {
        const { user_type, status } = updatedFields;
        const sql = 'UPDATE employees SET user_type = ?, status = ? WHERE employee_id = ?';
        db.query(sql, [user_type, status, employee_id], (err, result) => {
            if (err) return callback(err, null);
            callback(null, result);
        });
    },

    search: (term, currentUserId, callback) => {
        const sql = `SELECT employee_id, employee_name, position, profile_image 
                    FROM employees 
                    WHERE (employee_name LIKE ? OR position LIKE ? OR employee_id = ?)
                    AND status = 1
                    AND employee_id != ?
                    LIMIT 10`;
        const searchTerm = `%${term}%`;
        db.query(sql, [searchTerm, searchTerm, term, currentUserId], (err, results) => {
            if (err) return callback(err);
            callback(null, results);
        });
    },

    searchForAdmin: (query, userType, callback) => {
        let sql = 'SELECT * FROM employees WHERE status = 1';
        const params = [];
        if (query) {
            sql += ' AND (employee_name LIKE ? OR email LIKE ?)';
            params.push(`%${query}%`, `%${query}%`);
        }
        if (userType) {
            sql += ' AND user_type = ?';
            params.push(userType);
        }
        db.query(sql, params, callback);
    },

    approveUser: (id, callback) => {
        const sql = `UPDATE employees SET status = 1 WHERE employee_id = ?`;
        db.query(sql, [id], (err, result) => {
            if (err) return callback(err, null);
            callback(null, result);
        });
    },

    archive: (emp_id, callback) => {
        const sql = `UPDATE employees SET is_archived = 1 WHERE employee_id = ?`;
        db.query(sql, [emp_id], (err, result) => {
            if (err) return callback(err, null);
            callback(null, result);
        });
    },

    unarchive: (emp_id, callback) => {
        const sql = `UPDATE employees SET is_archived = 0 WHERE employee_id = ?`;
        db.query(sql, [emp_id], (err, result) => {
            if (err) return callback(err, null);
            callback(null, result);
        });
    },

    getArchived: (callback) => {
        const sql = `SELECT * FROM emp_info WHERE is_archived = 1`;
        db.query(sql, (err, results) => {
            if (err) return callback(err, null);
            callback(null, results);
        });
    },

    getProfile: (employee_id, callback) => {
        const sql = `
            SELECT 
                e.*, 
                d.department_name,
                CONCAT(u.employee_name, ' (', u.position, ')') as updated_by_name
            FROM employees e
            LEFT JOIN departments d ON e.department_id = d.department_id
            LEFT JOIN employees u ON e.updated_by = u.employee_id
            WHERE e.employee_id = ?
        `;
        db.query(sql, [employee_id], (err, results) => {
            if (err) return callback(err, null);
            callback(null, results[0] || null);
        });
    },

    updateProfile: (employee_id, profileData, callback) => {
        const { signature, bac_position, profile_image, updated_by } = profileData;
        const sql = `UPDATE employees 
                     SET signature = ?, bac_position = ?, profile_image = ?, updated_at = NOW(), updated_by = ?
                     WHERE employee_id = ?`;
        db.query(sql, [signature, bac_position, profile_image, updated_by, employee_id], (err, result) => {
            if (err) return callback(err, null);
            callback(null, result);
        });
    },

    getProfileImage: (employee_id, callback) => {
        const sql = `SELECT profile_image FROM employees WHERE employee_id = ?`;
        db.query(sql, [employee_id], (err, results) => {
            if (err) return callback(err, null);
            if (results.length === 0) return callback(null, null);
            callback(null, results[0].profile_image);
        });
    },

    getBacMembers: (callback) => {
        const sql = `
            SELECT 
                e.*, 
                d.department_name 
            FROM employees e
            LEFT JOIN departments d ON e.department_id = d.department_id
            WHERE e.user_type = 'bac'
            ORDER BY e.employee_name
        `;
        db.query(sql, (err, results) => {
            if (err) return callback(err, null);
            callback(null, results);
        });
    },

    getNonBacEmployees: (callback) => {
        const sql = `
            SELECT 
                e.*, 
                d.department_name 
            FROM employees e
            LEFT JOIN departments d ON e.department_id = d.department_id
            WHERE e.user_type != 'bac' OR e.user_type IS NULL
            ORDER BY e.employee_name
        `;
        db.query(sql, (err, results) => {
            if (err) return callback(err, null);
            callback(null, results);
        });
    },

    updateBacMember: (employee_id, updateData, callback) => {
        const sql = `
            UPDATE employees 
            SET 
                user_type = ?,
                bac_position = ?,
                status = ?,
                updated_at = NOW(),
                updated_by = ?
            WHERE employee_id = ?
        `;
        db.query(sql, [
            'bac',
            updateData.bac_position,
            updateData.status,
            updateData.updated_by,
            employee_id
        ], (err, result) => {
            if (err) return callback(err, null);
            callback(null, result);
        });
    }
};

module.exports = Employee;
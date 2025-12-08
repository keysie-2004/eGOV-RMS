const db = require("../config/db");

const Department = {

    // Create a department
    create: (departmentData, callback) => {
        const sql = `
            INSERT INTO departments 
            (department_code, department_name, department_head, position, contact_person, contact_number) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const values = [
            departmentData.department_code,
            departmentData.department_name,
            departmentData.department_head,
            departmentData.position,
            departmentData.contact_person,
            departmentData.contact_number
        ];

        db.query(sql, values, (err, result) => {
            if (err) {
                console.error('Department create error:', err);
                return callback(err);
            }
            callback(null, result);
        });
    },

    // Update a department
    update: (id, departmentData, callback) => {
        const sql = `
            UPDATE departments SET 
            department_code = ?, 
            department_name = ?, 
            department_head = ?, 
            position = ?, 
            contact_person = ?, 
            contact_number = ?
            WHERE department_id = ?
        `;
        const values = [
            departmentData.department_code,
            departmentData.department_name,
            departmentData.department_head,
            departmentData.position,
            departmentData.contact_person,
            departmentData.contact_number,
            id
        ];

        db.query(sql, values, (err, result) => {
            if (err) {
                console.error('Department update error:', err);
                return callback(err);
            }
            callback(null, result);
        });
    },

    // Get all departments
    getAll: (callback) => {
        const sql = `SELECT * FROM departments ORDER BY department_name`;
        db.query(sql, (err, results) => {
            if (err) {
                console.error('Department getAll error:', err);
                return callback(err);
            }
            callback(null, results);
        });
    },

    // Get department by ID
    getById: (id, callback) => {
        const sql = `SELECT * FROM departments WHERE department_id = ?`;
        db.query(sql, [id], (err, result) => {
            if (err) {
                console.error('Department getById error:', err);
                return callback(err);
            }
            callback(null, result[0]);
        });
    },

    // Delete a department
    delete: (id, callback) => {
        const sql = `DELETE FROM departments WHERE department_id = ?`;
        db.query(sql, [id], (err, result) => {
            if (err) {
                console.error('Department delete error:', err);
                return callback(err);
            }
            callback(null, result);
        });
    },

    // Autocomplete for department codes
    searchByCode: (query, callback) => {
        const sql = `
            SELECT department_code 
            FROM departments 
            WHERE department_code LIKE ?
            LIMIT 10
        `;
        db.query(sql, [`%${query}%`], (err, results) => {
            if (err) {
                console.error('Department search error:', err);
                return callback(err);
            }
            callback(null, results.map(d => d.department_code));
        });
    },

    // 🔥 UPDATED: Department Spending Summary using NEW `ics` table
    getDepartmentSpending: (departmentName, callback) => {
        const sql = `
            SELECT 
                MONTH(date_acq) AS month,
                SUM(unit_of_value) AS total
            FROM ics
            WHERE dept = ?
            GROUP BY MONTH(date_acq)
        `;

        db.query(sql, [departmentName], (err, results) => {
            if (err) {
                console.error('Department spending error:', err);
                return callback(err);
            }
            callback(null, results);
        });
    },

    // 🔥 UPDATED: ICS Data Verification using NEW `ics` fields
    verifyICSData: (callback) => {
        const sql = `
            SELECT 
                COUNT(*) AS total,
                SUM(CASE WHEN dept IS NULL OR dept = '' THEN 1 ELSE 0 END) AS missing_dept,
                SUM(CASE WHEN date_acq IS NULL THEN 1 ELSE 0 END) AS missing_date,
                SUM(CASE WHEN unit_of_value IS NULL THEN 1 ELSE 0 END) AS missing_amount
            FROM ics
        `;

        db.query(sql, (err, results) => {
            if (err) {
                console.error('ICS verification error:', err);
                return callback(err);
            }
            callback(null, results[0]);
        });
    }

};


module.exports = Department;

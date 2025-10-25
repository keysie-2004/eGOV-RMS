const db = require("../config/db");

const Department = {
    create: (departmentData, callback) => {
        const sql = `INSERT INTO departments 
                    (department_code, department_name, department_head, position, contact_person, contact_number) 
                    VALUES (?, ?, ?, ?, ?, ?)`;
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

    update: (id, departmentData, callback) => {
        const sql = `UPDATE departments SET 
                    department_code = ?, 
                    department_name = ?, 
                    department_head = ?, 
                    position = ?, 
                    contact_person = ?, 
                    contact_number = ? 
                    WHERE department_id = ?`;
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

    searchByCode: (query, callback) => {
        const sql = `SELECT department_code FROM departments 
                    WHERE department_code LIKE ? 
                    LIMIT 10`;
        db.query(sql, [`%${query}%`], (err, results) => {
            if (err) {
                console.error('Department search error:', err);
                return callback(err);
            }
            callback(null, results.map(d => d.department_code));
        });
    },

    getDepartmentSpending: (departmentName, callback) => {
        const sql = `SELECT 
                    MONTH(date_encode) as month, 
                    SUM(unit_amount) as total 
                    FROM ics_2024 
                    WHERE department = ? 
                    GROUP BY MONTH(date_encode)`;
        db.query(sql, [departmentName], (err, results) => {
            if (err) {
                console.error('Department spending error:', err);
                return callback(err);
            }
            callback(null, results);
        });
    },

    // New method to verify ICS data
    verifyICSData: (callback) => {
        const sql = `SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN department IS NULL OR department = '' THEN 1 ELSE 0 END) as missing_dept,
                    SUM(CASE WHEN date_encode IS NULL THEN 1 ELSE 0 END) as missing_date,
                    SUM(CASE WHEN unit_amount IS NULL THEN 1 ELSE 0 END) as missing_amount
                    FROM ics_2024`;
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
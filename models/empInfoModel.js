const db = require('../config/db');

const EmpInfo = {
    create: (employeeData, callback) => {
        const sql = `
            INSERT INTO emp_info 
            (first_name, middle_name, midname, last_name, department_id, position, b_date, tin_no) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            employeeData.first_name,
            employeeData.middle_name,
            employeeData.midname,
            employeeData.last_name,
            employeeData.department_id,
            employeeData.position,
            employeeData.b_date,
            employeeData.tin_no
        ];
        db.query(sql, values, (err, result) => {
            if (err) return callback(err, null);
            callback(null, result);
        });
    },

    getAll: (callback) => {
        const sql = `
            SELECT 
                e.emp_id,
                e.first_zzname,
                e.middle_name,
                e.midname,
                e.last_name,
                e.position,
                e.tin_no,
                e.b_date,
                d.department_id,
                d.department_name 
            FROM emp_info e 
            LEFT JOIN departments d ON e.department_id = d.department_id 
            WHERE e.is_archived = 0
        `;
        db.query(sql, (err, results) => {
            if (err) return callback(err, null);
            callback(null, results);
        });
    },

    getArchived: (callback) => {
        const sql = `
            SELECT 
                e.emp_id,
                e.first_name,
                e.middle_name,
                e.midname,
                e.last_name,
                e.position,
                e.tin_no,
                e.b_date,
                e.department_id,
                d.department_name 
            FROM emp_info e 
            LEFT JOIN departments d ON e.department_id = d.department_id 
            WHERE e.is_archived = 1
        `;
        db.query(sql, (err, results) => {
            if (err) return callback(err, null);            
            callback(null, results);
        });
    },
    archive: (emp_id, callback) => {
        const sql = `UPDATE emp_info SET is_archived = 1 WHERE emp_id = ?`;
        db.query(sql, [emp_id], (err, result) => {
            if (err) return callback(err, null);
            callback(null, result);
        });
    },

    restore: (emp_id, callback) => {
        const sql = `UPDATE emp_info SET is_archived = 0 WHERE emp_id = ?`;
        db.query(sql, [emp_id], (err, result) => {
            if (err) return callback(err, null);
            callback(null, result);
        });
    },

    getById: (emp_id, callback) => {
        const sql = `
            SELECT e.*, d.department_name 
            FROM emp_info e 
            LEFT JOIN departments d ON e.department_id = d.department_id 
            WHERE e.emp_id = ?
        `;
        db.query(sql, [emp_id], (err, result) => {
            if (err) return callback(err, null);
            callback(null, result[0]);
        });
    },

    update: (emp_id, employeeData, callback) => {
        const sql = `
            UPDATE emp_info 
            SET first_name = ?, middle_name = ?, last_name = ?, department_id = ?, position = ?, b_date = ?, tin_no = ? 
            WHERE emp_id = ?
        `;
        const values = [
            employeeData.first_name,
            employeeData.middle_name,
            employeeData.last_name,
            employeeData.department_id,
            employeeData.position,
            employeeData.b_date,
            employeeData.tin_no,
            emp_id
        ];
        db.query(sql, values, (err, result) => {
            if (err) return callback(err, null);
            callback(null, result);
        });
    },

    getEmployeesWithDepartments: (callback) => {
        // Get all employees with their department names in a single query
        const sql = `
            SELECT 
                e.emp_id, 
                e.first_name, 
                e.middle_name,
                e.midname,
                e.last_name,
                e.position,
                e.b_date,
                e.tin_no,
                d.department_id,
                d.department_name
            FROM emp_info e
            LEFT JOIN departments d ON e.department_id = d.department_id
            WHERE e.is_archived = 0
        `;
        
        db.query(sql, (err, employees) => {
            if (err) return callback(err);
            
            // Get all departments separately for the dropdown
            db.query('SELECT department_id, department_name FROM departments', (deptErr, departments) => {
                if (deptErr) return callback(deptErr);
                
                callback(null, {
                    employees: employees,
                    departments: departments
                });
            });
        });
    },

    getEmployeesWithDepartmentsAsync: async () => {
        try {
            // 1. Get all active employees
            const [employees] = await db.promise().query(`
                SELECT 
                    emp_id, 
                    first_name, 
                    last_name,
                    department_id AS department_name, 
                    position
                FROM emp_info 
                WHERE is_archived = 0
            `);
            
            // 2. Get all departments
            const [departments] = await db.promise().query(`
                SELECT department_id, department_name 
                FROM departments
            `);
            
            // 3. Combine the data
            const departmentMap = {};
            departments.forEach(dept => {
                departmentMap[dept.department_name] = dept;
            });
            
            const enhancedEmployees = employees.map(emp => ({
                ...emp,
                department_info: departmentMap[emp.department_name] || null
            }));
            
            return {
                employees: enhancedEmployees,
                departments: departments
            };
            
        } catch (err) {
            throw err;
        }
    },

    /**
     * Alternative: Single query with text-matching JOIN
     */
    getAllWithDepartmentNames: (callback) => {
        const sql = `
            SELECT 
                e.*,
                d.department_id AS actual_department_id,
                e.department_id AS department_name
            FROM emp_info e
            LEFT JOIN departments d ON e.department_id = d.department_name
            WHERE e.is_archived = 0
        `;
        db.query(sql, (err, results) => {
            if (err) return callback(err);
            callback(null, results);
        });
    },

    /**
     * Async/await version of single query approach
     */
    getAllWithDepartmentNamesAsync: async () => {
        try {
            const [results] = await db.promise().query(`
                SELECT 
                    e.*,
                    d.department_id AS actual_department_id,
                    e.department_id AS department_name
                FROM emp_info e
                LEFT JOIN departments d ON e.department_id = d.department_name
                WHERE e.is_archived = 0
            `);
            return results;
        } catch (err) {
            throw err;
        }
    }
};

module.exports = EmpInfo;
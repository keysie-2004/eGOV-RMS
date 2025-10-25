const EmpInfo = require('../models/empInfoModel');
const Department = require('../models/departmentModel');

// Render the Add Employee page
const renderAddEmployeePage = (req, res) => {
    Department.getAll((err, departments) => {
        if (err) {
            return res.redirect('/add-employee?error=' + encodeURIComponent('Error fetching departments'));
        }
        res.render('add-employee', { 
            user: req.user,
            departments, 
            error: req.query.error,
            success: req.query.success
        });
    });
};

// Add a new employee
const addEmployee = (req, res) => {
    const { first_name, middle_name, last_name, department_id, position, b_date, tin_no } = req.body;

    // Generate midname (middle initial with dot)
    const midname = middle_name ? `${middle_name.charAt(0)}.` : '';

    const employeeData = { first_name, middle_name, midname, last_name, department_id, position, b_date, tin_no };

    EmpInfo.create(employeeData, (err, result) => {
        if (err) {
            return res.redirect('/add-employee?error=' + encodeURIComponent('Error adding employee'));
        }
        Department.getAll((err, departments) => {
            if (err) {
                return res.redirect('/add-employee?success=' + encodeURIComponent('Employee added successfully') + '&error=' + encodeURIComponent('Error fetching departments'));
            }
            res.redirect('/add-employee?success=' + encodeURIComponent('Employee added successfully'));
        });
    });
};

// Get all active employees
const getAllEmployees = (req, res) => {
    EmpInfo.getEmployeesWithDepartments((err, data) => {
        if (err) {
            console.error("Error:", err);
            return res.redirect('/employees?error=' + encodeURIComponent('Error fetching employee data'));
        }
        
        res.render('employees', { user: req.user,
            employees: data.employees,
            departments: data.departments,
            error: req.query.error,
            success: req.query.success
        });
    });
};

// Get all archived employees
const getArchivedEmp = (req, res) => {
    EmpInfo.getArchivedEmp((err, employees) => {
        if (err) {
            console.error("Error:", err);
            return res.status(500).render('archived-employees', { 
                user: req.user,
                employees: [],
                error: 'Error fetching archived employee data'
            });
        }
        
        res.render('archived-employees', { 
            user: req.user,
            employees: employees,
            error: req.query.error,
            success: req.query.success
        });
    });
};

// Archive an employee
const archiveEmployee = (req, res) => {
    const emp_id = req.params.emp_id;

    EmpInfo.archive(emp_id, (err, result) => {
        if (err) {
            return res.redirect('/employees?error=' + encodeURIComponent('Error archiving employee'));
        }
        res.redirect('/employees?success=' + encodeURIComponent('Employee archived successfully'));
    });
};

// Restore an archived employee
const restoreEmployee = (req, res) => {
    const emp_id = req.params.emp_id;

    EmpInfo.restore(emp_id, (err, result) => {
        if (err) {
            return res.redirect('/archived-employees?error=' + encodeURIComponent('Error restoring employee'));
        }
        res.redirect('/archived-employees?success=' + encodeURIComponent('Employee restored successfully'));
    });
};

// Get employee by ID (AJAX endpoint - keep as JSON response)
const getEmployeeById = (req, res) => {
    const emp_id = req.params.emp_id;
    EmpInfo.getById(emp_id, (err, employee) => {
        if (err) {
            console.error('Error fetching employee:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'Error fetching employee data',
                error: err.message 
            });
        }
        if (!employee) {
            return res.status(404).json({ 
                success: false, 
                message: 'Employee not found' 
            });
        }
        res.json({ 
            success: true,
            data: employee 
        });
    });
};

// Update employee (AJAX endpoint - keep as JSON response)
const updateEmployee = (req, res) => {
    const emp_id = req.params.emp_id;
    const { first_name, middle_name, last_name, department_id, position, b_date, tin_no } = req.body;

    // Validate required fields
    if (!first_name || !last_name || !department_id || !position) {
        return res.status(400).json({ 
            success: false, 
            message: 'Missing required fields' 
        });
    }

    const employeeData = { 
        first_name, 
        middle_name: middle_name || null, 
        last_name, 
        department_id, 
        position, 
        b_date: b_date || null, 
        tin_no: tin_no || null 
    };

    EmpInfo.update(emp_id, employeeData, (err, result) => {
        if (err) {
            console.error('Update error:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'Error updating employee',
                error: err.message 
            });
        }
        res.json({ 
            success: true, 
            message: 'Employee updated successfully',
            data: result 
        });
    });
};

module.exports = {
    renderAddEmployeePage,
    addEmployee,
    getAllEmployees,
    getArchivedEmp,
    archiveEmployee,
    restoreEmployee,
    getEmployeeById,
    updateEmployee
};
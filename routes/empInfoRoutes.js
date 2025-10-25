const express = require('express');
const router = express.Router();
const empInfoController = require('../controllers/empInfoController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

// Display Add Employee page
router.get('/add-employee', requireAuth, requireRole(['superadmin']),empInfoController.renderAddEmployeePage);

// Add a new employee
router.post('/add-employee', requireAuth, empInfoController.addEmployee);

// Display Employee List
router.get('/employees', requireAuth, requireRole(['superadmin']),empInfoController.getAllEmployees);

// Display Archived Employees
router.get('/archived-employees', requireAuth, empInfoController.getArchivedEmp);

// Archive an employee
router.post('/employees/archive/:emp_id', requireAuth, empInfoController.archiveEmployee);

// Restore an archived employee
router.post('/archived-employees/restore/:emp_id', requireAuth, empInfoController.restoreEmployee);

router.get('/employees/:emp_id', requireAuth, empInfoController.getEmployeeById);
// Get employee by ID
router.post('/employees/update/:emp_id', requireAuth, empInfoController.updateEmployee);
module.exports = router;
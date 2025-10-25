const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

// Route to display the add department form
router.get('/add-department', requireAuth, (req, res) => {
    res.render('add-department', {  user: req.user, error: null });
});

// Route to handle the add department form submission
router.post('/add-department', requireAuth, departmentController.createDepartment);

// Route to display the department list
router.get('/departments', requireAuth, requireRole(['superadmin']), departmentController.getDepartments);

// Route to display the edit department form
router.get('/departments/edit/:id', requireAuth, departmentController.getDepartmentById);

// Route to handle the edit department form submission
router.post('/departments/edit/:id', requireAuth, departmentController.updateDepartment);

// Route to handle the delete department request
router.post('/departments/delete', requireAuth, departmentController.deleteDepartment);

module.exports = router;

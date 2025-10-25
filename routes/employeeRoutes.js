const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController'); // Ensure the correct path
const { requireAuth, requireSuperadmin } = require('../middlewares/authMiddleware'); // Correct import

router.get('/department-codes', requireAuth, employeeController.getDepartmentCodes);
router.get('/add-user', requireAuth, employeeController.getAddUser);
router.post('/add-user', requireAuth, employeeController.postAddUser);
router.get('/users', requireAuth, employeeController.getAllUsers); 
router.get('/edit-users', requireAuth, employeeController.getEmployees);
router.post('/employees/edit/:employee_id', requireAuth, employeeController.editUser);
router.get('/search-employees', requireAuth, employeeController.searchEmployees);
router.post('/employees/archive/:emp_id', requireAuth, employeeController.archiveEmployee);
router.post('/archived-employees/restore/:emp_id', requireAuth, employeeController.unarchiveEmployee);
router.get('/archived-employees', requireAuth, employeeController.getArchivedEmployees);

router.get('/profile', requireAuth, (req, res) => {
    res.redirect(`/profile/${req.user.id}`);
});
router.post('/profile/upload-picture', requireAuth, (req, res) => {
    employeeController.uploadProfilePicture(req, res);
});
router.get('/profile/:employee_id', requireAuth, employeeController.getProfile);
router.post('/profile/:employee_id', requireAuth, employeeController.updateProfile);

router.get('/bac-members', requireAuth, employeeController.getBacMembers);
router.post('/bac-members/update/:employee_id', requireAuth, employeeController.updateBacMember);
router.post('/bac-members/remove/:employee_id', requireAuth, employeeController.removeBacMember);
router.post('/bac-members/add', requireAuth, employeeController.addBacMember);

// In your employee routes file
router.get('/login-history/:email', requireAuth, async (req, res) => {
    try {
        const { email } = req.params;
        const { sync } = req.query;
        
        if (sync === 'true') {
            await syncLoginEvents(email);
        }
        
        const db = await dbPromise;
        const [history] = await db.query(
            'SELECT * FROM blockchain_login_events WHERE email = ? ORDER BY event_timestamp DESC',
            [email]
        );
        
        res.json({ success: true, history });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/reset-history/:email', requireAuth, async (req, res) => {
    try {
        const { email } = req.params;
        const { sync } = req.query;
        
        if (sync === 'true') {
            await syncResetEvents(email);
        }
        
        const db = await dbPromise;
        const [history] = await db.query(
            'SELECT * FROM blockchain_reset_events WHERE email = ? ORDER BY event_timestamp DESC',
            [email]
        );
        
        res.json({ success: true, history });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
module.exports = router;

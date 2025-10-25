const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const dashboardController = require('../controllers/dashboardController');
const { requireAuth } = require('../middlewares/authMiddleware');

// Render the login form
router.get('/login', (req, res) => {
    res.render('login', { error: null, success: null });
});

router.get('/signup', authController.getRegister); // Use authController.getRegister for signup page
router.post('/signup', authController.register);
router.post('/login', authController.login);
router.get('/logout', authController.logout);

// Protected route

router.get('/', requireAuth, dashboardController.getDashboardData);
// Forgot Password route
router.get('/forgot-password', (req, res) => {
    res.render('forgot-password');
});

router.post('/forgot-password', authController.forgotPassword);

// Reset Password Routes
router.get('/reset-password', authController.showResetForm);
router.get('/reset-password', authController.showResetForm);
router.post('/reset-password', authController.handleResetPassword);

module.exports = router;
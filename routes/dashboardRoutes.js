const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { requireAuth } = require('../middlewares/authMiddleware');

// Route to render the dashboard
router.get('/', requireAuth, dashboardController.getDashboardData);
router.get('/dashboard', requireAuth, dashboardController.getDashboardData);

module.exports = router;
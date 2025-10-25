// routes/predictiveRoutes.js
const express = require('express');
const router = express.Router();
const predictiveController = require('../controllers/predictiveController');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

// Update this route to match your view path
router.get('/department', requireAuth, predictiveController.getDepartmentPredictions);
router.post('/predictions', predictiveController.getPredictions);
module.exports = router;
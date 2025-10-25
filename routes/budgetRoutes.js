// routes/budgetRoutes.js
const express = require('express');
const router = express.Router();
const budgetController = require('../controllers/budgetController');
const { requireAuth } = require('../middlewares/authMiddleware');

router.get('/predict', budgetController.predictDepartmentBudgets);

module.exports = router;
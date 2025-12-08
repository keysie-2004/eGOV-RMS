// routes/predictive.js
const express = require('express');
const router = express.Router();
const predictiveController = require('../controllers/predictiveController');
const { requireAuth } = require('../middlewares/authMiddleware');

// Protected routes
router.get('/department', requireAuth, predictiveController.getDepartmentPredictions);
router.post('/predictions', requireAuth, predictiveController.getPredictions);
router.get('/department/details', requireAuth, predictiveController.getDepartmentDetails);

// AI Routes
router.get('/ai-recommendations', requireAuth, predictiveController.getAIRecommendations);
router.get('/prediction-explanation', requireAuth, predictiveController.getPredictionExplanation);
router.get('/detailed-analysis', requireAuth, predictiveController.getDetailedAnalysis);

module.exports = router;

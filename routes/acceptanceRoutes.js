const express = require('express');
const router = express.Router();
const acceptanceController = require('../controllers/acceptanceController');
const { requireAuth } = require('../middlewares/authMiddleware');

router.get('/acceptance/:id', acceptanceController.showAcceptance);

module.exports = router;
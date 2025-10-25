// In homepageRoutes.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/authMiddleware');

// Handle both root path and /homepage
router.get(['/', '/homepage'], (req, res) => {
    res.render('homepage', { 
        title: 'Government Services Portal',
        user: req.session.user || null 
    });
});

module.exports = router;
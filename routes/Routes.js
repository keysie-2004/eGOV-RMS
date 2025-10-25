const express = require('express');
const router = express.Router();
const path = require('path');
const Controller = require('../controllers/Controller');
const { requireAuth } = require('../middlewares/authMiddleware');

// Accounting Routes
router.get('/accounting', Controller.viewAccounting);

// User Management Routes
router.get('/add_user', Controller.viewAddUser);
router.get('/edit_user', Controller.viewEditUser);
router.get('/user_list', Controller.viewUserList);

// ICS Routes
router.get('/ics_2023', Controller.viewICS2023);
router.get('/ics_2024', requireAuth, Controller.viewICS2024);

// PAR Routes
router.get('/par_propertyvehicles', Controller.viewPARVehicles);
router.get('/par', Controller.viewParHome);

// Arrivals Route
router.get('/arrivals', Controller.viewArrivals);

// Analytics Route
router.get('/analytics', Controller.viewAnalytics);


module.exports = router;
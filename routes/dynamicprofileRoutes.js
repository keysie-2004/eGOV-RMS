const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth } = require('../middlewares/authMiddleware');

router.get('/profile', requireAuth, async (req, res) => {
  try {
    console.log('Fetching profile for:', req.user.id);
    
    // Get full profile
    const [results] = await db.query(`
      SELECT 
        employee_id,
        employee_name,
        email,
        user_type,
        department_id
      FROM employees 
      WHERE employee_id = ?
    `, [req.user.id]);

    // If user found in database
    if (results.length > 0) {
      const user = results[0];
      
      // Validate required fields exist
      if (!user.employee_name) {
        throw new Error('Employee name not found in database record');
      }
      
      // Generate avatar URL
      const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.employee_name)}&background=random&color=fff&size=128`;
      
      return res.json({
        success: true,
        id: user.employee_id,
        employee_name: user.employee_name,
        email: user.email,
        user_type: user.user_type,
        department_id: user.department_id,
        avatarUrl
      });
    }
    
    // Fallback to token data if user not in database
    res.json({
      success: true,
      id: req.user.id,
      employee_name: req.user.employee_name || 'User',
      user_type: req.user.user_type || 'Employee',
      department_id: req.user.department_id || null,
      email: req.user.email || null,
      avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(req.user.employee_name || 'User')}&background=random&color=fff&size=128`,
      fromToken: true
    });

  } catch (error) {
    console.error('Profile route error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load profile',
      error: error.message
    });
  }
});

module.exports = router;
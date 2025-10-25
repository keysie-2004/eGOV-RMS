const jwt = require('jsonwebtoken');
const dbPromise = require('../config/db'); // Renamed to dbPromise to indicate it's a Promise
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Employee = require('../models/employeeModel');
const Department = require('../models/departmentModel');
const { passwordValidator } = require('../utils/validation');

// Email transporter configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Forgot Password Handler
const forgotPassword = async (req, res) => {
    try {
        const db = await dbPromise;
        const { email } = req.body;

        const [rows] = await db.query('SELECT * FROM employees WHERE email = ?', [email]);
        const user = rows[0];

        if (!user) {
            return res.render('forgot-password', {
                message: { type: 'error', text: 'No account with that email exists.' },
            });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        await db.query(
            'INSERT INTO password_resets (employee_id, email, token, expires_at) VALUES (?, ?, ?, ?)',
            [user.employee_id, user.email, token, expiresAt]
        );

        // Record password reset request on blockchain
        try {
            await recordResetRequest(email);
        } catch (blockchainError) {
            console.error('Blockchain reset request recording failed:', blockchainError);
            // Continue with reset process even if blockchain fails
        }

        const resetLink = `${req.protocol}://${req.get('host')}/reset-password?token=${token}`;

        await transporter.sendMail({
            from: `"System" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: 'Password Reset',
            html: `<p>You requested a password reset. Click the link below to set a new password:</p>
                 <a href="${resetLink}">${resetLink}</a>
                 <p>This link will expire in 15 minutes.</p>`,
        });

        res.render('forgot-password', {
            message: { type: 'success', text: 'Password reset link sent to your email.' },
        });
    } catch (error) {
        console.error('Forgot Password Error:', error);
        res.render('forgot-password', {
            message: { type: 'error', text: 'An error occurred. Please try again.' },
        });
    }
};

// Show Reset Form
const showResetForm = async (req, res) => {
  try {
    const db = await dbPromise; // Await the connection
    const { token } = req.query;

    const [rows] = await db.query(
      'SELECT * FROM password_resets WHERE token = ? AND used = FALSE AND expires_at > NOW()',
      [token]
    );
    const resetRecord = rows[0]; // Extract the first row

    if (!resetRecord) {
      return res.render('reset-password', {
        token,
        message: { type: 'error', text: 'Invalid or expired token. Please request a new reset link.' },
      });
    }

    res.render('reset-password', {
      token,
      message: { type: 'success', text: 'Password updated successfully!' },
    });
  } catch (error) {
    console.error('Show Reset Form Error:', error);
    res.render('reset-password', {
      token: req.query.token,
      message: { type: 'error', text: 'An error occurred. Please try again.' },
    });
  }
};

// Reset Password
const resetPassword = async (req, res) => {
  try {
    const db = await dbPromise; // Await the connection
    const { token, password } = req.body;

    const [rows] = await db.query(
      'SELECT * FROM password_resets WHERE token = ? AND used = FALSE AND expires_at > NOW()',
      [token]
    );
    const resetRecord = rows[0]; // Extract the first row

    if (!resetRecord) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await db.query(
      'UPDATE employees SET password = ?, updated_at = NOW() WHERE employee_id = ?',
      [hashedPassword, resetRecord.employee_id]
    );

    await db.query('UPDATE password_resets SET used = TRUE WHERE id = ?', [resetRecord.id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Reset Password Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Handle Reset Password
const handleResetPassword = async (req, res) => {
    const { password, confirmPassword, token } = req.body;

    // Validate password
    const { valid, message } = passwordValidator(password);
    if (!valid) {
        return res.render('reset-password', {
            token,
            message: { type: 'error', text: message },
        });
    }

    if (password !== confirmPassword) {
        return res.render('reset-password', {
            token,
            message: { type: 'error', text: 'Passwords do not match.' },
        });
    }

    try {
        const db = await dbPromise;
        const [rows] = await db.query(
            'SELECT * FROM password_resets WHERE token = ? AND used = FALSE AND expires_at > NOW()',
            [token]
        );
        const resetRecord = rows[0];

        if (!resetRecord) {
            return res.render('reset-password', {
                token,
                message: { type: 'error', text: 'Invalid or expired token.' },
            });
        }

        if (!resetRecord.employee_id) {
            console.error('Error: employee_id is missing in resetRecord:', resetRecord);
            return res.render('reset-password', {
                token,
                message: { type: 'error', text: 'Error retrieving employee ID for password reset.' },
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        await db.query(
            'UPDATE employees SET password = ?, updated_at = NOW() WHERE employee_id = ?',
            [hashedPassword, resetRecord.employee_id]
        );

        await db.query('UPDATE password_resets SET used = TRUE WHERE id = ?', [resetRecord.id]);

        // Record password reset completion on blockchain
        try {
            await recordResetCompletion(resetRecord.email);
        } catch (blockchainError) {
            console.error('Blockchain reset completion recording failed:', blockchainError);
            // Continue with reset process even if blockchain fails
        }

        return res.render('reset-password', {
            token: '',
            message: { type: 'success', text: 'Password has been successfully reset.' },
        });
    } catch (err) {
        console.error('Handle Reset Password Error:', err);
        return res.render('reset-password', {
            token,
            message: { type: 'error', text: 'An error occurred while resetting your password.' },
        });
    }
};

// Register
const register = async (req, res) => {
  const { email, employee_name, position, password, department_id } = req.body;

  if (!email || !employee_name || !position || !password || !department_id) {
    return res.status(400).json({
      success: false,
      showModal: true,
      message: 'All fields are required',
    });
  }

  try {
    const user = await new Promise((resolve, reject) => {
      Employee.getUserByEmail(email, (err, user) => (err ? reject(err) : resolve(user)));
    });

    if (user) {
      return res.status(400).json({
        success: false,
        showModal: true,
        message: 'Email is already registered',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await new Promise((resolve, reject) => {
      Employee.create(
        {
          email,
          employee_name,
          position,
          password: hashedPassword,
          department_id,
        },
        (err, result) => (err ? reject(err) : resolve(result))
      );
    });

    return res.status(201).json({
      success: true,
      message: 'User registered successfully. Awaiting admin approval.',
    });
  } catch (error) {
    console.error('Registration Error:', error);
    return res.status(500).json({
      success: false,
      showModal: true,
      message: 'Server error during registration: ' + error.message,
    });
  }
};

// Login
const login = async (req, res) => {
    const { email, password } = req.body;
    const maxAttempts = 5;
    let attempts = req.session.attempts || 0;

    if (attempts >= maxAttempts) {
        return res.status(429).json({
            success: false,
            message: 'Too many failed attempts. Please try again later.',
        });
    }

    try {
        const user = await new Promise((resolve, reject) => {
            Employee.getUserByEmail(email, (err, user) => (err ? reject(err) : resolve(user)));
        });

        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        if (user.status === 0) {
            return res.status(401).json({
                success: false,
                message: 'Your account is pending approval. Please contact the administrator.',
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            req.session.attempts = ++attempts;
            return res.status(401).json({
                success: false,
                message: `Invalid password. ${maxAttempts - attempts} attempts remaining.`,
            });
        }

        req.session.attempts = 0;

        // Record successful login on blockchain
        try {
            await recordLogin(email);
        } catch (blockchainError) {
            console.error('Blockchain login recording failed:', blockchainError);
            // Continue with login even if blockchain fails
        }

        const department = await new Promise((resolve, reject) => {
            Department.getById(user.department_id, (err, dept) => {
                err ? reject(err) : resolve(dept)
            });
        });

        const tokenPayload = {
            user_id: user.employee_id,
            employee_name: user.employee_name,
            user_type: user.user_type,
            department_id: user.department_id,
            department_name: department ? department.department_name : null,
        };

        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET || 'secret', { expiresIn: '1h' });

        res.cookie('token', token, { httpOnly: true });

        return res.status(200).json({
            success: true,
            message: 'Login successful',
            user: tokenPayload,
        });
    } catch (error) {
        console.error('Login Error:', error);
        return res.status(500).json({ success: false, message: 'Server error during login' });
    }
};

// Logout
const logout = (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
};

// Signup Page
const getRegister = (req, res) => {
  Department.getAll((err, departments) => {
    if (err) {
      console.error('Get Departments Error:', err);
      return res.render('signup', {
        error: 'Error fetching departments',
        success: null,
        departments: [],
      });
    }
    res.render('signup', { error: null, success: null, departments });
  });
};

module.exports = {
  register,
  login,
  logout,
  getRegister,
  forgotPassword,
  showResetForm,
  resetPassword,
  handleResetPassword,
};
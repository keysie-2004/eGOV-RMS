const jwt = require('jsonwebtoken');

// Main authentication middleware
const requireAuth = (req, res, next) => {
  const publicRoutes = [
  '/',
  '/homepage',        // Allow homepage without authentication
  '/login',
  '/signup',
  '/static',
  '/supplier/login',
  '/supplier/register'
];


  // Allow public routes and static assets
  if (publicRoutes.includes(req.path) || req.path.startsWith('/static')) {
    return next();
  }

  // Check for token in multiple sources
  const token =
    req.cookies?.token ||
    req.headers['authorization']?.split(' ')[1] ||
    req.query?.token;

  if (!token) {
    console.log('Auth failed: No token found');
    req.flash('error', 'You must be logged in to access this page.');
    return res.redirect('/login');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded token:', decoded);

    // Standardize user object
    req.user = {
      id: decoded.user_id || decoded.id,
      employee_id: decoded.user_id || decoded.id, // Add employee_id
      employee_name: decoded.employee_name || decoded.name,
      user_type: decoded.user_type || decoded.role || 'user',
      department_id: decoded.department_id,
      department: decoded.department_name || decoded.department,
      email: decoded.email,
    };

    console.log('Authenticated user:', req.user);
    next();
  } catch (err) {
    console.error('Token verification failed:', err.message);
    req.flash('error', 'Invalid or expired token. Please log in again.');
    return res.redirect('/login');
  }
};

// Generic role checker factory
const createRoleChecker = (allowedRoles, customMessage) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: No user data',
      });
    }

    const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    const isAllowed =
      allowed.includes(req.user.user_type) ||
      ['superadmin', 'admin'].includes(req.user.user_type);

    if (isAllowed) {
      return next();
    }

    console.log(`Access denied for ${req.user.user_type}. Required: ${allowed.join(', ')}`);
    return res.status(403).json({
      success: false,
      message: customMessage || `Access denied. Required role: ${allowed.join(' or ')}`,
    });
  };
};

// Fixed authenticateSupplier middleware
const authenticateSupplier = (req, res, next) => {
    // Extract token from multiple sources (same as requireAuth)
    const token = 
        req.cookies?.token || 
        req.headers['authorization']?.split(' ')[1] ||
        req.query?.token;

    if (!token) {
        console.log('No token found - redirecting to supplier login');
        return res.redirect('/supplier/login');
    }

    try {
        const jwtSecret = process.env.JWT_SECRET || 'hareneth';
        const decoded = jwt.verify(token, jwtSecret);
        
        console.log('Decoded supplier token:', decoded);
        
        // Check if this is a supplier token
        if (decoded.type !== 'supplier') {
            console.log('Token type mismatch. Expected: supplier, Got:', decoded.type);
            return res.redirect('/supplier/login');
        }

        // Attach the decoded token to the request
        req.user = decoded;
        console.log('Supplier authenticated successfully:', {
            id: decoded.id,
            email: decoded.email,
            type: decoded.type
        });
        
        next();
    } catch (error) {
        console.error('Supplier token verification failed:', error.message);
        
        // Clear the invalid cookie
        res.clearCookie('token', { 
            path: '/',  // Clear from root path
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });
        
        return res.redirect('/supplier/login');
    }
};

// Supplier guest middleware - allows access only if not already logged in as supplier
const supplierGuest = (req, res, next) => {
  const token = 
    req.cookies?.token || 
    req.headers['authorization']?.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // If already logged in as supplier, redirect to dashboard
      if (decoded.type === 'supplier') {
        console.log('Supplier already authenticated, redirecting to dashboard');
        return res.redirect('/supplier/dashboard');
      }
    } catch (error) {
      // Invalid token, clear it and proceed as guest
      console.log('Invalid supplier token in guest middleware, clearing cookie');
      res.clearCookie('token', { 
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
    }
  }

  next();
};

// Specific role checkers
const requireSuperadmin = createRoleChecker('superadmin', 'Access denied. Superadmin only.');
const requireAdmin = createRoleChecker(['admin', 'superadmin'], 'Access denied. Admin only.');
const requireBudget = createRoleChecker('budget', 'Access denied. Budget department only.');
const requireAccounting = createRoleChecker('accounting', 'Access denied. Accounting department only.');
const requireMo = createRoleChecker('mo', 'Access denied. Mayor\'s office only.');
const requireIcs = createRoleChecker('ics', 'Access denied. ICS department only.');
const requireBac = createRoleChecker('bac', 'Access denied. BAC only.');
const requireUser = createRoleChecker('user', 'Access denied. Regular user only.');
const requireInout = createRoleChecker('inout', 'Access denied. In/Out department only.');
const requirePar = createRoleChecker('par', 'Access denied. PAR only.');
const requireFinance = createRoleChecker(['budget', 'accounting'], 'Access denied. Finance department only.');
const requireManagement = createRoleChecker(
  ['mo', 'admin', 'superadmin'],
  'Access denied. Management only.'
);

module.exports = {
  requireAuth,
  requireRole: createRoleChecker,
  requireSuperadmin,
  requireAdmin,
  requireBudget,
  requireAccounting,
  requireMo,
  requireIcs,
  requireBac,
  requireUser,
  requireInout,
  requirePar,
  requireFinance,
  requireManagement,
  authenticateSupplier,
  supplierGuest,
  authenticateAdmin: requireAdmin,
};
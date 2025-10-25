const db = require('../config/db');
const bcrypt = require('bcrypt');
const Employee = require('../models/employeeModel');
const Department = require('../models/departmentModel');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../public/uploads/profile-pictures/'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalName));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalName).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
  },
});

exports.getAddUser = (req, res) => {
  Department.getAll((err, departments) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Error fetching departments' });
    }
    res.render('add-user', { user: req.user, error: null, success: null, departments });
  });
};

exports.postAddUser = async (req, res) => {
  const { employee_name, email, position, department_id, user_type, password, status } = req.body;

  if (!position) {
    return res.status(400).json({ success: false, message: 'Position is required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newEmployee = {
      employee_name,
      email,
      position,
      department_id,
      user_type,
      password: hashedPassword,
      status: status || 0,
    };

    Employee.create(newEmployee, (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Error adding employee. Please try again.' });
      }
      res.status(201).json({ success: true, message: 'Employee added successfully' });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error. Try again later.' });
  }
};

exports.getAllUsers = (req, res) => {
  Employee.getAll((err, employees) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Error fetching users' });
    }
    res.render('users', { user: req.user, error: null, employees });
  });
};

exports.getDepartmentCodes = (req, res) => {
  const query = req.query.query || '';
  Department.searchByCode(query, (err, departmentCodes) => {
    if (err) {
      return res.status(500).json({ error: 'Error fetching department codes' });
    }
    res.json(departmentCodes);
  });
};

exports.getEmployees = (req, res) => {
  Employee.getAll((err, employees) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error fetching employees' });
    }
    res.render('users', {  user: req.user, employees });
  });
};

exports.editUser = (req, res) => {
  const { employee_id } = req.params;
  const { user_type, status } = req.body;

  Employee.updateUser(employee_id, { user_type, status }, (err, result) => {
    if (err) {
      console.error("Error updating employee:", err);
      return res.status(500).json({ success: false, message: "Error updating employee" });
    }
    return res.status(200).json({ success: true, message: "Employee updated successfully" });
  });
};

exports.searchEmployees = (req, res) => {
  const { search, userType, draw, start, length, order, columns } = req.query;

  // Build the SQL query with join to get department_name
  let query = `
    SELECT e.*, d.department_name 
    FROM employees e 
    LEFT JOIN departments d ON e.department_id = d.department_id 
    WHERE 1=1
  `;
  let params = [];

  // Add search filter
  if (search && search.value) {
    query += ' AND (e.employee_name LIKE ? OR e.email LIKE ?)';
    params.push(`%${search.value}%`, `%${search.value}%`);
  }

  // Add user type filter
  if (userType) {
    query += ' AND e.user_type = ?';
    params.push(userType);
  }

  // Add sorting
  if (order && columns) {
    const columnIndex = order[0].column;
    const columnName = columns[columnIndex].data;
    // Adjust for department_name sorting
    const columnAlias = columnName === 'department_name' ? 'd.department_name' : `e.${columnName}`;
    const direction = order[0].dir.toUpperCase();
    query += ` ORDER BY ${columnAlias} ${direction}`;
  }

  // Add pagination
  query += ' LIMIT ? OFFSET ?';
  params.push(parseInt(length), parseInt(start));

  // Get total records (for DataTables)
  let countQuery = `
    SELECT COUNT(*) as total 
    FROM employees e 
    LEFT JOIN departments d ON e.department_id = d.department_id 
    WHERE 1=1
  `;
  let countParams = [];
  if (search && search.value) {
    countQuery += ' AND (e.employee_name LIKE ? OR e.email LIKE ?)';
    countParams.push(`%${search.value}%`, `%${search.value}%`);
  }
  if (userType) {
    countQuery += ' AND e.user_type = ?';
    countParams.push(userType);
  }

  // Execute queries
  db.query(countQuery, countParams, (err, countResult) => {
    if (err) {
      console.error('Error counting employees:', err);
      return res.status(500).json({ error: 'Error searching employees' });
    }

    db.query(query, params, (err, results) => {
      if (err) {
        console.error('Error searching employees:', err);
        return res.status(500).json({ error: 'Error searching employees' });
      }

      res.json({
        draw: parseInt(draw),
        recordsTotal: countResult[0].total,
        recordsFiltered: countResult[0].total,
        data: results,
      });
    });
  });
};

exports.archiveEmployee = (req, res) => {
  const { emp_id } = req.params;

  Employee.archive(emp_id, (err, result) => {
    if (err) {
      console.error("Error archiving employee:", err);
      return res.status(500).json({ success: false, message: "Error archiving employee" });
    }
    return res.status(200).json({ success: true, message: "Employee archived successfully" });
  });
};

exports.unarchiveEmployee = (req, res) => {
  const { emp_id } = req.params;

  Employee.unarchive(emp_id, (err, result) => {
    if (err) {
      console.error("Error unarchiving employee:", err);
      return res.status(500).json({ success: false, message: "Error unarchiving employee" });
    }
    return res.status(200).json({ success: true, message: "Employee unarchived successfully" });
  });
};

exports.getArchivedEmployees = (req, res) => {
  Employee.getArchived((err, employees) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Error fetching archived employees' });
    }
    res.render('archived-employees', {  user: req.user, error: null, employees });
  });
};

exports.getProfile = (req, res) => {
  const { employee_id } = req.params;
  const profileId = employee_id || req.user.id;

  // First get all departments
  Department.getAll((err, departments) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Error loading departments' });
    }

    // Then get the profile
    Employee.getProfile(profileId, (err, profile) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Error loading profile' });
      }

      if (!profile) {
        return res.status(404).json({ success: false, message: 'Profile not found' });
      }

      res.render('profile', {
        user: req.user,
        title: 'Employee Profile',
        profile: profile,
        departments: departments,
        user: req.user,
        currentUser: req.user,
      });
    });
  });
};

exports.updateProfile = (req, res) => {
  upload.single('profile_picture')(req, res, function (err) {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'Error uploading file' });
    }

    const { employee_id } = req.params;
    const { employee_name, position, email, department_id, bac_position, signature } = req.body;

    // First, fetch the current employee data to get the existing user_type
    Employee.getById(employee_id, (err, employee) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Error fetching current profile' });
      }
      if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee not found' });
      }

      // Prepare update data, preserving the existing user_type if not provided
      const updateData = {
        employee_name,
        position: position || '',
        email,
        department_id,
        bac_position,
        user_type: req.body.user_type || employee.user_type,
        signature,
        updated_by: req.user.employee_id,
        updated_at: new Date(),
      };

      // Handle profile picture if uploaded
      if (req.file) {
        updateData.profile_image = '/uploads/profile-pictures/' + req.file.filename;
      }

      // Update the employee record
      const sql = `UPDATE employees SET 
        employee_name = ?, 
        position = ?, 
        email = ?, 
        department_id = ?, 
        bac_position = ?, 
        user_type = ?, 
        signature = ?, 
        updated_by = ?, 
        updated_at = ?
        ${req.file ? ', profile_image = ?' : ''}
        WHERE employee_id = ?`;

      const values = [
        updateData.employee_name,
        updateData.position,
        updateData.email,
        updateData.department_id,
        updateData.bac_position,
        updateData.user_type,
        updateData.signature,
        updateData.updated_by,
        updateData.updated_at,
      ];

      if (req.file) {
        values.push(updateData.profile_image);
      }
      values.push(employee_id);

      db.query(sql, values, (err, result) => {
        if (err) {
          // Clean up uploaded file if database update fails
          if (req.file) {
            fs.unlinkSync(req.file.path);
          }
          console.error(err);
          return res.status(500).json({ success: false, message: 'Error updating profile' });
        }

        // Get the updated profile to return
        Employee.getProfile(employee_id, (err, updatedProfile) => {
          if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: 'Error fetching updated profile' });
          }

          res.json({ success: true, message: 'Profile updated successfully', profile: updatedProfile });
        });
      });
    });
  });
};

exports.getBacMembers = (req, res) => {
  // Get all BAC members and non-BAC employees for the dropdown
  Employee.getBacMembers((err, bacMembers) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Error loading BAC members' });
    }

    Employee.getNonBacEmployees((err, nonBacEmployees) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Error loading non-BAC employees' });
      }

      res.render('bac-members', {
        user: req.user,
        title: 'BAC Members Management',
        bacMembers: bacMembers,
        nonBacEmployees: nonBacEmployees,
        user: req.user,
      });
    });
  });
};

exports.updateBacMember = (req, res) => {
  const { employee_id } = req.params;
  const { bac_position } = req.body;

  if (!bac_position) {
    return res.status(400).json({ success: false, message: 'BAC position is required' });
  }

  Employee.updateBacMember(employee_id, { bac_position, status: 1, updated_by: req.user.employee_id }, (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Error updating BAC member' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    res.json({ success: true, message: 'BAC member updated successfully' });
  });
};

exports.removeBacMember = (req, res) => {
  const { employee_id } = req.params;

  db.query(
    `
    UPDATE employees 
    SET 
      user_type = 'user',
      bac_position = NULL,
      updated_at = NOW(),
      updated_by = ?
    WHERE employee_id = ?
  `,
    [req.user.employee_id, employee_id],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Error removing BAC member' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Employee not found' });
      }

      res.json({ success: true, message: 'BAC member removed successfully' });
    }
  );
};

exports.addBacMember = (req, res) => {
  const { employee_id, bac_position } = req.body;

  if (!employee_id || !bac_position) {
    return res.status(400).json({ success: false, message: 'Employee ID and BAC position are required' });
  }

  Employee.updateBacMember(employee_id, { bac_position, status: 1, updated_by: req.user.employee_id }, (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Error adding BAC member' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    res.json({ success: true, message: 'BAC member added successfully' });
  });
};
const approvalsModel = require('../models/approvalsModel');
const { formatDateTime } = require('../utils/format');

// approvalsController.js
exports.showApprovalsPage = (req, res) => {
  if (!req.user) {
    return res.status(401).redirect('/login');
  }

  const user = req.user;
  const isAdmin = user.user_type === 'superadmin' || user.user_type === 'admin';
  const isRegularUser = user.user_type === 'user';

  // For regular users, only show their department's requests
  const departmentFilter = isRegularUser ? user.department : null;

  approvalsModel.getAllPurchaseOrderApprovals(departmentFilter, (err, results) => {
    if (err) {
      console.error('Error fetching approvals:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }

    // Set permission flags based on user_type
    const currentUser = {
      isAdmin,
      isRegularUser,
      userType: user.user_type,
      department: user.department,
      canApproveBudget: isAdmin || user.user_type === 'budget',
      canApproveTreasury: isAdmin || user.user_type === 'accounting',
      canApproveMayor: isAdmin || user.user_type === 'mo',
      canApproveGSO: isAdmin || user.user_type === 'ics'
    };

    res.render('approvals', { 
      approvalList: results,
      currentUser,
      user: req.user,
      formatDateTime: (date) => {
        if (!date) return '—';
        return new Date(date).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    });
  });
};

exports.updateApproval = (req, res) => {
  const { pr_id } = req.params;
  const { budget_status, treasury_status, mayor_status, gso_status } = req.body;
  
  const data = {
      pr_id,
      budget_status: budget_status ? 'Approved' : 'Pending',
      treasury_status: treasury_status ? 'Approved' : 'Pending',
      mayor_status: mayor_status ? 'Approved' : 'Pending',
      gso_status: gso_status ? 'Approved' : 'Pending',
      // Add dates if needed
  };
  
  approvalsModel.updateApproval(data, (err, result) => {
      if (err) {
          console.error('Error updating approval:', err);
          return res.status(500).json({ success: false, message: 'Server error' });
      }
      res.redirect('/approvals');
  });
};

// Budget Approval Update
exports.updateBudgetApproval = (req, res) => {
  updateApprovalStatus(req, res, 'budget');
};

// Treasury Approval Update
exports.updateTreasuryApproval = (req, res) => {
  updateApprovalStatus(req, res, 'treasury');
};

// Mayor Approval Update
exports.updateMayorApproval = (req, res) => {
  updateApprovalStatus(req, res, 'mayor');
};

// GSO Approval Update
exports.updateGSOApproval = (req, res) => {
  updateApprovalStatus(req, res, 'gso');
};

// Update the helper function
function updateApprovalStatus(req, res, department) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const { pr_id } = req.params;
  const isApproved = req.body[`${department}_status`] === 'on';

  const data = {
    pr_id,
    [`${department}_status`]: isApproved ? 'Approved' : 'Pending',
    [`${department}_date`]: isApproved ? new Date() : null,
    [`${department}_approver`]: isApproved ? req.user.employee_name : null
  };

  approvalsModel.updateApproval(data, (err, result) => {
    if (err) {
      console.error(`Error updating ${department} approval:`, err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
    res.redirect('/approvals');
  });
}
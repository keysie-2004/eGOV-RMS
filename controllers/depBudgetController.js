const DepBudgetModel = require('../models/depBudgetModel');
const RequestsModel = require('../models/requestsModel');
const db = require('../config/db');

exports.setBudget = (req, res) => {
  const { department_id, budget_amount } = req.body;
  DepBudgetModel.setBudget(department_id, budget_amount, (err, result) => {
    if (err) {
      console.error('Error setting budget:', err);
      req.flash('error', 'Error setting budget');
      return res.redirect('/budget/admin');
    }
    req.flash('success', 'Budget set successfully');
    res.redirect('/budget/admin');
  });
};

exports.addToBudget = (req, res) => {
  const { department_id, additional_amount } = req.body;
  
  // First get current budget
  DepBudgetModel.getBudgetByDepartment(department_id, (err, currentBudget) => {
    if (err) {
      console.error('Error fetching department budget:', err);
      console.log('Department ID used for query:', department_id);
      req.flash('error', 'Error fetching current budget');
      return res.redirect('/budget/admin');
    }

    // Check if budget exists
    if (!currentBudget) {
      console.log('No budget found for department:', department_id);
      req.flash('error', 'No budget found for this department. Please set an initial budget first.');
      return res.redirect('/budget/admin');
    }

    // Add debug line to see what the query returned
    console.log('Budget query result:', currentBudget);
    
    // Calculate new budget amount
    const newBudgetAmount = parseFloat(currentBudget.budget_amount) + parseFloat(additional_amount);
    
    // Update the budget
    DepBudgetModel.addToBudget(department_id, additional_amount, newBudgetAmount, (err, result) => {
      if (err) {
        console.error('Error adding to budget:', err);
        req.flash('error', 'Error adding to budget');
        return res.redirect('/budget/admin');
      }
      req.flash('success', `Successfully added ₱${parseFloat(additional_amount).toLocaleString()} to budget`);
      res.redirect('/budget/admin');
    });
  });
};

exports.getBudgetView = (req, res) => {
  const user = req.user;
  if (!user || !user.department_id) {
    console.error('User or department_id missing:', user);
    req.flash('error', 'Unable to fetch budget: User or department information missing');
    return res.redirect('/dashboard');
  }

  DepBudgetModel.getBudgetByDepartment(user.department_id, (err, budget) => {
    if (err) {
      console.error('Error fetching budget:', err);
      req.flash('error', 'Error fetching budget');
      return res.redirect('/dashboard');
    }
    
    DepBudgetModel.getBudgetHistory(user.department_id, (err, history) => {
      if (err) {
        console.error('Error fetching budget history:', err);
        req.flash('error', 'Error fetching budget history');
        return res.redirect('/dashboard');
      }
      
      // Ensure budget object is properly formatted
      const budgetData = budget && budget.budget_amount !== undefined && budget.remaining_budget !== undefined
        ? {
            department_id: budget.department_id,
            budget_amount: parseFloat(budget.budget_amount) || 0,
            remaining_budget: parseFloat(budget.remaining_budget) || 0,
            department_name: budget.department_name || 'Unknown Department'
          }
        : {
            department_id: user.department_id,
            budget_amount: 0,
            remaining_budget: 0,
            department_name: budget?.department_name || 'Unknown Department'
          };

      res.render('view_budget', {
        budget: budgetData,
        history,
        user: req.user,
        error: req.flash('error'),
        success: req.flash('success')
      });
    });
  });
};

exports.getAdminBudgetsView = (req, res) => {
  DepBudgetModel.getAllBudgets((err, budgets) => {
    if (err) {
      console.error('Error fetching budgets:', err);
      req.flash('error', 'Error fetching budgets');
      return res.redirect('/admin/dashboard');
    }
    
    DepBudgetModel.getAllDepartments((err, departments) => {
      if (err) {
        console.error('Error fetching departments:', err);
        req.flash('error', 'Error fetching departments');
        return res.redirect('/admin/dashboard');
      }
      
      res.render('admin_budgets', {
        budgets,
        departments,
        user: req.user,
        error: req.flash('error'),
        success: req.flash('success')
      });
    });
  });
};

exports.updateStatus = (req, res) => {
  const { pr_id } = req.params;
  const { status } = req.body;

  // Fetch the purchase request to get the total and department_id
  const fetchQuery = `SELECT total, department FROM purchase_requests WHERE pr_id = ?`;
  db.query(fetchQuery, [pr_id], (err, result) => {
    if (err) {
      console.error('Error fetching purchase request:', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
    if (!result || result.length === 0) {
      return res.status(404).json({ message: 'Purchase request not found' });
    }

    const { total, department } = result[0];

    // Update the purchase request status
    const updateQuery = `UPDATE purchase_requests SET status = ? WHERE pr_id = ?`;
    db.query(updateQuery, [status, pr_id], (err, updateResult) => {
      if (err) {
        console.error('Error updating status:', err);
        return res.status(500).json({ message: 'Internal Server Error' });
      }

      // If status is 'approved', update the remaining budget
      if (status === 'approved') {
        DepBudgetModel.updateRemainingBudget(department, total, (err, budgetResult) => {
          if (err) {
            console.error('Error updating remaining budget:', err);
            return res.status(500).json({ message: 'Failed to update budget' });
          }
          res.json({ message: 'Status updated successfully' });
        });
      } else {
        res.json({ message: 'Status updated successfully' });
      }
    });
  });
};
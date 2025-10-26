const RequestsModel = require('../models/requestsModel');
const db = require('../config/db');

exports.renderAddRequestForm = (req, res) => {
  const user = req.user;
  if (!user) {
    return res.redirect('/login');
  }

  // Fetch cash availability (City Treasurer)
  const cashAvailabilityQuery = `
    SELECT employee_name 
    FROM employees 
    WHERE bac_position LIKE '%Cash Availability%' 
    LIMIT 1
  `;

  // Fetch approved by (City Mayor)
  const approvedByQuery = `
    SELECT employee_name 
    FROM employees 
    WHERE bac_position LIKE '%Approved by%' 
    LIMIT 1
  `;

  // Fetch active FPP codes
  const eppCodesQuery = `
    SELECT epp_code, epp_name 
    FROM epp_code 
    WHERE is_archived = 0
  `;

  db.query(cashAvailabilityQuery, (err, cashResults) => {
    if (err) {
      console.error('Error fetching cash availability:', err);
      return res.status(500).render('error', { message: 'Error fetching cash availability' });
    }

    db.query(approvedByQuery, (err, approvedResults) => {
      if (err) {
        console.error('Error fetching approved by:', err);
        return res.status(500).render('error', { message: 'Error fetching approved by' });
      }

      db.query(eppCodesQuery, (err, eppCodes) => {
        if (err) {
          console.error('Error fetching FPP codes:', err);
          return res.status(500).render('error', { message: 'Error fetching FPP codes' });
        }

        res.render('add-requests', {
          user: user,
          cashAvailability: cashResults[0]?.employee_name || '',
          approvedBy: approvedResults[0]?.employee_name || '',
          eppCodes: eppCodes || [],
          budget: null // Budget information removed
        });
      });
    });
  });
};

exports.createRequest = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized: No user found in request' 
      });
    }

    if (!req.body.items || !Array.isArray(req.body.items) || req.body.items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'At least one item is required' 
      });
    }

    const { items, cash_availability, approved_by, ...requestData } = req.body;

    // Calculate total cost of items
    const total = items.reduce((sum, item) => {
      const itemCost = parseFloat(item.total_cost) || 0;
      if (isNaN(itemCost)) {
        throw new Error(`Invalid total_cost for item ${item.item_description}`);
      }
      return sum + itemCost;
    }, 0);

    // Fetch the department's remaining budget
    const budgetQuery = `
      SELECT remaining_budget 
      FROM department_budgets 
      WHERE department_id = ?
    `;
    const [budgetResult] = await new Promise((resolve, reject) => {
      db.query(budgetQuery, [user.department_id], (err, results) => {
        if (err) return reject(err);
        resolve(results);
      });
    });

    if (!budgetResult) {
      return res.status(400).json({
        success: false,
        message: 'No budget found for this department',
      });
    }

    const remainingBudget = parseFloat(budgetResult.remaining_budget);
    if (total > remainingBudget) {
      return res.status(400).json({
        success: false,
        message: `Request total (₱${total.toFixed(2)}) exceeds remaining budget (₱${remainingBudget.toFixed(2)})`,
      });
    }

    // Proceed with creating the request
    const newRequest = {
      lgu: requestData.lgu || 'Calapan City',
      fund: requestData.fund,
      department: user.department_id,
      section: requestData.section,
      fpp: requestData.fpp,
      date_requested: requestData.date_requested || new Date().toISOString().split('T')[0],
      total: total.toFixed(2),
      purpose: requestData.purpose,
      requested_by: user.employee_name,
      cash_availability,
      approved_by,
      status: 'pending',
    };

    const requestResult = await new Promise((resolve, reject) => {
      RequestsModel.create(newRequest, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });

    const pr_id = requestResult.insertId;

    // Insert items
    await Promise.all(
      items.map((item, index) => {
        const newItem = {
          pr_id,
          item_no: index + 1,
          unit: item.unit,
          item_description: item.item_description,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          total_cost: item.total_cost,
        };
        return new Promise((resolve, reject) => {
          RequestsModel.createItem(newItem, (err, result) => {
            if (err) return reject(err);
            resolve(result);
          });
        });
      })
    );

    // Update the remaining budget
    const updateBudgetQuery = `
      UPDATE department_budgets 
      SET remaining_budget = remaining_budget - ? 
      WHERE department_id = ?
    `;
    await new Promise((resolve, reject) => {
      db.query(updateBudgetQuery, [total, user.department_id], (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });

    res.status(201).json({
      success: true,
      message: 'Request created successfully',
      data: {
        pr_id,
        ...newRequest,
        items,
      },
    });
  } catch (error) {
    console.error('Error creating request:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create request',
      error: process.env.NODE_ENV === 'production' ? error.stack : undefined,
    });
  }
};

exports.getRequests = (req, res) => {
    const user = req.user;
    if (!user) {
        console.error('No user found in session');
        return res.redirect('/login');
    }

    const statusFilter = req.query.status ? req.query.status.toLowerCase() : 'all';
    const showArchived = req.query.archived === 'true';

    // Validate status filter
    const validStatuses = ['all', 'pending', 'approved', 'declined', 'e-sign', 'posted', 'archived'];
    if (statusFilter !== 'all' && !validStatuses.includes(statusFilter)) {
        console.error(`Invalid status filter: ${statusFilter}`);
        return res.status(400).render('error', { message: 'Invalid status filter' });
    }

    // Initialize query parameters
    let queryParams = [showArchived ? 1 : 0];
    let baseQuery = `
        SELECT 
            pr.pr_id, pr.lgu, pr.fund, pr.department, pr.section, pr.fpp, 
            pr.date_requested, pr.total, pr.purpose, pr.requested_by, 
            pr.cash_availability, pr.approved_by, pr.status, pr.is_archived, pr.qr_code,
            pri.item_no, pri.unit, pri.item_description, pri.quantity, pri.unit_cost, pri.total_cost,
            pr.comments
        FROM purchase_requests pr
        LEFT JOIN purchase_request_items pri ON pr.pr_id = pri.pr_id
        WHERE pr.is_archived = ?
    `;

    // Add status filter if not 'all'
    if (statusFilter !== 'all') {
        if (statusFilter === 'archived') {
            baseQuery += ` AND pr.status != 'archived'`;
        } else {
            baseQuery += ` AND pr.status = ?`;
            queryParams.push(statusFilter);
        }
    }
    
    // Add department filter for regular users
    if (user.user_type === 'user') {
        baseQuery += ` AND pr.department = ?`;
        queryParams.push(user.department_id);
        console.log(`Fetching requests for user ${user.employee_name} from department ${user.department_id}`);
    } else {
        console.log(`Fetching requests for ${user.user_type} user: ${user.employee_name}, department: ${user.department_id}`);
    }

    // Add ORDER BY to ensure consistent results
    baseQuery += ` ORDER BY pr.pr_id DESC, pri.item_no`;

    db.query(baseQuery, queryParams, (err, results) => {
        if (err) {
            console.error('Database error in getRequests:', err);
            return res.status(500).render('error', { message: 'Internal Server Error' });
        }

        // Group items by pr_id and include QR code for e-sign requests
        const groupedRequests = results.reduce((acc, row) => {
            if (!acc[row.pr_id]) {
                let parsedComments = {};
                if (row.comments) {
                    try {
                        if (typeof row.comments === 'object') {
                            parsedComments = row.comments;
                        } else if (typeof row.comments === 'string') {
                            if (row.comments.trim().startsWith('{') || row.comments.trim().startsWith('[')) {
                                parsedComments = JSON.parse(row.comments);
                            } else {
                                parsedComments = { message: row.comments };
                            }
                        }
                    } catch (parseError) {
                        console.error(`Error parsing comments for request ${row.pr_id}:`, parseError);
                        parsedComments = { message: row.comments };
                    }
                }

                acc[row.pr_id] = {
                    pr_id: row.pr_id,
                    lgu: row.lgu,
                    fund: row.fund,
                    department: row.department,
                    section: row.section,
                    fpp: row.fpp,
                    date_requested: row.date_requested,
                    total: row.total,
                    purpose: row.purpose,
                    requested_by: row.requested_by,
                    cash_availability: row.cash_availability,
                    approved_by: row.approved_by,
                    status: row.status,
                    is_archived: row.is_archived,
                    qr_code: row.status === 'e-sign' ? row.qr_code : null,
                    comments: parsedComments,
                    items: []
                };
            }

            if (row.item_no) {
                acc[row.pr_id].items.push({
                    item_no: row.item_no,
                    unit: row.unit,
                    item_description: row.item_description,
                    quantity: row.quantity,
                    unit_cost: row.unit_cost,
                    total_cost: row.total_cost
                });
            }
            return acc;
        }, {});

        res.render('requests', {
            user,
            requests: Object.values(groupedRequests),
            currentStatus: statusFilter,
            showArchived,
            statusOptions: validStatuses,
            budget: null // Budget information removed
        });
    });
};

// Update delete method to archive instead of delete
exports.deleteRequest = (req, res) => {
    const pr_id = req.body.pr_id;
    RequestsModel.archive(pr_id, (err) => {
        if (err) return res.status(500).send(err);
        res.redirect('/requests');
    });
};

// Add restore method
exports.restoreRequest = (req, res) => {
    const pr_id = req.params.id;
    RequestsModel.restore(pr_id, (err) => {
        if (err) return res.status(500).send(err);
        res.redirect('/requests?archived=true');
    });
};

exports.getRequestById = (req, res) => {
    const pr_id = req.params.id;
    RequestsModel.getByIdWithItems(pr_id, (err, request) => {
        if (err) {
            return res.status(500).send(err);
        }
        if (!request) {
            return res.status(404).render('404', { message: 'Request not found' });
        }
        res.render('edit-request', { request });
    });
};

exports.updateRequest = (req, res) => {
    const pr_id = req.params.id;
    const user = req.user;

    if (!user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // First check if request is approved
    RequestsModel.getById(pr_id, (err, request) => {
        if (err) {
            return res.status(500).json({ success: false, message: err.message });
        }

        if (request.status === 'approved') {
            return res.status(403).json({ 
                success: false, 
                message: 'Approved requests cannot be modified' 
            });
        }

        // Proceed with update if not approved
        const updatedRequest = {
            ...req.body,
            department: user.department,
            requested_by: user.employee_name
        };

        RequestsModel.update(pr_id, updatedRequest, (err) => {
            if (err) {
                return res.status(500).json({ success: false, message: err.message });
            }
            res.json({ success: true, message: 'Request updated successfully' });
        });
    });
};

exports.updateStatus = (req, res) => {
    const pr_id = req.params.id;
    const { status } = req.body;
    const user = req.user;

    if (!user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // First get the request details to check the total amount
    RequestsModel.getById(pr_id, (err, request) => {
        if (err) {
            return res.status(500).json({ success: false, message: err.message });
        }

        if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        // Check if status is being changed to declined and total exceeds 800,000
        if (status === 'declined' && parseFloat(request.total) > 800000) {
            // First get the requester's email
            db.query(
                `SELECT email FROM employees WHERE employee_name = ?`, 
                [request.requested_by], 
                (err, results) => {
                    if (err) {
                        console.error('Error fetching requester email:', err);
                        return updateRequestStatus();
                    }

                    if (results.length === 0) {
                        console.error('Requester email not found');
                        return updateRequestStatus();
                    }

                    const requesterEmail = results[0].email;
                    if (!requesterEmail) {
                        console.error('Requester email is empty');
                        return updateRequestStatus();
                    }

                    // Send email notification
                    sendDeclinedEmail(request, requesterEmail);
                    updateRequestStatus();
                }
            );
        } else {
            updateRequestStatus();
        }

        function updateRequestStatus() {
            if (status === 'e-sign') {
                // Generate the signing URL
                const signUrl = `${req.protocol}://${req.get('host')}/sign-request/${pr_id}`;
                
                // Generate QR code
                const qr = require('qrcode');
                qr.toDataURL(signUrl, (err, qrCodeUrl) => {
                    if (err) {
                        console.error('QR code generation failed:', err);
                        return res.status(500).json({ 
                            success: false, 
                            message: 'Failed to generate QR code',
                            error: err.message 
                        });
                    }

                    // Update the request status and save QR code
                    const updateQuery = `
                        UPDATE purchase_requests 
                        SET status = ?, qr_code = ?
                        WHERE pr_id = ?
                    `;
                    
                    db.query(updateQuery, [status, qrCodeUrl, pr_id], (err, result) => {
                        if (err) {
                            console.error('Database update failed:', err);
                            return res.status(500).json({ 
                                success: false, 
                                message: 'Failed to update request status' 
                            });
                        }
                        
                        // Return the QR code URL in the response
                        res.json({ 
                            success: true, 
                            message: 'Status updated to e-sign successfully',
                            qrCodeUrl: qrCodeUrl,
                            pr_id: pr_id
                        });
                    });
                });
            } else {
                // For other status updates
                const updateQuery = `UPDATE purchase_requests SET status = ? WHERE pr_id = ?`;
                db.query(updateQuery, [status, pr_id], (err, result) => {
                    if (err) {
                        console.error('Database update failed:', err);
                        return res.status(500).json({ 
                            success: false, 
                            message: 'Failed to update request status' 
                        });
                    }
                    
                    res.json({ 
                        success: true, 
                        message: 'Status updated successfully'
                    });
                });
            }
        }
    });
};

// Updated email sending function with better error handling
async function sendDeclinedEmail(request, requesterEmail) {
    const nodemailer = require('nodemailer');
    
    // Validate email configuration
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error('Email configuration missing in environment variables');
        return false;
    }

    if (!requesterEmail) {
        console.error('No recipient email provided');
        return false;
    }

    try {
        // Configure your email transport with more options
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            host: 'smtp.gmail.com',
            port: 587,
            secure: false, 
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            tls: {
                rejectUnauthorized: false 
            }
        });

        // Verify connection configuration
        await transporter.verify((error, success) => {
            if (error) {
                console.error('Error verifying email transporter:', error);
            } else {
                console.log('Server is ready to take our messages');
            }
        });

        // Email options
        const mailOptions = {
            from: `"Hareneth Procurement" <${process.env.EMAIL_USER}>`,
            to: requesterEmail,
            subject: `SPPMP Required for PR ID: ${request.pr_id}`,
            html: `
                <p>Dear ${request.requested_by},</p>
                <p>Your procurement request (PR ID: ${request.pr_id}) has been declined because the total amount exceeds ₱800,000.</p>
                <p>Please prepare and submit a Supplemental Project Procurement Management Plan (SPPMP) to proceed.</p>
                <p>Thank you.</p>
                <p>- Hareneth Procurement Team</p>
            `
        };

        // Send email
        const info = await transporter.sendMail(mailOptions);
        console.log('Message sent: %s', info.messageId);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
}

exports.getArchivedRequests = (req, res) => {
    const user = req.user;
    if (!user) {
        return res.redirect('/login');
    }

    RequestsModel.getArchived((err, requests) => {
        if (err) {
            return res.status(500).render('error', { message: err.message });
        }

        res.render('archived-requests', { 
            user, 
            requests: requests 
        });
    });
};

exports.restoreRequest = (req, res) => {
    const pr_id = req.params.id;
    const user = req.user;

    if (!user || !['superadmin', 'admin'].includes(user.user_type)) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    RequestsModel.restore(pr_id, (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
        res.json({ success: true, message: 'Request restored successfully' });
    });
};

exports.deleteRequest = (req, res) => {
    const pr_id = req.body.pr_id;
    RequestsModel.delete(pr_id, (err) => {
        if (err) {
            return res.status(500).send(err);
        }
        res.redirect('/requests');
    });
};

exports.getRequestsByStatus = (req, res) => {
    const status = req.query.status;
    RequestsModel.getByStatus(status, (err, requests) => {
        if (err) {
            return res.status(500).send(err);
        }
        res.render('requests', { requests });
    });
};

// Archive a request
exports.archiveRequest = (req, res) => {
  const pr_id = req.params.id;
  
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      message: 'Unauthorized' 
    });
  }

  const query = 'UPDATE purchase_requests SET is_archived = 1 WHERE pr_id = ?';
  
  db.query(query, [pr_id], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to archive request' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Request archived successfully' 
    });
  });
};

// Restore an archived request
exports.restoreRequest = (req, res) => {
  const pr_id = req.params.id;
  
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      message: 'Unauthorized' 
    });
  }

  const query = 'UPDATE purchase_requests SET is_archived = 0 WHERE pr_id = ?';
  
  db.query(query, [pr_id], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to restore request' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Request restored successfully' 
    });
  });
};

exports.updateStatus = (req, res) => {
    const pr_id = req.params.id;
    const { status } = req.body;
    const user = req.user;

    if (!user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // First get the request details to get the requester information
    RequestsModel.getById(pr_id, (err, request) => {
        if (err) {
            return res.status(500).json({ success: false, message: err.message });
        }

        if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        // Check if status is being changed to declined
        if (status === 'declined') {
            // First get the requester's email
            db.query(
                `SELECT email FROM employees WHERE employee_name = ?`, 
                [request.requested_by], 
                (err, results) => {
                    if (err) {
                        console.error('Error fetching requester email:', err);
                        return updateRequestStatus();
                    }

                    if (results.length === 0) {
                        console.error('Requester email not found');
                        return updateRequestStatus();
                    }

                    const requesterEmail = results[0].email;
                    if (!requesterEmail) {
                        console.error('Requester email is empty');
                        return updateRequestStatus();
                    }

                    // Send email notification
                    sendDeclinedEmail(request, requesterEmail);
                    updateRequestStatus();
                }
            );
        } else {
            updateRequestStatus();
        }

        function updateRequestStatus() {
            if (status === 'e-sign') {
                // Generate the signing URL
                const signUrl = `${req.protocol}://${req.get('host')}/sign-request/${pr_id}`;
                
                // Generate QR code
                const qr = require('qrcode');
                qr.toDataURL(signUrl, (err, qrCodeUrl) => {
                    if (err) {
                        console.error('QR code generation failed:', err);
                        return res.status(500).json({ 
                            success: false, 
                            message: 'Failed to generate QR code',
                            error: err.message 
                        });
                    }

                    // Update the request status and save QR code
                    const updateQuery = `
                        UPDATE purchase_requests 
                        SET status = ?, qr_code = ?
                        WHERE pr_id = ?
                    `;
                    
                    db.query(updateQuery, [status, qrCodeUrl, pr_id], (err, result) => {
                        if (err) {
                            console.error('Database update failed:', err);
                            return res.status(500).json({ 
                                success: false, 
                                message: 'Failed to update request status' 
                            });
                        }
                        
                        // Return the QR code URL in the response
                        res.json({ 
                            success: true, 
                            message: 'Status updated to e-sign successfully',
                            qrCodeUrl: qrCodeUrl,
                            pr_id: pr_id
                        });
                    });
                });
            } else {
                // For other status updates
                const updateQuery = `UPDATE purchase_requests SET status = ? WHERE pr_id = ?`;
                db.query(updateQuery, [status, pr_id], (err, result) => {
                    if (err) {
                        console.error('Database update failed:', err);
                        return res.status(500).json({ 
                            success: false, 
                            message: 'Failed to update request status' 
                        });
                    }
                    
                    res.json({ 
                        success: true, 
                        message: 'Status updated successfully'
                    });
                });
            }
        }
    });
};

// Updated email sending function for declined requests
async function sendDeclinedEmail(request, requesterEmail) {
    const nodemailer = require('nodemailer');
    
    // Validate email configuration
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error('Email configuration missing in environment variables');
        return false;
    }

    if (!requesterEmail) {
        console.error('No recipient email provided');
        return false;
    }

    try {
        // Configure your email transport with more options
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        // Verify connection configuration
        await transporter.verify((error, success) => {
            if (error) {
                console.error('Error verifying email transporter:', error);
            } else {
                console.log('Server is ready to take our messages');
            }
        });

        // Email options
        const mailOptions = {
            from: `"Bids and Awards Commission " <${process.env.EMAIL_USER}>`,
            to: requesterEmail,
            subject: `Action Required: Prepare SMPP for PR ID ${request.pr_id}`,
            html: `
                <p>Dear ${request.requested_by},</p>
                <p>Your procurement request (PR ID: ${request.pr_id}) requires the preparation of a Supplier Management and Procurement Plan (SMPP) to proceed with the approval process. The SMPP is essential to ensure compliance with procurement policies, streamline supplier selection, and justify the allocation of resources.</p>
                <p><strong>Request Details:</strong></p>
                <ul>
                    <li>PR Number: ${request.pr_no}</li>
                    <li>Date Requested: ${request.date_requested}</li>
                    <li>Total Amount: ₱${parseFloat(request.total).toLocaleString('en-US', {minimumFractionDigits: 2})}</li>
                    <li>Purpose: ${request.purpose}</li>
                </ul>
                <p>Please prepare the SMPP in accordance with the guidelines provided by the procurement office and submit it promptly to facilitate the review and approval of your request. Ensure all required documentation is included to avoid delays.</p>
                <p>For clarification or assistance, kindly contact the procurement office.</p>
                <p>Sincerely,<br>Bids and Awards Commission Team</p>
            `
        };

        // Send email
        const info = await transporter.sendMail(mailOptions);
        console.log('Message sent: %s', info.messageId);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
}

exports.updateFullRequest = (req, res) => {
    const requestData = req.body;
    const pr_id = requestData.pr_id;

    RequestsModel.update(pr_id, requestData, (err, result) => {
        if (err) return res.status(500).json({ error: 'Failed to update request' });
        res.json({ message: 'Request updated successfully' });
    });
};

exports.printRequest = async (req, res) => {
    const pr_id = req.params.id;

    try {
        // Query to get the request with all needed data
        const requestQuery = `
            SELECT 
                pr.*,
                GROUP_CONCAT(
                    CONCAT_WS('|', pri.item_no, pri.unit, pri.item_description, 
                             pri.quantity, pri.unit_cost, pri.total_cost) 
                    SEPARATOR ';'
                ) as items
            FROM purchase_requests pr
            LEFT JOIN purchase_request_items pri ON pr.pr_id = pri.pr_id
            WHERE pr.pr_id = ?
            GROUP BY pr.pr_id
        `;

        const [requestResults] = await new Promise((resolve, reject) => {
            db.query(requestQuery, [pr_id], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        if (!requestResults) {
            return res.status(404).send('Request not found');
        }

        const request = requestResults;

        // Parse items
        request.items = request.items ? request.items.split(';').map(item => {
            const [item_no, unit, item_description, quantity, unit_cost, total_cost] = item.split('|');
            return { item_no, unit, item_description, quantity, unit_cost, total_cost };
        }) : [];

        // Fetch employee details for requested_by
        const requestedByQuery = `
            SELECT employee_name AS name, position
            FROM employees 
            WHERE employee_name = ?
        `;
        const [requestedByResult] = await new Promise((resolve, reject) => {
            db.query(requestedByQuery, [request.requested_by], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // Fetch employee details for cash_availability (City Treasurer)
        const cashAvailabilityQuery = `
            SELECT employee_name AS name, position, bac_position
            FROM employees 
            WHERE bac_position = 'City Treasurer'
            LIMIT 1
        `;
        const [cashAvailabilityResult] = await new Promise((resolve, reject) => {
            db.query(cashAvailabilityQuery, [], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // Fetch employee details for approved_by (City Mayor)
        const approvedByQuery = `
            SELECT employee_name AS name, position, bac_position
            FROM employees 
            WHERE bac_position = 'City Mayor'
            LIMIT 1
        `;
        const [approvedByResult] = await new Promise((resolve, reject) => {
            db.query(approvedByQuery, [], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // Structure the request object with employee details
        request.requested_by = requestedByResult || { name: request.requested_by, position: '' };
        request.cash_availability = cashAvailabilityResult || { name: request.cash_availability || 'N/A', position: 'City Treasurer', bac_position: 'City Treasurer' };
        request.approved_by = approvedByResult || { name: request.approved_by || 'N/A', position: 'City Mayor', bac_position: 'City Mayor' };

        // Generate QR code only for e-sign status
        if (request.status === 'e-sign') {
            if (request.qr_code) {
                request.qrCodeUrl = request.qr_code;
                res.render('print-request', { request });
            } else {
                const qr = require('qrcode');
                const signUrl = `${req.protocol}://${req.get('host')}/sign-request/${pr_id}`;
                
                qr.toDataURL(signUrl, (err, qrCodeUrl) => {
                    if (err) {
                        console.error('QR code generation error:', err);
                        return res.status(500).send('Error generating QR code');
                    }
                    
                    // Save the QR code to the database for future use
                    db.query(
                        'UPDATE purchase_requests SET qr_code = ? WHERE pr_id = ?',
                        [qrCodeUrl, pr_id],
                        (err) => {
                            if (err) console.error('Failed to save QR code:', err);
                            request.qrCodeUrl = qrCodeUrl;
                            res.render('print-request', { request });
                        }
                    );
                });
            }
        } else {
            res.render('print-request', { request });
        }
    } catch (err) {
        console.error('Error in printRequest:', err);
        res.status(500).send('Internal Server Error');
    }
};

exports.generateQRCode = (req, res) => {
    const pr_id = req.params.id;
    const signUrl = `${req.protocol}://${req.get('host')}/sign-request/${pr_id}`;
    
    // Generate QR code image
    const qr = require('qrcode');
    qr.toDataURL(signUrl, (err, url) => {
        if (err) return res.status(500).send(err);
        res.json({ qrCode: url });
    });
};

exports.showSignRequest = (req, res) => {
  const pr_id = req.params.id;
  const user = req.user;

  if (!user) {
    console.error('No user found in session');
    return res.redirect('/login');
  }

  if (!user.employee_id) {
    console.error('User missing employee_id:', user);
    return res.status(400).render('error', { message: `User profile incomplete: Missing employee ID (User: ${user.employee_name}, Role: ${user.user_type}, BAC Position: ${user.bac_position || 'None'}). Please contact the administrator.` });
  }

  console.log('User data in showSignRequest:', user);

  RequestsModel.getBacId(pr_id, (err, request) => {
    if (err) {
      console.error('Error fetching request:', err);
      return res.status(500).render('error', { message: 'Failed to fetch request: ' + err.message });
    }
    if (!request) {
      return res.status(404).render('error', { message: 'Request not found' });
    }
    if (request.status !== 'e-sign') {
      return res.status(400).render('error', { message: 'This request is not ready for signing' });
    }

    // Check if the user has already reviewed based on status fields
    const userHasSigned =
      (user.employee_name === request.requested_by && request.requested_by_status !== 'pending') ||
      (user.bac_position === 'City Treasurer' && request.cash_availability_status !== 'pending') ||
      (user.bac_position === 'City Mayor' && request.approved_by_status !== 'pending') ||
      (user.bac_position === 'BAC Member 1' && request.bac_1_status !== 'pending') ||
      (user.bac_position === 'BAC Member 2' && request.bac_2_status !== 'pending') ||
      (user.bac_position === 'BAC Member 3' && request.bac_3_status !== 'pending') ||
      (user.bac_position === 'BAC Vice Chairman' && request.bac_vice_status !== 'pending') ||
      (user.bac_position === 'BAC Chairman' && request.bac_chairman_status !== 'pending') ||
      (user.bac_position === 'BAC Secretariat' && request.bac_secretariat_status !== 'pending') ||
      (user.bac_position === 'BAC Member' && request.bac_1_status !== 'pending');

    // Check if user is authorized to sign
    const isAuthorized =
      user.user_type === 'bac' ||
      user.employee_name === request.requested_by ||
      user.bac_position === 'City Treasurer' ||
      user.bac_position === 'City Mayor';

    res.render('sign-request', {
      user,
      request,
      userHasSigned,
      isAuthorized
    });
  });
};

exports.processSignature = (req, res) => {
  const pr_id = req.params.id;
  const user = req.user;
  const { employee_id, bac_position, approval_status, comment } = req.body;

  console.log('Request body in processSignature:', req.body);
  console.log('User in processSignature:', user);

  if (!user) {
    return res.status(401).json({ success: false, message: 'Unauthorized: No user found' });
  }

  if (!employee_id) {
    return res.status(400).json({ success: false, message: 'Missing employee_id' });
  }
  if (!bac_position) {
    return res.status(400).json({ success: false, message: 'Missing bac_position' });
  }
  if (!approval_status) {
    return res.status(400).json({ success: false, message: 'Missing approval_status' });
  }

  if (!['approved', 'declined'].includes(approval_status)) {
    return res.status(400).json({ success: false, message: 'Invalid approval_status. Must be "approved" or "declined"' });
  }

  if (approval_status === 'declined' && (!comment || !comment.trim())) {
    return res.status(400).json({ success: false, message: 'Comment is required when declining the request' });
  }

  // Fallback for bac_position if user_type is 'bac'
  const effectiveBacPosition = bac_position || (user.user_type === 'bac' ? 'BAC Member' : null);
  if (!effectiveBacPosition) {
    return res.status(400).json({ success: false, message: 'Invalid or missing BAC position' });
  }

  RequestsModel.getBacId(pr_id, (err, request) => {
    if (err) {
      console.error('Error fetching request:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch request: ' + err.message });
    }
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }
    if (request.status !== 'e-sign') {
      return res.status(400).json({ success: false, message: 'Request is not in e-sign status' });
    }

    // Authorization check
    const isAuthorized =
      user.user_type === 'bac' ||
      user.employee_name === request.requested_by ||
      user.bac_position === 'City Treasurer' ||
      user.bac_position === 'City Mayor';

    if (!isAuthorized) {
      return res.status(403).json({ success: false, message: `You are not authorized to review this request (User: ${user.employee_name}, Role: ${user.user_type}, BAC Position: ${user.bac_position || 'None'})` });
    }

    // Check if user has already reviewed
    const userHasSigned =
      (user.employee_name === request.requested_by && request.requested_by_status !== 'pending') ||
      (effectiveBacPosition === 'City Treasurer' && request.cash_availability_status !== 'pending') ||
      (effectiveBacPosition === 'City Mayor' && request.approved_by_status !== 'pending') ||
      (effectiveBacPosition === 'BAC Member 1' && request.bac_1_status !== 'pending') ||
      (effectiveBacPosition === 'BAC Member 2' && request.bac_2_status !== 'pending') ||
      (effectiveBacPosition === 'BAC Member 3' && request.bac_3_status !== 'pending') ||
      (effectiveBacPosition === 'BAC Vice Chairman' && request.bac_vice_status !== 'pending') ||
      (effectiveBacPosition === 'BAC Chairman' && request.bac_chairman_status !== 'pending') ||
      (effectiveBacPosition === 'BAC Secretariat' && request.bac_secretariat_status !== 'pending') ||
      (effectiveBacPosition === 'BAC Member' && request.bac_1_status !== 'pending');

    if (userHasSigned) {
      return res.status(403).json({ success: false, message: 'You have already reviewed this request' });
    }

    RequestsModel.updateBacStatus(
      pr_id,
      employee_id,
      effectiveBacPosition,
      approval_status,
      comment,
      (err, result) => {
        if (err) {
          console.error('Error updating BAC status:', err);
          return res.status(500).json({ success: false, message: 'Failed to update status: ' + err.message });
        }

        checkAllSignaturesComplete(pr_id, res);
      }
    );
  });
};

function checkAllSignaturesComplete(pr_id, res) {
  RequestsModel.checkAllSignaturesComplete(pr_id, (err, { allApproved }) => {
    if (err) {
      console.error('Error checking signatures:', err);
      return res.status(500).json({ success: false, message: 'Error checking signatures: ' + err.message });
    }

    if (allApproved) {
      RequestsModel.updateStatus(pr_id, 'approved', (err) => {
        if (err) {
          console.error('Error updating request status:', err);
          return res.status(500).json({ success: false, message: 'Failed to update request status: ' + err.message });
        }
        res.json({ success: true, message: 'All signatures complete, request approved', statusUpdated: true });
      });
    } else {
      res.json({ success: true, message: 'Review submitted successfully', statusUpdated: false });
    }
  });
}

exports.postRequest = async (req, res) => {
  try {
    const { prId } = req.params;
    const { posted_by, posted_at, deadline, status } = req.body;
    const user = req.session.user || req.user;

    console.log('Received prId:', prId);
    console.log('Received body:', req.body);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Restrict to superadmin or BAC roles
    if (!['superadmin', 'bac'].includes(user.user_type)) {
      return res.status(403).json({ success: false, message: 'Only superadmin or BAC members can post requests for bidding' });
    }

    // Validate required fields
    if (!prId || !posted_by || !posted_at || !deadline || !status) {
      return res.status(400).json({ 
        success: false, 
        message: 'All bidding fields are required',
        missing: {
          prId: !prId,
          posted_by: !posted_by,
          posted_at: !posted_at,
          deadline: !deadline,
          status: !status
        }
      });
    }

    // Validate status
    if (!['open', 'closed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    // Validate dates
    const postedAtDate = new Date(posted_at);
    const deadlineDate = new Date(deadline);
    if (isNaN(postedAtDate) || isNaN(deadlineDate)) {
      return res.status(400).json({ success: false, message: 'Invalid date format' });
    }
    if (deadlineDate <= postedAtDate) {
      return res.status(400).json({ success: false, message: 'Deadline must be after posted_at date' });
    }

    // Check if PR exists and is approved
    const request = await new Promise((resolve, reject) => {
      db.query('SELECT * FROM purchase_requests WHERE pr_id = ?', [prId], (err, results) => {
        if (err) return reject(err);
        if (!results[0]) return reject(new Error('Request not found'));
        resolve(results[0]);
      });
    });

    if (request.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'Only approved requests can be posted for bidding' });
    }

    // Insert into biddings table
    const bidResult = await new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO biddings 
        (pr_id, posted_by, posted_at, deadline, status) 
        VALUES (?, ?, ?, ?, ?)
      `;
      db.query(sql, [prId, posted_by, posted_at, deadline, status], (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });

    const bidding_id = bidResult.insertId;

    // Update PR status to 'posted'
    await new Promise((resolve, reject) => {
      db.query('UPDATE purchase_requests SET status = ? WHERE pr_id = ?', ['posted', prId], (err, result) => {
        if (err) return reject(err);
        if (result.affectedRows === 0) return reject(new Error('Failed to update request status'));
        resolve(result);
      });
    });

    res.json({ success: true, message: 'Request posted for bidding successfully', bidding_id });
  } catch (error) {
    console.error('Error posting request for bidding:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

exports.getPostedRequests = async (req, res) => {
  try {
    const user = req.session.supplier || req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const query = `
      SELECT 
        pr.pr_id, pr.lgu, pr.fund, pr.department, pr.section, pr.fpp, 
        pr.date_requested, pr.total, pr.purpose, pr.requested_by, 
        pr.cash_availability, pr.approved_by, pr.status, 
        pri.item_no, pri.unit, pri.item_description, pri.quantity, pri.unit_cost, pri.total_cost
      FROM purchase_requests pr
      LEFT JOIN purchase_request_items pri ON pr.pr_id = pri.pr_id
      WHERE pr.status = 'posted' AND pr.is_archived = 0
      ORDER BY pr.pr_id DESC, pri.item_no
    `;

    const results = await new Promise((resolve, reject) => {
      db.query(query, (err, results) => {
        if (err) return reject(err);
        resolve(results);
      });
    });

    // Group items by pr_id
    const groupedRequests = results.reduce((acc, row) => {
      if (!acc[row.pr_id]) {
        acc[row.pr_id] = {
          pr_id: row.pr_id,
          lgu: row.lgu,
          fund: row.fund,
          department: row.department,
          section: row.section,
          fpp: row.fpp,
          date_requested: row.date_requested,
          total: row.total,
          purpose: row.purpose,
          requested_by: row.requested_by,
          cash_availability: row.cash_availability,
          approved_by: row.approved_by,
          status: row.status,
          items: []
        };
      }
      if (row.item_no) {
        acc[row.pr_id].items.push({
          item_no: row.item_no,
          unit: row.unit,
          item_description: row.item_description,
          quantity: row.quantity,
          unit_cost: row.unit_cost,
          total_cost: row.total_cost
        });
      }
      return acc;
    }, {});

    res.json({ success: true, requests: Object.values(groupedRequests) });
  } catch (error) {
    console.error('Error fetching posted requests:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.submitSupplierBid = async (req, res) => {
  try {
    const { bidding_id } = req.params;
    const { supplier_id, total_amount, notes, items } = req.body;
    const user = req.session.supplier || req.user;

    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Validate required fields
    if (!supplier_id || total_amount == null || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Missing or invalid bid data' });
    }

    // Validate items structure
    for (const item of items) {
      if (!item.item_id || item.unit_price == null || item.quantity == null || item.unit_price < 0 || item.quantity < 0) {
        return res.status(400).json({ success: false, message: 'Invalid item data' });
      }
    }

    // Verify supplier_id matches authenticated user
    if (user.supplier_id && user.supplier_id !== supplier_id) {
      return res.status(403).json({ success: false, message: 'Supplier ID does not match authenticated user' });
    }

    // Verify total_amount matches sum of item totals
    const calculatedTotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    if (Math.abs(calculatedTotal - total_amount) > 0.01) {
      return res.status(400).json({ success: false, message: 'Total amount does not match item totals' });
    }

    // Check if bidding exists and is open
    const bidding = await new Promise((resolve, reject) => {
      db.query('SELECT * FROM biddings WHERE bidding_id = ? AND status = "open"', [bidding_id], (err, results) => {
        if (err) return reject(err);
        if (!results[0]) return reject(new Error('Bidding not found or closed'));
        resolve(results[0]);
      });
    });

    // Insert into supplier_bids
    const bidResult = await new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO supplier_bids 
        (bidding_id, supplier_id, submitted_at, status, total_amount, notes) 
        VALUES (?, ?, NOW(), 'pending', ?, ?)
      `;
      db.query(sql, [bidding_id, supplier_id, total_amount, notes || ''], (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });

    const bid_id = bidResult.insertId;

    // Insert bid items
    await Promise.all(items.map(item => {
      return new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO bid_items 
          (bid_id, item_id, unit_price, quantity, total_price) 
          VALUES (?, ?, ?, ?, ?)
        `;
        db.query(sql, [
          bid_id,
          item.item_id,
          item.unit_price,
          item.quantity,
          item.unit_price * item.quantity
        ], (err, result) => {
          if (err) return reject(err);
          resolve(result);
        });
      });
    }));

    res.json({ success: true, message: 'Bid submitted successfully', bid_id });
  } catch (error) {
    console.error('Error submitting supplier bid:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

exports.postRequestForBidding = async (req, res) => {
  try {
    const { pr_id } = req.params;
    const { posted_by, posted_at, deadline, status } = req.body;
    const user = req.session.user || req.user;

    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Validate required fields
    if (!pr_id || !posted_by || !posted_at || !deadline || !status) {
      return res.status(400).json({ success: false, message: 'All bidding fields are required' });
    }

    // Validate status
    if (!['open', 'closed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    // Validate dates
    const postedAtDate = new Date(posted_at);
    const deadlineDate = new Date(deadline);
    if (isNaN(postedAtDate) || isNaN(deadlineDate)) {
      return res.status(400).json({ success: false, message: 'Invalid date format' });
    }
    if (deadlineDate <= postedAtDate) {
      return res.status(400).json({ success: false, message: 'Deadline must be after posted_at date' });
    }

    // Validate purchase request exists
    const pr = await new Promise((resolve, reject) => {
      db.query('SELECT * FROM purchase_requests WHERE pr_id = ?', [pr_id], (err, results) => {
        if (err) return reject(err);
        if (!results[0]) return reject(new Error('Purchase request not found'));
        resolve(results[0]);
      });
    });

    // Insert into biddings table
    const bidResult = await new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO biddings 
        (pr_id, posted_by, posted_at, deadline, status) 
        VALUES (?, ?, ?, ?, ?)
      `;
      db.query(sql, [pr_id, posted_by, posted_at, deadline, status], (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });

    const bidding_id = bidResult.insertId;

    res.json({ success: true, message: 'Bidding posted successfully', bidding_id });
  } catch (error) {
    console.error('Error posting request for bidding:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};
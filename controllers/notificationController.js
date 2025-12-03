const NotificationModel = require('../models/notificationModel');
const RequestsModel = require('../models/requestsModel');
const nodemailer = require('nodemailer');

exports.requestFollowUp = async (req, res) => {
  try {
    const { pr_id } = req.params;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Verify purchase request exists and user is the requester
    const request = await new Promise((resolve, reject) => {
      RequestsModel.getById(pr_id, (err, result) => {
        if (err) return reject(err);
        if (!result) return reject(new Error('Purchase request not found'));
        resolve(result);
      });
    });

    if (request.requested_by !== user.employee_name) {
      return res.status(403).json({ success: false, message: 'Only the requester can request a follow-up' });
    }

    // Create notification
    const notificationData = {
      pr_id,
      user_id: user.employee_id,
      type: 'follow-up',
      message: `Follow-up requested for PR ID: ${pr_id} by ${user.employee_name}`,
      status: 'pending'
    };

    await new Promise((resolve, reject) => {
      NotificationModel.createNotification(notificationData, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });

    // Send email notification to BAC members
    const bacMembers = await new Promise((resolve, reject) => {
      NotificationModel.getBacMembers((err, results) => {
        if (err) return reject(err);
        resolve(results);
      });
    });

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

    const mailOptions = {
      from: `"eGOV-RMS Procurement" <${process.env.EMAIL_USER}>`,
      to: bacMembers.map(member => member.email).join(','),
      subject: `Follow-up Request for PR ID: ${pr_id}`,
      html: `
        <p>Dear BAC Members,</p>
        <p>${user.employee_name} has requested a follow-up for Purchase Request ID: ${pr_id}.</p>
        <p><strong>Request Details:</strong></p>
        <ul>
          <li>PR ID: ${pr_id}</li>
          <li>Department: ${request.department}</li>
          <li>Purpose: ${request.purpose}</li>
          <li>Total Amount: ₱${parseFloat(request.total).toLocaleString('en-PH', {minimumFractionDigits: 2})}</li>
          <li>Date Requested: ${new Date(request.date_requested).toLocaleDateString()}</li>
        </ul>
        <p>Please review the request and provide any necessary updates or comments.</p>
        <p>Thank you,<br>eGOV-RMS Procurement System</p>
      `
    };

    await transporter.sendMail(mailOptions);

    res.json({ 
      success: true, 
      message: 'Follow-up request submitted successfully and notifications sent to BAC members'
    });
  } catch (error) {
    console.error('Error processing follow-up request:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to process follow-up request'
    });
  }
};

exports.requestFollowUp = async (req, res) => {
  try {
    const { pr_id } = req.params;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Verify purchase request exists and user is the requester
    const request = await new Promise((resolve, reject) => {
      RequestsModel.getById(pr_id, (err, result) => {
        if (err) return reject(err);
        if (!result) return reject(new Error('Purchase request not found'));
        resolve(result);
      });
    });

    if (request.requested_by !== user.employee_name) {
      return res.status(403).json({ success: false, message: 'Only the requester can request a follow-up' });
    }

    // Create notification
    const notificationData = {
      pr_id,
      user_id: user.employee_id,
      type: 'follow-up',
      message: `Follow-up requested for PR ID: ${pr_id} by ${user.employee_name}`,
      status: 'pending'
    };

    await new Promise((resolve, reject) => {
      NotificationModel.createNotification(notificationData, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });

    // Send email notification to BAC members
    const bacMembers = await new Promise((resolve, reject) => {
      NotificationModel.getBacMembers((err, results) => {
        if (err) return reject(err);
        resolve(results);
      });
    });

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

    const mailOptions = {
      from: `"eGOV-RMS Procurement" <${process.env.EMAIL_USER}>`,
      to: bacMembers.map(member => member.email).join(','),
      subject: `Follow-up Request for PR ID: ${pr_id}`,
      html: `
        <p>Dear BAC Members,</p>
        <p>${user.employee_name} has requested a follow-up for Purchase Request ID: ${pr_id}.</p>
        <p><strong>Request Details:</strong></p>
        <ul>
          <li>PR ID: ${pr_id}</li>
          <li>Department: ${request.department}</li>
          <li>Purpose: ${request.purpose}</li>
          <li>Total Amount: ₱${parseFloat(request.total).toLocaleString('en-PH', {minimumFractionDigits: 2})}</li>
          <li>Date Requested: ${new Date(request.date_requested).toLocaleDateString()}</li>
        </ul>
        <p>Please review the request and provide any necessary updates or comments.</p>
        <p>Thank you,<br>eGOV-RMS Procurement System</p>
      `
    };

    await transporter.sendMail(mailOptions);

    res.json({ 
      success: true, 
      message: 'Follow-up request submitted successfully and notifications sent to BAC members'
    });
  } catch (error) {
    console.error('Error processing follow-up request:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to process follow-up request'
    });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.employee_id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const count = await new Promise((resolve, reject) => {
      NotificationModel.getUnreadCount(user.employee_id, (err, result) => {
        if (err) return reject(err);
        resolve(result.count);
      });
    });

    res.json({ success: true, count });
  } catch (error) {
    console.error('Error fetching unread notification count:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notification count' });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.employee_id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const notifications = await new Promise((resolve, reject) => {
      NotificationModel.getNotificationsByUser(user.employee_id, (err, results) => {
        if (err) return reject(err);
        resolve(results);
      });
    });

    res.render('notifications', { notifications, user });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    if (!user || !user.employee_id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    await new Promise((resolve, reject) => {
      NotificationModel.markAsRead(id, user.employee_id, (err, result) => {
        if (err) return reject(err);
        if (result.affectedRows === 0) {
          return reject(new Error('Notification not found or not authorized'));
        }
        resolve(result);
      });
    });

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ success: false, message: 'Failed to mark notification as read' });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.employee_id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    await new Promise((resolve, reject) => {
      NotificationModel.markAllAsRead(user.employee_id, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ success: false, message: 'Failed to mark all notifications as read' });
  }
};
const db = require('../config/db');

const NotificationModel = {
  createNotification: (data, callback) => {
    const query = `
      INSERT INTO notifications 
      (pr_id, user_id, type, message, status) 
      VALUES (?, ?, ?, ?, ?)
    `;
    db.query(query, [data.pr_id, data.user_id, data.type, data.message, data.status], callback);
  },

  getBacMembers: (callback) => {
    const query = `
      SELECT email 
      FROM employees 
      WHERE user_type = 'bac' OR bac_position IS NOT NULL
    `;
    db.query(query, callback);
  },

  getUnreadCount: (employee_id, callback) => {
    const query = `
      SELECT COUNT(*) as count 
      FROM notifications 
      WHERE user_id = ? AND status = 'pending'
    `;
    db.query(query, [employee_id], (err, results) => {
      if (err) return callback(err);
      callback(null, results[0]);
    });
  },

  getNotificationsByUser: (employee_id, callback) => {
    const query = `
      SELECT notification_id, pr_id, type, message, status, created_at 
      FROM notifications 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `;
    db.query(query, [employee_id], callback);
  },

  markAsRead: (notification_id, employee_id, callback) => {
    const query = `
      UPDATE notifications 
      SET status = 'read' 
      WHERE notification_id = ? AND user_id = ?
    `;
    db.query(query, [notification_id, employee_id], callback);
  },

  markAllAsRead: (employee_id, callback) => {
    const query = `
      UPDATE notifications 
      SET status = 'read' 
      WHERE user_id = ? AND status = 'pending'
    `;
    db.query(query, [employee_id], callback);
  }
};

module.exports = NotificationModel;

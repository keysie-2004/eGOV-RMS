const db = require('../config/db');
const socket = require('../socket'); // You'll need to create this

const Chat = {
  sendMessage: (chatType, senderId, receiverId, message, callback) => {
    if (chatType === 'general') {
      const sql = 'INSERT INTO general_chat (sender_id, message) VALUES (?, ?)';
      db.query(sql, [senderId, message], (err, result) => {
        if (err) return callback(err);
        callback(null, { insertId: result.insertId, chatId: null });
      });
    } else if (chatType === 'private') {
      // First find or create a chat_id between these two users
      const findChatSql = `SELECT chat_id FROM private_chats 
                          WHERE (user1_id = ? AND user2_id = ?)
                          OR (user1_id = ? AND user2_id = ?)`;
      db.query(findChatSql, [senderId, receiverId, receiverId, senderId], (err, results) => {
        if (err) return callback(err);
        
        let chatId;
        if (results.length > 0) {
          chatId = results[0].chat_id;
          insertMessage();
        } else {
          // Create new private chat
          const createChatSql = 'INSERT INTO private_chats (user1_id, user2_id) VALUES (?, ?)';
          db.query(createChatSql, [senderId, receiverId], (err, result) => {
            if (err) return callback(err);
            chatId = result.insertId;
            insertMessage();
          });
        }
        
        function insertMessage() {
          const sql = 'INSERT INTO private_chat (chat_id, sender_id, receiver_id, message) VALUES (?, ?, ?, ?)';
          db.query(sql, [chatId, senderId, receiverId, message], (err, result) => {
            if (err) return callback(err);
            callback(null, { insertId: result.insertId, chatId });
          });
        }
      });
    }
  },

  getChatHistory: (chatType, chatId, callback) => {
    if (chatType === 'general') {
      const sql = `SELECT gc.message_id as id, gc.message, gc.timestamp, 
                  e.employee_id as sender_id, e.employee_name
                  FROM general_chat gc
                  JOIN employees e ON gc.sender_id = e.employee_id
                  ORDER BY gc.timestamp DESC
                  LIMIT 100`;
      
      db.query(sql, (err, results) => {
        if (err) return callback(err);
        callback(null, results.reverse());
      });
    } else if (chatType === 'private') {
      const sql = `SELECT pc.message_id as id, pc.message, pc.timestamp, 
                  e.employee_id as sender_id, e.employee_name, pc.receiver_id
                  FROM private_chat pc
                  JOIN employees e ON pc.sender_id = e.employee_id
                  WHERE pc.chat_id = ?
                  ORDER BY pc.timestamp DESC
                  LIMIT 100`;
      
      db.query(sql, [chatId], (err, results) => {
        if (err) return callback(err);
        callback(null, results.reverse());
      });
    }
  },

  getNewMessages: (chatType, chatId, lastId, callback) => {
    if (chatType === 'general') {
      const sql = `SELECT gc.message_id as id, gc.message, gc.timestamp, 
                  e.employee_id as sender_id, e.employee_name
                  FROM general_chat gc
                  JOIN employees e ON gc.sender_id = e.employee_id
                  WHERE gc.message_id > ?
                  ORDER BY gc.timestamp ASC`;
      
      db.query(sql, [lastId], (err, results) => {
        if (err) return callback(err);
        callback(null, results);
      });
    } else if (chatType === 'private') {
      const sql = `SELECT pc.message_id as id, pc.message, pc.timestamp, 
                  e.employee_id as sender_id, e.employee_name, pc.receiver_id
                  FROM private_chat pc
                  JOIN employees e ON pc.sender_id = e.employee_id
                  WHERE pc.chat_id = ? AND pc.message_id > ?
                  ORDER BY pc.timestamp ASC`;
      
      db.query(sql, [chatId, lastId], (err, results) => {
        if (err) return callback(err);
        callback(null, results);
      });
    }
  },

  getPrivateChats: (userId, callback) => {
    const sql = `SELECT 
                pc.chat_id,
                CASE 
                  WHEN pc.user1_id = ? THEN u2.employee_id
                  ELSE u1.employee_id
                END as other_user_id,
                CASE 
                  WHEN pc.user1_id = ? THEN u2.employee_name
                  ELSE u1.employee_name
                END as other_user_name,
                CASE 
                  WHEN pc.user1_id = ? THEN u2.profile_image
                  ELSE u1.profile_image
                END as other_user_image,
                last_msg.message as last_message,
                last_msg.timestamp as last_message_time,
                (SELECT COUNT(*) FROM private_chat 
                 WHERE chat_id = pc.chat_id 
                 AND receiver_id = ? AND is_read = FALSE) as unread_count
              FROM private_chats pc
              LEFT JOIN employees u1 ON pc.user1_id = u1.employee_id
              LEFT JOIN employees u2 ON pc.user2_id = u2.employee_id
              LEFT JOIN (
                SELECT chat_id, message, timestamp 
                FROM private_chat 
                WHERE (chat_id, timestamp) IN (
                  SELECT chat_id, MAX(timestamp) 
                  FROM private_chat 
                  GROUP BY chat_id
                )
              ) last_msg ON pc.chat_id = last_msg.chat_id
              WHERE pc.user1_id = ? OR pc.user2_id = ?
              ORDER BY last_msg.timestamp DESC`;
    
    db.query(sql, [userId, userId, userId, userId, userId, userId], (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  },

  getMessageById: (messageId, isPrivate, callback) => {
    if (isPrivate) {
      const sql = `SELECT pc.message_id as id, pc.message, pc.timestamp, 
                  e.employee_id as sender_id, e.employee_name, pc.receiver_id, pc.chat_id
                  FROM private_chat pc
                  JOIN employees e ON pc.sender_id = e.employee_id
                  WHERE pc.message_id = ?`;
      db.query(sql, [messageId], (err, results) => {
        if (err) return callback(err);
        callback(null, results[0]);
      });
    } else {
      const sql = `SELECT gc.message_id as id, gc.message, gc.timestamp, 
                  e.employee_id as sender_id, e.employee_name
                  FROM general_chat gc
                  JOIN employees e ON gc.sender_id = e.employee_id
                  WHERE gc.message_id = ?`;
      db.query(sql, [messageId], (err, results) => {
        if (err) return callback(err);
        callback(null, results[0]);
      });
    }
  },

  markMessagesAsRead: (chatId, userId, callback) => {
    const sql = `UPDATE private_chat 
                SET is_read = TRUE 
                WHERE chat_id = ? AND receiver_id = ? AND is_read = FALSE`;
    db.query(sql, [chatId, userId], (err, result) => {
      if (err) return callback(err);
      callback(null, result);
    });
  },
  sendSupportMessage: (senderId, message, callback) => {
    // First find or create a support chat for this user
    const findChatSql = `SELECT chat_id FROM support_chats WHERE user_id = ?`;
    db.query(findChatSql, [senderId], (err, results) => {
      if (err) return callback(err);
      
      let chatId;
      if (results.length > 0) {
        chatId = results[0].chat_id;
        insertMessage();
      } else {
        // Create new support chat
        const createChatSql = 'INSERT INTO support_chats (user_id) VALUES (?)';
        db.query(createChatSql, [senderId], (err, result) => {
          if (err) return callback(err);
          chatId = result.insertId;
          insertMessage();
        });
      }
      
      function insertMessage() {
        const sql = 'INSERT INTO support_chat (chat_id, sender_id, message, is_from_support) VALUES (?, ?, ?, ?)';
        db.query(sql, [chatId, senderId, message, false], (err, result) => {
          if (err) return callback(err);
          callback(null, { insertId: result.insertId, chatId });
        });
      }
    });
  },

  sendSupportResponse: (chatId, senderId, message, callback) => {
    const sql = 'INSERT INTO support_chat (chat_id, sender_id, message, is_from_support) VALUES (?, ?, ?, ?)';
    db.query(sql, [chatId, senderId, message, true], (err, result) => {
      if (err) return callback(err);
      callback(null, { insertId: result.insertId, chatId });
    });
  },

  getSupportChatHistory: (chatId, callback) => {
    const sql = `SELECT sc.message_id as id, sc.message, sc.timestamp, 
                e.employee_id as sender_id, e.employee_name, sc.is_from_support
                FROM support_chat sc
                JOIN employees e ON sc.sender_id = e.employee_id
                WHERE sc.chat_id = ?
                ORDER BY sc.timestamp ASC`;
    
    db.query(sql, [chatId], (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  },

  getNewSupportMessages: (chatId, lastId, callback) => {
    const sql = `SELECT sc.message_id as id, sc.message, sc.timestamp, 
                e.employee_id as sender_id, e.employee_name, sc.is_from_support
                FROM support_chat sc
                JOIN employees e ON sc.sender_id = e.employee_id
                WHERE sc.chat_id = ? AND sc.message_id > ?
                ORDER BY sc.timestamp ASC`;
    
    db.query(sql, [chatId, lastId], (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  },

  getSupportChats: (callback) => {
    const sql = `SELECT 
                sc.chat_id,
                u.employee_id as user_id,
                u.employee_name as user_name,
                u.profile_image as user_image,
                last_msg.message as last_message,
                last_msg.timestamp as last_message_time,
                (SELECT COUNT(*) FROM support_chat 
                 WHERE chat_id = sc.chat_id 
                 AND is_from_support = FALSE AND is_read = FALSE) as unread_count
              FROM support_chats sc
              JOIN employees u ON sc.user_id = u.employee_id
              LEFT JOIN (
                SELECT chat_id, message, timestamp 
                FROM support_chat 
                WHERE (chat_id, timestamp) IN (
                  SELECT chat_id, MAX(timestamp) 
                  FROM support_chat 
                  GROUP BY chat_id
                )
              ) last_msg ON sc.chat_id = last_msg.chat_id
              ORDER BY last_msg.timestamp DESC`;
    
    db.query(sql, (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  },

markSupportMessagesAsRead: (chatId, callback) => {
  const sql = `UPDATE support_chat 
              SET is_read = TRUE 
              WHERE chat_id = ? AND is_from_support = FALSE AND is_read = FALSE`;
  db.query(sql, [chatId], (err, result) => {
    if (err) return callback(err);
    callback(null, result);
  });
},

  getSupportMessageById: (messageId, callback) => {
    const sql = `SELECT sc.message_id as id, sc.message, sc.timestamp, 
                e.employee_id as sender_id, e.employee_name, sc.is_from_support, sc.chat_id
                FROM support_chat sc
                JOIN employees e ON sc.sender_id = e.employee_id
                WHERE sc.message_id = ?`;
    db.query(sql, [messageId], (err, results) => {
      if (err) return callback(err);
      callback(null, results[0]);
    });
  },
getSupportChatInfo: (chatId, callback) => {
  const sql = 'SELECT user_id FROM support_chats WHERE chat_id = ?';
  db.query(sql, [chatId], (err, results) => {
    if (err) return callback(err);
    callback(null, results[0] || null);
  });
},

getOrCreateSupportChat: (userId, callback) => {
  // First try to find existing chat
  const findSql = 'SELECT chat_id FROM support_chats WHERE user_id = ?';
  db.query(findSql, [userId], (err, results) => {
    if (err) return callback(err);
    
    if (results.length > 0) {
      // Return existing chat
      callback(null, { chat_id: results[0].chat_id });
    } else {
      // Create new support chat
      const createSql = 'INSERT INTO support_chats (user_id) VALUES (?)';
      db.query(createSql, [userId], (err, result) => {
        if (err) return callback(err);
        callback(null, { chat_id: result.insertId });
      });
    }
  });
},
  
};

module.exports = Chat;
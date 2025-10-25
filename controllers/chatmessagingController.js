const Chat = require('../models/chatmessagingModel');
const Employee = require('../models/employeeModel');
const db = require('../config/db'); // Make sure this path matches your db configuration file


const handleError = (res, error, status = 500) => {
  console.error(error);
  res.status(status).json({ 
    success: false, 
    message: error.message || 'Server error' 
  });
};

const formatChatHistory = (history, currentUserId) => {
  return history.map(msg => ({
    ...msg,
    isCurrentUser: msg.sender_id === currentUserId,
    formattedTime: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }));
};

module.exports = {
  getGeneralChat: async (req, res) => {
    try {
      const employees = await new Promise((resolve, reject) => {
        Employee.getAllActive((err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });

      const history = await new Promise((resolve, reject) => {
        Chat.getChatHistory('general', null, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });

      res.render('chat/general', {
        user: req.user,
        employees,
        chatType: 'general',
        history: formatChatHistory(history, req.user.id)
      });
    } catch (error) {
      handleError(res, error);
    }
  },

  getPrivateChat: async (req, res) => {
    try {
      const chatId = req.params.chatId;
      const receiverId = req.params.receiverId;
      
      const employees = await new Promise((resolve, reject) => {
        Employee.getAllActive((err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });

      // Get chat history
      const history = await new Promise((resolve, reject) => {
        Chat.getChatHistory('private', chatId, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });

      // Get all private chats for sidebar
      const privateChats = await new Promise((resolve, reject) => {
        Chat.getPrivateChats(req.user.id, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });

      // Get receiver info
      let receiver = null;
      if (receiverId) {
        receiver = await new Promise((resolve, reject) => {
          Employee.getById(receiverId, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });

        // Mark messages as read
        await new Promise((resolve, reject) => {
          Chat.markMessagesAsRead(chatId, req.user.id, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      res.render('chat/private', {
        user: req.user,
        employees,
        privateChats,
        chatType: 'private',
        chatId,
        receiver,
        history: formatChatHistory(history, req.user.id)
      });
    } catch (error) {
      handleError(res, error);
    }
  },

  getChatHistory: (req, res) => {
    try {
      const currentUserId = req.user.id;
      const { chatType, chatId } = req.query;

      Chat.getChatHistory(chatType, chatId, (err, history) => {
        if (err) return handleError(res, err);
        
        res.json({ 
          success: true, 
          history: formatChatHistory(history, currentUserId)
        });
      });
    } catch (error) {
      handleError(res, error);
    }
  },

  getNewMessages: (req, res) => {
    try {
      const currentUserId = req.user.id;
      const lastId = parseInt(req.query.lastId) || 0;
      const { chatType, chatId } = req.query;

      Chat.getNewMessages(chatType, chatId, lastId, (err, newMessages) => {
        if (err) return handleError(res, err);
        
        res.json({ 
          success: true, 
          newMessages: formatChatHistory(newMessages, currentUserId)
        });
      });
    } catch (error) {
      handleError(res, error);
    }
  },

  sendMessage: (req, res) => {
    try {
      const { chatType, message, receiverId, chatId } = req.body;
      const senderId = req.user.id;
      
      if (!message?.trim()) {
        return handleError(res, new Error('Message cannot be empty'), 400);
      }

      Chat.sendMessage(chatType, senderId, receiverId, message, (err, result) => {
        if (err) return handleError(res, err);
        
        // Get the newly created message
        Chat.getMessageById(result.insertId, chatType === 'private', (err, message) => {
          if (err) return handleError(res, err);
          
          res.json({ 
            success: true,
            messageId: result.insertId,
            chatId: result.chatId || chatId,
            message: message
          });
        });
      });
    } catch (error) {
      handleError(res, error, 400);
    }
  },

  getPrivateChats: (req, res) => {
    try {
      Chat.getPrivateChats(req.user.id, (err, privateChats) => {
        if (err) return handleError(res, err);
        
        res.json({ 
          success: true, 
          privateChats 
        });
      });
    } catch (error) {
      handleError(res, error);
    }
  },

  searchEmployees: (req, res) => {
    try {
      const searchTerm = req.query.term;
      const currentUserId = req.user.id;
      
      Employee.search(searchTerm, currentUserId, (err, results) => {
        if (err) return handleError(res, err);
        
        res.json({ 
          success: true, 
          employees: results 
        });
      });
    } catch (error) {
      handleError(res, error);
    }
  },

  markMessagesAsRead: (req, res) => {
    try {
      const { chatId } = req.body;
      const userId = req.user.id;
      
      Chat.markMessagesAsRead(chatId, userId, (err) => {
        if (err) return handleError(res, err);
        
        res.json({ 
          success: true
        });
      });
    } catch (error) {
      handleError(res, error);
    }
  },

getSupportChat: async (req, res) => {
    try {
      const employees = await new Promise((resolve, reject) => {
        Employee.getAllActive((err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });

      let chatId = req.params.chatId;
      let history = [];
      let receiver = null;

      if (req.user.user_type === 'superadmin') {
        // Superadmin viewing a specific support chat
        if (chatId) {
          history = await new Promise((resolve, reject) => {
            Chat.getSupportChatHistory(chatId, (err, results) => {
              if (err) reject(err);
              else resolve(results);
            });
          });

          // Mark messages as read
          await new Promise((resolve, reject) => {
            Chat.markSupportMessagesAsRead(chatId, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          // Get user info for this chat using the Chat model
          const chatInfo = await new Promise((resolve, reject) => {
            Chat.getSupportChatInfo(chatId, (err, results) => {
              if (err) reject(err);
              else resolve(results);
            });
          });

          if (chatInfo) {
            receiver = await new Promise((resolve, reject) => {
              Employee.getById(chatInfo.user_id, (err, result) => {
                if (err) reject(err);
                else resolve(result);
              });
            });
          }
        }
      } else {
        // Regular user - find or create their support chat using the Chat model
        const supportChat = await new Promise((resolve, reject) => {
          Chat.getOrCreateSupportChat(req.user.id, (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });

        chatId = supportChat.chat_id;

        // Get chat history
        history = await new Promise((resolve, reject) => {
          Chat.getSupportChatHistory(chatId, (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });
      }

      // Get all support chats for superadmin sidebar
      let supportChats = [];
      if (req.user.user_type === 'superadmin') {
        supportChats = await new Promise((resolve, reject) => {
          Chat.getSupportChats((err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });
      }

      // Format history with isCurrentUser flag
      const formattedHistory = history.map(msg => ({
        ...msg,
        isCurrentUser: msg.sender_id === req.user.id,
        formattedTime: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }));

      res.render('chat/support', {
        user: req.user,
        employees,
        supportChats,
        chatType: 'support',
        chatId,
        receiver,
        history: formattedHistory
      });
    } catch (error) {
      handleError(res, error);
    }
  },
  
  getSupportChatHistory: (req, res) => {
    try {
      const currentUserId = req.user.id;
      const { chatId } = req.query;

      Chat.getSupportChatHistory(chatId, (err, history) => {
        if (err) return handleError(res, err);
        
        res.json({ 
          success: true, 
          history: history.map(msg => ({
            ...msg,
            isCurrentUser: msg.sender_id === currentUserId,
            formattedTime: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }))
        });
      });
    } catch (error) {
      handleError(res, error);
    }
  },

  getNewSupportMessages: (req, res) => {
    try {
      const currentUserId = req.user.id;
      const lastId = parseInt(req.query.lastId) || 0;
      const { chatId } = req.query;

      Chat.getNewSupportMessages(chatId, lastId, (err, newMessages) => {
        if (err) return handleError(res, err);
        
        res.json({ 
          success: true, 
          newMessages: newMessages.map(msg => ({
            ...msg,
            isCurrentUser: msg.sender_id === currentUserId,
            formattedTime: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }))
        });
      });
    } catch (error) {
      handleError(res, error);
    }
  },

  sendSupportMessage: (req, res) => {
    try {
      const { message, chatId } = req.body;
      const senderId = req.user.id;
      
      if (!message?.trim()) {
        return handleError(res, new Error('Message cannot be empty'), 400);
      }

      if (req.user.user_type === 'superadmin') {
        // Superadmin is responding to a support request
        Chat.sendSupportResponse(chatId, senderId, message, (err, result) => {
          if (err) return handleError(res, err);
          
          // Get the newly created message
          Chat.getSupportMessageById(result.insertId, (err, message) => {
            if (err) return handleError(res, err);
            
            res.json({ 
              success: true,
              messageId: result.insertId,
              chatId: result.chatId || chatId,
              message: {
                ...message,
                isCurrentUser: true,
                formattedTime: new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }
            });
          });
        });
      } else {
        // Regular user is creating a support request
        Chat.sendSupportMessage(senderId, message, (err, result) => {
          if (err) return handleError(res, err);
          
          // Get the newly created message
          Chat.getSupportMessageById(result.insertId, (err, message) => {
            if (err) return handleError(res, err);
            
            res.json({ 
              success: true,
              messageId: result.insertId,
              chatId: result.chatId || chatId,
              message: {
                ...message,
                isCurrentUser: true,
                formattedTime: new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }
            });
          });
        });
      }
    } catch (error) {
      handleError(res, error, 400);
    }
  },

  markSupportMessagesAsRead: (req, res) => {
    try {
      const { chatId } = req.body;
      
      Chat.markSupportMessagesAsRead(chatId, (err) => {
        if (err) return handleError(res, err);
        
        res.json({ 
          success: true
        });
      });
    } catch (error) {
      handleError(res, error);
    }
  },

  getSupportChats: (req, res) => {
    try {
      if (req.user.user_type !== 'superadmin') {
        return res.json({ success: true, supportChats: [] });
      }

      Chat.getSupportChats((err, supportChats) => {
        if (err) return handleError(res, err);
        
        res.json({ 
          success: true, 
          supportChats 
        });
      });
    } catch (error) {
      handleError(res, error);
    }
  }
};
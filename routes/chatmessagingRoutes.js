const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatmessagingController');
const { requireAuth } = require('../middlewares/authMiddleware');

// Chat pages
router.get('/general', requireAuth, chatController.getGeneralChat);
router.get('/private/:chatId?/:receiverId?', requireAuth, chatController.getPrivateChat);

// API endpoints
router.post('/send', requireAuth, chatController.sendMessage);
router.get('/history', requireAuth, chatController.getChatHistory);
router.get('/new-messages', requireAuth, chatController.getNewMessages);
router.get('/private-chats', requireAuth, chatController.getPrivateChats);
router.get('/search-employees', requireAuth, chatController.searchEmployees);
router.post('/mark-read', requireAuth, chatController.markMessagesAsRead);


// Add these routes
router.get('/support/:chatId?', requireAuth, chatController.getSupportChat);
router.get('/support/history', requireAuth, chatController.getSupportChatHistory);
router.get('/support/new-messages', requireAuth, chatController.getNewSupportMessages);
router.post('/support/send', requireAuth, chatController.sendSupportMessage);
router.post('/support/mark-read', requireAuth, chatController.markSupportMessagesAsRead);
router.get('/support/chats', requireAuth, chatController.getSupportChats);

module.exports = router;
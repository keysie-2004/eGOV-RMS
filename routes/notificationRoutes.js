
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { requireAuth } = require('../middlewares/authMiddleware');

router.get('/', requireAuth, notificationController.getNotifications);

router.post('/:pr_id/follow-up', requireAuth, notificationController.requestFollowUp);
router.get('/api/unread-count', requireAuth, notificationController.getUnreadCount);
router.patch('/api/:id/mark-read', requireAuth, notificationController.markAsRead);
router.patch('/api/mark-all-read', requireAuth, notificationController.markAllAsRead);

module.exports = router;

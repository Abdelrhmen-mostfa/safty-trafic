const express = require('express');
const router = express.Router();
const gamificationController = require('../controllers/gamification.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// Public routes (no auth required for mobile app)
router.post('/update-score', gamificationController.updateGameScore);

// Protected routes (admin only)
router.use(verifyToken);

// GET /api/gamification/leaderboard - Get top scorers
router.get('/leaderboard', gamificationController.getLeaderboard);

// GET /api/gamification/stats - Get gamification statistics
router.get('/stats', gamificationController.getGamificationStats);

// GET /api/gamification/daily-active - Get daily active players trend
router.get('/daily-active', gamificationController.getDailyActivePlayers);

// GET /api/gamification/engagement - Get engagement metrics
router.get('/engagement', gamificationController.getEngagementMetrics);

// GET /api/gamification/user/:userId/history - Get user game history
router.get('/user/:userId/history', gamificationController.getUserGameHistory);

module.exports = router;

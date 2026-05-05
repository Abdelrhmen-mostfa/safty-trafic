const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(verifyToken);

// GET /api/users - Get all users with pagination
router.get('/', userController.getAllUsers);

// GET /api/users/top-reporters - Get top reporters
router.get('/top-reporters', userController.getTopReporters);

// GET /api/users/:id - Get user by ID with stats
router.get('/:id', userController.getUserById);

// GET /api/users/:id/accuracy - Get user accuracy report
router.get('/:id/accuracy', userController.getUserAccuracy);

// PUT /api/users/:id/status - Update user status
router.put('/:id/status', userController.updateUserStatus);

module.exports = router;

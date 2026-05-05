const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { verifyToken, checkRole } = require('../middleware/auth.middleware');

// All routes require super_admin role
router.use(verifyToken);
router.use(checkRole('super_admin'));

// GET /api/admin/admins - Get all admins
router.get('/admins', adminController.getAllAdmins);

// POST /api/admin/admins - Create new admin
router.post('/admins', adminController.createAdmin);

// PUT /api/admin/admins/:id - Update admin
router.put('/admins/:id', adminController.updateAdmin);

// DELETE /api/admin/admins/:id - Delete admin
router.delete('/admins/:id', adminController.deleteAdmin);

// GET /api/admin/audit-logs - Get audit logs
router.get('/audit-logs', adminController.getAuditLogs);

// GET /api/admin/health - Get system health
router.get('/health', adminController.getSystemHealth);

module.exports = router;

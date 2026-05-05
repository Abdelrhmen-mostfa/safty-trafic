const express = require('express');
const router = express.Router();
const dangerZoneController = require('../controllers/dangerZone.controller');
const { verifyToken, checkRole } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(verifyToken);

// GET /api/danger-zones - Get all danger zones with pagination
router.get('/', dangerZoneController.getAllDangerZones);

// GET /api/danger-zones/map - Get danger zones for map display
router.get('/map', dangerZoneController.getMapDangerZones);

// POST /api/danger-zones - Create new danger zone (admin/super_admin only)
router.post('/', checkRole('admin', 'super_admin'), dangerZoneController.createDangerZone);

// PUT /api/danger-zones/:id - Update danger zone (admin/super_admin only)
router.put('/:id', checkRole('admin', 'super_admin'), dangerZoneController.updateDangerZone);

// DELETE /api/danger-zones/:id - Delete danger zone (super_admin only)
router.delete('/:id', checkRole('super_admin'), dangerZoneController.deleteDangerZone);

module.exports = router;

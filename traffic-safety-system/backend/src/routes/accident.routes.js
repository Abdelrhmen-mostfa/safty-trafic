const express = require('express');
const router = express.Router();
const accidentController = require('../controllers/accident.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(verifyToken);

// GET /api/accidents - Get all accidents with filters
router.get('/', accidentController.getAllAccidents);

// GET /api/accidents/map - Get accidents for map display
router.get('/map', accidentController.getMapAccidents);

// GET /api/accidents/stats - Get accident statistics
router.get('/stats', accidentController.getAccidentStats);

// GET /api/accidents/:id - Get single accident by ID
router.get('/:id', accidentController.getAccidentById);

// POST /api/accidents - Create new accident report
router.post('/', accidentController.createAccident);

// PUT /api/accidents/:id/status - Update accident status (verify/dismiss)
router.put('/:id/status', accidentController.updateAccidentStatus);

module.exports = router;

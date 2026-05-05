const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(verifyToken);

// GET /api/analytics/overview - Get dashboard overview statistics
router.get('/overview', analyticsController.getDashboardOverview);

// GET /api/analytics/trends - Get accident trends over time
router.get('/trends', analyticsController.getAccidentTrends);

// GET /api/analytics/type-distribution - Get accident type distribution (pie chart)
router.get('/type-distribution', analyticsController.getAccidentTypeDistribution);

// GET /api/analytics/dangerous-locations - Get most dangerous locations (bar chart)
router.get('/dangerous-locations', analyticsController.getDangerousLocations);

// GET /api/analytics/severity-distribution - Get severity distribution
router.get('/severity-distribution', analyticsController.getSeverityDistribution);

// GET /api/analytics/status-distribution - Get status distribution
router.get('/status-distribution', analyticsController.getStatusDistribution);

module.exports = router;

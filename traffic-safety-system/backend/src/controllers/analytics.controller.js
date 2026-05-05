const { pool } = require('../server');

// Get dashboard overview statistics
exports.getDashboardOverview = async (req, res) => {
  try {
    const [
      accidentStats,
      userStats,
      dangerZoneStats,
      gameStats,
    ] = await Promise.all([
      pool.query(`
        SELECT 
          COUNT(*) as total_accidents,
          COUNT(CASE WHEN status IN ('pending', 'verified') THEN 1 END) as active_accidents,
          COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified_reports,
          COUNT(CASE WHEN status = 'dismissed' THEN 1 END) as dismissed_reports
        FROM accidents
      `),
      pool.query('SELECT COUNT(*) as total_users FROM users WHERE status = $1', ['active']),
      pool.query("SELECT COUNT(*) as high_risk_zones FROM danger_zones WHERE risk_level = 'high'"),
      pool.query('SELECT SUM(total_points) as total_game_points FROM game_scores'),
    ]);

    res.json({
      success: true,
      data: {
        totalAccidents: parseInt(accidentStats.rows[0].total_accidents),
        activeAccidents: parseInt(accidentStats.rows[0].active_accidents),
        verifiedReports: parseInt(accidentStats.rows[0].verified_reports),
        dismissedReports: parseInt(accidentStats.rows[0].dismissed_reports),
        totalUsers: parseInt(userStats.rows[0].total_users),
        highRiskZones: parseInt(dangerZoneStats.rows[0].high_risk_zones),
        totalGamePoints: parseInt(gameStats.rows[0].total_game_points) || 0,
      },
    });
  } catch (error) {
    console.error('Get dashboard overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Get accident trends over time
exports.getAccidentTrends = async (req, res) => {
  try {
    const { period = 'daily', startDate, endDate } = req.query;

    let dateTrunc;
    switch (period) {
      case 'daily':
        dateTrunc = 'DATE(reported_at)';
        break;
      case 'weekly':
        dateTrunc = "DATE_TRUNC('week', reported_at)";
        break;
      case 'monthly':
        dateTrunc = "DATE_TRUNC('month', reported_at)";
        break;
      default:
        dateTrunc = 'DATE(reported_at)';
    }

    let query = `
      SELECT 
        ${dateTrunc} as date,
        COUNT(*) as total,
        COUNT(CASE WHEN accident_type = 'collision' THEN 1 END) as collision,
        COUNT(CASE WHEN accident_type = 'road_hazard' THEN 1 END) as road_hazard,
        COUNT(CASE WHEN accident_type = 'vehicle_breakdown' THEN 1 END) as vehicle_breakdown,
        COUNT(CASE WHEN accident_type = 'pedestrian_incident' THEN 1 END) as pedestrian_incident,
        COUNT(CASE WHEN accident_type = 'other' THEN 1 END) as other
      FROM accidents
      WHERE 1=1
    `;

    const values = [];
    let paramIndex = 1;

    if (startDate) {
      query += ` AND reported_at >= $${paramIndex}`;
      values.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND reported_at <= $${paramIndex}`;
      values.push(endDate);
      paramIndex++;
    }

    query += ` GROUP BY ${dateTrunc} ORDER BY ${dateTrunc}`;

    const result = await pool.query(query, values);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get accident trends error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Get accident type distribution
exports.getAccidentTypeDistribution = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let query = `
      SELECT 
        accident_type,
        COUNT(*) as count,
        ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM accidents) * 100, 2) as percentage
      FROM accidents
      WHERE 1=1
    `;

    const values = [];
    let paramIndex = 1;

    if (startDate) {
      query += ` AND reported_at >= $${paramIndex}`;
      values.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND reported_at <= $${paramIndex}`;
      values.push(endDate);
      paramIndex++;
    }

    query += ` GROUP BY accident_type ORDER BY count DESC`;

    const result = await pool.query(query, values);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get accident type distribution error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Get most dangerous locations
exports.getDangerousLocations = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const result = await pool.query(`
      SELECT 
        location_name,
        latitude,
        longitude,
        COUNT(*) as accident_count,
        COUNT(CASE WHEN severity_level = 'severe' THEN 1 END) as severe_count,
        COUNT(CASE WHEN severity_level = 'moderate' THEN 1 END) as moderate_count,
        COUNT(CASE WHEN severity_level = 'minor' THEN 1 END) as minor_count
      FROM accidents
      WHERE location_name IS NOT NULL
      GROUP BY location_name, latitude, longitude
      ORDER BY accident_count DESC
      LIMIT $1
    `, [parseInt(limit)]);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get dangerous locations error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Get severity distribution
exports.getSeverityDistribution = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        severity_level,
        COUNT(*) as count
      FROM accidents
      GROUP BY severity_level
      ORDER BY 
        CASE severity_level
          WHEN 'severe' THEN 1
          WHEN 'moderate' THEN 2
          WHEN 'minor' THEN 3
          ELSE 4
        END
    `);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get severity distribution error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Get status distribution
exports.getStatusDistribution = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM accidents
      GROUP BY status
      ORDER BY count DESC
    `);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get status distribution error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

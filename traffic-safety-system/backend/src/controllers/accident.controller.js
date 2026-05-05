const { pool } = require('../server');

// Get all accidents with filters
exports.getAllAccidents = async (req, res) => {
  try {
    const { 
      status, 
      type, 
      severity, 
      startDate, 
      endDate, 
      page = 1, 
      limit = 20 
    } = req.query;

    const offset = (page - 1) * limit;
    let query = 'SELECT * FROM accidents WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) FROM accidents WHERE 1=1';
    const values = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      countQuery += ` AND status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }

    if (type) {
      query += ` AND accident_type = $${paramIndex}`;
      countQuery += ` AND accident_type = $${paramIndex}`;
      values.push(type);
      paramIndex++;
    }

    if (severity) {
      query += ` AND severity_level = $${paramIndex}`;
      countQuery += ` AND severity_level = $${paramIndex}`;
      values.push(severity);
      paramIndex++;
    }

    if (startDate) {
      query += ` AND reported_at >= $${paramIndex}`;
      countQuery += ` AND reported_at >= $${paramIndex}`;
      values.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND reported_at <= $${paramIndex}`;
      countQuery += ` AND reported_at <= $${paramIndex}`;
      values.push(endDate);
      paramIndex++;
    }

    query += ` ORDER BY reported_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(parseInt(limit), parseInt(offset));

    const [accidentsResult, countResult] = await Promise.all([
      pool.query(query, values),
      pool.query(countQuery, values.slice(0, paramIndex)),
    ]);

    res.json({
      success: true,
      data: {
        accidents: accidentsResult.rows,
        pagination: {
          total: parseInt(countResult.rows[0].count),
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(countResult.rows[0].count / limit),
        },
      },
    });
  } catch (error) {
    console.error('Get all accidents error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Get single accident by ID
exports.getAccidentById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM accidents WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Accident not found',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Get accident by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Create new accident report
exports.createAccident = async (req, res) => {
  try {
    const {
      user_id,
      latitude,
      longitude,
      accident_type,
      severity_level,
      description,
      images,
    } = req.body;

    if (!latitude || !longitude || !accident_type) {
      return res.status(400).json({
        success: false,
        message: 'Latitude, longitude, and accident type are required',
      });
    }

    const result = await pool.query(
      `INSERT INTO accidents (user_id, location, accident_type, severity_level, description, images)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, $5, $6, $7)
       RETURNING *`,
      [user_id, longitude, latitude, accident_type, severity_level || 'moderate', description, images]
    );

    res.status(201).json({
      success: true,
      message: 'Accident report created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Create accident error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Update accident status (verify/dismiss)
exports.updateAccidentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'verified', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value',
      });
    }

    const result = await pool.query(
      `UPDATE accidents 
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Accident not found',
      });
    }

    // Log the action
    await pool.query(
      `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.admin.id, `ACCIDENT_${status.toUpperCase()}`, 'accident', id, JSON.stringify({ status })]
    );

    res.json({
      success: true,
      message: `Accident ${status} successfully`,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update accident status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Get accidents for map (with geospatial data)
exports.getMapAccidents = async (req, res) => {
  try {
    const { bounds, status, type, startDate, endDate } = req.query;

    let query = `
      SELECT 
        id,
        user_id,
        ST_X(location) as longitude,
        ST_Y(location) as latitude,
        accident_type,
        severity_level,
        status,
        reported_at,
        description
      FROM accidents
      WHERE 1=1
    `;

    const values = [];
    let paramIndex = 1;

    if (bounds) {
      const [southWestLng, southWestLat, northEastLng, northEastLat] = bounds.split(',');
      query += ` AND ST_Within(location, ST_MakeEnvelope($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3}, 4326))`;
      values.push(parseFloat(southWestLng), parseFloat(southWestLat), parseFloat(northEastLng), parseFloat(northEastLat));
      paramIndex += 4;
    }

    if (status) {
      query += ` AND status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }

    if (type) {
      query += ` AND accident_type = $${paramIndex}`;
      values.push(type);
      paramIndex++;
    }

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

    const result = await pool.query(query, values);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get map accidents error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Get accident statistics
exports.getAccidentStats = async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_accidents,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_accidents,
        COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified_accidents,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_accidents,
        COUNT(CASE WHEN status = 'dismissed' THEN 1 END) as dismissed_accidents
      FROM accidents
    `);

    res.json({
      success: true,
      data: stats.rows[0],
    });
  } catch (error) {
    console.error('Get accident stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

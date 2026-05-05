const { pool } = require('../server');

// Get all danger zones
exports.getAllDangerZones = async (req, res) => {
  try {
    const { status, risk_level, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM danger_zones WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) FROM danger_zones WHERE 1=1';
    const values = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      countQuery += ` AND status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }

    if (risk_level) {
      query += ` AND risk_level = $${paramIndex}`;
      countQuery += ` AND risk_level = $${paramIndex}`;
      values.push(risk_level);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(parseInt(limit), parseInt(offset));

    const [zonesResult, countResult] = await Promise.all([
      pool.query(query, values),
      pool.query(countQuery, values.slice(0, paramIndex)),
    ]);

    res.json({
      success: true,
      data: {
        dangerZones: zonesResult.rows,
        pagination: {
          total: parseInt(countResult.rows[0].count),
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(countResult.rows[0].count / limit),
        },
      },
    });
  } catch (error) {
    console.error('Get all danger zones error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Create danger zone
exports.createDangerZone = async (req, res) => {
  try {
    const {
      location_name,
      latitude,
      longitude,
      radius_meters,
      risk_level,
      description,
      status,
    } = req.body;

    if (!latitude || !longitude || !risk_level) {
      return res.status(400).json({
        success: false,
        message: 'Latitude, longitude, and risk level are required',
      });
    }

    const result = await pool.query(
      `INSERT INTO danger_zones (location_name, location, radius_meters, risk_level, description, status)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, $5, $6, $7)
       RETURNING *`,
      [location_name, longitude, latitude, radius_meters || 100, risk_level, description, status || 'active']
    );

    // Log the action
    await pool.query(
      `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.admin.id, 'DANGER_ZONE_CREATED', 'danger_zone', result.rows[0].id, JSON.stringify(req.body)]
    );

    res.status(201).json({
      success: true,
      message: 'Danger zone created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Create danger zone error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Update danger zone
exports.updateDangerZone = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      location_name,
      radius_meters,
      risk_level,
      description,
      status,
    } = req.body;

    const result = await pool.query(
      `UPDATE danger_zones 
       SET location_name = COALESCE($1, location_name),
           radius_meters = COALESCE($2, radius_meters),
           risk_level = COALESCE($3, risk_level),
           description = COALESCE($4, description),
           status = COALESCE($5, status),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [location_name, radius_meters, risk_level, description, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Danger zone not found',
      });
    }

    // Log the action
    await pool.query(
      `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.admin.id, 'DANGER_ZONE_UPDATED', 'danger_zone', id, JSON.stringify(req.body)]
    );

    res.json({
      success: true,
      message: 'Danger zone updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update danger zone error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Delete danger zone
exports.deleteDangerZone = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM danger_zones WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Danger zone not found',
      });
    }

    // Log the action
    await pool.query(
      `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.admin.id, 'DANGER_ZONE_DELETED', 'danger_zone', id, null]
    );

    res.json({
      success: true,
      message: 'Danger zone deleted successfully',
    });
  } catch (error) {
    console.error('Delete danger zone error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Get danger zones for map
exports.getMapDangerZones = async (req, res) => {
  try {
    const { bounds, status, risk_level } = req.query;

    let query = `
      SELECT 
        id,
        location_name,
        ST_X(location) as longitude,
        ST_Y(location) as latitude,
        radius_meters,
        risk_level,
        status,
        description
      FROM danger_zones
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

    if (risk_level) {
      query += ` AND risk_level = $${paramIndex}`;
      values.push(risk_level);
      paramIndex++;
    }

    const result = await pool.query(query, values);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get map danger zones error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

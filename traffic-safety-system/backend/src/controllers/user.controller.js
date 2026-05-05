const { pool } = require('../server');

// Get all users with pagination and filters
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM users WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) FROM users WHERE 1=1';
    const values = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      countQuery += ` AND status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }

    if (search) {
      query += ` AND (name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
      countQuery += ` AND (name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
      values.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(parseInt(limit), parseInt(offset));

    const [usersResult, countResult] = await Promise.all([
      pool.query(query, values),
      pool.query(countQuery, values.slice(0, paramIndex)),
    ]);

    res.json({
      success: true,
      data: {
        users: usersResult.rows,
        pagination: {
          total: parseInt(countResult.rows[0].count),
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(countResult.rows[0].count / limit),
        },
      },
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Get user by ID with stats
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const userResult = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Get user stats
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_reports,
        COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified_reports,
        COUNT(CASE WHEN status = 'dismissed' THEN 1 END) as dismissed_reports
      FROM accidents
      WHERE user_id = $1
    `, [id]);

    // Get user's game score
    const scoreResult = await pool.query(
      'SELECT total_points, games_played, last_played FROM game_scores WHERE user_id = $1',
      [id]
    );

    res.json({
      success: true,
      data: {
        ...userResult.rows[0],
        stats: statsResult.rows[0],
        gameScore: scoreResult.rows[0] || null,
      },
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Update user status
exports.updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'suspended', 'banned'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value',
      });
    }

    const result = await pool.query(
      `UPDATE users 
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    // Log the action
    await pool.query(
      `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.admin.id, `USER_${status.toUpperCase()}`, 'user', id, JSON.stringify({ status })]
    );

    res.json({
      success: true,
      message: `User ${status} successfully`,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Get user accuracy report
exports.getUserAccuracy = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_reports,
        COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified,
        COUNT(CASE WHEN status = 'dismissed' THEN 1 END) as dismissed,
        ROUND(
          COUNT(CASE WHEN status = 'verified' THEN 1 END)::numeric / 
          NULLIF(COUNT(*), 0)::numeric * 100, 
          2
        ) as accuracy_percentage
      FROM accidents
      WHERE user_id = $1
    `, [id]);

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Get user accuracy error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Get top reporters
exports.getTopReporters = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const result = await pool.query(`
      SELECT 
        u.id,
        u.name,
        u.email,
        COUNT(a.id) as total_reports,
        COUNT(CASE WHEN a.status = 'verified' THEN 1 END) as verified_reports,
        ROUND(
          COUNT(CASE WHEN a.status = 'verified' THEN 1 END)::numeric / 
          NULLIF(COUNT(*), 0)::numeric * 100, 
          2
        ) as accuracy_percentage
      FROM users u
      LEFT JOIN accidents a ON u.id = a.user_id
      GROUP BY u.id, u.name, u.email
      HAVING COUNT(a.id) > 0
      ORDER BY verified_reports DESC
      LIMIT $1
    `, [parseInt(limit)]);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get top reporters error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

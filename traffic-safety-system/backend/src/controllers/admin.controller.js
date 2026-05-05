const { pool } = require('../server');

// Get all admins
exports.getAllAdmins = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, role, is_active, created_at, last_login FROM admins ORDER BY created_at DESC'
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get all admins error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Create new admin
exports.createAdmin = async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, and name are required',
      });
    }

    // Check if admin already exists
    const existing = await pool.query(
      'SELECT id FROM admins WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Admin with this email already exists',
      });
    }

    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO admins (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role, is_active, created_at`,
      [email, hashedPassword, name, role || 'admin']
    );

    // Log the action
    await pool.query(
      `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.admin.id, 'ADMIN_CREATED', 'admin', result.rows[0].id, JSON.stringify({ email, name, role })]
    );

    res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Update admin
exports.updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, is_active } = req.body;

    const result = await pool.query(
      `UPDATE admins 
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           role = COALESCE($3, role),
           is_active = COALESCE($4, is_active),
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, email, name, role, is_active`,
      [name, email, role, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found',
      });
    }

    // Log the action
    await pool.query(
      `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.admin.id, 'ADMIN_UPDATED', 'admin', id, JSON.stringify(req.body)]
    );

    res.json({
      success: true,
      message: 'Admin updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Delete admin
exports.deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting yourself
    if (id === req.admin.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account',
      });
    }

    const result = await pool.query(
      'DELETE FROM admins WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found',
      });
    }

    // Log the action
    await pool.query(
      `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.admin.id, 'ADMIN_DELETED', 'admin', id, null]
    );

    res.json({
      success: true,
      message: 'Admin deleted successfully',
    });
  } catch (error) {
    console.error('Delete admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Get audit logs
exports.getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, admin_id, action, entity_type } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) FROM audit_logs WHERE 1=1';
    const values = [];
    let paramIndex = 1;

    if (admin_id) {
      query += ` AND admin_id = $${paramIndex}`;
      countQuery += ` AND admin_id = $${paramIndex}`;
      values.push(admin_id);
      paramIndex++;
    }

    if (action) {
      query += ` AND action ILIKE $${paramIndex}`;
      countQuery += ` AND action ILIKE $${paramIndex}`;
      values.push(`%${action}%`);
      paramIndex++;
    }

    if (entity_type) {
      query += ` AND entity_type = $${paramIndex}`;
      countQuery += ` AND entity_type = $${paramIndex}`;
      values.push(entity_type);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(parseInt(limit), parseInt(offset));

    const [logsResult, countResult] = await Promise.all([
      pool.query(query, values),
      pool.query(countQuery, values.slice(0, paramIndex)),
    ]);

    res.json({
      success: true,
      data: {
        logs: logsResult.rows,
        pagination: {
          total: parseInt(countResult.rows[0].count),
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(countResult.rows[0].count / limit),
        },
      },
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Get system health
exports.getSystemHealth = async (req, res) => {
  try {
    const [
      dbResult,
      accidentCount,
      userCount,
      activeAccidents,
    ] = await Promise.all([
      pool.query('SELECT NOW() as db_time'),
      pool.query('SELECT COUNT(*) as count FROM accidents'),
      pool.query('SELECT COUNT(*) as count FROM users'),
      pool.query("SELECT COUNT(*) as count FROM accidents WHERE status IN ('pending', 'verified')"),
    ]);

    res.json({
      success: true,
      data: {
        database: {
          status: 'connected',
          timestamp: dbResult.rows[0].db_time,
        },
        statistics: {
          totalAccidents: parseInt(accidentCount.rows[0].count),
          totalUsers: parseInt(userCount.rows[0].count),
          activeAccidents: parseInt(activeAccidents.rows[0].count),
        },
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      },
    });
  } catch (error) {
    console.error('Get system health error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

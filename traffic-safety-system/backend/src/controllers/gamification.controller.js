const { pool } = require('../server');

// Get leaderboard (top scorers)
exports.getLeaderboard = async (req, res) => {
  try {
    const { limit = 10, period = 'all' } = req.query;

    let query = `
      SELECT 
        u.id,
        u.name,
        u.email,
        gs.total_points,
        gs.games_played,
        gs.last_played,
        RANK() OVER (ORDER BY gs.total_points DESC) as rank
      FROM game_scores gs
      JOIN users u ON gs.user_id = u.id
      WHERE u.status = 'active'
    `;

    if (period === 'daily') {
      query += " AND DATE(gs.last_played) = CURRENT_DATE";
    } else if (period === 'weekly') {
      query += " AND DATE_TRUNC('week', gs.last_played) = DATE_TRUNC('week', CURRENT_DATE)";
    } else if (period === 'monthly') {
      query += " AND DATE_TRUNC('month', gs.last_played) = DATE_TRUNC('month', CURRENT_DATE)";
    }

    query += ` ORDER BY gs.total_points DESC LIMIT $1`;

    const result = await pool.query(query, [parseInt(limit)]);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Get gamification statistics
exports.getGamificationStats = async (req, res) => {
  try {
    const [
      totalPlayers,
      activeToday,
      totalGamesPlayed,
      totalPoints,
      avgScore,
    ] = await Promise.all([
      pool.query('SELECT COUNT(DISTINCT user_id) as count FROM game_scores'),
      pool.query("SELECT COUNT(DISTINCT user_id) as count FROM game_scores WHERE DATE(last_played) = CURRENT_DATE"),
      pool.query('SELECT SUM(games_played) as count FROM game_scores'),
      pool.query('SELECT SUM(total_points) as count FROM game_scores'),
      pool.query('SELECT AVG(total_points) as count FROM game_scores'),
    ]);

    res.json({
      success: true,
      data: {
        totalPlayers: parseInt(totalPlayers.rows[0].count) || 0,
        activeToday: parseInt(activeToday.rows[0].count) || 0,
        totalGamesPlayed: parseInt(totalGamesPlayed.rows[0].count) || 0,
        totalPoints: parseInt(totalPoints.rows[0].count) || 0,
        avgScore: parseFloat(avgScore.rows[0].count) || 0,
      },
    });
  } catch (error) {
    console.error('Get gamification stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Get daily active players trend
exports.getDailyActivePlayers = async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const result = await pool.query(`
      SELECT 
        DATE(last_played) as date,
        COUNT(DISTINCT user_id) as active_players
      FROM game_scores
      WHERE last_played >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
      GROUP BY DATE(last_played)
      ORDER BY date
    `);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get daily active players error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Get game engagement metrics
exports.getEngagementMetrics = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_sessions,
        AVG(total_points) as avg_points_per_session,
        MAX(total_points) as highest_score,
        COUNT(CASE WHEN total_points > 1000 THEN 1 END) as high_scorers,
        COUNT(CASE WHEN total_points > 500 THEN 1 END) as medium_scorers,
        COUNT(CASE WHEN total_points <= 500 THEN 1 END) as low_scorers
      FROM game_scores
    `);

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Get engagement metrics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Get user game history
exports.getUserGameHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20 } = req.query;

    const result = await pool.query(
      `SELECT * FROM game_history 
       WHERE user_id = $1 
       ORDER BY played_at DESC 
       LIMIT $2`,
      [userId, parseInt(limit)]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get user game history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

// Update game score (called from mobile app)
exports.updateGameScore = async (req, res) => {
  try {
    const { user_id, points_earned, game_duration, level_completed } = req.body;

    if (!user_id || points_earned === undefined) {
      return res.status(400).json({
        success: false,
        message: 'User ID and points earned are required',
      });
    }

    // Update or insert game scores
    const upsertResult = await pool.query(`
      INSERT INTO game_scores (user_id, total_points, games_played, last_played)
      VALUES ($1, $2, 1, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        total_points = game_scores.total_points + $2,
        games_played = game_scores.games_played + 1,
        last_played = NOW()
      RETURNING *
    `, [user_id, points_earned]);

    // Record game history
    await pool.query(
      `INSERT INTO game_history (user_id, points_earned, game_duration, level_completed)
       VALUES ($1, $2, $3, $4)`,
      [user_id, points_earned, game_duration, level_completed]
    );

    res.json({
      success: true,
      message: 'Game score updated successfully',
      data: upsertResult.rows[0],
    });
  } catch (error) {
    console.error('Update game score error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

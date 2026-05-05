-- Enable PostGIS extension for geographic data
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(50) DEFAULT 'citizen' CHECK (role IN ('citizen', 'admin', 'moderator')),
    is_active BOOLEAN DEFAULT true,
    report_accuracy_score DECIMAL(5,2) DEFAULT 100.00,
    total_reports INTEGER DEFAULT 0,
    verified_reports INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- Index for email lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);

-- ============================================
-- ACCIDENTS TABLE
-- ============================================
CREATE TYPE accident_status AS ENUM ('pending', 'verified', 'resolved', 'dismissed');
CREATE TYPE accident_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE accident_type AS ENUM (
    'collision', 
    'road_hazard', 
    'vehicle_breakdown', 
    'pedestrian_accident', 
    'property_damage', 
    'fatal_accident', 
    'other'
);

CREATE TABLE accidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Location data (PostGIS geography type for accurate distance calculations)
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'USA',
    zip_code VARCHAR(20),
    
    -- Accident details
    accident_type accident_type NOT NULL,
    severity accident_severity NOT NULL,
    status accident_status DEFAULT 'pending',
    description TEXT,
    
    -- Media and evidence
    images TEXT[], -- Array of image URLs
    videos TEXT[], -- Array of video URLs
    
    -- Verification data
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP WITH TIME ZONE,
    verification_notes TEXT,
    
    -- Metadata
    reported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Additional data
    weather_conditions VARCHAR(100),
    road_conditions VARCHAR(100),
    vehicles_involved INTEGER DEFAULT 1,
    injuries_count INTEGER DEFAULT 0,
    fatalities_count INTEGER DEFAULT 0
);

-- Spatial index for fast geographic queries
CREATE INDEX idx_accidents_location ON accidents USING GIST(location);
CREATE INDEX idx_accidents_lat_lon ON accidents(latitude, longitude);
CREATE INDEX idx_accidents_status ON accidents(status);
CREATE INDEX idx_accidents_type ON accidents(accident_type);
CREATE INDEX idx_accidents_severity ON accidents(severity);
CREATE INDEX idx_accidents_reported_at ON accidents(reported_at);
CREATE INDEX idx_accidents_user_id ON accidents(user_id);

-- ============================================
-- GAME SCORES TABLE (Gamification)
-- ============================================
CREATE TABLE game_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    game_session_id VARCHAR(100),
    score INTEGER NOT NULL DEFAULT 0,
    level_completed INTEGER DEFAULT 0,
    accuracy_percentage DECIMAL(5,2),
    time_spent_seconds INTEGER,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_game_scores_user_id ON game_scores(user_id);
CREATE INDEX idx_game_scores_score ON game_scores(score DESC);
CREATE INDEX idx_game_scores_completed_at ON game_scores(completed_at);

-- ============================================
-- ADMIN AUDIT LOG TABLE
-- ============================================
CREATE TABLE admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL, -- 'accident', 'user', etc.
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_admin_audit_logs_admin_id ON admin_audit_logs(admin_id);
CREATE INDEX idx_admin_audit_logs_entity ON admin_audit_logs(entity_type, entity_id);
CREATE INDEX idx_admin_audit_logs_created_at ON admin_audit_logs(created_at);

-- ============================================
-- DANGER ZONES TABLE (High-risk areas)
-- ============================================
CREATE TABLE danger_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    zone_type VARCHAR(50) DEFAULT 'high_accident_rate',
    location GEOGRAPHY(POLYGON, 4326), -- Polygon for area coverage
    center_point GEOGRAPHY(POINT, 4326),
    radius_meters INTEGER,
    accident_count INTEGER DEFAULT 0,
    severity_score DECIMAL(5,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_danger_zones_location ON danger_zones USING GIST(location);
CREATE INDEX idx_danger_zones_center ON danger_zones USING GIST(center_point);
CREATE INDEX idx_danger_zones_active ON danger_zones(is_active);

-- ============================================
-- VIEWS FOR ANALYTICS
-- ============================================

-- View: Accident statistics by type
CREATE VIEW v_accident_stats_by_type AS
SELECT 
    accident_type,
    COUNT(*) as total_count,
    COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified_count,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
    AVG(EXTRACT(EPOCH FROM (verified_at - reported_at))/3600) as avg_verification_hours
FROM accidents
GROUP BY accident_type;

-- View: Daily accident trends
CREATE VIEW v_daily_accident_trends AS
SELECT 
    DATE(reported_at) as report_date,
    COUNT(*) as total_accidents,
    COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_count,
    COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_count,
    COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified_count
FROM accidents
GROUP BY DATE(reported_at)
ORDER BY report_date DESC;

-- View: Top dangerous locations
CREATE VIEW v_top_dangerous_locations AS
SELECT 
    city,
    address,
    latitude,
    longitude,
    COUNT(*) as accident_count,
    AVG(CASE 
        WHEN severity = 'low' THEN 1
        WHEN severity = 'medium' THEN 2
        WHEN severity = 'high' THEN 3
        WHEN severity = 'critical' THEN 4
    END) as avg_severity_score
FROM accidents
WHERE latitude IS NOT NULL AND longitude IS NOT NULL
GROUP BY city, address, latitude, longitude
HAVING COUNT(*) >= 3
ORDER BY accident_count DESC, avg_severity_score DESC
LIMIT 100;

-- View: User leaderboard (gamification)
CREATE VIEW v_user_leaderboard AS
SELECT 
    u.id,
    u.full_name,
    u.email,
    u.report_accuracy_score,
    u.total_reports,
    u.verified_reports,
    COALESCE(SUM(g.score), 0) as total_game_points,
    COUNT(g.id) as games_played,
    MAX(g.completed_at) as last_game_at
FROM users u
LEFT JOIN game_scores g ON u.id = g.user_id
WHERE u.is_active = true
GROUP BY u.id, u.full_name, u.email, u.report_accuracy_score, u.total_reports, u.verified_reports
ORDER BY total_game_points DESC;

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_accidents_updated_at BEFORE UPDATE ON accidents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate distance between two points (in meters)
CREATE OR REPLACE FUNCTION calculate_distance_meters(
    lat1 DECIMAL, lon1 DECIMAL, 
    lat2 DECIMAL, lon2 DECIMAL
) RETURNS DECIMAL AS $$
BEGIN
    RETURN ST_Distance(
        ST_MakePoint(lon1, lat1)::geography,
        ST_MakePoint(lon2, lat2)::geography
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SEED DATA (Optional - for development)
-- ============================================

-- Insert a default admin user (password: admin123 - hash this in production!)
-- Note: In production, always hash passwords using bcrypt or similar
INSERT INTO users (email, password_hash, full_name, role) 
VALUES (
    'admin@trafficsafety.com',
    '$2b$10$example_hashed_password_here',
    'System Administrator',
    'admin'
) ON CONFLICT (email) DO NOTHING;

const bcrypt = require('bcrypt');
const pool = require('../config/db');

/**
 * Checks if the password matches any of the last 10 passwords in history.
 */
async function isPasswordInHistory(userId, password, connection = pool) {
    const [rows] = await connection.query(
        'SELECT password_hash FROM password_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
        [userId]
    );
    for (const row of rows) {
        const match = await bcrypt.compare(password, row.password_hash);
        if (match) return true;
    }
    return false;
}

/**
 * Adds the new password hash to the history and prunes older ones.
 */
async function addPasswordToHistory(userId, hash, connection = pool) {
    await connection.query(
        'INSERT INTO password_history (user_id, password_hash) VALUES (?, ?)',
        [userId, hash]
    );
    // Keep only the last 10 entries
    const [rows] = await connection.query(
        'SELECT created_at FROM password_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 1 OFFSET 9',
        [userId]
    );
    if (rows.length > 0) {
        const cutoff = rows[0].created_at;
        await connection.query(
            'DELETE FROM password_history WHERE user_id = ? AND created_at < ?',
            [userId, cutoff]
        );
    }
}

/**
 * Checks if the daily password reset limit (5) has been reached.
 * If not, increments the counter. Returns true if allowed, false if limit reached.
 */
async function checkAndIncrementResetLimit(userId, connection = pool) {
    const [rows] = await connection.query(
        'SELECT password_resets_today, last_password_reset_date FROM users WHERE id = ?',
        [userId]
    );
    if (rows.length === 0) return true;

    const user = rows[0];
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const lastResetStr = user.last_password_reset_date ? new Date(user.last_password_reset_date).toISOString().split('T')[0] : null;

    if (lastResetStr === today) {
        if (user.password_resets_today >= 5) {
            return false;
        }
        await connection.query(
            'UPDATE users SET password_resets_today = password_resets_today + 1 WHERE id = ?',
            [userId]
        );
    } else {
        await connection.query(
            'UPDATE users SET password_resets_today = 1, last_password_reset_date = ? WHERE id = ?',
            [today, userId]
        );
    }
    return true;
}

module.exports = {
    isPasswordInHistory,
    addPasswordToHistory,
    checkAndIncrementResetLimit
};

const pool = require('./config/db');

async function run() {
    try {
        console.log("=== USERS ===");
        const [users] = await pool.query("SELECT id, name, email, password, must_change_password, password_resets_today, last_password_reset_date FROM users");
        console.log(users);

        console.log("=== PASSWORD HISTORY ===");
        const [history] = await pool.query("SELECT * FROM password_history");
        console.log(history);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

run();

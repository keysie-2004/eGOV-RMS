const mysql = require('mysql2');
const util = require('util');
require('dotenv').config();

const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'db',
  port: process.env.DB_PORT || 3306,
  timezone: '+08:00'
});

db.connect((err) => {
  if (err) {
    console.log('❌ Error connecting to the database:', err.message);
  } else {
    console.log('✅ Connected to the database');
  }
});

db.query = util.promisify(db.query);

module.exports = db;
module.exports.bcryptSaltRounds = 10;
module.exports.uploadPath = 'public/uploads';

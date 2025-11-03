const mysql = require('mysql2');
const util = require('util');
require('dotenv').config();

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'db',
  port: process.env.DB_PORT || 3306,
  timezone: '+08:00',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Promisify queries for async/await
db.query = util.promisify(db.query);

module.exports = db;
module.exports.bcryptSaltRounds = 10;
module.exports.uploadPath = 'public/uploads';

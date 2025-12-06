const mysql = require('mysql2');
const util = require('util');
require('dotenv').config();

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  timezone: '+08:00',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

db.query = util.promisify(db.query);

module.exports = db;
module.exports.bcryptSaltRounds = 10;
module.exports.uploadPath = 'public/uploads';

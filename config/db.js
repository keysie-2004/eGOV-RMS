const mysql = require('mysql2');
const util = require('util');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'db',
  timezone: '+08:00'
});

db.connect((err) => {
  if (err) {
    console.log('Error connecting to the database:', err);
  } else {
    console.log('Connected to the database');
  }
});

db.query = util.promisify(db.query);

module.exports = db;
module.exports.bcryptSaltRounds = 10; // Keep for password hashing
module.exports.uploadPath = 'public/uploads';
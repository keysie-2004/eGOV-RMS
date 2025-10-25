const jwt = require('jsonwebtoken');
const secretKey = 'yourSecretKey'; // Use a secure and unique secret key

// Generate a token from an ID
exports.generateToken = (id) => jwt.sign({ id }, secretKey, { expiresIn: '1h' });

// Decode and verify a token
exports.decodeToken = (token) => {
  try {
    const decoded = jwt.verify(token, secretKey);
    return decoded.id; // Return the ID embedded in the token
  } catch (err) {
    throw new Error('Invalid token');
  }
};

const db = require('../config/db');

// Get all requests
exports.getAllRequests = (callback) => {
    const query = `
        SELECT 
            requests_id, 
            charging,
            department_code, 
            property_no, 
            PPE_code, 
            description, 
            request_date, 
            quantity, 
            count_measurement,
            unit_value
        FROM requests
    `;
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching requests:', err);
            return callback(err, null);
        }
        callback(null, results);
    });
};

// Function to update a request
exports.updateRequest = (requestData, callback) => {
    const query = `
        UPDATE requests SET 
            charging = ?, 
            department_code = ?, 
            property_no = ?, 
            PPE_code = ?, 
            description = ?, 
            quantity = ?, 
            count_measurement = ?, 
            unit_value = ?
        WHERE requests_id = ?
    `;

    const values = [
        requestData.charging,
        requestData.departmentCode,
        requestData.propertyNo,
        requestData.ppeCode,
        requestData.description,
        requestData.quantity,
        requestData.unitMeasure,
        requestData.unitValue || null, // Handle null for optional value
        requestData.requestId
    ];

    db.query(query, values, (err, result) => {
        if (err) {
            console.error('Error updating request:', err);
            return callback(err, null);
        }
        console.log('Request updated successfully');
        callback(null, result);
    });
};
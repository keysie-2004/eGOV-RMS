// models/budgetModel.js
const db = require('./db');

const Budget = {
    getPredictiveData: (callback) => {
        // Example queries - adjust based on your actual database structure
        const queries = [
            `SELECT d.department_name, COUNT(r.request_id) as total_requests 
             FROM departments d 
             LEFT JOIN requests r ON d.department_id = r.department_id 
             GROUP BY d.department_name`,
             
            `SELECT item_name, COUNT(*) as request_count 
             FROM request_items 
             GROUP BY item_name 
             ORDER BY request_count DESC 
             LIMIT 5`,
             
            `SELECT 
                SUM(CASE WHEN MONTH(request_date) = 1 THEN 1 ELSE 0 END) as jan,
                SUM(CASE WHEN MONTH(request_date) = 2 THEN 1 ELSE 0 END) as feb,
                // ... other months
             FROM requests 
             WHERE YEAR(request_date) = YEAR(CURRENT_DATE)`
        ];

        db.query(queries.join(';'), (err, results) => {
            if (err) return callback(err);
            
            const data = {
                departments: results[0],
                topItems: results[1],
                monthlyTrends: Object.values(results[2][0]) // Convert monthly columns to array
            };
            
            // Calculate statistics
            data.stats = {
                totalRequests: results[0].reduce((sum, dept) => sum + dept.total_requests, 0),
                mostRequestedItem: results[1][0],
                highestSpendingDept: results[0].sort((a, b) => b.total_requests - a.total_requests)[0]
            };
            
            callback(null, data);
        });
    }
};

module.exports = Budget;
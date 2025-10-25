
// models/dashboardModel.js
const db = require('../config/db');

module.exports = {
    getAllDepartments: () => {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM departments WHERE is_archived = 0';
            db.query(sql, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });
    },

    getIcsData: ({ department, timePeriod, startDate, endDate }) => {
        return new Promise((resolve, reject) => {
            let sql = 'SELECT dept, date_acq, balcard FROM ics WHERE 1=1';
            const params = [];

            if (department && department !== 'all') {
                sql += ' AND dept = ?';
                params.push(department);
            }

            if (timePeriod && timePeriod !== 'custom') {
                const months = parseInt(timePeriod);
                sql += ` AND date_acq >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)`;
                params.push(months);
            } else if (timePeriod === 'custom' && startDate && endDate) {
                sql += ' AND date_acq BETWEEN ? AND ?';
                params.push(startDate, endDate);
            }

            db.query(sql, params, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });
    },

    getHistoricalSpending: ({ department, timePeriod, startDate, endDate }) => {
        return new Promise((resolve, reject) => {
            let sql = `
                SELECT 
                    MONTH(date_acq) as month,
                    SUM(balcard) as total
                FROM ics
                WHERE 1=1
            `;
            const params = [];

            if (department && department !== 'all') {
                sql += ' AND dept = ?';
                params.push(department);
            }

            if (timePeriod && timePeriod !== 'custom') {
                const months = parseInt(timePeriod);
                sql += ` AND date_acq >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)`;
                params.push(months);
            } else if (timePeriod === 'custom' && startDate && endDate) {
                sql += ' AND date_acq BETWEEN ? AND ?';
                params.push(startDate, endDate);
            }

            sql += ' GROUP BY MONTH(date_acq) ORDER BY month';

            db.query(sql, params, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });
    },

    getPredictedSpending: async ({ department, timePeriod, startDate, endDate }) => {
        // First get historical data to base our prediction on
        const historicalData = await this.getHistoricalSpending({
            department,
            timePeriod,
            startDate,
            endDate
        });

        // Simple prediction - average of last 3 months * 12
        const lastThreeMonths = historicalData.slice(-3);
        const average = lastThreeMonths.reduce((sum, month) => sum + month.total, 0) / lastThreeMonths.length || 0;
        const yearlyPrediction = average * 12;

        // Return as monthly predictions for the next year
        const monthlyPrediction = yearlyPrediction / 12;
        return Array(12).fill().map((_, i) => ({
            month: i + 1,
            predictedAmount: monthlyPrediction
        }));
    }
};
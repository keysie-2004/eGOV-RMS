// controllers/predictiveController.js
const db = require("../config/db");
const regression = require('regression');

// Helper function to calculate YoY change
function calculateYoYChange(yearlyData) {
    if (!yearlyData || yearlyData.length < 2) return 0;
    
    // Sort by date ascending
    yearlyData.sort((a, b) => a.date - b.date);
    
    // Get the last two years
    const prevYear = yearlyData[yearlyData.length - 2].amount;
    const currentYear = yearlyData[yearlyData.length - 1].amount;
    
    if (prevYear <= 0) return 0;
    
    return ((currentYear - prevYear) / prevYear) * 100;
}

exports.getDepartmentPredictions = async (req, res) => {
    try {
        const selectedDepartment = req.query.department || null;

        // Get all departments
        const departments = await new Promise((resolve, reject) => {
            const sql = "SELECT * FROM departments";
            db.query(sql, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // Get ICS spending data (filtered if department is selected)
        const icsData = await new Promise((resolve, reject) => {
            let sql = `SELECT dept, date_acq, balcard FROM ics WHERE balcard IS NOT NULL AND balcard > 0`;
            if (selectedDepartment) {
                sql += ` AND dept = ?`;
                db.query(sql, [selectedDepartment], (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                });
            } else {
                db.query(sql, (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                });
            }
        });

        // Generate predictions
        const departmentPredictions = icsData.length > 0 ? 
            await predictBudgets(icsData, 12) : {};

        // Sort departments by predicted amount (descending)
        const sortedDepartments = Object.entries(departmentPredictions)
            .sort((a, b) => b[1] - a[1]);

        // Calculate max amount and total amount for the view
        const maxAmount = sortedDepartments.length > 0 ? sortedDepartments[0][1] : 0;
        const totalAmount = sortedDepartments.reduce((sum, [_, amount]) => sum + amount, 0);

        // Get historical spending data for charts
        const historicalData = await getHistoricalSpendingData(selectedDepartment);
        
        // Calculate average year-over-year increase
        let averageIncrease = 0;
        if (historicalData && Object.keys(historicalData).length > 0) {
            const increases = [];
            for (const dept in historicalData) {
                const yearlyData = historicalData[dept];
                const yoyChange = calculateYoYChange(yearlyData);
                if (!isNaN(yoyChange)) {
                    increases.push(yoyChange);
                }
            }
            
            if (increases.length > 0) {
                averageIncrease = increases.reduce((sum, val) => sum + val, 0) / increases.length;
            }
        }

        // Calculate recommended increase (average + 2% for inflation/growth)
        const recommendedIncrease = averageIncrease > 0 ? averageIncrease + 2 : 5;

        // Get spending patterns for the selected department
        let spendingPatterns = {};
        if (selectedDepartment) {
            spendingPatterns = await getSpendingPatterns(selectedDepartment);
        }

        // Debug logging
        console.log('Average Increase:', averageIncrease);
        console.log('Recommended Increase:', recommendedIncrease);

        res.render('predictive/department', {
            user: req.user,
            departments,
            selectedDepartment,
            departmentPredictions,
            sortedDepartments,
            maxAmount,
            totalAmount,
            historicalData,
            spendingPatterns,
            predictionsAvailable: Object.keys(departmentPredictions).length > 0,
            averageIncrease: averageIncrease || 0,
            recommendedIncrease: recommendedIncrease || 5,
            calculateYoYChange
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('error', { 
            message: 'Failed to load predictive analysis data',
            error 
        });
    }
};

async function predictBudgets(icsData, months = 12) {
    const INFLATION_RATE = 0.05; // 5% inflation rate - adjust as needed
    
    const departmentData = {};
    
    icsData.forEach(record => {
        if (!record.dept) return;
        
        const dept = record.dept;
        const date = record.date_acq ? new Date(record.date_acq) : null;
        if (!date || isNaN(date)) return;
        
        const amount = parseFloat(record.balcard) || 0;
        const month = date.getMonth();
        const year = date.getFullYear();
        
        if (!departmentData[dept]) {
            departmentData[dept] = {
                monthlyTotals: Array(12).fill(0),
                count: Array(12).fill(0),
                yearlyData: {}, // Track data by year for inflation adjustment
                yearlyMonthlyData: {} // Track monthly data by year
            };
        }
        
        // Monthly data for current year
        departmentData[dept].monthlyTotals[month] += amount;
        departmentData[dept].count[month]++;
        
        // Yearly data
        if (!departmentData[dept].yearlyData[year]) {
            departmentData[dept].yearlyData[year] = 0;
        }
        departmentData[dept].yearlyData[year] += amount;
        
        // Track monthly data by year for inflation adjustment
        if (!departmentData[dept].yearlyMonthlyData[year]) {
            departmentData[dept].yearlyMonthlyData[year] = {
                monthlyTotals: Array(12).fill(0),
                count: Array(12).fill(0)
            };
        }
        departmentData[dept].yearlyMonthlyData[year].monthlyTotals[month] += amount;
        departmentData[dept].yearlyMonthlyData[year].count[month]++;
    });

    const predictions = {};
    const scaleFactor = months / 12;
    const currentYear = new Date().getFullYear();
    
    for (const dept in departmentData) {
        try {
            // Calculate monthly averages
            const monthlyAverages = departmentData[dept].monthlyTotals.map((total, i) => 
                departmentData[dept].count[i] > 0 ? total / departmentData[dept].count[i] : 0
            );

            // Adjust historical data for inflation (normalize to current value)
            const years = Object.keys(departmentData[dept].yearlyMonthlyData).sort();
            if (years.length > 1) {
                for (const year of years) {
                    const yearDiff = currentYear - parseInt(year);
                    if (yearDiff > 0) {
                        const inflationFactor = Math.pow(1 + INFLATION_RATE, yearDiff);
                        for (let month = 0; month < 12; month++) {
                            if (departmentData[dept].yearlyMonthlyData[year].count[month] > 0) {
                                const adjustedAmount = departmentData[dept].yearlyMonthlyData[year].monthlyTotals[month] * inflationFactor;
                                // Update the monthly average with inflation-adjusted value
                                monthlyAverages[month] = ((monthlyAverages[month] || 0) + adjustedAmount) / 2;
                            }
                        }
                    }
                }
            }

            // Yearly trend approach
            const yearlyEntries = Object.entries(departmentData[dept].yearlyData)
                .map(([year, amount]) => [parseInt(year), amount])
                .sort((a, b) => a[0] - b[0]);

            let prediction;
            
            if (yearlyEntries.length >= 2) {
                // Use linear regression if we have at least 2 years of data
                const result = regression.linear(yearlyEntries.map(([year, amount]) => [year, amount]));
                prediction = result.predict(currentYear + 1)[1] * scaleFactor;
            } else {
                // Fallback to monthly average * 12 if not enough yearly data
                prediction = monthlyAverages.reduce((a, b) => a + b, 0) * months;
            }
            
            // Apply inflation adjustment to the prediction
            prediction = prediction * (1 + INFLATION_RATE);
            
            // Ensure no negative predictions
            predictions[dept] = Math.max(0, parseFloat(prediction.toFixed(2)));
        } catch (e) {
            console.error(`Prediction error for ${dept}:`, e);
            predictions[dept] = 0;
        }
    }

    return predictions;
}

async function getHistoricalSpendingData(department = null) {
    try {
        let sql = `
            SELECT 
                dept,
                YEAR(date_acq) as year,
                MONTH(date_acq) as month,
                SUM(balcard) as total_amount
            FROM ics
            WHERE date_acq IS NOT NULL AND balcard IS NOT NULL
        `;
        
        const params = [];
        if (department) {
            sql += ` AND dept = ?`;
            params.push(department);
        }
        
        sql += `
            GROUP BY dept, YEAR(date_acq), MONTH(date_acq)
            ORDER BY dept, year, month
        `;

        const data = await new Promise((resolve, reject) => {
            db.query(sql, params, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // Organize data by department
        const organizedData = {};
        data.forEach(row => {
            if (!organizedData[row.dept]) {
                organizedData[row.dept] = [];
            }
            organizedData[row.dept].push({
                date: new Date(row.year, row.month - 1),
                amount: parseFloat(row.total_amount)
            });
        });

        return organizedData;
    } catch (error) {
        console.error('Error fetching historical data:', error);
        return {};
    }
}

async function getSpendingPatterns(department) {
    try {
        // Get monthly spending patterns
        const monthlyPatterns = await new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    MONTH(date_acq) as month,
                    SUM(balcard) as total_amount,
                    COUNT(*) as transaction_count
                FROM ics
                WHERE dept = ? AND balcard IS NOT NULL
                GROUP BY MONTH(date_acq)
                ORDER BY month
            `;
            db.query(sql, [department], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // Get yearly spending patterns
        const yearlyPatterns = await new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    YEAR(date_acq) as year,
                    SUM(balcard) as total_amount,
                    COUNT(*) as transaction_count
                FROM ics
                WHERE dept = ? AND balcard IS NOT NULL
                GROUP BY YEAR(date_acq)
                ORDER BY year
            `;
            db.query(sql, [department], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // Calculate total for percentage calculations
        const totalSpending = monthlyPatterns.reduce((sum, item) => sum + parseFloat(item.total_amount), 0);

        // Identify peak months (top 3)
        const peakMonths = monthlyPatterns
            .map(item => ({
                name: new Date(2000, item.month - 1, 1).toLocaleString('default', { month: 'long' }),
                amount: parseFloat(item.total_amount),
                percentage: ((parseFloat(item.total_amount) / totalSpending) * 100).toFixed(1)
            }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 3);

        return {
            monthly: monthlyPatterns.map(item => ({
                month: item.month,
                totalAmount: parseFloat(item.total_amount),
                averageAmount: parseFloat(item.total_amount) / (item.transaction_count || 1),
                transactionCount: item.transaction_count
            })),
            yearly: yearlyPatterns.map(item => ({
                year: item.year,
                totalAmount: parseFloat(item.total_amount),
                averageAmount: parseFloat(item.total_amount) / (item.transaction_count || 1),
                transactionCount: item.transaction_count
            })),
            peakMonths
        };
    } catch (error) {
        console.error('Error fetching spending patterns:', error);
        return {
            monthly: [],
            yearly: [],
            peakMonths: []
        };
    }
}

exports.getPredictions = async (req, res) => {
    try {
        const { department, timePeriod = 12, viewType = 'monthly' } = req.body;
        
        // Get ICS data (filter by department if not 'all')
        let sql = `SELECT dept, date_acq, balcard FROM ics WHERE balcard IS NOT NULL AND balcard > 0`;
        const params = [];
        if (department !== 'all') {
            sql += ` AND dept = ?`;
            params.push(department);
        }
        
        const icsData = await new Promise((resolve, reject) => {
            db.query(sql, params, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // Calculate predictions based on time period
        const predictions = await predictBudgets(icsData, parseInt(timePeriod));
        
        // Prepare chart data
        const chartData = await prepareChartData(icsData, viewType, parseInt(timePeriod));
        
        // Get insights
        const insights = department !== 'all' ? 
            await getSpendingPatterns(department) : 
            await getAggregateSpendingPatterns();

        res.json({
            success: true,
            predictions,
            chartData,
            insights: {
                peakMonths: insights.peakMonths || []
            }
        });
        
    } catch (error) {
        console.error('Prediction error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
};

async function prepareChartData(icsData, viewType, months) {
    // Process data for chart visualization
    const scaleFactor = months / 12;
    
    if (viewType === 'monthly') {
        const monthlyData = Array(12).fill(0);
        const monthlyCount = Array(12).fill(0);
        
        icsData.forEach(record => {
            const date = record.date_acq ? new Date(record.date_acq) : null;
            if (!date || isNaN(date)) return;
            
            const month = date.getMonth();
            const amount = parseFloat(record.balcard) || 0;
            
            monthlyData[month] += amount;
            monthlyCount[month]++;
        });
        
        const monthlyAverages = monthlyData.map((total, i) => 
            monthlyCount[i] > 0 ? (total / monthlyCount[i]) * scaleFactor : 0
        );
        
        return {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            datasets: [{
                label: 'Predicted Spending',
                data: monthlyAverages,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.1,
                fill: true
            }]
        };
    } else {
        // Yearly view
        const yearlyData = {};
        
        icsData.forEach(record => {
            const date = record.date_acq ? new Date(record.date_acq) : null;
            if (!date || isNaN(date)) return;
            
            const year = date.getFullYear();
            const amount = parseFloat(record.balcard) || 0;
            
            if (!yearlyData[year]) {
                yearlyData[year] = { total: 0, count: 0 };
            }
            
            yearlyData[year].total += amount;
            yearlyData[year].count++;
        });
        
        const years = Object.keys(yearlyData).sort();
        const yearlyAverages = years.map(year => 
            (yearlyData[year].total / yearlyData[year].count) * scaleFactor
        );
        
        // Predict future years based on trend
        const currentYear = new Date().getFullYear();
        const futureYears = Array.from({length: 5}, (_, i) => currentYear + i + 1);
        
        if (years.length >= 2) {
            const regressionData = years.map((year, i) => [parseInt(year), yearlyAverages[i]]);
            const result = regression.linear(regressionData);
            
            futureYears.forEach(year => {
                years.push(year.toString());
                yearlyAverages.push(result.predict(year)[1]);
            });
        }
        
        return {
            labels: years,
            datasets: [{
                label: 'Predicted Spending',
                data: yearlyAverages,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.1,
                fill: true
            }]
        };
    }
}

async function getAggregateSpendingPatterns() {
    try {
        // Get monthly spending patterns
        const monthlyPatterns = await new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    MONTH(date_acq) as month,
                    SUM(balcard) as total_amount,
                    COUNT(*) as transaction_count
                FROM ics
                WHERE balcard IS NOT NULL
                GROUP BY MONTH(date_acq)
                ORDER BY month
            `;
            db.query(sql, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // Calculate total for percentage calculations
        const totalSpending = monthlyPatterns.reduce((sum, item) => sum + parseFloat(item.total_amount), 0);

        // Identify peak months (top 3)
        const peakMonths = monthlyPatterns
            .map(item => ({
                name: new Date(2000, item.month - 1, 1).toLocaleString('default', { month: 'long' }),
                amount: parseFloat(item.total_amount),
                percentage: ((parseFloat(item.total_amount) / totalSpending) * 100).toFixed(1)
            }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 3);

        return {
            monthly: monthlyPatterns.map(item => ({
                month: item.month,
                totalAmount: parseFloat(item.total_amount),
                averageAmount: parseFloat(item.total_amount) / (item.transaction_count || 1),
                transactionCount: item.transaction_count
            })),
            peakMonths
        };
    } catch (error) {
        console.error('Error fetching aggregate spending patterns:', error);
        return {
            monthly: [],
            peakMonths: []
        };
    }
}
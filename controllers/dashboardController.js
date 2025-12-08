const Department = require('../models/departmentModel');
const dashboardModel = require('../models/dashboardModel');
const db = require("../config/db");
const regression = require('regression');

// Import enhanced functions from predictiveController
const { 
    getEnhancedICSData, 
    predictBudgets: enhancedPredictBudgets,
    getDynamicInflationRate
} = require('./predictiveController');

// Enhanced prediction function using AI system
async function predictBudgets(icsData) {
    if (!icsData || !Array.isArray(icsData) || icsData.length === 0) {
        console.warn('No ICS data available for predictions');
        return {};
    }
    
    // Use the enhanced prediction system from predictiveController
    try {
        const predictions = await enhancedPredictBudgets(icsData, 12);
        return predictions;
    } catch (error) {
        console.error('Enhanced prediction failed, falling back to basic:', error);
        return fallbackPrediction(icsData);
    }
}

// Basic fallback prediction (keep as backup)
async function fallbackPrediction(icsData) {
    const INFLATION_RATE = 0.05;
    const departmentData = {};
    
    icsData.forEach((record, index) => {
        try {
            if (!record.department_name) {
                console.warn(`Record ${index} missing department_name:`, record);
                return;
            }

            const dept = record.department_name;
            const date = record.date_acq ? new Date(record.date_acq) : null;
            
            if (!date || isNaN(date)) {
                console.warn(`Invalid date in record ${index}:`, record.date_acq);
                return;
            }

            const amount = parseFloat(record.unit_of_value) || 0;
            const month = date.getMonth();
            const year = date.getFullYear();
            
            if (!departmentData[dept]) {
                departmentData[dept] = { 
                    monthlyTotals: Array(12).fill(0), 
                    count: Array(12).fill(0),
                    yearlyData: {}
                };
            }
            
            if (!departmentData[dept].yearlyData[year]) {
                departmentData[dept].yearlyData[year] = {
                    monthlyTotals: Array(12).fill(0),
                    count: Array(12).fill(0)
                };
            }
            
            departmentData[dept].monthlyTotals[month] += amount;
            departmentData[dept].count[month]++;
            departmentData[dept].yearlyData[year].monthlyTotals[month] += amount;
            departmentData[dept].yearlyData[year].count[month]++;
        } catch (e) {
            console.error(`Error processing record ${index}:`, e);
        }
    });

    const predictions = {};
    
    for (const dept in departmentData) {
        try {
            const monthlyAverages = departmentData[dept].monthlyTotals.map((total, i) => 
                departmentData[dept].count[i] > 0 ? total / departmentData[dept].count[i] : 0
            );

            const years = Object.keys(departmentData[dept].yearlyData).sort();
            if (years.length > 1) {
                const currentYear = new Date().getFullYear();
                for (const year of years) {
                    const yearDiff = currentYear - parseInt(year);
                    if (yearDiff > 0) {
                        const inflationFactor = Math.pow(1 + INFLATION_RATE, yearDiff);
                        for (let month = 0; month < 12; month++) {
                            if (departmentData[dept].yearlyData[year].count[month] > 0) {
                                const adjustedAmount = departmentData[dept].yearlyData[year].monthlyTotals[month] * inflationFactor;
                                monthlyAverages[month] = ((monthlyAverages[month] || 0) + adjustedAmount) / 2;
                            }
                        }
                    }
                }
            }

            const dataForRegression = monthlyAverages
                .map((avg, month) => [month + 1, avg])
                .filter(point => point[1] > 0);
            
            let prediction;
            if (dataForRegression.length > 1) {
                const result = regression.linear(dataForRegression);
                prediction = result.predict(13)[1] * 12;
                prediction = prediction * (1 + INFLATION_RATE);
                prediction = Math.max(0, prediction);
            } else {
                prediction = monthlyAverages.reduce((a, b) => a + b, 0) * 12;
                prediction = prediction * (1 + INFLATION_RATE);
                prediction = Math.max(0, prediction);
            }
            
            predictions[dept] = parseFloat(prediction.toFixed(2));
        } catch (e) {
            console.error(`Error predicting for ${dept}:`, e);
            predictions[dept] = 0;
        }
    }

    return predictions;
}

// Helper function for fallback forecast
function generateFallbackForecast(row) {
    const base = (row.yearly_spending || row.total_spent || row.avg_yearly_spending || 1000000) / 1000000;
    return Array.from({length: 5}, (_, i) => 
        base * Math.pow(1.05, i + 1) // 5% annual growth
    );
}

// Updated formatChartData function to handle new data structures
function formatChartData(rawData, type) {
    switch (type) {
        case 'yearly':
            // Handle enhanced yearly forecast data
            if (rawData && rawData.length > 0) {
                // Extract 5-year forecast from JSON array
                const firstRow = rawData[0];
                const currentYear = new Date().getFullYear();
                const forecastYears = Array.from({length: 5}, (_, i) => currentYear + i + 1);
                
                let forecastData;
                if (firstRow.five_year_forecast) {
                    // Parse JSON array if it exists
                    try {
                        forecastData = JSON.parse(firstRow.five_year_forecast);
                    } catch (e) {
                        console.warn('Failed to parse five_year_forecast JSON:', e);
                        forecastData = generateFallbackForecast(firstRow);
                    }
                } else if (firstRow.ai_predicted_next_year) {
                    // Generate forecast based on AI prediction
                    const base = parseFloat(firstRow.ai_predicted_next_year) / 1000000; // Convert to millions
                    forecastData = Array.from({length: 5}, (_, i) => base * Math.pow(1.08, i + 1));
                } else {
                    forecastData = generateFallbackForecast(firstRow);
                }

                return {
                    labels: forecastYears,
                    data: forecastData.map(val => parseFloat(val.toFixed(2)))
                };
            } else {
                // Generate basic forecast even with no data
                const currentYear = new Date().getFullYear();
                const forecastYears = Array.from({length: 5}, (_, i) => currentYear + i + 1);
                const baseAmount = 1.0; // 1 million base for departments with no data
                const forecastData = Array.from({length: 5}, (_, i) => 
                    baseAmount * Math.pow(1.05, i + 1) // 5% annual growth
                );
                
                return {
                    labels: forecastYears,
                    data: forecastData.map(val => parseFloat(val.toFixed(2)))
                };
            }
            
        case 'monthly':
            // Handle enhanced monthly spending data
            if (rawData && Array.isArray(rawData)) {
                // Ensure we have data for all 12 months
                const monthlyData = Array(12).fill(0);
                const monthlyDataPAR = Array(12).fill(0);
                
                rawData.forEach(row => {
                    const month = row.month_num - 1; // Convert to 0-based index
                    if (month >= 0 && month < 12) {
                        monthlyData[month] = parseFloat(row.ics_spending) / 1000000 || 0; // Convert to millions
                        monthlyDataPAR[month] = parseFloat(row.par_spending) / 1000000 || 0; // Convert to millions
                    }
                });
                
                return {
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                    icsData: monthlyData.map(val => parseFloat(val.toFixed(2))),
                    parData: monthlyDataPAR.map(val => parseFloat(val.toFixed(2)))
                };
            } else {
                // No data available
                return {
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                    icsData: Array(12).fill(0),
                    parData: Array(12).fill(0)
                };
            }
            
        case 'distribution':
            // Handle enhanced department distribution data
            if (rawData && rawData.length > 0) {
                const total = rawData.reduce((sum, row) => sum + parseFloat(row.total_spent || 0), 0);
                
                // Filter out departments with no spending
                const validData = rawData.filter(row => parseFloat(row.total_spent || 0) > 0);
                
                if (validData.length === 0) {
                    return {
                        labels: ['No Data'],
                        data: [1],
                        percentages: [100]
                    };
                }
                
                return {
                    labels: validData.map(row => row.department || `Department ${row.department_code}`),
                    data: validData.map(row => parseFloat((row.total_spent / 1000000).toFixed(2))),
                    percentages: validData.map(row => total > 0 ? 
                        parseFloat(((row.total_spent / total) * 100).toFixed(1)) : 0)
                };
            } else {
                // No data available
                return {
                    labels: ['No Data'],
                    data: [1],
                    percentages: [100]
                };
            }
            
        default:
            return { labels: [], data: [], percentages: [] };
    }
}

// NEW: Function to fetch enhanced yearly forecast data
async function fetchEnhancedYearlyForecastFromICS(department) {
    try {
        const sql = `
            WITH yearly_spending AS (
                SELECT 
                    YEAR(i.date_acq) as year,
                    d.department_id,
                    d.department_name,
                    d.department_code,
                    SUM(i.balcard) as yearly_total,
                    COUNT(*) as transaction_count,
                    AVG(i.balcard) as avg_transaction,
                    MAX(i.date_acq) as latest_purchase
                FROM ics i
                JOIN departments d ON i.dept = d.department_id
                WHERE i.balcard > 0 
                    AND i.date_acq IS NOT NULL
                    AND i.condemned = 0 
                    AND i.disposed = 0
                    ${department ? 'AND d.department_name = ?' : ''}
                GROUP BY YEAR(i.date_acq), d.department_id
            ),
            growth_rates AS (
                SELECT 
                    department_id,
                    year,
                    yearly_total,
                    LAG(yearly_total) OVER (PARTITION BY department_id ORDER BY year) as prev_year_total,
                    CASE 
                        WHEN LAG(yearly_total) OVER (PARTITION BY department_id ORDER BY year) > 0
                        THEN (yearly_total - LAG(yearly_total) OVER (PARTITION BY department_id ORDER BY year)) / 
                             LAG(yearly_total) OVER (PARTITION BY department_id ORDER BY year)
                        ELSE 0
                    END as growth_rate
                FROM yearly_spending
            ),
            department_stats AS (
                SELECT 
                    department_id,
                    COUNT(DISTINCT year) as years_of_data,
                    AVG(yearly_total) as avg_yearly_spending,
                    STDDEV(yearly_total) as spending_volatility,
                    AVG(growth_rate) as avg_growth_rate,
                    MAX(year) as latest_year
                FROM growth_rates
                GROUP BY department_id
            )
            SELECT 
                ys.department_name,
                ys.department_code,
                ys.year as historical_year,
                ys.yearly_total as yearly_spending,
                ys.transaction_count,
                ds.avg_yearly_spending,
                ds.avg_growth_rate,
                ds.spending_volatility,
                ds.years_of_data,
                -- AI-enhanced 5-year forecast
                JSON_ARRAY(
                    ROUND(COALESCE(ys.yearly_total * POWER(1 + GREATEST(ds.avg_growth_rate, 0.03), 1), 
                          ds.avg_yearly_spending * 1.08), 2),
                    ROUND(COALESCE(ys.yearly_total * POWER(1 + GREATEST(ds.avg_growth_rate, 0.03), 2), 
                          ds.avg_yearly_spending * 1.1664), 2),
                    ROUND(COALESCE(ys.yearly_total * POWER(1 + GREATEST(ds.avg_growth_rate, 0.03), 3), 
                          ds.avg_yearly_spending * 1.2597), 2),
                    ROUND(COALESCE(ys.yearly_total * POWER(1 + GREATEST(ds.avg_growth_rate, 0.03), 4), 
                          ds.avg_yearly_spending * 1.3605), 2),
                    ROUND(COALESCE(ys.yearly_total * POWER(1 + GREATEST(ds.avg_growth_rate, 0.03), 5), 
                          ds.avg_yearly_spending * 1.4693), 2)
                ) as five_year_forecast,
                -- Next year prediction
                ROUND(
                    COALESCE(
                        ys.yearly_total * (1 + GREATEST(ds.avg_growth_rate, 0.03)) * 
                        (1 + 0.05) * -- Base inflation
                        (1 + (ds.spending_volatility / NULLIF(ds.avg_yearly_spending, 0) * 0.3)),
                        ds.avg_yearly_spending * 1.08
                    ), 2
                ) as ai_predicted_next_year
            FROM yearly_spending ys
            JOIN department_stats ds ON ys.department_id = ds.department_id
            WHERE ys.year = ds.latest_year
            ${department ? 'AND ys.department_name = ?' : ''}
            ORDER BY ys.yearly_total DESC
        `;

        const params = department ? [department, department] : [];

        return await new Promise((resolve, reject) => {
            db.query(sql, params, (err, results) => {
                if (err) {
                    console.error('Error fetching enhanced yearly forecast:', err);
                    reject(err);
                } else {
                    resolve(results);
                }
            });
        });
    } catch (error) {
        console.error('Error in fetchEnhancedYearlyForecastFromICS:', error);
        return [];
    }
}

// NEW: Function to fetch department distribution from ICS
async function fetchDepartmentDistributionFromICS(department) {
    try {
        const sql = `
            SELECT 
                d.department_name as department,
                d.department_code,
                d.department_id,
                COUNT(DISTINCT i.id) as item_count,
                SUM(i.balcard) as total_spent,
                COUNT(DISTINCT YEAR(i.date_acq)) as active_years,
                AVG(i.unit_of_value) as avg_item_value,
                COUNT(DISTINCT i.item_classification) as category_count,
                MAX(i.date_acq) as latest_purchase,
                MIN(i.date_acq) as earliest_purchase,
                -- Current year spending
                SUM(CASE WHEN YEAR(i.date_acq) = YEAR(CURDATE()) THEN i.balcard ELSE 0 END) as current_year_spending,
                -- Last year spending
                SUM(CASE WHEN YEAR(i.date_acq) = YEAR(CURDATE()) - 1 THEN i.balcard ELSE 0 END) as last_year_spending,
                -- Calculate YoY growth
                CASE 
                    WHEN SUM(CASE WHEN YEAR(i.date_acq) = YEAR(CURDATE()) - 1 THEN i.balcard ELSE 0 END) > 0
                    THEN ROUND(
                        (SUM(CASE WHEN YEAR(i.date_acq) = YEAR(CURDATE()) THEN i.balcard ELSE 0 END) - 
                         SUM(CASE WHEN YEAR(i.date_acq) = YEAR(CURDATE()) - 1 THEN i.balcard ELSE 0 END)) / 
                         SUM(CASE WHEN YEAR(i.date_acq) = YEAR(CURDATE()) - 1 THEN i.balcard ELSE 0 END) * 100, 
                        2
                    )
                    ELSE 0 
                END as yoy_growth_percent
            FROM ics i
            JOIN departments d ON i.dept = d.department_id
            WHERE i.balcard > 0 
                AND i.date_acq IS NOT NULL
                AND i.condemned = 0 
                AND i.disposed = 0
                ${department ? 'AND d.department_name = ?' : ''}
            GROUP BY d.department_id, d.department_name, d.department_code
            HAVING total_spent > 0
            ORDER BY total_spent DESC
            ${!department ? 'LIMIT 10' : ''}
        `;

        const params = department ? [department] : [];

        return await new Promise((resolve, reject) => {
            db.query(sql, params, (err, results) => {
                if (err) {
                    console.error('Error fetching department distribution:', err);
                    reject(err);
                } else {
                    // If specific department requested and no results, get department-only data
                    if (department && (!results || results.length === 0)) {
                        const fallbackSql = `
                            SELECT 
                                d.department_name as department,
                                d.department_code,
                                d.department_id,
                                COALESCE(SUM(i.balcard), 0) as total_spent,
                                COUNT(i.id) as item_count
                            FROM departments d
                            LEFT JOIN ics i ON d.department_id = i.dept 
                                AND i.balcard > 0 
                                AND i.date_acq IS NOT NULL
                                AND i.condemned = 0 
                                AND i.disposed = 0
                            WHERE d.department_name = ?
                            GROUP BY d.department_id, d.department_name, d.department_code
                        `;
                        
                        db.query(fallbackSql, [department], (fallbackErr, fallbackResults) => {
                            if (fallbackErr) {
                                reject(fallbackErr);
                            } else {
                                resolve(fallbackResults);
                            }
                        });
                    } else {
                        resolve(results);
                    }
                }
            });
        });
    } catch (error) {
        console.error('Error in fetchDepartmentDistributionFromICS:', error);
        return [];
    }
}

// DEBUG VERSION: Function to fetch monthly spending from ICS
async function fetchMonthlySpendingFromICS(department) {
    try {
        const currentYear = new Date().getFullYear();
        console.log(`DEBUG: Fetching monthly spending for ${department || 'all departments'}`);
        
        // First, let's check if there's ANY ICS data at all
        const checkSql = `
            SELECT COUNT(*) as total_records, 
                   MIN(date_acq) as earliest_date,
                   MAX(date_acq) as latest_date,
                   SUM(balcard) as total_spent
            FROM ics 
            WHERE balcard > 0 
                AND date_acq IS NOT NULL
                AND condemned = 0 
                AND disposed = 0
                ${department ? 'AND dept IN (SELECT department_id FROM departments WHERE department_name = ?)' : ''}
        `;
        
        console.log('DEBUG: Checking ICS data existence...');
        const checkResults = await new Promise((resolve, reject) => {
            db.query(checkSql, department ? [department] : [], (err, results) => {
                if (err) {
                    console.error('DEBUG: Check query error:', err);
                    reject(err);
                } else {
                    console.log('DEBUG: ICS data check:', results[0]);
                    resolve(results[0]);
                }
            });
        });
        
        if (checkResults.total_records === 0) {
            console.log('DEBUG: No ICS records found in database');
            return getEmptyMonthlyData();
        }
        
        console.log(`DEBUG: Found ${checkResults.total_records} ICS records from ${checkResults.earliest_date} to ${checkResults.latest_date}`);
        
        // Now get the actual monthly spending data
        const sql = `
            WITH monthly_data AS (
                SELECT 
                    MONTH(i.date_acq) as month_num,
                    DATE_FORMAT(i.date_acq, '%b') as month_name,
                    YEAR(i.date_acq) as year,
                    SUM(CASE WHEN i.balcard < 50000 THEN i.balcard ELSE 0 END) as ics_spending,
                    SUM(CASE WHEN i.balcard >= 50000 THEN i.balcard ELSE 0 END) as par_spending,
                    COUNT(CASE WHEN i.balcard < 50000 THEN i.id END) as ics_count,
                    COUNT(CASE WHEN i.balcard >= 50000 THEN i.id END) as par_count,
                    d.department_name
                FROM ics i
                LEFT JOIN departments d ON i.dept = d.department_id
                WHERE i.balcard > 0 
                    AND i.date_acq IS NOT NULL
                    AND i.condemned = 0 
                    AND i.disposed = 0
                    ${department ? 'AND d.department_name = ?' : ''}
                GROUP BY YEAR(i.date_acq), MONTH(i.date_acq), d.department_name
                ORDER BY YEAR(i.date_acq) DESC, MONTH(i.date_acq)
            ),
            latest_year AS (
                SELECT MAX(year) as latest_year FROM monthly_data
            ),
            all_months AS (
                SELECT 1 as month_num, 'Jan' as month_name
                UNION SELECT 2, 'Feb' UNION SELECT 3, 'Mar' UNION SELECT 4, 'Apr'
                UNION SELECT 5, 'May' UNION SELECT 6, 'Jun' UNION SELECT 7, 'Jul'
                UNION SELECT 8, 'Aug' UNION SELECT 9, 'Sep' UNION SELECT 10, 'Oct'
                UNION SELECT 11, 'Nov' UNION SELECT 12, 'Dec'
            )
            SELECT 
                am.month_num,
                am.month_name,
                COALESCE(SUM(md.ics_spending), 0) as ics_spending,
                COALESCE(SUM(md.par_spending), 0) as par_spending,
                COALESCE(SUM(md.ics_count), 0) as ics_count,
                COALESCE(SUM(md.par_count), 0) as par_count,
                ly.latest_year as data_year
            FROM all_months am
            CROSS JOIN latest_year ly
            LEFT JOIN monthly_data md ON am.month_num = md.month_num 
                AND md.year = ly.latest_year
            GROUP BY am.month_num, am.month_name, ly.latest_year
            ORDER BY am.month_num
        `;

        const params = department ? [department] : [];
        
        console.log('DEBUG: Running monthly spending query...');
        return await new Promise((resolve, reject) => {
            db.query(sql, params, (err, results) => {
                if (err) {
                    console.error('DEBUG: Monthly query error:', err);
                    reject(err);
                } else {
                    console.log(`DEBUG: Query returned ${results.length} months of data`);
                    console.log('DEBUG: First few results:', results.slice(0, 3));
                    
                    // Check if we got any data
                    const hasData = results.some(row => row.ics_spending > 0 || row.par_spending > 0);
                    
                    if (!hasData) {
                        console.log('DEBUG: No monthly spending data found for latest year');
                        // Try to get data from ANY year
                        const anyYearSql = `
                            SELECT 
                                MONTH(date_acq) as month_num,
                                DATE_FORMAT(date_acq, '%b') as month_name,
                                SUM(CASE WHEN balcard < 50000 THEN balcard ELSE 0 END) as ics_spending,
                                SUM(CASE WHEN balcard >= 50000 THEN balcard ELSE 0 END) as par_spending,
                                YEAR(date_acq) as data_year
                            FROM ics
                            WHERE balcard > 0 
                                AND date_acq IS NOT NULL
                                AND condemned = 0 
                                AND disposed = 0
                                ${department ? 'AND dept IN (SELECT department_id FROM departments WHERE department_name = ?)' : ''}
                            GROUP BY YEAR(date_acq), MONTH(date_acq)
                            ORDER BY YEAR(date_acq) DESC, MONTH(date_acq)
                            LIMIT 12
                        `;
                        
                        db.query(anyYearSql, department ? [department] : [], (anyYearErr, anyYearResults) => {
                            if (anyYearErr) {
                                console.error('DEBUG: Any year query error:', anyYearErr);
                                resolve(getEmptyMonthlyData());
                            } else {
                                console.log(`DEBUG: Any year query returned ${anyYearResults.length} results`);
                                const formattedResults = formatMonthlyResults(anyYearResults);
                                resolve(formattedResults);
                            }
                        });
                    } else {
                        resolve(results);
                    }
                }
            });
        });
        
    } catch (error) {
        console.error('Error in fetchMonthlySpendingFromICS:', error);
        return getEmptyMonthlyData();
    }
}

// Helper function to format monthly results
function formatMonthlyResults(results) {
    const monthlyMap = {};
    results.forEach(row => {
        monthlyMap[row.month_num] = row;
    });
    
    return Array.from({length: 12}, (_, i) => {
        const monthNum = i + 1;
        const row = monthlyMap[monthNum] || {
            month_num: monthNum,
            month_name: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i],
            ics_spending: 0,
            par_spending: 0,
            ics_count: 0,
            par_count: 0,
            data_year: results[0]?.data_year || new Date().getFullYear()
        };
        
        return {
            month_num: monthNum,
            month_name: row.month_name,
            ics_spending: parseFloat(row.ics_spending) || 0,
            par_spending: parseFloat(row.par_spending) || 0,
            ics_count: parseInt(row.ics_count) || 0,
            par_count: parseInt(row.par_count) || 0,
            data_year: row.data_year || new Date().getFullYear(),
            has_data: (row.ics_spending > 0 || row.par_spending > 0) ? 1 : 0
        };
    });
}

// Helper function for empty monthly data
function getEmptyMonthlyData() {
    return Array.from({length: 12}, (_, i) => ({
        month_num: i + 1,
        month_name: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i],
        ics_spending: 0,
        par_spending: 0,
        ics_count: 0,
        par_count: 0,
        data_year: new Date().getFullYear(),
        has_data: 0
    }));
}

exports.getDashboardData = async (req, res) => {
    try {
        const isSuperAdmin = req.user.user_type === 'superadmin';
        const isAdmin = req.user.user_type === 'superadmin' || req.user.user_type === 'admin';
        const userDepartment = req.user.department;
        const userDepartmentId = req.user.department_id;

        console.log('User info:', { user_type: req.user.user_type, userDepartment, userDepartmentId });

        // Use enhanced ICS data function from predictiveController
        let icsData = [];
        try {
            console.log('Fetching enhanced ICS data for predictions...');
            
            // Determine department filter for non-admin users
            let selectedDepartment = null;
            if (!isAdmin && userDepartment) {
                selectedDepartment = userDepartment;
            }
            
            // Use the enhanced ICS data function
            icsData = await getEnhancedICSData(selectedDepartment);
            console.log('Enhanced ICS data fetched:', icsData.length, 'records');
        } catch (predictionError) {
            console.error('Enhanced ICS data fetch error:', predictionError);
            
            // Fallback to original query if enhanced fails
            try {
                let sql = `
                    SELECT d.department_name, i.date_acq, i.unit_of_value, i.dept
                    FROM ics i
                    JOIN departments d ON i.dept = d.department_id
                    WHERE i.date_acq IS NOT NULL
                        AND i.condemned = 0 AND i.disposed = 0
                `;
                if (!isAdmin && userDepartment) {
                    sql += ` AND d.department_name = ?`;
                }
                console.log('Fallback ICS Data Query:', sql);
                icsData = await new Promise((resolve, reject) => {
                    db.query(sql, !isAdmin && userDepartment ? [userDepartment] : [], (err, results) => {
                        if (err) reject(err);
                        else {
                            console.log('Fallback ICS data query result:', results.length, 'records');
                            resolve(results);
                        }
                    });
                });
            } catch (fallbackError) {
                console.error('Fallback ICS data fetch also failed:', fallbackError);
                icsData = [];
            }
        }

        // Calculate department predictions using enhanced AI system
        let departmentPredictions = {};
        let predictionsAvailable = false;
        let filteredDepartments = [];
        
        if (icsData.length > 0) {
            console.log('Processing ICS data with enhanced AI prediction system...');
            
            try {
                // Use enhanced prediction function
                departmentPredictions = await enhancedPredictBudgets(icsData, 12);
                predictionsAvailable = Object.keys(departmentPredictions).length > 0;
                
                // Convert predictions to array format with full department info
                const departmentsArray = [];
                
                // First, get all departments to map IDs
                const allDepartments = await new Promise((resolve, reject) => {
                    const sql = "SELECT * FROM departments ORDER BY department_name";
                    db.query(sql, (err, results) => {
                        if (err) reject(err);
                        else resolve(results);
                    });
                });
                
                // Process each prediction
                for (const [deptKey, prediction] of Object.entries(departmentPredictions)) {
                    const amount = prediction.amount || 0;
                    
                    // Skip departments with 0 budget or low confidence
                    if (amount <= 0 || (prediction.factors && prediction.factors.confidence < 30)) {
                        continue;
                    }
                    
                    const deptCode = prediction.code || deptKey;
                    const deptId = prediction.id || null;
                    const deptName = prediction.name || deptKey;
                    
                    // Find the matching department in our departments array
                    const department = allDepartments.find(d => 
                        d.department_id === deptId || 
                        d.department_code === deptCode || 
                        d.department_name === deptName
                    );
                    
                    if (department) {
                        departmentsArray.push({
                            id: department.department_id,
                            name: department.department_name,
                            code: department.department_code,
                            amount: amount,
                            confidence: prediction.factors?.confidence || 0,
                            inflationRate: prediction.factors?.inflationRate || 0.05
                        });
                    } else {
                        // Fallback if department not found
                        const displayName = deptName;
                        const displayCode = deptCode.includes('(') ? 
                            deptCode.match(/\((.*?)\)/)?.[1] || deptCode : 
                            deptCode;
                        
                        departmentsArray.push({
                            id: deptId,
                            name: displayName,
                            code: displayCode,
                            amount: amount,
                            confidence: prediction.factors?.confidence || 0,
                            inflationRate: prediction.factors?.inflationRate || 0.05
                        });
                    }
                }
                
                // Sort by amount (descending)
                filteredDepartments = departmentsArray.sort((a, b) => b.amount - a.amount);
                
                console.log('Enhanced predictions generated:', filteredDepartments.length, 'departments');
                
            } catch (enhancedError) {
                console.error('Enhanced prediction failed, using fallback:', enhancedError);
                
                // Fallback to basic prediction
                departmentPredictions = await fallbackPrediction(icsData);
                predictionsAvailable = Object.keys(departmentPredictions).length > 0;
                filteredDepartments = Object.entries(departmentPredictions)
                    .filter(([dept, amount]) => amount > 0)
                    .sort((a, b) => b[1] - a[1])
                    .map(([deptName, amount]) => ({
                        name: deptName,
                        amount: amount,
                        code: deptName, // Basic fallback
                        id: null,
                        confidence: 0,
                        inflationRate: 0.05
                    }));
            }
        } else {
            console.warn('No ICS data, setting empty predictions');
            departmentPredictions = {};
            predictionsAvailable = false;
            filteredDepartments = [];
        }

        // For non-superadmin, non-admin users, restrict predictions to their department
        if (!isAdmin && userDepartment) {
            const userDeptPrediction = filteredDepartments.find(dept => 
                dept.name === userDepartment || 
                dept.code === userDepartment ||
                (dept.id && dept.id.toString() === (userDepartmentId || '').toString())
            );
            
            departmentPredictions = {
                [userDepartment]: userDeptPrediction?.amount || 0
            };
            filteredDepartments = userDeptPrediction ? [userDeptPrediction] : [];
        }

        // Fetch other dashboard data in parallel using NEW ICS-based functions
        const [
            pendingRequests,
            propertySmall,
            icsBelow50k,
            parAbove50k,
            totalSpent,
            totalEmployees,
            yearlyForecastData,
            departmentDistributionData,
            monthlySpendingData
        ] = await Promise.all([
            new Promise((resolve, reject) => {
                dashboardModel.fetchPendingRequests(isAdmin ? null : userDepartment, (err, results) => {
                    if (err) reject(err);
                    else {
                        const total = results[0]?.pending_requests || 0;
                        console.log('Pending requests:', total);
                        resolve(total);
                    }
                });
            }),
            new Promise((resolve, reject) => {
                dashboardModel.fetchPropertySmall(isAdmin ? null : userDepartment, (err, results) => {
                    if (err) reject(err);
                    else {
                        const total = results[0]?.property_small || 0;
                        console.log('Property Small:', total);
                        resolve(total);
                    }
                });
            }),
            new Promise((resolve, reject) => {
                dashboardModel.fetchIcsBelow50k(isAdmin ? null : userDepartment, (err, results) => {
                    if (err) reject(err);
                    else {
                        const total = results[0]?.ics_below_50k || 0;
                        console.log('ICS Below 50k:', total);
                        resolve(total);
                    }
                });
            }),
            new Promise((resolve, reject) => {
                dashboardModel.fetchParAbove50k(isAdmin ? null : userDepartment, (err, results) => {
                    if (err) reject(err);
                    else {
                        const total = results[0]?.par_above_50k || 0;
                        console.log('PAR Above 50k:', total);
                        resolve(total);
                    }
                });
            }),
            new Promise((resolve, reject) => {
                dashboardModel.fetchTotalSpent(isAdmin ? null : userDepartment, (err, results) => {
                    if (err) reject(err);
                    else {
                        const total = results[0]?.total_spent || 0;
                        console.log('Total spent:', total);
                        resolve(total);
                    }
                });
            }),
            new Promise((resolve, reject) => {
                dashboardModel.fetchTotalEmployees(isAdmin ? null : userDepartment, (err, results) => {
                    if (err) reject(err);
                    else {
                        const total = results[0]?.total_employees || 0;
                        console.log('Total employees:', total);
                        resolve(total);
                    }
                });
            }),
            // Use new ICS-based yearly forecast
            fetchEnhancedYearlyForecastFromICS(isAdmin ? null : userDepartment),
            // Use new ICS-based department distribution
            fetchDepartmentDistributionFromICS(isAdmin ? null : userDepartment),
            // Use new ICS-based monthly spending
            fetchMonthlySpendingFromICS(isAdmin ? null : userDepartment)
        ]);

        // Format chart data using updated formatter
        const formattedYearlyData = formatChartData(yearlyForecastData, 'yearly');
        const formattedDistributionData = formatChartData(departmentDistributionData, 'distribution');
        const formattedMonthlyData = formatChartData(monthlySpendingData, 'monthly');

        // Format filteredDepartments for EJS template
        const formattedSortedDepartments = filteredDepartments.map(dept => [
            dept.code,
            dept.amount,
            dept.id,
            dept.name,
            dept.confidence || 0
        ]);

        // Calculate total predicted amount
        const totalPredictedAmount = filteredDepartments.reduce((sum, dept) => sum + dept.amount, 0);

        res.render('index', {
            pendingRequests,
            propertySmall,
            icsBelow50k,
            parAbove50k,
            totalSpent,
            totalEmployees,
            departmentPredictions,
            predictionsAvailable,
            filteredDepartments: formattedSortedDepartments,
            yearlyForecastData: yearlyForecastData, // Pass raw data for debugging
            departmentDistributionData: departmentDistributionData, // Pass raw data for debugging
            monthlySpendingData: monthlySpendingData, // Pass raw data for debugging
            formattedYearlyData,
            formattedDistributionData,
            formattedMonthlyData,
            icsData: icsData || [],
            isAdmin,
            isSuperAdmin,
            userDepartment,
            user: req.user,
            totalPredictedAmount: totalPredictedAmount.toFixed(2),
            maxPredictedAmount: filteredDepartments.length > 0 ? filteredDepartments[0].amount : 0
        });

    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).render('index', {
            pendingRequests: 0,
            propertySmall: 0,
            icsBelow50k: 0,
            parAbove50k: 0,
            totalSpent: 0,
            totalEmployees: 0,
            departmentPredictions: {},
            predictionsAvailable: false,
            filteredDepartments: [],
            yearlyForecastData: [],
            departmentDistributionData: [],
            monthlySpendingData: [],
            formattedYearlyData: { labels: [], data: [] },
            formattedDistributionData: { labels: [], data: [], percentages: [] },
            formattedMonthlyData: { labels: [], icsData: [], parData: [] },
            icsData: [],
            isAdmin: false,
            isSuperAdmin: false,
            userDepartment: null,
            errorMessage: 'Failed to load dashboard data. Please try again later.'
        });
    }
};

// Export the new functions for use in other controllers
exports.fetchEnhancedYearlyForecastFromICS = fetchEnhancedYearlyForecastFromICS;
exports.fetchDepartmentDistributionFromICS = fetchDepartmentDistributionFromICS;
exports.fetchMonthlySpendingFromICS = fetchMonthlySpendingFromICS;
exports.formatChartData = formatChartData;
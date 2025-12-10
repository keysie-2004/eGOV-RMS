const express = require('express');
const router = express.Router();
const axios = require('axios');
const { requireAuth } = require('../middlewares/authMiddleware');
const Department = require('../models/departmentModel');
const { getIcs2024Requests } = require('../models/icsModel');
const db = require("../config/db");
const regression = require('regression');
const { getDynamicInflationRate, getEnhancedICSData, formatAITextToHTML } = require('../models/dashboardModel');

// Enhanced prediction function using the full engine
async function enhancedPredictBudgets(icsData, months = 12) {
    // Get dynamic inflation rate from your model
    const INFLATION_RATE = await getDynamicInflationRate();
    console.log(`Using dynamic inflation rate: ${(INFLATION_RATE * 100).toFixed(2)}%`);
    
    const departmentData = {};
    
    icsData.forEach(record => {
        const deptId = record.department_id || record.dept;
        const deptName = record.department_name || `Department ${record.dept}`;
        const deptCode = record.department_code || `D${record.dept}`;
        
        if (!deptId) return;

        const date = record.date_acq ? new Date(record.date_acq) : null;
        if (!date || isNaN(date)) return;
        
        const amount = parseFloat(record.balcard) || 0;
        const month = date.getMonth();
        const year = date.getFullYear();
        
        // Extract additional factors from ICS data
        const unitValue = parseFloat(record.unit_of_value) || 0;
        const quantity = parseFloat(record.qty) || 1;
        const conditionCode = record.condition_code || '2';
        const itemClass = record.item_classification || '';
        const status = record.status || '';
        
        // Calculate item age
        const itemAge = new Date().getFullYear() - year;
        
        // Use department_id as primary key
        const key = `ID_${deptId}`;
        
        if (!departmentData[key]) {
            departmentData[key] = {
                monthlyTotals: Array(12).fill(0),
                monthlyCounts: Array(12).fill(0),
                monthlyQuantities: Array(12).fill(0),
                yearlyData: {},
                yearlyMonthlyData: {},
                itemDetails: [],
                departmentId: deptId,
                departmentCode: deptCode,
                departmentName: deptName,
                conditionProfile: { 1: 0, 2: 0, 3: 0, 4: 0 },
                itemClasses: {},
                avgUnitValue: 0,
                totalQuantity: 0,
                totalAmount: 0
            };
        }
        
        // Monthly data
        departmentData[key].monthlyTotals[month] += amount;
        departmentData[key].monthlyCounts[month]++;
        departmentData[key].monthlyQuantities[month] += quantity;
        departmentData[key].totalAmount += amount;
        
        // Yearly data
        if (!departmentData[key].yearlyData[year]) {
            departmentData[key].yearlyData[year] = 0;
        }
        departmentData[key].yearlyData[year] += amount;
        
        // Track monthly data by year
        if (!departmentData[key].yearlyMonthlyData[year]) {
            departmentData[key].yearlyMonthlyData[year] = {
                monthlyTotals: Array(12).fill(0),
                monthlyCounts: Array(12).fill(0),
                monthlyQuantities: Array(12).fill(0)
            };
        }
        departmentData[key].yearlyMonthlyData[year].monthlyTotals[month] += amount;
        departmentData[key].yearlyMonthlyData[year].monthlyCounts[month]++;
        departmentData[key].yearlyMonthlyData[year].monthlyQuantities[month] += quantity;
        
        // Store item details for better prediction
        departmentData[key].itemDetails.push({
            year,
            amount,
            unitValue,
            quantity,
            conditionCode,
            itemAge,
            itemClass,
            status
        });
        
        // Update condition profile
        if (departmentData[key].conditionProfile[conditionCode] !== undefined) {
            departmentData[key].conditionProfile[conditionCode]++;
        }
        
        // Update item classes
        if (itemClass) {
            departmentData[key].itemClasses[itemClass] = 
                (departmentData[key].itemClasses[itemClass] || 0) + amount;
        }
        
        // Update averages
        departmentData[key].totalQuantity += quantity;
        departmentData[key].avgUnitValue = 
            ((departmentData[key].avgUnitValue || 0) + unitValue) / 
            (departmentData[key].itemDetails.length || 1);
    });

    const predictions = {};
    const scaleFactor = months / 12;
    const currentYear = new Date().getFullYear();
    
    for (const deptKey in departmentData) {
        try {
            const dept = departmentData[deptKey];
            
            // Skip departments with insufficient data
            if (dept.itemDetails.length < 3) {
                predictions[dept.departmentCode || deptKey] = {
                    amount: 0,
                    code: dept.departmentCode,
                    name: dept.departmentName,
                    id: dept.departmentId,
                    factors: { 
                        confidence: 0,
                        note: "Insufficient data for prediction"
                    }
                };
                continue;
            }

            // Calculate comprehensive monthly averages
            const monthlyAverages = dept.monthlyTotals.map((total, i) => {
                if (dept.monthlyCounts[i] > 0) {
                    return total / dept.monthlyCounts[i];
                }
                return 0;
            });

            // Calculate item replacement factors
            const replacementFactor = calculateReplacementFactor(dept);
            const conditionFactor = calculateConditionFactor(dept.conditionProfile);
            
            // Adjust historical data for dynamic inflation
            const years = Object.keys(dept.yearlyMonthlyData).sort();
            if (years.length > 1) {
                for (const year of years) {
                    const yearDiff = currentYear - parseInt(year);
                    if (yearDiff > 0) {
                        // Apply dynamic inflation rate
                        const inflationFactor = Math.pow(1 + INFLATION_RATE, yearDiff);
                        for (let month = 0; month < 12; month++) {
                            if (dept.yearlyMonthlyData[year].monthlyCounts[month] > 0) {
                                const adjustedAmount = 
                                    dept.yearlyMonthlyData[year].monthlyTotals[month] * inflationFactor;
                                // Weighted average with recent data having more weight
                                const weight = Math.max(0.1, 1 - (yearDiff * 0.2));
                                monthlyAverages[month] = 
                                    (monthlyAverages[month] * (1 - weight)) + (adjustedAmount * weight);
                            }
                        }
                    }
                }
            }

            // Yearly trend with multiple regression factors
            const yearlyEntries = Object.entries(dept.yearlyData)
                .map(([year, amount]) => [parseInt(year), amount])
                .sort((a, b) => a[0] - b[0]);

            let basePrediction;
            
            if (yearlyEntries.length >= 3) {
                // Enhanced regression with seasonal factors
                const seasonalFactors = calculateSeasonalFactors(dept);
                const result = regression.linear(yearlyEntries);
                
                // Base prediction from regression
                basePrediction = result.predict(currentYear + 1)[1];
                
                // Apply seasonal adjustment
                basePrediction *= (1 + seasonalFactors.average);
                
            } else if (yearlyEntries.length === 2) {
                // Two years: use growth rate
                const growthRate = (yearlyEntries[1][1] - yearlyEntries[0][1]) / yearlyEntries[0][1];
                basePrediction = yearlyEntries[1][1] * (1 + Math.max(growthRate, 0.02));
                
            } else if (yearlyEntries.length === 1) {
                // One year: use that with default growth
                basePrediction = yearlyEntries[0][1] * (1 + 0.03);
            } else {
                // No yearly data: use monthly average
                basePrediction = monthlyAverages.reduce((a, b) => a + b, 0) * 12;
            }
            
            // Apply comprehensive adjustments
            let prediction = basePrediction * scaleFactor;
            
            // Apply dynamic inflation
            prediction *= (1 + INFLATION_RATE);
            
            // Apply replacement factor (aging items)
            prediction *= (1 + replacementFactor);
            
            // Apply condition factor
            prediction *= (1 + conditionFactor);
            
            // Apply item class adjustments
            const classAdjustment = calculateClassAdjustment(dept.itemClasses);
            prediction *= (1 + classAdjustment);
            
            // Ensure reasonable bounds
            prediction = applyPredictionBounds(prediction, dept);
            
            // Calculate confidence level
            const confidence = calculateConfidenceLevel(dept);
            
            // Use department code as key for display
            const displayKey = dept.departmentCode || dept.departmentName || deptKey;
            predictions[displayKey] = {
                amount: Math.max(0, parseFloat(prediction.toFixed(2))),
                code: dept.departmentCode,
                name: dept.departmentName,
                id: dept.departmentId,
                factors: {
                    inflationRate: INFLATION_RATE,
                    replacementFactor,
                    conditionFactor,
                    classAdjustment,
                    confidence: confidence,
                    dataPoints: dept.itemDetails.length,
                    yearsOfData: Object.keys(dept.yearlyData).length
                }
            };
        } catch (e) {
            console.error(`Prediction error for ${deptKey}:`, e);
            predictions[deptKey] = {
                amount: 0,
                code: dept.departmentCode || deptKey,
                name: dept.departmentName || deptKey,
                id: dept.departmentId,
                factors: { error: e.message, confidence: 0 }
            };
        }
    }

    return predictions;
}

// Helper functions for enhanced prediction
function calculateReplacementFactor(dept) {
    if (dept.itemDetails.length === 0) return 0;
    
    const avgAge = dept.itemDetails.reduce((sum, item) => sum + item.itemAge, 0) / 
                   dept.itemDetails.length;
    
    if (avgAge > 10) return 0.15;
    if (avgAge > 7) return 0.10;
    if (avgAge > 5) return 0.05;
    return 0.02;
}

function calculateConditionFactor(conditionProfile) {
    const total = Object.values(conditionProfile).reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    
    const unserviceableRatio = (conditionProfile[1] + conditionProfile[3] + conditionProfile[4]) / total;
    
    if (unserviceableRatio > 0.3) return 0.10;
    if (unserviceableRatio > 0.2) return 0.05;
    return 0;
}

function calculateSeasonalFactors(dept) {
    const monthlyTotals = dept.monthlyTotals;
    const total = monthlyTotals.reduce((a, b) => a + b, 0);
    
    if (total === 0) return { average: 0, peakMonths: [] };
    
    const monthlyPercentages = monthlyTotals.map(total => (total / total) * 100);
    const avgPercentage = 100 / 12;
    
    const peakMonths = monthlyPercentages
        .map((pct, i) => ({ month: i, percentage: pct }))
        .filter(item => item.percentage > avgPercentage * 1.5)
        .sort((a, b) => b.percentage - a.percentage);
    
    const averagePeak = peakMonths.length > 0 ? 
        peakMonths.reduce((sum, pm) => sum + pm.percentage, 0) / peakMonths.length : 
        avgPercentage;
    
    return {
        average: (averagePeak - avgPercentage) / 100,
        peakMonths: peakMonths.map(pm => ({
            month: new Date(2000, pm.month, 1).toLocaleString('default', { month: 'short' }),
            intensity: pm.percentage > avgPercentage * 2 ? 'High' : 
                       pm.percentage > avgPercentage * 1.5 ? 'Medium' : 'Low'
        }))
    };
}

function calculateClassAdjustment(itemClasses) {
    const total = Object.values(itemClasses).reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    
    const highAdjustmentClasses = ['Office Equipment', 'IT Equipment', 'Furniture', 'Computer', 'Printer'];
    const mediumAdjustmentClasses = ['Vehicles', 'Machinery', 'Air Conditioner', 'Generator'];
    
    let adjustment = 0;
    
    for (const [className, amount] of Object.entries(itemClasses)) {
        const percentage = amount / total;
        
        if (highAdjustmentClasses.some(hc => className.toLowerCase().includes(hc.toLowerCase()))) {
            adjustment += percentage * 0.08;
        } else if (mediumAdjustmentClasses.some(mc => className.toLowerCase().includes(mc.toLowerCase()))) {
            adjustment += percentage * 0.05;
        } else {
            adjustment += percentage * 0.02;
        }
    }
    
    return Math.min(0.15, adjustment);
}

function applyPredictionBounds(prediction, dept) {
    const yearlyValues = Object.values(dept.yearlyData);
    if (yearlyValues.length === 0) return prediction;
    
    const maxHistorical = Math.max(...yearlyValues);
    const minHistorical = Math.min(...yearlyValues);
    
    const upperBound = maxHistorical * 2;
    const lowerBound = minHistorical * 0.5;
    
    return Math.max(lowerBound, Math.min(prediction, upperBound));
}

function calculateConfidenceLevel(dept) {
    let score = 0;
    
    // Data points score (max 30)
    const dataPoints = dept.itemDetails.length;
    if (dataPoints > 100) score += 30;
    else if (dataPoints > 50) score += 20;
    else if (dataPoints > 20) score += 10;
    else if (dataPoints > 5) score += 5;
    
    // Years of data score (max 40)
    const yearsCount = Object.keys(dept.yearlyData).length;
    if (yearsCount >= 5) score += 40;
    else if (yearsCount >= 3) score += 30;
    else if (yearsCount >= 2) score += 20;
    else if (yearsCount >= 1) score += 10;
    
    // Data consistency score (max 20)
    const monthlyVariance = calculateMonthlyVariance(dept.monthlyTotals);
    if (monthlyVariance < 0.3) score += 20;
    else if (monthlyVariance < 0.6) score += 10;
    else if (monthlyVariance < 0.8) score += 5;
    
    // Condition data score (max 10)
    const conditionData = Object.values(dept.conditionProfile).reduce((a, b) => a + b, 0);
    if (conditionData > 0) score += 10;
    
    return Math.min(100, score);
}

function calculateMonthlyVariance(monthlyTotals) {
    const nonZeroValues = monthlyTotals.filter(val => val > 0);
    if (nonZeroValues.length === 0) return 1;
    
    const mean = nonZeroValues.reduce((a, b) => a + b, 0) / nonZeroValues.length;
    const variance = nonZeroValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / nonZeroValues.length;
    return Math.sqrt(variance) / (mean || 1);
}

// Helper function to wrap callback-style DB calls in promises
const queryDB = (method, ...args) => {
    return new Promise((resolve, reject) => {
        method(...args, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
};

// Middleware to check user types
function requireRole(allowedTypes) {
    return (req, res, next) => {
        if (!req.user || !allowedTypes.includes(req.user.user_type)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        next();
    };
}

router.post('/api/cohere-chat', requireAuth, async (req, res) => {
    try {
        const { message, chatHistory = [] } = req.body;
        const userType = req.user.user_type;
        const userDept = req.user.department || 'your department';

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Determine what data to fetch based on user's question and type
        const question = message.toLowerCase();
        let systemContext = '';
        let predictions = {};
        let aiInsights = '';
        let historicalData = {};

        // Department-related questions
        if (question.includes('department') || question.includes('dept')) {
            const departments = await queryDB(Department.getAll);
            systemContext += `DEPARTMENTS (${departments.length} total):
${departments.map(dept => `- ${dept.department_name} (${dept.department_code})`).join('\n')}`;
        }

        // ICS Requests questions
        if (question.includes('request') || question.includes('ics') || 
            question.includes('issue') || question.includes('inventory')) {
            
            const icsRequests = await queryDB(getIcs2024Requests);
            
            if (['superadmin', 'admin', 'bac', 'budget', 'accounting'].includes(userType)) {
                const recentRequests = icsRequests.slice(0, 5);
                const deptSummary = {};
                icsRequests.forEach(req => {
                    deptSummary[req.department] = (deptSummary[req.department] || 0) + 1;
                });

                systemContext += `ICS REQUESTS SUMMARY:
${Object.entries(deptSummary).map(([dept, count]) => `- ${dept}: ${count} items`).join('\n')}

RECENT REQUESTS:
${recentRequests.map(req => `- ${req.ics_no}: ${req.particular} (${req.quantity} ${req.unit})`).join('\n')}`;
            } else {
                const userDeptRequests = icsRequests.filter(req => req.department === userDept);
                systemContext += `YOUR DEPARTMENT REQUESTS (${userDept}):
${userDeptRequests.slice(0, 3).map(req => `- ${req.ics_no}: ${req.particular} (${req.quantity} ${req.unit})`).join('\n')}
${userDeptRequests.length > 3 ? `\n...and ${userDeptRequests.length - 3} more` : ''}`;
            }
        }

        // ENHANCED: Predictive analytics questions - Using full engine
        if ((question.includes('predict') || question.includes('forecast') || 
            question.includes('budget') || question.includes('next year') ||
            question.includes('spending trend') || question.includes('fiscal projection')) &&
            (['superadmin', 'admin', 'budget', 'accounting'].includes(userType))) {
            
            // Get enhanced ICS data using your model function
            const icsData = await getEnhancedICSData(null); // Get all data
            
            if (icsData.length > 0) {
                // Get dynamic inflation rate
                const currentInflationRate = await getDynamicInflationRate();
                
                // Generate enhanced predictions
                predictions = await enhancedPredictBudgets(icsData);
                
                // Filter to show only meaningful predictions
                const validPredictions = Object.entries(predictions)
                    .filter(([dept, data]) => data.amount > 0 && data.factors.confidence > 30)
                    .sort((a, b) => b[1].amount - a[1].amount)
                    .slice(0, 15); // Show top 15 departments
                
                // Generate AI insights about the predictions
                aiInsights = await generatePredictionInsights(predictions, currentInflationRate);
                
                // Format predictions for the prompt
                const predictionsText = validPredictions.map(([dept, data]) => 
                    `- ${dept}: ₱${data.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} (${data.factors.confidence}% confidence)`
                ).join('\n');
                
                // Get top 5 departments by predicted budget
                const topDepartments = validPredictions.slice(0, 5);
                
                systemContext += `ENHANCED PREDICTIVE BUDGET ANALYSIS:
                
Current Inflation Rate: ${(currentInflationRate * 100).toFixed(2)}%
Total Departments Analyzed: ${validPredictions.length}
Total Predicted Budget: ₱${validPredictions.reduce((sum, [_, data]) => sum + data.amount, 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}

TOP 5 DEPARTMENTS BY PREDICTED BUDGET:
${topDepartments.map(([dept, data]) => 
    `- ${dept}: ₱${data.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} (Confidence: ${data.factors.confidence}%)`
).join('\n')}

FACTORS CONSIDERED:
• AI-driven inflation adjustment (${(currentInflationRate * 100).toFixed(2)}%)
• Item condition and replacement needs
• Seasonal spending patterns
• Historical trend analysis
• Item classification impact

${aiInsights ? `AI INSIGHTS:\n${aiInsights}` : ''}`;
            }
        }

        // Specific department prediction request
        if (question.includes('predict budget for') || question.includes('forecast for department')) {
            const departmentMatch = question.match(/for (?:department )?([a-zA-Z0-9\s]+)/i);
            if (departmentMatch && ['superadmin', 'admin', 'budget'].includes(userType)) {
                const deptName = departmentMatch[1].trim();
                
                // Find department by name or code
                const departments = await queryDB(Department.getAll);
                const department = departments.find(dept => 
                    dept.department_name.toLowerCase().includes(deptName.toLowerCase()) ||
                    dept.department_code.toLowerCase().includes(deptName.toLowerCase())
                );
                
                if (department) {
                    const icsData = await getEnhancedICSData(department.department_id);
                    
                    if (icsData.length > 0) {
                        const currentInflationRate = await getDynamicInflationRate();
                        const deptPredictions = await enhancedPredictBudgets(icsData);
                        const deptPrediction = deptPredictions[department.department_code] || 
                                               deptPredictions[department.department_name];
                        
                        if (deptPrediction && deptPrediction.amount > 0) {
                            const monthlyAvg = deptPrediction.amount / 12;
                            const quarterly = deptPrediction.amount / 4;
                            
                            systemContext += `DETAILED DEPARTMENT PREDICTION FOR ${department.department_name.toUpperCase()}:
                            
Department Code: ${department.department_code}
Predicted Annual Budget: ₱${deptPrediction.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
Confidence Level: ${deptPrediction.factors.confidence}%

BREAKDOWN:
• Monthly Average: ₱${monthlyAvg.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
• Quarterly Allocation: ₱${quarterly.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
• Historical Data Points: ${deptPrediction.factors.dataPoints}
• Years of Data: ${deptPrediction.factors.yearsOfData}

ADJUSTMENT FACTORS:
• Inflation Rate: ${(deptPrediction.factors.inflationRate * 100).toFixed(2)}%
• Replacement Factor: ${(deptPrediction.factors.replacementFactor * 100).toFixed(2)}%
• Condition Factor: ${(deptPrediction.factors.conditionFactor * 100).toFixed(2)}%
• Class Adjustment: ${(deptPrediction.factors.classAdjustment * 100).toFixed(2)}%

RECOMMENDATIONS:
1. Allocate ${(deptPrediction.factors.inflationRate * 100).toFixed(2)}% above last year's budget for inflation
2. Include ${(deptPrediction.factors.replacementFactor * 100).toFixed(2)}% for aging item replacement
3. Plan major purchases during non-peak months`;
                        }
                    }
                }
            }
        }

        // Comparative analysis request
        if (question.includes('compare') && question.includes('budget') && 
            (['superadmin', 'admin', 'budget'].includes(userType))) {
            
            const icsData = await getEnhancedICSData(null);
            if (icsData.length > 0) {
                predictions = await enhancedPredictBudgets(icsData);
                
                // Filter and sort predictions
                const validPredictions = Object.entries(predictions)
                    .filter(([dept, data]) => data.amount > 0 && data.factors.confidence > 30)
                    .sort((a, b) => b[1].amount - a[1].amount);
                
                if (validPredictions.length >= 3) {
                    const top3 = validPredictions.slice(0, 3);
                    const bottom3 = validPredictions.slice(-3);
                    
                    const total = validPredictions.reduce((sum, [_, data]) => sum + data.amount, 0);
                    const avg = total / validPredictions.length;
                    
                    systemContext += `COMPARATIVE BUDGET ANALYSIS:
                    
Total Predicted Budget (All Departments): ₱${total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
Average Department Budget: ₱${avg.toLocaleString('en-PH', { minimumFractionDigits: 2 })}

HIGHEST BUDGET DEPARTMENTS:
${top3.map(([dept, data], index) => 
    `${index + 1}. ${dept}: ₱${data.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} (${data.factors.confidence}% confidence)`
).join('\n')}

LOWEST BUDGET DEPARTMENTS:
${bottom3.map(([dept, data], index) => 
    `${index + 1}. ${dept}: ₱${data.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} (${data.factors.confidence}% confidence)`
).join('\n')}

BUDGET DISTRIBUTION:
• Top 3 departments account for ${((top3.reduce((sum, [_, data]) => sum + data.amount, 0) / total) * 100).toFixed(1)}% of total
• Bottom 3 departments account for ${((bottom3.reduce((sum, [_, data]) => sum + data.amount, 0) / total) * 100).toFixed(1)}% of total
• Budget range: ₱${bottom3[0][1].amount.toLocaleString('en-PH')} - ₱${top3[0][1].amount.toLocaleString('en-PH')}`;
                }
            }
        }

        // Trend analysis request
        if (question.includes('trend') || question.includes('growth') || question.includes('increase')) {
            if (['superadmin', 'admin', 'budget'].includes(userType)) {
                // Get historical data for trend analysis
                const historicalQuery = `
                    SELECT 
                        YEAR(date_acq) as year,
                        SUM(balcard) as total_amount,
                        COUNT(*) as transaction_count
                    FROM ics
                    WHERE date_acq IS NOT NULL AND balcard > 0
                    GROUP BY YEAR(date_acq)
                    HAVING total_amount > 0
                    ORDER BY year DESC
                    LIMIT 5
                `;
                
                const trendData = await new Promise((resolve, reject) => {
                    db.query(historicalQuery, (err, results) => {
                        if (err) reject(err);
                        else resolve(results);
                    });
                });
                
                if (trendData.length >= 2) {
                    const latestYear = trendData[0];
                    const previousYear = trendData[1];
                    const growthRate = ((latestYear.total_amount - previousYear.total_amount) / previousYear.total_amount) * 100;
                    
                    const currentInflationRate = await getDynamicInflationRate();
                    const realGrowth = growthRate - (currentInflationRate * 100);
                    
                    systemContext += `SPENDING TREND ANALYSIS:
                    
LATEST YEAR (${latestYear.year}): 
• Total: ₱${parseFloat(latestYear.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
• Transactions: ${latestYear.transaction_count}

PREVIOUS YEAR (${previousYear.year}):
• Total: ₱${parseFloat(previousYear.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
• Transactions: ${previousYear.transaction_count}

GROWTH ANALYSIS:
• Nominal Growth: ${growthRate.toFixed(2)}%
• Current Inflation Rate: ${(currentInflationRate * 100).toFixed(2)}%
• Real Growth (adjusted for inflation): ${realGrowth.toFixed(2)}%

TREND: ${realGrowth > 0 ? 'POSITIVE' : 'NEGATIVE'} real growth
RECOMMENDATION: ${realGrowth > 0 ? 'Continue current spending patterns' : 'Review spending efficiency'}`;
                }
            }
        }

        // Report generation
        if (question.includes('generate report') || question.includes('export data')) {
            if (userType !== 'superadmin') {
                return res.status(403).json({
                    error: 'Access denied',
                    fallback: "Report generation is only available to super administrators."
                });
            }
            systemContext += "\nREPORT GENERATION ACCESS: You have super admin privileges to generate system reports.";
        }

        // Format the prompt for Cohere
        const roleContextMap = {
            'superadmin': "You are responding as a system administrator with full access to all predictive analytics",
            'admin': "You are responding as an administrator with access to budget predictions and analytics",
            'bac': "You are responding as a BAC member with procurement and budget review access",
            'budget': "You are responding as a budget officer with advanced financial forecasting capabilities",
            'accounting': "You are responding as an accounting staff with financial analysis access",
            'mo': "You are responding as a municipal officer with field operation insights",
            'default': "You are responding as a user with standard system access"
        };

        const roleContext = roleContextMap[userType] || roleContextMap.default;

        const prompt = systemContext 
            ? `${roleContext}\nCURRENT SYSTEM DATA AND ANALYTICS:\n${systemContext}\n\nUSER QUESTION: ${message}`
            : `${roleContext}\nUSER QUESTION: ${message}`;

        const response = await axios.post(
            'https://api.cohere.ai/v1/chat',
            {
                message: prompt,
                model: 'command-a-03-2025',
                temperature: 0.3,
                max_tokens: 2000,
                chat_history: chatHistory,
                preamble: `You are an AI assistant for eGOV-RMS's predictive budget analytics system. 
                    You have access to enhanced predictive models that analyze:
                    1. Historical spending patterns with regression analysis
                    2. AI-driven dynamic inflation rates
                    3. Item condition and replacement factors
                    4. Seasonal spending variations
                    5. Confidence scoring for each prediction
                    
                    Formatting Guidelines:
                    - Use clear markdown formatting
                    - Present budgets as: ₱X,XXX.XX
                    - Include confidence levels: (XX% confidence)
                    - Highlight significant trends with **bold**
                    - Use bullet points for lists
                    - Separate sections with clear headings
                    - Include actionable insights
                    - Mention prediction methodology when relevant
                    
                    Current Context:
                    - User role: ${userType}
                    - Department: ${userDept}
                    - Access Level: ${['superadmin', 'admin', 'budget', 'accounting'].includes(userType) ? 'Full Predictive Analytics' : 'Limited'}
                    
                    Always provide:
                    1. Clear numerical predictions with context
                    2. Methodology explanation for predictions
                    3. Confidence levels and data quality assessment
                    4. Actionable recommendations
                    5. Comparisons to historical data when relevant`,
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.COHERE_API_KEY}`,
                    'Content-Type': 'application/json',
                    'Cohere-Version': '2022-12-06'
                }
            }
        );

        // CORRECTED: Extract the AI response from the proper location
        const aiResponse = response.data.message?.content?.[0]?.text || 
                          response.data.text || 
                          "I received an empty response from the AI service.";

        // Clean and format response text
        const cleanResponse = aiResponse
            // Remove markdown formatting
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/_(.*?)_/g, '$1')
            .replace(/`(.*?)`/g, '$1')
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/_/g, '')
            .replace(/^#+\s*/gm, '')

            // Remove permission-related phrases
            .replace(/^(Access|Permission) (granted|approved)[.,]?\s*/i, '')
            .replace(/[Yy]our (access|permission) (level|status) (allows|permits)[^.]*\.?\s*/g, '')

            // Normalize spacing in numbers and percentages
            .replace(/(\d)\. (\d)/g, '$1. $2') // fix "1. 000"
            .replace(/(\d)(%)(\s|$)/g, '$1%$3')
            .replace(/(\d{4,})(%)/g, (_, num, symbol) => {
                const formatted = parseFloat(num).toLocaleString();
                return `${formatted}${symbol}`;
            })

            // Clean department and budget table listings
            .replace(/Department\tPredicted Budget\t/g, 'Predicted Annual Budgets:\n')
            .replace(/(\w+)\t₱([\d,]+\.\s?\d{2})/g, (match, dept, amount) => {
                const cleanAmount = amount.replace(/\s/g, '').replace(/(\d)\.(\d{3})/g, '$1,$2');
                return `${dept.padEnd(10, ' ')}₱${cleanAmount}`;
            })

            // Add breaks between departments and fix misplaced bullets
            .replace(/(\w{3,})₱/g, '\n- $1: ₱')
            .replace(/-/g, '')

            // Properly format currency
            .replace(/₱(\d+(?:,\d{3})*)(?:\.(\d{2}))?/g, (_, num, dec = '00') => {
                const formatted = parseFloat(num.replace(/,/g, '')).toLocaleString('en-PH', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
                return `₱${formatted}`;
            })

            // Fix broken decimals and numbers
            .replace(/(\d)\s(\d{2})/g, '$1.$2')
            .replace(/(₱\d+),(\d+)/g, '$1,$2')

            // Title formatting for section headers
            .replace(/Current Predicted Annual Budgets:[\s-]*/g, 'Current Predicted Annual Budgets:\n--------------------------------\n')

            // Ensure consistent spacing and sentence structure
            .replace(/([a-z])\. ([A-Z])/g, '$1.\n$2') // New sentence line break
            .replace(/(\d)\. ([A-Z])/g, '$1.\n$2') // Numbered list fix

            // Special formatting for common report patterns
            .replace(/(\d)\. (ZeroBudget Departments:|High Allocations:|Low Allocations:|Moderate Allocations:)/g, '$1. $2')

            // Final cleanup
            .replace(/\s{2,}/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/([^.?!])(\s*)$/, '$1.$2')
            .replace(/\.{2,}/g, '.')
            .replace(/(\w)\.(\w)/g, '$1. $2')
            .trim();

        res.json({
            response: cleanResponse,
            chatId: response.data.chat_id,
            userType,
            userDept,
            metadata: {
                isPrivileged: ['superadmin', 'admin', 'bac', 'budget', 'accounting'].includes(userType),
                hasPredictions: Object.keys(predictions).length > 0,
                predictionCount: Object.keys(predictions).filter(k => predictions[k].amount > 0).length,
                totalPredictedAmount: Object.values(predictions).reduce((sum, p) => sum + (p.amount || 0), 0),
                averageConfidence: Object.values(predictions).length > 0 ? 
                    Object.values(predictions).reduce((sum, p) => sum + (p.factors?.confidence || 0), 0) / Object.values(predictions).length : 
                    0
            }
        });

    } catch (error) {
        console.error('Error:', error);
        const isPrivileged = ['superadmin', 'admin'].includes(req.user?.user_type);
        res.status(500).json({
            error: 'System data unavailable',
            fallback: "I can't access the live system data right now. " +
                     (isPrivileged 
                      ? "As an administrator, you can try again or check server logs." 
                      : "Please contact your administrator for assistance.")
        });
    }
});

// Helper function to generate AI insights about predictions
async function generatePredictionInsights(predictions, inflationRate) {
    try {
        const validPredictions = Object.entries(predictions)
            .filter(([dept, data]) => data.amount > 0 && data.factors.confidence > 30);
        
        if (validPredictions.length === 0) return "No reliable predictions available.";
        
        const total = validPredictions.reduce((sum, [_, data]) => sum + data.amount, 0);
        const avg = total / validPredictions.length;
        const avgConfidence = validPredictions.reduce((sum, [_, data]) => sum + data.factors.confidence, 0) / validPredictions.length;
        
        // Find highest and lowest confidence predictions
        const sortedByConfidence = [...validPredictions].sort((a, b) => b[1].factors.confidence - a[1].factors.confidence);
        const highestConfidence = sortedByConfidence[0];
        const lowestConfidence = sortedByConfidence[sortedByConfidence.length - 1];
        
        // Find highest and lowest budgets
        const sortedByBudget = [...validPredictions].sort((a, b) => b[1].amount - a[1].amount);
        const highestBudget = sortedByBudget[0];
        const lowestBudget = sortedByBudget[sortedByBudget.length - 1];
        
        return `
Total Predicted Budget: ₱${total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
Average Department Budget: ₱${avg.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
Average Prediction Confidence: ${avgConfidence.toFixed(1)}%

KEY INSIGHTS:
• Highest Budget Department: ${highestBudget[0]} (₱${highestBudget[1].amount.toLocaleString('en-PH')}, ${highestBudget[1].factors.confidence}% confidence)
• Lowest Budget Department: ${lowestBudget[0]} (₱${lowestBudget[1].amount.toLocaleString('en-PH')}, ${lowestBudget[1].factors.confidence}% confidence)
• Highest Confidence Prediction: ${highestConfidence[0]} (${highestConfidence[1].factors.confidence}% confidence)
• Current Inflation Adjustment: ${(inflationRate * 100).toFixed(2)}%

RECOMMENDATIONS:
1. Focus budget reviews on departments with < 50% confidence
2. Include ${(inflationRate * 100).toFixed(2)}% inflation buffer in all allocations
3. Consider seasonal patterns for departments with peak spending months
4. Plan for asset replacement based on condition factors`;
        
    } catch (error) {
        console.error('Error generating insights:', error);
        return "Unable to generate detailed insights at this time.";
    }
}

module.exports = router;
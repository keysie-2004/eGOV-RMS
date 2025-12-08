// controllers/predictiveController.js
const db = require("../config/db");
const regression = require('regression');
const { CohereClientV2 } = require('cohere-ai');

// Initialize Cohere client
const cohere = new CohereClientV2({
    token: 'jnxT04OYCyeN9lZoJAXDplcRBhkAH9ArDRzViSNn',
});

// Helper function to convert markdown-like text to HTML
function formatAITextToHTML(text) {
    if (!text || typeof text !== 'string') return '';
    
    // Remove any leading/trailing whitespace
    let cleanedText = text.trim();
    
    // First, handle code blocks if present
    cleanedText = cleanedText.replace(/```[\s\S]*?```/g, (match) => {
        const codeContent = match.replace(/```[\w]*\n?/g, '').replace(/```/g, '');
        return `<pre><code>${codeContent.trim()}</code></pre>`;
    });
    
    // Handle inline code
    cleanedText = cleanedText.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Convert headers (###, ##, #)
    cleanedText = cleanedText.replace(/^###\s+(.+)$/gm, '<h4>$1</h4>');
    cleanedText = cleanedText.replace(/^##\s+(.+)$/gm, '<h3>$1</h3>');
    cleanedText = cleanedText.replace(/^#\s+(.+)$/gm, '<h2>$1</h2>');
    
    // Convert **bold** to <strong>
    cleanedText = cleanedText.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Convert *italic* to <em> (but not bullet points)
    cleanedText = cleanedText.replace(/(^|\s)\*([^*\s][^*]+[^*\s])\*($|\s)/g, '$1<em>$2</em>$3');
    
    // Process each line
    const lines = cleanedText.split('\n');
    let inList = false;
    let htmlLines = [];
    
    for (let line of lines) {
        line = line.trim();
        
        // Check for list items (bullet points, numbered lists)
        const listMatch = line.match(/^(\d+\.|\•|\*|\-)\s+(.+)$/);
        
        if (listMatch) {
            if (!inList) {
                htmlLines.push('<ul class="ai-recommendations-list">');
                inList = true;
            }
            const content = listMatch[2];
            htmlLines.push(`<li>${content}</li>`);
        } else {
            if (inList) {
                htmlLines.push('</ul>');
                inList = false;
            }
            
            // Handle empty lines
            if (!line) {
                htmlLines.push('<br>');
            } 
            // Handle lines that might be headers or regular text
            else if (!line.startsWith('<h') && !line.startsWith('<p') && 
                     !line.startsWith('<ul') && !line.startsWith('<li') &&
                     !line.startsWith('<pre') && !line.startsWith('<code')) {
                // Check if this looks like a header
                if (line.length < 100 && (line.endsWith(':') || /^[A-Z][^.]{0,100}$/.test(line))) {
                    htmlLines.push(`<h4 class="ai-recommendation-header">${line}</h4>`);
                } else {
                    htmlLines.push(`<p class="ai-recommendation-text">${line}</p>`);
                }
            } else {
                htmlLines.push(line);
            }
        }
    }
    
    // Close any open list
    if (inList) {
        htmlLines.push('</ul>');
    }
    
    let result = htmlLines.join('\n');
    
    // Clean up any double <br> tags
    result = result.replace(/<br>\s*<br>/g, '<br>');
    
    // Ensure proper spacing
    result = result.replace(/<\/h[234]>\s*<p/g, '</h4><br><p');
    
    return result;
}

// AI-powered inflation rate getter - Updated to use v2 API
async function getDynamicInflationRate() {
    try {
        // Try to get current inflation rate from Cohere AI using v2 API
        const response = await cohere.chat({
            model: 'command-a-03-2025', // Updated model
            messages: [
                {
                    role: 'user',
                    content: 'What is the current global inflation rate percentage? Just give me the number without any explanation or additional text.',
                },
            ],
            temperature: 0.1,
            maxTokens: 10,
        });
        
        const text = response.message.content[0].text.trim();
        const inflationMatch = text.match(/\d+\.?\d*/);
        
        if (inflationMatch) {
            const rate = parseFloat(inflationMatch[0]) / 100;
            // Cap at reasonable values (0.5% to 15%)
            return Math.max(0.005, Math.min(rate, 0.15));
        }
        
        // Fallback: Use historical average or economic indicators
        return await getFallbackInflationRate();
        
    } catch (error) {
        console.warn('AI inflation API failed, using fallback:', error.message);
        return await getFallbackInflationRate();
    }
}

async function getFallbackInflationRate() {
    // Fallback: Use Philippines historical inflation or economic indicators
    try {
        // You could fetch from Philippine Statistics Authority API or similar
        // For now, use a calculated average based on recent trends
        const inflationQuery = `
            SELECT 
                YEAR(date_acq) as year,
                AVG(balcard) as avg_amount
            FROM ics 
            WHERE date_acq >= DATE_SUB(CURDATE(), INTERVAL 5 YEAR)
                AND balcard > 0
                AND date_acq IS NOT NULL
            GROUP BY YEAR(date_acq)
            HAVING COUNT(*) > 10
            ORDER BY year
        `;
        
        const yearlyData = await new Promise((resolve, reject) => {
            db.query(inflationQuery, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });
        
        if (yearlyData.length >= 2) {
            const sorted = yearlyData.sort((a, b) => a.year - b.year);
            const first = sorted[0].avg_amount;
            const last = sorted[sorted.length - 1].avg_amount;
            const yearsDiff = sorted[sorted.length - 1].year - sorted[0].year;
            
            if (yearsDiff > 0 && first > 0) {
                const cagr = Math.pow(last / first, 1 / yearsDiff) - 1;
                // Use CAGR as proxy for inflation
                return Math.max(0.03, Math.min(cagr, 0.1)); // Bound between 3-10%
            }
        }
        
        // Default to 5% if no data
        return 0.05;
    } catch (error) {
        return 0.05; // Conservative default
    }
}

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

// Enhanced prediction using all ICS data fields
async function predictBudgets(icsData, months = 12) {
    // Get dynamic inflation rate
    const INFLATION_RATE = await getDynamicInflationRate();
    console.log(`Using inflation rate: ${(INFLATION_RATE * 100).toFixed(2)}%`);
    
    const departmentData = {};
    
    // Process all ICS records with comprehensive data extraction
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
        const conditionCode = record.condition_code || '2'; // Default to serviceable
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
                conditionProfile: { 1: 0, 2: 0, 3: 0, 4: 0 }, // Condition codes
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
    
    // AI-enhanced prediction for each department
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
                                const weight = Math.max(0.1, 1 - (yearDiff * 0.2)); // Older data gets less weight
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
                basePrediction = yearlyEntries[1][1] * (1 + Math.max(growthRate, 0.02)); // Min 2% growth
                
            } else if (yearlyEntries.length === 1) {
                // One year: use that with default growth
                basePrediction = yearlyEntries[0][1] * (1 + 0.03); // 3% default growth
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
    
    // Items older than 5 years likely need replacement
    if (avgAge > 10) return 0.15; // 15% increase for very old items
    if (avgAge > 7) return 0.10;  // 10% increase for old items
    if (avgAge > 5) return 0.05;  // 5% increase for aging items
    return 0.02; // 2% for relatively new items
}

function calculateConditionFactor(conditionProfile) {
    const total = Object.values(conditionProfile).reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    
    // Condition codes: 1=Unserviceable, 2=Serviceable, 3=For Repair, 4=For Condemnation
    const unserviceableRatio = (conditionProfile[1] + conditionProfile[3] + conditionProfile[4]) / total;
    
    if (unserviceableRatio > 0.3) return 0.10; // 10% increase if many unserviceable items
    if (unserviceableRatio > 0.2) return 0.05;  // 5% increase
    return 0; // No adjustment needed
}

function calculateSeasonalFactors(dept) {
    const monthlyTotals = dept.monthlyTotals;
    const total = monthlyTotals.reduce((a, b) => a + b, 0);
    
    if (total === 0) return { average: 0, peakMonths: [] };
    
    const monthlyPercentages = monthlyTotals.map(total => (total / total) * 100);
    const avgPercentage = 100 / 12; // 8.33%
    
    // Find peak months (above average)
    const peakMonths = monthlyPercentages
        .map((pct, i) => ({ month: i, percentage: pct }))
        .filter(item => item.percentage > avgPercentage * 1.5) // 50% above average
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
    
    // Higher adjustment for certain item classes
    const highAdjustmentClasses = ['Office Equipment', 'IT Equipment', 'Furniture', 'Computer', 'Printer'];
    const mediumAdjustmentClasses = ['Vehicles', 'Machinery', 'Air Conditioner', 'Generator'];
    
    let adjustment = 0;
    
    for (const [className, amount] of Object.entries(itemClasses)) {
        const percentage = amount / total;
        
        if (highAdjustmentClasses.some(hc => className.toLowerCase().includes(hc.toLowerCase()))) {
            adjustment += percentage * 0.08; // 8% for high-depreciation items
        } else if (mediumAdjustmentClasses.some(mc => className.toLowerCase().includes(mc.toLowerCase()))) {
            adjustment += percentage * 0.05; // 5% for medium-depreciation
        } else {
            adjustment += percentage * 0.02; // 2% for others
        }
    }
    
    return Math.min(0.15, adjustment); // Cap at 15%
}

function applyPredictionBounds(prediction, dept) {
    const yearlyValues = Object.values(dept.yearlyData);
    if (yearlyValues.length === 0) return prediction;
    
    const maxHistorical = Math.max(...yearlyValues);
    const minHistorical = Math.min(...yearlyValues);
    const avgHistorical = yearlyValues.reduce((a, b) => a + b, 0) / yearlyValues.length;
    
    // Don't predict more than 200% of max historical or less than 50% of min
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
    if (monthlyVariance < 0.3) score += 20; // Low variance = more predictable
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

// Enhanced ICS data query to get all relevant fields
async function getEnhancedICSData(selectedDepartment = null) {
    try {
        let sql = `
            SELECT 
                ics.*,
                departments.department_id,
                departments.department_name,
                departments.department_code,
                YEAR(ics.date_acq) as purchase_year,
                MONTH(ics.date_acq) as purchase_month,
                CASE 
                    WHEN ics.date_acq IS NOT NULL 
                    THEN DATEDIFF(CURDATE(), ics.date_acq) / 365.25 
                    ELSE 0 
                END as item_age_years
            FROM ics
            LEFT JOIN departments 
                ON departments.department_id = ics.dept
            WHERE ics.balcard IS NOT NULL 
                AND ics.balcard > 0
                AND ics.date_acq IS NOT NULL
                AND ics.date_acq > '2000-01-01' -- Reasonable date filter
        `;
        
        const params = [];
        
        if (selectedDepartment && selectedDepartment !== 'all') {
            if (!isNaN(selectedDepartment)) {
                sql += ` AND ics.dept = ?`;
                params.push(parseInt(selectedDepartment));
            } else {
                sql += ` AND departments.department_code = ?`;
                params.push(selectedDepartment);
            }
        }
        
        sql += ` ORDER BY ics.date_acq DESC, departments.department_name`;
        
        return await new Promise((resolve, reject) => {
            db.query(sql, params, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });
    } catch (error) {
        console.error('Error fetching enhanced ICS data:', error);
        return [];
    }
}

exports.getDepartmentPredictions = async (req, res) => {
    try {
        const selectedDepartment = req.query.department || null;

        // Get all departments
        const departments = await new Promise((resolve, reject) => {
            const sql = "SELECT * FROM departments ORDER BY department_name";
            db.query(sql, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // Get enhanced ICS data with all fields
        const icsData = await getEnhancedICSData(selectedDepartment);
        
        // Generate enhanced predictions
        const departmentPredictions = icsData.length > 0 ? 
            await predictBudgets(icsData, 12) : {};

        // Prepare sorted departments array with full department info
        const sortedDepartments = [];
        
        // Convert predictions object to array with proper department info
        for (const [deptKey, prediction] of Object.entries(departmentPredictions)) {
            const amount = prediction.amount;
            
            // Skip departments with 0 budget or low confidence
            if (amount <= 0 || (prediction.factors && prediction.factors.confidence < 30)) {
                continue;
            }
            
            const deptCode = prediction.code || deptKey;
            const deptId = prediction.id || null;
            
            // Find the matching department in our departments array
            const department = departments.find(d => 
                d.department_id === deptId || 
                d.department_code === deptCode || 
                d.department_name === deptKey
            );
            
            if (department) {
                sortedDepartments.push({
                    id: department.department_id,
                    name: department.department_name,
                    code: department.department_code,
                    amount: amount,
                    department: department,
                    confidence: prediction.factors?.confidence || 0,
                    inflationRate: prediction.factors?.inflationRate || 0.05
                });
            } else {
                // Fallback if department not found
                const displayName = prediction.name || deptKey;
                const displayCode = deptCode.includes('(') ? 
                    deptCode.match(/\((.*?)\)/)?.[1] || deptCode : 
                    deptCode;
                
                sortedDepartments.push({
                    id: deptId,
                    name: displayName,
                    code: displayCode,
                    amount: amount,
                    department: null,
                    confidence: prediction.factors?.confidence || 0,
                    inflationRate: prediction.factors?.inflationRate || 0.05
                });
            }
        }

        // Sort by amount (descending)
        sortedDepartments.sort((a, b) => b.amount - a.amount);

        // Calculate max amount and total amount for the view
        const maxAmount = sortedDepartments.length > 0 ? sortedDepartments[0].amount : 0;
        const totalAmount = sortedDepartments.reduce((sum, dept) => sum + dept.amount, 0);

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

        // Get current inflation rate for display
        const currentInflationRate = await getDynamicInflationRate();
        
        // Calculate recommended increase (average + inflation + buffer)
        const recommendedIncrease = Math.max(
            averageIncrease + (currentInflationRate * 100) + 2,
            5
        );

        // Get spending patterns for the selected department
        let spendingPatterns = {};
        if (selectedDepartment && selectedDepartment !== 'all') {
            spendingPatterns = await getSpendingPatterns(selectedDepartment);
        }

        // Format data for EJS template - include id
        const formattedSortedDepartments = sortedDepartments.map(dept => [
            dept.code,
            dept.amount,
            dept.id,
            dept.name,
            dept.confidence || 0
        ]);

        res.render('predictive/department', {
            user: req.user,
            departments,
            selectedDepartment,
            departmentPredictions,
            sortedDepartments: formattedSortedDepartments,
            maxAmount,
            totalAmount,
            historicalData,
            spendingPatterns,
            predictionsAvailable: sortedDepartments.length > 0,
            averageIncrease: averageIncrease || 0,
            recommendedIncrease: recommendedIncrease || 5,
            currentInflationRate: (currentInflationRate * 100).toFixed(2),
            calculateYoYChange,
            departmentData: sortedDepartments
        });

    } catch (error) {
        console.error('Error in getDepartmentPredictions:', error);
        res.status(500).render('error', { 
            message: 'Failed to load predictive analysis data',
            error 
        });
    }
};

async function getHistoricalSpendingData(department = null) {
    try {
        let sql = `
            SELECT 
                ics.dept,
                departments.department_id,
                departments.department_name,
                departments.department_code,
                YEAR(ics.date_acq) as year,
                MONTH(ics.date_acq) as month,
                SUM(ics.balcard) as total_amount,
                COUNT(*) as transaction_count,
                AVG(ics.unit_of_value) as avg_unit_value
            FROM ics
            LEFT JOIN departments 
                ON departments.department_id = ics.dept
            WHERE ics.date_acq IS NOT NULL AND ics.balcard IS NOT NULL
        `;
        
        const params = [];
        if (department && department !== 'all') {
            if (!isNaN(department)) {
                sql += ` AND ics.dept = ?`;
                params.push(parseInt(department));
            } else {
                sql += ` AND departments.department_code = ?`;
                params.push(department);
            }
        }
        
        sql += `
            GROUP BY departments.department_code, YEAR(date_acq), MONTH(date_acq)
            ORDER BY departments.department_code, year, month
        `;

        const data = await new Promise((resolve, reject) => {
            db.query(sql, params, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // Organize data by department code for display
        const organizedData = {};
        data.forEach(row => {
            const key = row.department_code || `D${row.dept}`;

            if (!organizedData[key]) {
                organizedData[key] = [];
            }

            organizedData[key].push({
                date: new Date(row.year, row.month - 1),
                amount: parseFloat(row.total_amount),
                departmentName: row.department_name,
                departmentCode: row.department_code,
                departmentId: row.department_id,
                transactionCount: row.transaction_count,
                avgUnitValue: parseFloat(row.avg_unit_value) || 0
            });
        });

        return organizedData;
    } catch (error) {
        console.error('Error fetching historical data:', error);
        return {};
    }
}

async function getSpendingPatterns(departmentIdOrCode) {
    try {
        // Determine if input is a number (department_id) or string (department_code)
        let whereClause = '';
        let param = departmentIdOrCode;
        
        if (!isNaN(departmentIdOrCode)) {
            whereClause = 'departments.department_id = ?';
        } else {
            whereClause = 'departments.department_code = ?';
        }

        // Get monthly spending patterns with enhanced data
        const monthlyPatterns = await new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    MONTH(ics.date_acq) as month,
                    SUM(ics.balcard) as total_amount,
                    COUNT(*) as transaction_count,
                    AVG(ics.unit_of_value) as avg_unit_value,
                    AVG(ics.qty) as avg_quantity,
                    departments.department_id,
                    departments.department_name,
                    departments.department_code
                FROM ics
                LEFT JOIN departments ON departments.department_id = ics.dept
                WHERE ${whereClause} AND ics.balcard IS NOT NULL
                GROUP BY MONTH(ics.date_acq)
                ORDER BY month
            `;
            db.query(sql, [param], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // Get yearly spending patterns
        const yearlyPatterns = await new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    YEAR(ics.date_acq) as year,
                    SUM(ics.balcard) as total_amount,
                    COUNT(*) as transaction_count,
                    AVG(ics.unit_of_value) as avg_unit_value,
                    COUNT(DISTINCT ics.item_classification) as item_classes_count
                FROM ics
                LEFT JOIN departments ON departments.department_id = ics.dept
                WHERE ${whereClause} AND ics.balcard IS NOT NULL
                GROUP BY YEAR(ics.date_acq)
                ORDER BY year
            `;
            db.query(sql, [param], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // Get item class distribution
        const itemClassPatterns = await new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    ics.item_classification,
                    COUNT(*) as item_count,
                    SUM(ics.balcard) as total_value
                FROM ics
                LEFT JOIN departments ON departments.department_id = ics.dept
                WHERE ${whereClause} AND ics.balcard IS NOT NULL
                    AND ics.item_classification IS NOT NULL
                    AND ics.item_classification != ''
                GROUP BY ics.item_classification
                ORDER BY total_value DESC
                LIMIT 10
            `;
            db.query(sql, [param], (err, results) => {
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
                percentage: totalSpending > 0 ? 
                    ((parseFloat(item.total_amount) / totalSpending) * 100).toFixed(1) : 
                    "0.0",
                transactionCount: item.transaction_count,
                avgUnitValue: parseFloat(item.avg_unit_value) || 0
            }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 3);

        // Get department info from first result or use defaults
        const deptInfo = monthlyPatterns[0] || yearlyPatterns[0] || {};
        
        return {
            departmentId: deptInfo.department_id || (isNaN(departmentIdOrCode) ? null : parseInt(departmentIdOrCode)),
            departmentName: deptInfo.department_name || `Department ${departmentIdOrCode}`,
            departmentCode: deptInfo.department_code || departmentIdOrCode,
            monthly: monthlyPatterns.map(item => ({
                month: item.month,
                totalAmount: parseFloat(item.total_amount),
                averageAmount: parseFloat(item.total_amount) / (item.transaction_count || 1),
                transactionCount: item.transaction_count,
                avgUnitValue: parseFloat(item.avg_unit_value) || 0,
                avgQuantity: parseFloat(item.avg_quantity) || 1
            })),
            yearly: yearlyPatterns.map(item => ({
                year: item.year,
                totalAmount: parseFloat(item.total_amount),
                averageAmount: parseFloat(item.total_amount) / (item.transaction_count || 1),
                transactionCount: item.transaction_count,
                avgUnitValue: parseFloat(item.avg_unit_value) || 0,
                itemClassesCount: item.item_classes_count || 0
            })),
            itemClasses: itemClassPatterns.map(item => ({
                classification: item.item_classification || 'Unclassified',
                count: item.item_count,
                totalValue: parseFloat(item.total_value),
                percentage: totalSpending > 0 ? 
                    ((parseFloat(item.total_value) / totalSpending) * 100).toFixed(1) : 
                    "0.0"
            })),
            peakMonths,
            totalSpending: totalSpending.toFixed(2)
        };
    } catch (error) {
        console.error('Error fetching spending patterns:', error);
        return {
            monthly: [],
            yearly: [],
            itemClasses: [],
            peakMonths: []
        };
    }
}

exports.getPredictions = async (req, res) => {
    try {
        const { department, timePeriod = 12, viewType = 'monthly' } = req.body;
        
        // Determine if department is a number (ID) or string (code)
        let whereClause = '';
        let param = [];
        
        if (department !== 'all') {
            if (!isNaN(department)) {
                whereClause = 'AND ics.dept = ?';
                param.push(parseInt(department));
            } else {
                whereClause = 'AND departments.department_code = ?';
                param.push(department);
            }
        }
        
        // Get enhanced ICS data
        let sql = `
            SELECT 
                ics.*,
                departments.department_id,
                departments.department_name,
                departments.department_code
            FROM ics
            LEFT JOIN departments ON departments.department_id = ics.dept
            WHERE ics.balcard IS NOT NULL AND ics.balcard > 0
            ${whereClause}
        `;
        
        const icsData = await new Promise((resolve, reject) => {
            db.query(sql, param, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // Calculate enhanced predictions
        const predictions = await predictBudgets(icsData, parseInt(timePeriod));
        
        // Filter out predictions with low confidence or 0 amount
        const filteredPredictions = {};
        for (const [key, value] of Object.entries(predictions)) {
            if (value.amount > 0 && (value.factors?.confidence || 0) > 30) {
                filteredPredictions[key] = value;
            }
        }
        
        // Prepare chart data
        const chartData = await prepareChartData(icsData, viewType, parseInt(timePeriod));
        
        // Get enhanced insights
        const insights = department !== 'all' ? 
            await getSpendingPatterns(department) : 
            await getAggregateSpendingPatterns();

        // Get current inflation rate
        const currentInflationRate = await getDynamicInflationRate();

        res.json({
            success: true,
            predictions: filteredPredictions,
            chartData,
            insights: {
                peakMonths: insights.peakMonths || [],
                departmentName: insights.departmentName,
                departmentCode: insights.departmentCode,
                departmentId: insights.departmentId,
                itemClasses: insights.itemClasses || [],
                totalSpending: insights.totalSpending || 0
            },
            inflationRate: (currentInflationRate * 100).toFixed(2)
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
    const scaleFactor = months / 12;
    const currentInflationRate = await getDynamicInflationRate();
    
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
        
        // Apply inflation to future predictions
        const predictedMonthly = monthlyAverages.map(amount => 
            amount * (1 + currentInflationRate)
        );
        
        return {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            datasets: [{
                label: 'Historical Average',
                data: monthlyAverages,
                borderColor: '#6b7280',
                backgroundColor: 'rgba(107, 114, 128, 0.1)',
                tension: 0.1,
                fill: false
            }, {
                label: 'Predicted with Inflation',
                data: predictedMonthly,
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
        
        // Predict future years based on trend with inflation
        const currentYear = new Date().getFullYear();
        const futureYears = Array.from({length: 3}, (_, i) => currentYear + i + 1);
        const futurePredictions = [];
        
        if (years.length >= 2) {
            const regressionData = years.map((year, i) => [parseInt(year), yearlyAverages[i]]);
            const result = regression.linear(regressionData);
            
            futureYears.forEach((year, i) => {
                futurePredictions.push(
                    result.predict(year)[1] * Math.pow(1 + currentInflationRate, i + 1)
                );
            });
        } else if (years.length === 1) {
            futureYears.forEach((year, i) => {
                futurePredictions.push(
                    yearlyAverages[0] * Math.pow(1 + currentInflationRate, i + 1)
                );
            });
        }
        
        return {
            labels: [...years, ...futureYears],
            datasets: [{
                label: 'Historical Data',
                data: [...yearlyAverages, ...Array(futureYears.length).fill(null)],
                borderColor: '#6b7280',
                backgroundColor: 'transparent',
                borderDash: [5, 5],
                tension: 0.1,
                fill: false
            }, {
                label: 'Predicted Trend',
                data: [...Array(years.length).fill(null), ...futurePredictions],
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
        // Get monthly spending patterns with department names and ids
        const monthlyPatterns = await new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    MONTH(ics.date_acq) as month,
                    SUM(ics.balcard) as total_amount,
                    COUNT(*) as transaction_count,
                    AVG(ics.unit_of_value) as avg_unit_value,
                    departments.department_id,
                    departments.department_name,
                    departments.department_code
                FROM ics
                LEFT JOIN departments ON departments.department_id = ics.dept
                WHERE ics.balcard IS NOT NULL
                GROUP BY MONTH(ics.date_acq), departments.department_code, departments.department_name, departments.department_id
                ORDER BY month
            `;
            db.query(sql, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // Get top departments by spending
        const topDepartments = await new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    departments.department_id,
                    departments.department_name,
                    departments.department_code,
                    SUM(ics.balcard) as total_spending,
                    COUNT(*) as transaction_count
                FROM ics
                LEFT JOIN departments ON departments.department_id = ics.dept
                WHERE ics.balcard IS NOT NULL
                GROUP BY departments.department_id, departments.department_name, departments.department_code
                ORDER BY total_spending DESC
                LIMIT 5
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
                percentage: totalSpending > 0 ? 
                    ((parseFloat(item.total_amount) / totalSpending) * 100).toFixed(1) : 
                    "0.0",
                departmentName: item.department_name,
                departmentCode: item.department_code, 
                departmentId: item.department_id,
                avgUnitValue: parseFloat(item.avg_unit_value) || 0
            }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 3);

        return {
            monthly: monthlyPatterns.map(item => ({
                month: item.month,
                totalAmount: parseFloat(item.total_amount),
                averageAmount: parseFloat(item.total_amount) / (item.transaction_count || 1),
                transactionCount: item.transaction_count,
                departmentName: item.department_name,
                departmentCode: item.department_code,
                departmentId: item.department_id,
                avgUnitValue: parseFloat(item.avg_unit_value) || 0
            })),
            peakMonths,
            topDepartments: topDepartments.map(dept => ({
                name: dept.department_name,
                code: dept.department_code,
                id: dept.department_id,
                totalSpending: parseFloat(dept.total_spending),
                transactionCount: dept.transaction_count,
                percentage: totalSpending > 0 ? 
                    ((parseFloat(dept.total_spending) / totalSpending) * 100).toFixed(1) : 
                    "0.0"
            })),
            totalSpending: totalSpending.toFixed(2)
        };
    } catch (error) {
        console.error('Error fetching aggregate spending patterns:', error);
        return {
            monthly: [],
            peakMonths: [],
            topDepartments: []
        };
    }
}

exports.getDepartmentDetails = async (req, res) => {
    try {
        const departmentId = req.query.id || req.query.code;
        
        if (!departmentId) {
            return res.json({ success: false, error: 'Department ID is required' });
        }

        // Determine if input is a number (department_id) or string (department_code)
        let whereClause = '';
        let param = departmentId;
        
        if (!isNaN(departmentId)) {
            whereClause = "departments.department_id = ?";
        } else {
            whereClause = "departments.department_code = ?";
        }

        // Get department information
        const department = await new Promise((resolve, reject) => {
            const sql = `SELECT * FROM departments WHERE ${whereClause}`;
            
            db.query(sql, [param], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });

        if (!department) {
            return res.json({ success: false, error: 'Department not found' });
        }

        // Get enhanced total historical spending for this department
        const totalSpendingResult = await new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    SUM(ics.balcard) as total,
                    COUNT(*) as transaction_count,
                    AVG(ics.unit_of_value) as avg_unit_value,
                    AVG(ics.qty) as avg_quantity,
                    MIN(ics.date_acq) as first_purchase,
                    MAX(ics.date_acq) as last_purchase
                FROM ics 
                LEFT JOIN departments ON departments.department_id = ics.dept
                WHERE ${whereClause} AND ics.balcard IS NOT NULL
            `;
            db.query(sql, [param], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });

        // Get monthly spending patterns
        const spendingPatternsResult = await new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    MONTH(ics.date_acq) as month,
                    SUM(ics.balcard) as total_amount,
                    COUNT(*) as count,
                    AVG(ics.unit_of_value) as avg_unit_value
                FROM ics
                LEFT JOIN departments ON departments.department_id = ics.dept
                WHERE ${whereClause} AND ics.balcard IS NOT NULL
                GROUP BY MONTH(ics.date_acq)
                ORDER BY total_amount DESC
                LIMIT 3
            `;
            db.query(sql, [param], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // Get yearly trend data
        const yearlyTrend = await new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    YEAR(ics.date_acq) as year,
                    SUM(ics.balcard) as total_amount,
                    COUNT(*) as transaction_count,
                    AVG(ics.unit_of_value) as avg_unit_value
                FROM ics
                LEFT JOIN departments ON departments.department_id = ics.dept
                WHERE ${whereClause} AND ics.balcard IS NOT NULL
                GROUP BY YEAR(ics.date_acq)
                ORDER BY year
            `;
            db.query(sql, [param], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // Get item class distribution
        const itemClassDistribution = await new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    ics.item_classification,
                    COUNT(*) as item_count,
                    SUM(ics.balcard) as total_value
                FROM ics
                LEFT JOIN departments ON departments.department_id = ics.dept
                WHERE ${whereClause} AND ics.balcard IS NOT NULL
                    AND ics.item_classification IS NOT NULL
                GROUP BY ics.item_classification
                ORDER BY total_value DESC
                LIMIT 5
            `;
            db.query(sql, [param], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // Calculate peak months with percentages
        const totalSpending = parseFloat(totalSpendingResult?.total || 0);
        const peakMonths = spendingPatternsResult.map(pattern => {
            const monthName = new Date(2000, pattern.month - 1, 1).toLocaleString('default', { month: 'long' });
            const percentage = totalSpending > 0 ? 
                ((parseFloat(pattern.total_amount) / totalSpending) * 100).toFixed(1) : 
                "0.0";
            return {
                name: monthName,
                amount: parseFloat(pattern.total_amount),
                percentage: percentage,
                transactionCount: pattern.count,
                avgUnitValue: parseFloat(pattern.avg_unit_value) || 0
            };
        });

        // Calculate yearly trend
        const yearlyTrendData = yearlyTrend.map(item => ({
            year: item.year,
            amount: parseFloat(item.total_amount),
            transactionCount: item.transaction_count,
            avgUnitValue: parseFloat(item.avg_unit_value) || 0
        }));

        // Calculate year-over-year growth
        let yoyGrowth = 0;
        if (yearlyTrendData.length >= 2) {
            const latest = yearlyTrendData[yearlyTrendData.length - 1];
            const previous = yearlyTrendData[yearlyTrendData.length - 2];
            yoyGrowth = previous.amount > 0 ? 
                ((latest.amount - previous.amount) / previous.amount * 100).toFixed(1) : 
                0;
        }

        // Get data points count
        const dataPointsResult = await new Promise((resolve, reject) => {
            const sql = `
                SELECT COUNT(*) as count 
                FROM ics 
                LEFT JOIN departments ON departments.department_id = ics.dept
                WHERE ${whereClause} AND ics.balcard IS NOT NULL
            `;
            db.query(sql, [param], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });

        // Calculate department age
        const departmentAge = totalSpendingResult?.first_purchase ? 
            Math.floor((new Date() - new Date(totalSpendingResult.first_purchase)) / (365.25 * 24 * 60 * 60 * 1000)) : 
            0;

        // Get current inflation rate
        const currentInflationRate = await getDynamicInflationRate();

        res.json({
            success: true,
            department,
            totalSpending: totalSpending.toFixed(2),
            avgMonthly: totalSpending > 0 ? (totalSpending / 12).toFixed(2) : 0,
            avgUnitValue: parseFloat(totalSpendingResult?.avg_unit_value || 0).toFixed(2),
            avgQuantity: parseFloat(totalSpendingResult?.avg_quantity || 1).toFixed(2),
            spendingPatterns: {
                peakMonths,
                yearlyTrend: yearlyTrendData,
                itemClasses: itemClassDistribution.map(item => ({
                    classification: item.item_classification,
                    count: item.item_count,
                    totalValue: parseFloat(item.total_value),
                    percentage: totalSpending > 0 ? 
                        ((parseFloat(item.total_value) / totalSpending) * 100).toFixed(1) : 
                        "0.0"
                })),
                yoyGrowth: parseFloat(yoyGrowth)
            },
            dataPoints: dataPointsResult?.count || 0,
            departmentAge: departmentAge,
            firstPurchase: totalSpendingResult?.first_purchase || null,
            lastPurchase: totalSpendingResult?.last_purchase || null,
            transactionCount: totalSpendingResult?.transaction_count || 0,
            predictionFactors: {
                inflationRate: currentInflationRate,
                seasonality: peakMonths.length > 0 ? 'High' : 'Low',
                dataQuality: dataPointsResult?.count > 50 ? 'High' : dataPointsResult?.count > 20 ? 'Medium' : 'Low',
                departmentAge: departmentAge > 10 ? 'Mature' : departmentAge > 5 ? 'Established' : 'Developing'
            }
        });

    } catch (error) {
        console.error('Error fetching department details:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch department details' 
        });
    }
};

exports.getPredictionExplanation = async (req, res) => {
    try {
        const departmentId = req.query.id || req.query.code;
        
        if (!departmentId) {
            return res.json({ success: false, error: 'Department ID is required' });
        }

        // Get current inflation rate
        const currentInflationRate = await getDynamicInflationRate();

        // Get prediction algorithm explanation
        const explanation = {
            algorithm: "Enhanced Linear Regression with AI-Driven Inflation Adjustment",
            currentInflationRate: (currentInflationRate * 100).toFixed(2) + "%",
            dataSources: [
                "ICS Historical Spending Data",
                "Item Classification Analysis",
                "Condition Assessment Data",
                "AI-Powered Economic Indicators",
                "Seasonal Spending Patterns"
            ],
            steps: [
                "1. Comprehensive historical data collection (all available years)",
                "2. Item-level analysis including age, condition, and classification",
                "3. AI-driven inflation rate determination",
                "4. Seasonal pattern detection and adjustment",
                "5. Linear regression modeling with confidence scoring",
                "6. Multi-factor adjustment application",
                "7. Future projection with reasonable bounds"
            ],
            factors: [
                { 
                    name: "Historical Data Quality", 
                    weight: "30%", 
                    description: "Based on data points, years covered, and consistency" 
                },
                { 
                    name: "AI Inflation Rate", 
                    weight: "25%", 
                    description: `Current: ${(currentInflationRate * 100).toFixed(2)}% - Adjusted quarterly` 
                },
                { 
                    name: "Asset Condition & Age", 
                    weight: "20%", 
                    description: "Replacement needs based on item age and condition codes" 
                },
                { 
                    name: "Seasonality", 
                    weight: "15%", 
                    description: "Monthly spending variations and peak periods" 
                },
                { 
                    name: "Item Classification", 
                    weight: "10%", 
                    description: "Depreciation rates based on item types" 
                }
            ],
            confidenceScoring: {
                excellent: "80-100%: Extensive historical data, clear patterns",
                good: "60-79%: Good data with some seasonal patterns",
                fair: "40-59%: Limited data but detectable trends",
                poor: "Below 40%: Insufficient data for reliable prediction"
            },
            nextPredictionDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toLocaleDateString(),
            updateFrequency: "Monthly with AI inflation adjustment"
        };

        res.json({
            success: true,
            explanation
        });

    } catch (error) {
        console.error('Error fetching prediction explanation:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch prediction explanation' 
        });
    }
};

// NEW: Detailed Analysis endpoint
exports.getDetailedAnalysis = async (req, res) => {
    try {
        const { department } = req.query;
        
        if (!department || department === 'all') {
            return res.json({ 
                success: false, 
                error: 'Please select a specific department' 
            });
        }

        // Get department spending data
        const spendingData = await getSpendingPatterns(department);
        
        if (!spendingData || !spendingData.monthly) {
            return res.json({ 
                success: false, 
                error: 'No data available for this department' 
            });
        }

        // Process monthly data for chart
        const monthlyData = Array(12).fill(0);
        const monthlyCount = Array(12).fill(0);
        
        spendingData.monthly.forEach(item => {
            const month = item.month - 1; // Convert to 0-indexed
            monthlyData[month] = parseFloat(item.totalAmount) || 0;
            monthlyCount[month] = item.transactionCount || 0;
        });

        // Calculate average transaction value
        const totalTransactions = monthlyCount.reduce((a, b) => a + b, 0);
        const totalSpending = monthlyData.reduce((a, b) => a + b, 0);
        const avgTransaction = totalTransactions > 0 ? 
            (totalSpending / totalTransactions).toFixed(2) : 0;

        // Calculate items per year
        const itemsPerYear = spendingData.itemClasses ? 
            spendingData.itemClasses.reduce((sum, item) => sum + (item.count || 0), 0) : 0;

        // Calculate growth rate
        let growthRate = 0;
        if (spendingData.yearly && spendingData.yearly.length >= 2) {
            const sortedYearly = [...spendingData.yearly].sort((a, b) => a.year - b.year);
            const latest = sortedYearly[sortedYearly.length - 1];
            const previous = sortedYearly[sortedYearly.length - 2];
            
            if (previous.totalAmount > 0) {
                growthRate = ((latest.totalAmount - previous.totalAmount) / previous.totalAmount * 100).toFixed(1);
            }
        }

        // Get yearly trend data
        const yearlyData = {
            labels: [],
            values: []
        };
        
        if (spendingData.yearly && spendingData.yearly.length > 0) {
            spendingData.yearly.forEach(item => {
                yearlyData.labels.push(item.year.toString());
                yearlyData.values.push(parseFloat(item.totalAmount) || 0);
            });
        }

        // Get AI recommendations for this department
        let aiRecommendations = '';
        try {
            const aiResponse = await cohere.chat({
                model: 'command-a-03-2025',
                messages: [
                    {
                        role: 'user',
                        content: `Provide budget recommendations for a department with this spending pattern:
                        
Department: ${spendingData.departmentName}
Total Spending: ₱${parseFloat(spendingData.totalSpending || 0).toLocaleString()}
Peak Months: ${spendingData.peakMonths?.map(pm => `${pm.name} (${pm.percentage}%)`).join(', ') || 'None'}
Years of Data: ${spendingData.yearly?.length || 0}
Item Categories: ${spendingData.itemClasses?.map(ic => ic.classification).join(', ') || 'None'}

Provide 3-5 specific, actionable recommendations.`
                    }
                ],
                temperature: 0.3,
                maxTokens: 300
            });
            
            aiRecommendations = formatAITextToHTML(aiResponse.message.content[0].text.trim());
        } catch (aiError) {
            console.warn('AI recommendations failed:', aiError.message);
            // Use fallback recommendations
            const currentInflationRate = await getDynamicInflationRate();
            aiRecommendations = formatAITextToHTML(generateFallbackRecommendations(spendingData, currentInflationRate));
        }

        res.json({
            success: true,
            monthlyData,
            yearlyData,
            avgTransaction,
            itemsPerYear: itemsPerYear || 0,
            growthRate: parseFloat(growthRate) || 0,
            recommendations: aiRecommendations,
            departmentInfo: {
                name: spendingData.departmentName,
                code: spendingData.departmentCode,
                totalSpending: spendingData.totalSpending
            }
        });

    } catch (error) {
        console.error('Error in detailed analysis:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to generate detailed analysis' 
        });
    }
};

// Updated AI recommendations with HTML formatting
exports.getAIRecommendations = async (req, res) => {
    try {
        const { department } = req.query;
        
        if (!department) {
            return res.json({ success: false, error: 'Department parameter is required' });
        }

        // Get department spending data
        const spendingData = await getSpendingPatterns(department);
        const currentInflationRate = await getDynamicInflationRate();

        try {
            // Generate AI recommendations using Cohere v2 API
            const response = await cohere.chat({
                model: 'command-a-03-2025',
                messages: [
                    {
                        role: 'user',
                        content: `Based on the following department spending analysis, provide 3-5 specific budget recommendations for the upcoming fiscal year. Format as a clear list with bullet points (use • symbol). Be concise and actionable.
                        
Department: ${spendingData.departmentName}
Total Historical Spending: ₱${parseFloat(spendingData.totalSpending || 0).toLocaleString()}
Peak Spending Months: ${spendingData.peakMonths?.map(pm => `${pm.name} (${pm.percentage}%)`).join(', ') || 'None'}
Current Inflation Rate: ${(currentInflationRate * 100).toFixed(2)}%
Years of Data: ${spendingData.yearly?.length || 0} years

Item Class Distribution:
${(spendingData.itemClasses || []).map(item => 
    `- ${item.classification}: ${item.count} items (${item.percentage}% of total value)`
).join('\n')}

Consider inflation, seasonality, asset replacement needs, and historical patterns in your recommendations.`
                    }
                ],
                temperature: 0.3,
                maxTokens: 400
            });

            const aiRecommendations = response.message.content[0].text.trim();
            
            // Format the AI response to HTML
            const formattedRecommendations = formatAITextToHTML(aiRecommendations);

            res.json({
                success: true,
                recommendations: formattedRecommendations,
                metadata: {
                    department: spendingData.departmentName,
                    inflationRate: (currentInflationRate * 100).toFixed(2) + '%',
                    dataPoints: spendingData.monthly?.length || 0,
                    generatedAt: new Date().toISOString()
                }
            });

        } catch (aiError) {
            console.warn('AI recommendation failed, using fallback:', aiError.message);
            
            // Fallback recommendations based on analysis
            const fallbackRecommendations = generateFallbackRecommendations(spendingData, currentInflationRate);
            
            // Format fallback recommendations as well
            const formattedFallback = formatAITextToHTML(fallbackRecommendations);
            
            res.json({
                success: true,
                recommendations: formattedFallback,
                metadata: {
                    department: spendingData.departmentName,
                    inflationRate: (currentInflationRate * 100).toFixed(2) + '%',
                    note: 'Using algorithm-based recommendations',
                    generatedAt: new Date().toISOString()
                }
            });
        }

    } catch (error) {
        console.error('Error generating AI recommendations:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to generate recommendations' 
        });
    }
};

function generateFallbackRecommendations(spendingData, inflationRate) {
    const recommendations = [];
    const peakMonths = spendingData.peakMonths || [];
    const totalSpending = parseFloat(spendingData.totalSpending || 0);
    const avgMonthly = totalSpending / 12;
    
    // Recommendation 1: Base on inflation
    recommendations.push(`• **Inflation Adjustment**: Increase budget by ${(inflationRate * 100).toFixed(2)}% to account for current inflation rates`);
    
    // Recommendation 2: Peak season planning
    if (peakMonths.length > 0) {
        const peakSeason = peakMonths.map(pm => `${pm.name} (${pm.percentage}% of annual spending)`).join(', ');
        recommendations.push(`• **Peak Season Allocation**: Allocate additional 15-20% budget during peak months: ${peakSeason}`);
    }
    
    // Recommendation 3: Item replacement
    if (spendingData.itemClasses && spendingData.itemClasses.length > 0) {
        const agingItems = spendingData.itemClasses.filter(item => 
            item.classification.toLowerCase().includes('equipment') || 
            item.classification.toLowerCase().includes('computer') ||
            item.classification.toLowerCase().includes('printer')
        );
        if (agingItems.length > 0) {
            const totalAgingValue = agingItems.reduce((sum, item) => sum + parseFloat(item.totalValue), 0);
            recommendations.push(`• **Asset Replacement**: Plan for replacement of ${agingItems.length} aging equipment items (worth ₱${totalAgingValue.toLocaleString()}) in the next fiscal year`);
        }
    }
    
    // Recommendation 4: Average spending
    recommendations.push(`• **Baseline Allocation**: Maintain minimum monthly allocation of ₱${avgMonthly.toFixed(2).toLocaleString()} based on historical averages`);
    
    // Recommendation 5: Contingency
    recommendations.push(`• **Contingency Fund**: Include 10% contingency fund (₱${(totalSpending * 0.1).toLocaleString()}) for unexpected procurement needs`);
    
    // Recommendation 6: Seasonal adjustment
    if (peakMonths.length >= 2) {
        recommendations.push(`• **Seasonal Planning**: Schedule major purchases in non-peak months to optimize cash flow and avoid supply chain constraints`);
    }
    
    return recommendations.join('\n');
}

// Export all functions
module.exports = {
    getDepartmentPredictions: exports.getDepartmentPredictions,
    getPredictions: exports.getPredictions,
    getDepartmentDetails: exports.getDepartmentDetails,
    getPredictionExplanation: exports.getPredictionExplanation,
    getDetailedAnalysis: exports.getDetailedAnalysis, // NEW
    getAIRecommendations: exports.getAIRecommendations,
    getDynamicInflationRate,
    calculateReplacementFactor,
    calculateConditionFactor,
    calculateConfidenceLevel,
    getEnhancedICSData,
    formatAITextToHTML
};
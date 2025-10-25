const express = require('express');
const router = express.Router();
const axios = require('axios');
const { requireAuth } = require('../middlewares/authMiddleware');
const Department = require('../models/departmentModel');
const { getIcs2024Requests } = require('../models/icsModel');
const db = require("../config/db");
const regression = require('regression');

async function predictBudgets(icsData, months = 12) {
    const INFLATION_RATE = 0.05; // 5% inflation rate - adjust as needed
    const departmentData = {};
    
    icsData.forEach(record => {
        if (!record.department) return;
        
        const dept = record.department;
        const date = record.date_encode ? new Date(record.date_encode) : null;
        if (!date || isNaN(date)) return;
        
        const amount = parseFloat(record.unit_amount) || 0;
        const month = date.getMonth();
        const year = date.getFullYear();
        
        if (!departmentData[dept]) {
            departmentData[dept] = {
                monthlyTotals: Array(12).fill(0),
                count: Array(12).fill(0),
                yearlyData: {}, // Track data by year for inflation adjustment
                monthlyDataByYear: {} // Track monthly data by year
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
        
        // Monthly data by year (for inflation adjustment)
        if (!departmentData[dept].monthlyDataByYear[year]) {
            departmentData[dept].monthlyDataByYear[year] = {
                monthlyTotals: Array(12).fill(0),
                count: Array(12).fill(0)
            };
        }
        departmentData[dept].monthlyDataByYear[year].monthlyTotals[month] += amount;
        departmentData[dept].monthlyDataByYear[year].count[month]++;
    });

    const predictions = {};
    const scaleFactor = months / 12;
    const currentYear = new Date().getFullYear();
    
    for (const dept in departmentData) {
        try {
            // Calculate monthly averages
            let monthlyAverages = departmentData[dept].monthlyTotals.map((total, i) => 
                departmentData[dept].count[i] > 0 ? total / departmentData[dept].count[i] : 0
            );

            // Adjust historical data for inflation (normalize to current value)
            const years = Object.keys(departmentData[dept].monthlyDataByYear).sort();
            if (years.length > 1) {
                for (const year of years) {
                    const yearDiff = currentYear - parseInt(year);
                    if (yearDiff > 0) {
                        const inflationFactor = Math.pow(1 + INFLATION_RATE, yearDiff);
                        for (let month = 0; month < 12; month++) {
                            if (departmentData[dept].monthlyDataByYear[year].count[month] > 0) {
                                const adjustedAmount = departmentData[dept].monthlyDataByYear[year].monthlyTotals[month] * inflationFactor;
                                // Update the monthly average with inflation-adjusted value
                                monthlyAverages[month] = ((monthlyAverages[month] || 0) + (adjustedAmount / departmentData[dept].monthlyDataByYear[year].count[month])) / 2;
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

        // Helper function to wrap callback-style DB calls in promises
        const queryDB = (method, ...args) => {
            return new Promise((resolve, reject) => {
                method(...args, (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                });
            });
        };

        // Determine what data to fetch based on user's question and type
        const question = message.toLowerCase();
        let systemContext = '';
        let predictions = {};

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

        // Predictive analytics questions
        if ((question.includes('predict') || question.includes('forecast') || 
            question.includes('budget') || question.includes('next year')) &&
            (['superadmin', 'admin', 'budget'].includes(userType))) {
            
            const icsData = await new Promise((resolve, reject) => {
                const sql = `SELECT department, date_encode, unit_amount FROM ics_2024`;
                db.query(sql, (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                });
            });

            if (icsData.length > 0) {
                predictions = await predictBudgets(icsData);
                systemContext += `PREDICTED ANNUAL BUDGETS:
${Object.entries(predictions).map(([dept, amount]) => `- ${dept}: ₱${amount.toLocaleString()}`).join('\n')}
NOTE: Predictions include a 5% annual inflation adjustment based on historical spending patterns.`;
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
            'superadmin': "You are responding as a system administrator with full access",
            'admin': "You are responding as an administrator with elevated privileges",
            'bac': "You are responding as a BAC member with procurement access",
            'budget': "You are responding as a budget officer with financial access",
            'accounting': "You are responding as an accounting staff with financial access",
            'mo': "You are responding as a municipal officer with field access",
            'default': "You are responding as a user with standard access"
        };

        const roleContext = roleContextMap[userType] || roleContextMap.default;

        const prompt = systemContext 
            ? `${roleContext}\nCURRENT SYSTEM DATA:\n${systemContext}\n\nQUESTION: ${message}`
            : `${roleContext}\nQUESTION: ${message}`;

            const response = await axios.post(
                'https://api.cohere.ai/v1/chat',
                {
                    message: prompt,
                    model: 'command-a-03-2025',
                    temperature: 0.3,
                    max_tokens: 1888,
                    chat_history: chatHistory,
                     preamble: `You are an AI assistant for Hareneth's management system. 
                Always respond using markdown formatting for better readability.
                Important rules:
                - Format tables with clear headers
                - Use bullet points for lists
                - Bold important numbers
                            Use clear and concise language
                            Highlight significant trends or anomalies
                            Always clarify prediction confidence levels
                            2. For predictions: "The [timeframe] prediction for [subject] is [value] (methodology: [brief explanation])"
                            3. Format currency as ₱X,XXX.XX
                            4. Never mention permissions or access levels
                            Do not mention access permissions in responses
                            5. For sensitive queries, simply state "This requires higher privileges"
                            Never disclose sensitive information to unauthorized users
                            
                            Current Context:
                            - User role: ${userType}
                            - Department: ${userDept}

                             Never disclose sensitive information to unauthorized users`,

                },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.COHERE_API_KEY}`,
                    'Content-Type': 'application/json',
                    'Cohere-Version': '2022-12-06'
                }
            }
        );
        // Clean and format response text
        const cleanResponse = response.data.text
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
                hasPredictions: Object.keys(predictions).length > 0
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

module.exports = router;
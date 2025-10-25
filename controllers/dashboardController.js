const Department = require('../models/departmentModel');
const dashboardModel = require('../models/dashboardModel');
const db = require("../config/db");
const regression = require('regression');

// Enhanced prediction function with inflation adjustment
async function predictBudgets(icsData) {
  if (!icsData || !Array.isArray(icsData) || icsData.length === 0) {
    console.warn('No ICS data available for predictions');
    return {};
  }

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

// Helper function to format chart data
function formatChartData(rawData, type) {
  switch (type) {
    case 'yearly':
      const yearlyData = {};
      rawData.forEach(row => {
        const year = row.year;
        const amount = parseFloat(row.total_spent) || 0;
        
        if (!yearlyData[year]) {
          yearlyData[year] = 0;
        }
        yearlyData[year] += amount;
      });
      
      // Generate forecast for next 5 years
      const years = Object.keys(yearlyData).sort().map(Number);
      const values = years.map(year => yearlyData[year] / 1000000); // Convert to millions
      
      // Ensure at least some data for forecasting
      if (values.length === 0) {
        const currentYear = new Date().getFullYear();
        return {
          labels: [currentYear, currentYear + 1, currentYear + 2, currentYear + 3, currentYear + 4],
          data: [0, 0, 0, 0, 0]
        };
      }

      // Simple linear regression for forecast with positive growth
      const currentYear = new Date().getFullYear();
      const forecastYears = [];
      const forecastValues = [];
      
      if (values.length > 1) {
        const dataForRegression = years.map((year, i) => [year - years[0], values[i]]);
        const result = regression.linear(dataForRegression);
        const slope = result.equation[0];
        const intercept = result.equation[1];
        
        for (let i = 0; i < 5; i++) {
          const year = currentYear + i;
          forecastYears.push(year);
          let forecast = intercept + slope * (year - years[0]);
          // Ensure non-negative and reasonable growth
          forecast = Math.max(forecast, values[values.length - 1] * 0.9); // At least 90% of last year's value
          forecastValues.push(forecast);
        }
      } else {
        // If only one year of data, assume flat or slight growth
        const lastValue = values[values.length - 1];
        for (let i = 0; i < 5; i++) {
          forecastYears.push(currentYear + i);
          forecastValues.push(lastValue * (1 + 0.05 * i)); // 5% annual growth
        }
      }
      
      return {
        labels: forecastYears,
        data: forecastValues.map(val => parseFloat(val.toFixed(2)))
      };
      
    case 'monthly':
      const monthlyData = Array(12).fill(0);
      const monthlyDataPAR = Array(12).fill(0);
      
      rawData.forEach(row => {
        const month = row.month - 1; // Convert to 0-based index
        monthlyData[month] = parseFloat(row.ics_spending) / 1000000 || 0; // Convert to millions
        monthlyDataPAR[month] = parseFloat(row.par_spending) / 1000000 || 0; // Convert to millions
      });
      
      return {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        icsData: monthlyData.map(val => parseFloat(val.toFixed(2))),
        parData: monthlyDataPAR.map(val => parseFloat(val.toFixed(2)))
      };
      
    case 'distribution':
      const total = rawData.reduce((sum, row) => sum + parseFloat(row.total_spent || 0), 0);
      return {
        labels: rawData.map(row => row.department),
        data: rawData.map(row => parseFloat((row.total_spent / 1000000).toFixed(2))),
        percentages: rawData.map(row => total > 0 ? parseFloat(((row.total_spent / total) * 100).toFixed(1)) : 0)
      };
      
    default:
      return { labels: [], data: [], percentages: [] };
  }
}

exports.getDashboardData = async (req, res) => {
  try {
    const isSuperAdmin = req.user.user_type === 'superadmin';
    const isAdmin = req.user.user_type === 'superadmin' || req.user.user_type === 'admin';
    const userDepartment = req.user.department;
    const userDepartmentId = req.user.department_id;

    console.log('User info:', { user_type: req.user.user_type, userDepartment, userDepartmentId });

    // Fetch ICS data for predictions
    let icsData = [];
    try {
      let sql = `
        SELECT d.department_name, i.date_acq, i.unit_of_value 
        FROM ics i
        JOIN departments d ON i.dept = d.department_id
        WHERE i.date_acq IS NOT NULL
          AND i.condemned = 0 AND i.disposed = 0
      `;
      if (!isAdmin && userDepartment) {
        sql += ` AND d.department_name = ?`;
      }
      console.log('ICS Data Query:', sql, 'Params:', !isAdmin && userDepartment ? [userDepartment] : []);
      icsData = await new Promise((resolve, reject) => {
        db.query(sql, !isAdmin && userDepartment ? [userDepartment] : [], (err, results) => {
          if (err) reject(err);
          else {
            console.log('ICS data query result:', results.length, 'records');
            resolve(results);
          }
        });
      });
    } catch (predictionError) {
      console.error('ICS data fetch error:', predictionError);
      icsData = [];
    }

    // Calculate department predictions
    let departmentPredictions = {};
    let predictionsAvailable = false;
    let filteredDepartments = [];
    if (icsData.length > 0) {
      console.log('Processing ICS data for predictions...');
      departmentPredictions = await predictBudgets(icsData);
      predictionsAvailable = Object.keys(departmentPredictions).length > 0;
      filteredDepartments = Object.entries(departmentPredictions)
        .filter(([dept, amount]) => amount > 0)
        .sort((a, b) => b[1] - a[1]);
    } else {
      console.warn('No ICS data, setting empty predictions');
      departmentPredictions = {};
      predictionsAvailable = false;
      filteredDepartments = [];
    }

    // For non-superadmin, non-admin users, restrict predictions to their department
    if (!isSuperAdmin && userDepartment) {
      departmentPredictions = {
        [userDepartment]: departmentPredictions[userDepartment] || 0
      };
      filteredDepartments = Object.entries(departmentPredictions)
        .filter(([dept, amount]) => amount > 0)
        .sort((a, b) => b[1] - a[1]);
    }

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
      new Promise((resolve, reject) => {
        dashboardModel.fetchYearlyForecastData(isAdmin ? null : userDepartment, (err, results) => {
          if (err) reject(err);
          else {
            console.log('Yearly forecast data:', results, 'for department:', userDepartment || 'all');
            resolve(results);
          }
        });
      }),
      new Promise((resolve, reject) => {
        dashboardModel.fetchDepartmentDistributionData(isAdmin ? null : userDepartment, (err, results) => {
          if (err) reject(err);
          else {
            console.log('Department distribution data:', results, 'for department:', userDepartment || 'all');
            resolve(results);
          }
        });
      }),
      new Promise((resolve, reject) => {
        dashboardModel.fetchMonthlySpendingData(isAdmin ? null : userDepartment, (err, results) => {
          if (err) reject(err);
          else {
            console.log('Monthly spending data:', results, 'for department:', userDepartment || 'all');
            resolve(results);
          }
        });
      })
    ]);

    // Format chart data
    const formattedYearlyData = formatChartData(yearlyForecastData, 'yearly');
    const formattedDistributionData = formatChartData(departmentDistributionData, 'distribution');
    const formattedMonthlyData = formatChartData(monthlySpendingData, 'monthly');

    res.render('index', {
      pendingRequests,
      propertySmall,
      icsBelow50k,
      parAbove50k,
      totalSpent,
      totalEmployees,
      departmentPredictions,
      predictionsAvailable,
      filteredDepartments,
      yearlyForecastData,
      departmentDistributionData,
      monthlySpendingData,
      formattedYearlyData,
      formattedDistributionData,
      formattedMonthlyData,
      icsData: icsData || [],
      isAdmin,
      isSuperAdmin,
      userDepartment,
      user: req.user 
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
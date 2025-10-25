// controllers/budgetController.js
const { ICS } = require('../models'); // Assuming you have an ICS model
const tf = require('@tensorflow/tfjs-node');
const regression = require('regression');

exports.predictDepartmentBudgets = async (req, res) => {
  try {
    // Get all ICS data
    const icsData = await ICS.findAll();
    
    if (!icsData || icsData.length === 0) {
      return res.status(404).json({ message: "No ICS data found" });
    }

    // Process data for prediction
    const predictions = await predictBudgets(icsData);
    
    res.json(predictions);
  } catch (error) {
    console.error("Prediction error:", error);
    res.status(500).json({ message: "Error predicting budgets", error: error.message });
  }
};

async function predictBudgets(icsData) {
  // Group data by department
  const departmentData = {};
  
  icsData.forEach(record => {
    const dept = record.department;
    const month = new Date(record.date_encode).getMonth();
    const amount = parseFloat(record.unit_amount);
    
    if (!departmentData[dept]) {
      departmentData[dept] = { monthlyTotals: Array(12).fill(0), count: Array(12).fill(0) };
    }
    
    departmentData[dept].monthlyTotals[month] += amount;
    departmentData[dept].count[month]++;
  });

  // Calculate monthly averages and prepare for prediction
  const predictions = {};
  
  for (const dept in departmentData) {
    const monthlyAverages = departmentData[dept].monthlyTotals.map((total, i) => 
      departmentData[dept].count[i] > 0 ? total / departmentData[dept].count[i] : 0
    );

    // Simple linear regression for prediction
    const dataForRegression = monthlyAverages
      .map((avg, month) => [month + 1, avg])
      .filter(point => point[1] > 0);
    
    if (dataForRegression.length > 1) {
      const result = regression.linear(dataForRegression);
      const predictedYearly = result.predict(13)[1] * 12; // Predict next year
      predictions[dept] = predictedYearly;
    } else {
      predictions[dept] = monthlyAverages.reduce((a, b) => a + b, 0) * 12;
    }
  }

  return predictions;
}
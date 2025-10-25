const db = require('../config/db');

// Helper function to format numbers with commas
const formatNumber = (num) => {
  if (num === null || num === undefined || num === '') return '';
  return parseFloat(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

// Helper function to format dates
const formatDate = (dateString) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

exports.viewReports = (req, res) => {
  res.render('reports', { user: req.user, reportType: null, data: [] });
};

exports.getFilteredReports = async (filters) => {
  try {
    const { reportType, department, dateStart, dateEnd, minValue, maxValue } = filters;
    let sql = '';
    const params = [];

    if (reportType === 'ics') {
      sql = `
        SELECT 
          id, pos_no, pr_id, ppe_code, charging, dept AS department, property_no, note, 
          description, date_acq, qty AS quantity, unit_of_measurement, 
          unit_of_value, balcard, onhand, com_name, condition_code, 
          sticker, attachment, condemned, disposed, forPRNTrpci, w_ARE, 
          property_card, notes, remarks
        FROM ics
        WHERE 1=1
      `;
      
      if (dateStart) {
        sql += ' AND date_acq >= ?';
        params.push(dateStart);
      }
      if (dateEnd) {
        sql += ' AND date_acq <= ?';
        params.push(dateEnd);
      }
      if (department) {
        sql += ' AND dept = ?';
        params.push(department);
      }
      if (minValue) {
        sql += ' AND unit_of_value >= ?';
        params.push(minValue);
      }
      if (maxValue) {
        sql += ' AND unit_of_value <= ?';
        params.push(maxValue);
      }
    } else {
      return [];
    }

    console.log('Generated SQL Query:', sql);
    console.log('Query Parameters:', params);

    const results = await db.query(sql, params);

    const formattedResults = results.map(row => ({
      ...row,
      date_acq: formatDate(row.date_acq),
      quantity: formatNumber(row.quantity),
      unit_of_value: formatNumber(row.unit_of_value),
      balcard: formatNumber(row.balcard),
      onhand: formatNumber(row.onhand)
    }));

    console.log('Formatted Query Results:', formattedResults);
    return formattedResults;
  } catch (error) {
    console.error('Error in getFilteredReports:', error);
    throw error;
  }
};

exports.filterReports = async (req, res) => {
  try {
    const filters = req.query;
    console.log('Filters:', filters);
    const data = await exports.getFilteredReports(filters);
    console.log('Data sent to frontend:', data);
    res.render('reports', { reportType: filters.reportType, data });
  } catch (error) {
    console.error('Error filtering reports:', error);
    res.status(500).send('Internal Server Error');
  }
};
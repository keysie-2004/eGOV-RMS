const db = require('../config/db');

// Display the form for selecting the report type
exports.viewReports = (req, res) => {
    // Render the form with no data initially
    res.render('reports', { reportType: null, data: [] });
};

exports.getFilteredReports = async (filters) => {
    const { reportType, department, dateStart, dateEnd, minValue, maxValue } = filters;
    let sql = '';
    const params = [];

    // Base query based on report type
    if (reportType === 'ics') {
        sql = `
            SELECT id, department, date_encode AS date, ics_no AS reference, particular AS description, quantity, unit, unit_amount AS unit_value
            FROM ics_2024
        `;
        if (dateStart) {
            sql += (sql.includes('WHERE') ? ' AND' : ' WHERE') + ' date_encode >= ?';
            params.push(dateStart);
        }
        if (dateEnd) {
            sql += (sql.includes('WHERE') ? ' AND' : ' WHERE') + ' date_encode <= ?';
            params.push(dateEnd);
        }
    } else if (reportType === 'par') {
        sql = `
            SELECT id, department, date_acquired AS date, property_no AS reference, description, quantity, unit_measure AS unit, unit_value
            FROM par_property_motor_vehicles
        `;
        if (dateStart) {
            sql += (sql.includes('WHERE') ? ' AND' : ' WHERE') + ' date_acquired >= ?';
            params.push(dateStart);
        }
        if (dateEnd) {
            sql += (sql.includes('WHERE') ? ' AND' : ' WHERE') + ' date_acquired <= ?';
            params.push(dateEnd);
        }
    } else if (reportType === 'combined') {
        sql = `
            SELECT 'ics' AS source, id, department, date_encode AS date, ics_no AS reference, particular AS description, quantity, unit, unit_amount AS unit_value
            FROM ics_2024
            UNION ALL
            SELECT 'par' AS source, id, department, date_acquired AS date, property_no AS reference, description, quantity, unit_measure AS unit, unit_value
            FROM par_property_motor_vehicles
        `;
        if (dateStart || dateEnd) {
            sql = `
                SELECT * FROM (
                    ${sql}
                ) AS combined_data
                WHERE 1=1
            `;
            if (dateStart) {
                sql += ' AND date >= ?';
                params.push(dateStart);
            }
            if (dateEnd) {
                sql += ' AND date <= ?';
                params.push(dateEnd);
            }
        }
    } else {
        return []; // Return empty if reportType is invalid
    }

    // Dynamic filters for all report types
    if (department) {
        sql += (sql.includes('WHERE') ? ' AND' : ' WHERE') + ' department = ?';
        params.push(department);
    }

    if (minValue) {
        sql += (sql.includes('WHERE') ? ' AND' : ' WHERE') + ' unit_value >= ?';
        params.push(minValue);
    }

    if (maxValue) {
        sql += (sql.includes('WHERE') ? ' AND' : ' WHERE') + ' unit_value <= ?';
        params.push(maxValue);
    }

    // Execute the query and return the results
    return await db.query(sql, params);
};

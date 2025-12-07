const db = require('../config/db');

class ICSModel {
    static async getAllItems() {
        try {
            const query = `
                SELECT i.*, d.department_name 
                FROM ics i
                LEFT JOIN departments d ON i.dept = d.department_id
                WHERE (i.status IS NULL OR i.status != "archived")
            `;
            const results = await db.query(query);
            return results;
        } catch (error) {
            console.error('Error getting all items:', error);
            throw error;
        }
    }

    static async getItemById(id) {
        try {
            const query = `
                SELECT i.*, d.department_name 
                FROM ics i
                LEFT JOIN departments d ON i.dept = d.department_id
                WHERE i.id = ?
            `;
            const results = await db.query(query, [id]);
            return results[0];
        } catch (error) {
            console.error('Error getting item by ID:', error);
            throw error;
        }
    }

static async updateScanStatus(id, scanType, date, condition_code = null) {
    try {
        let query = 'UPDATE ics SET ';
        const params = [];
        
        if (scanType === 'first') {
            query += 'first_scan_date = ?, scan_status = "First Scan"';
            params.push(date);
        } else {
            // Second scan means completed
            query += 'second_scan_date = ?, scan_status = "Completed"';
            params.push(date);
        }
        
        // Validate and add condition_code if provided
        if (condition_code) {
            const conditionInt = parseInt(condition_code);
            if (conditionInt >= 1 && conditionInt <= 4) {
                query += ', condition_code = ?';
                params.push(conditionInt);
            }
        }
        
        query += ' WHERE id = ? AND (status IS NULL OR status != "archived")';
        params.push(id);
        
        const result = await db.query(query, params);
        
        if (result.affectedRows === 0) {
            throw new Error('Item not found or is archived');
        }
        
        await this.calculateScanPercentage();
        return true;
    } catch (error) {
        throw error;
    }
}

    static async calculateScanPercentage() {
        try {
            const totalQuery = `
                SELECT COUNT(*) as total 
                FROM ics 
                WHERE (status IS NULL OR status != "archived")
            `;
            const scannedQuery = `
                SELECT COUNT(*) as scanned 
                FROM ics 
                WHERE first_scan_date IS NOT NULL 
                AND second_scan_date IS NOT NULL 
                AND (status IS NULL OR status != "archived")
            `;
            const [totalResult, scannedResult] = await Promise.all([
                db.query(totalQuery),
                db.query(scannedQuery)
            ]);
            const total = totalResult[0].total;
            const scanned = scannedResult[0].scanned;
            const overallPercentage = total > 0 ? (scanned / total) * 100 : 0;
            await db.query('UPDATE ics SET scan_percentage = ? WHERE (status IS NULL OR status != "archived")', [overallPercentage]);
            const deptQuery = `
                SELECT 
                    i.dept,
                    d.department_name,
                    COUNT(*) as total,
                    SUM(CASE WHEN i.first_scan_date IS NOT NULL AND i.second_scan_date IS NOT NULL THEN 1 ELSE 0 END) as scanned
                FROM ics i
                LEFT JOIN departments d ON i.dept = d.department_id
                WHERE (i.status IS NULL OR i.status != "archived")
                GROUP BY i.dept, d.department_name
            `;
            const deptResults = await db.query(deptQuery);
            for (const dept of deptResults) {
                const deptPercentage = dept.total > 0 ? (dept.scanned / dept.total) * 100 : 0;
                await db.query('UPDATE ics SET scan_percentage = ? WHERE dept = ? AND (status IS NULL OR status != "archived")', [deptPercentage, dept.dept]);
            }
            return overallPercentage;
        } catch (error) {
            throw error;
        }
    }

    static async getScanStatistics() {
        try {
            const [total, firstScan, secondScan, completeScan, deptStats] = await Promise.all([
                db.query(`
                    SELECT COUNT(*) as total 
                    FROM ics 
                    WHERE unit_of_value > 50000 
                    AND (status IS NULL OR status != "archived")
                `),
                db.query(`
                    SELECT COUNT(*) as scanned 
                    FROM ics 
                    WHERE first_scan_date IS NOT NULL 
                    AND unit_of_value > 50000 
                    AND (status IS NULL OR status != "archived")
                `),
                db.query(`
                    SELECT COUNT(*) as scanned 
                    FROM ics 
                    WHERE second_scan_date IS NOT NULL 
                    AND unit_of_value > 50000 
                    AND (status IS NULL OR status != "archived")
                `),
                db.query(`
                    SELECT COUNT(*) as scanned 
                    FROM ics 
                    WHERE first_scan_date IS NOT NULL 
                    AND second_scan_date IS NOT NULL 
                    AND unit_of_value > 50000 
                    AND (status IS NULL OR status != "archived")
                `),
                db.query(`
                    SELECT 
                        d.department_name as dept,
                        COUNT(*) as total,
                        SUM(CASE WHEN i.first_scan_date IS NOT NULL THEN 1 ELSE 0 END) as first_scan,
                        SUM(CASE WHEN i.second_scan_date IS NOT NULL THEN 1 ELSE 0 END) as second_scan,
                        SUM(CASE WHEN i.first_scan_date IS NOT NULL AND i.second_scan_date IS NOT NULL THEN 1 ELSE 0 END) as complete_scan
                    FROM ics i
                    LEFT JOIN departments d ON i.dept = d.department_id
                    WHERE i.unit_of_value > 50000 
                    AND (i.status IS NULL OR i.status != "archived")
                    GROUP BY d.department_id, d.department_name
                `)
            ]);
            
            return {
                total: total[0].total,
                firstScan: firstScan[0].scanned,
                secondScan: secondScan[0].scanned,
                completeScan: completeScan[0].scanned,
                departments: deptStats
            };
        } catch (error) {
            console.error('Error getting scan statistics:', error);
            throw error;
        }
    }
        
    static async getItemByQRCode(qrCode) {
        try {
            const query = `
                SELECT i.*, d.department_name 
                FROM ics i
                LEFT JOIN departments d ON i.dept = d.department_id
                WHERE i.id = ?
            `;
            const results = await db.query(query, [qrCode]);
            return results[0];
        } catch (error) {
            console.error('Error getting item by QR code:', error);
            throw error;
        }
    }

    static async calculateScanPercentage() {
        try {
            // Calculate item-level percentages
            const itemsQuery = `
                SELECT 
                    id,
                    (CASE 
                        WHEN first_scan_date IS NOT NULL AND second_scan_date IS NOT NULL THEN 100
                        WHEN first_scan_date IS NOT NULL OR second_scan_date IS NOT NULL THEN 50
                        ELSE 0
                    END) as item_percentage
                FROM ics
                WHERE (status IS NULL OR status != "archived")
            `;
            const items = await db.query(itemsQuery);
            for (const item of items) {
                await db.query('UPDATE ics SET scan_percentage = ? WHERE id = ?', [item.item_percentage, item.id]);
            }

            // Calculate overall percentage
            const totalQuery = 'SELECT COUNT(*) as total FROM ics WHERE (status IS NULL OR status != "archived")';
            const firstScanQuery = 'SELECT COUNT(*) as scanned FROM ics WHERE first_scan_date IS NOT NULL AND (status IS NULL OR status != "archived")';
            const secondScanQuery = 'SELECT COUNT(*) as scanned FROM ics WHERE second_scan_date IS NOT NULL AND (status IS NULL OR status != "archived")';
            const [totalResult, firstScanResult, secondScanResult] = await Promise.all([
                db.query(totalQuery),
                db.query(firstScanQuery),
                db.query(secondScanQuery)
            ]);
            const totalItems = totalResult[0].total;
            const firstScans = firstScanResult[0].scanned;
            const secondScans = secondScanResult[0].scanned;
            const totalPossibleScans = totalItems * 2;
            const overallPercentage = totalPossibleScans > 0 ? ((firstScans + secondScans) / totalPossibleScans) * 100 : 0;

            return overallPercentage;
        } catch (error) {
            console.error('Error calculating scan percentage:', error);
            throw error;
        }
    }
}

module.exports = ICSModel;
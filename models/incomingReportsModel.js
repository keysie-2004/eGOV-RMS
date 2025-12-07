const db = require('../config/db');

class IncomingReportsModel {
    static async fetchAndUpdateIncomingReports(userId = null, userName = null) {
        try {
            // Pass user info to the update method
            await this.updateReportDataFromSources(userId, userName);
            
            const query = `
                SELECT ir.*, 
                    DATE_FORMAT(ir.date, '%Y-%m-%d') AS formatted_date,
                    EXISTS (
                        SELECT 1 FROM ics WHERE ics.pr_id = ir.pr_id
                    ) AS is_synced
                FROM incoming_reports ir
                WHERE ir.pr_id IS NOT NULL
            `;
            const results = await db.query(query);
            return results;
        } catch (error) {
            throw error;
        }
    }
    
    static async updateReportDataFromSources(userId = null, userName = null) {
        try {
            // Determine who is updating (logged-in user or system)
            const updatedBy = userName || userId || 'system';
            
            const updateQuery = `
                INSERT INTO incoming_reports (
                    pr_id, 
                    department, 
                    amount, 
                    supplier, 
                    created_at, 
                    updated_at,
                    updated_by,
                    status  
                )
                SELECT 
                    insp.pr_id,
                    pr.department,
                    COALESCE((
                        SELECT SUM(poi.total_cost) 
                        FROM purchase_order_items poi
                        JOIN purchase_orders po ON poi.po_id = po.po_id
                        WHERE po.pr_id = insp.pr_id
                    ), 0) AS amount,
                    COALESCE(po.company_name, 'N/A') AS supplier,
                    NOW() AS created_at,
                    NOW() AS updated_at,
                    ? AS updated_by,
                    'active' AS status
                FROM 
                    inspection_reports insp
                JOIN 
                    purchase_requests pr ON insp.pr_id = pr.pr_id
                LEFT JOIN 
                    purchase_orders po ON insp.pr_id = po.pr_id
                WHERE 
                    insp.pr_id IS NOT NULL
                ON DUPLICATE KEY UPDATE
                    department = VALUES(department),
                    amount = VALUES(amount),
                    supplier = VALUES(supplier),
                    updated_at = NOW(),
                    updated_by = ?
            `;
            
            await db.query(updateQuery, [updatedBy, updatedBy]);
        } catch (error) {
            throw error;
        }
    }

    static async updateIncomingReport(data) {
        try {
            const { incoming_id, particulars, transaction, date, updated_by } = data;
            
            const formattedDate = date ? new Date(date).toISOString().slice(0, 19).replace('T', ' ') : null;
            
            const query = `
                UPDATE incoming_reports
                SET 
                    particulars = ?,
                    transaction = ?,
                    date = ?,
                    updated_at = NOW(),
                    updated_by = ?
                WHERE 
                    incoming_id = ?
            `;
            
            const result = await db.query(query, [particulars, transaction, formattedDate, updated_by, incoming_id]);
            return result;
        } catch (error) {
            throw error;
        }
    }

    static async archiveIncomingReport(incoming_id, updated_by) {
        try {
            const query = `
                UPDATE incoming_reports
                SET 
                    status = 'archived',
                    updated_at = NOW(),
                    updated_by = ?
                WHERE 
                    incoming_id = ?
            `;
            
            const result = await db.query(query, [updated_by, incoming_id]);
            return result;
        } catch (error) {
            throw error;
        }
    }

    static async unarchiveIncomingReport(incoming_id, updated_by) {
        try {
            const query = `
                UPDATE incoming_reports
                SET 
                    status = NULL,
                    updated_at = NOW(),
                    updated_by = ?
                WHERE 
                    incoming_id = ?
            `;
            
            const result = await db.query(query, [updated_by, incoming_id]);
            return result;
        } catch (error) {
            throw error;
        }
    }

    static async syncICSData(updated_by = 'system') {
        try {
            console.log('Starting ICS data sync...');
            
            const reports = await db.query(`
                SELECT incoming_id, pr_id FROM incoming_reports 
                WHERE pr_id IS NOT NULL
            `);

            console.log(`Found ${reports.length} reports with PR IDs to process`);

            let insertedCount = 0;
            let skippedCount = 0;

            for (const report of reports) {
                const { incoming_id, pr_id } = report;
                
                console.log(`Processing incoming_id: ${incoming_id}, pr_id: ${pr_id}`);
                
                const existingICS = await db.query(`
                    SELECT id FROM ics WHERE pr_id = ?
                `, [pr_id]);
                
                if (existingICS.length > 0) {
                    console.log(`PR ${pr_id} already exists in ICS table - skipping`);
                    skippedCount++;
                    continue;
                }
                
                const icsData = await this.fetchICSData(pr_id);
                
                if (icsData) {
                    // Add updated_by to ICS data if you have that field
                    icsData.updated_by = updated_by;
                    await this.insertICSData(icsData);
                    console.log(`Successfully inserted ICS data for PR ${pr_id}`);
                    insertedCount++;
                } else {
                    console.log(`No data found for PR ${pr_id} - skipping`);
                }
            }
            
            console.log(`Sync completed. Inserted: ${insertedCount}, Skipped: ${skippedCount}`);
            return { 
                success: true, 
                message: 'ICS data synced successfully',
                inserted: insertedCount,
                skipped: skippedCount,
                updated_by: updated_by
            };
        } catch (error) {
            console.error('Error syncing ICS data:', error);
            throw error;
        }
    }

    static async syncSingleICSData(incoming_id, updated_by = 'system') {
        try {
            console.log(`Starting ICS data sync for incoming_id: ${incoming_id}`);
            
            const [report] = await db.query(`
                SELECT incoming_id, pr_id FROM incoming_reports 
                WHERE incoming_id = ?
            `, [incoming_id]);

            if (!report) {
                throw new Error('Report not found');
            }

            const { pr_id } = report;
            
            const existingICS = await db.query(`
                SELECT id FROM ics WHERE pr_id = ?
            `, [pr_id]);
            
            if (existingICS.length > 0) {
                throw new Error(`PR ${pr_id} already exists in ICS table`);
            }
            
            const icsData = await this.fetchICSData(pr_id);
            
            if (!icsData) {
                throw new Error(`No valid data found for PR ${pr_id}`);
            }
            
            // Add updated_by to ICS data if you have that field
            icsData.updated_by = updated_by;
            await this.insertICSData(icsData);
            console.log(`Successfully synced ICS data for PR ${pr_id}`);
            
            return { 
                success: true, 
                message: `ICS data synced successfully for PR ${pr_id}`,
                incoming_id,
                updated_by
            };
        } catch (error) {
            console.error(`Error syncing ICS data for incoming_id ${incoming_id}:`, error);
            throw error;
        }
    }

    static async fetchICSData(pr_id) {
        try {
            // Fetch purchase request data
            const [prData] = await db.query(`
                SELECT pr.department, pri.quantity, pri.unit
                FROM purchase_requests pr
                JOIN purchase_request_items pri ON pr.pr_id = pri.pr_id
                WHERE pr.pr_id = ?
                LIMIT 1
            `, [pr_id]);
            
            if (!prData) return null;
            
            // Fetch department_id from departments table based on department name
            const [deptData] = await db.query(`
                SELECT department_id
                FROM departments
                WHERE department_name = ?
            `, [prData.department]);
            
            if (!deptData) {
                console.warn(`No department found for department name: ${prData.department}`);
                return null; // Skip if no matching department is found
            }
            
            // Fetch purchase order data
            const poData = await db.query(`
                SELECT po.po_id, po.company_name, poi.stock_property_no, 
                       poi.unit_cost, poi.total_cost
                FROM purchase_orders po
                JOIN purchase_order_items poi ON po.po_id = poi.po_id
                WHERE po.pr_id = ?
            `, [pr_id]);
            
            if (!poData.length) return null;
            
            const totalCost = poData.reduce((sum, item) => sum + parseFloat(item.total_cost || 0), 0);
            
            return {
                pr_id: pr_id,
                dept: prData.department || '',
                department_id: deptData.department_id || null,
                com_name: prData.department || '',
                property_no: poData[0]?.stock_property_no || '',
                description: prData.description || '',
                qty: prData.quantity || 0,
                unit_of_measurement: prData.unit || '',
                unit_of_value: poData[0]?.unit_cost || '0.00',
                balcard: totalCost,
                onhand: totalCost,
                pos_no: '',
                ppe_code: '',
                charging: '',
                note: '',
                date_acq: new Date().toISOString().slice(0, 19).replace('T', ' '),
                condition_code: '',
                sticker: '',
                attachment: '',
                condemned: 0,
                disposed: 0,
                forPRNTrpci: 0,
                w_ARE: 0,
                property_card: '',
                notes: '',
                remarks: '',
                qr_code_path: '',
                first_scan_date: null,
                second_scan_date: null,
                scan_status: 'pending',
                scan_percentage: 0,
                item_classification: ''
            };
        } catch (error) {
            console.error(`Error fetching ICS data for pr_id ${pr_id}:`, error);
            throw error;
        }
    }
    
    static async insertICSData(icsData) {
        try {
            const query = `
                INSERT INTO ics SET ?
            `;
            
            await db.query(query, icsData);
        } catch (error) {
            throw error;
        }
    }
}

module.exports = IncomingReportsModel;
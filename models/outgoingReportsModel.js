const db = require('../config/db');

class OutgoingReportsModel {
    static async fetchAllOutgoingReports(showArchived = false) {
        try {
            await this.syncIncomingToOutgoing();
            
            // Fetch reports with properly formatted dates
            const query = `
                SELECT 
                    o.outgoing_id,
                    o.pr_id,
                    i.department,
                    i.particulars,
                    i.amount,
                    i.supplier,
                    o.received_by,
                    DATE_FORMAT(o.date_received, '%Y-%m-%d') as formatted_date_received,
                    o.transaction,
                    o.created_at,
                    o.updated_at,
                    o.updated_by,
                    o.status
                FROM 
                    outgoing_reports o
                JOIN 
                    incoming_reports i ON o.pr_id = i.pr_id
                ORDER BY 
                    o.created_at DESC
            `;
            const results = await db.query(query);
            return results;
        } catch (error) {
            throw error;
        }
    }
    
    static async syncIncomingToOutgoing() {
        try {
            const query = `
                INSERT INTO outgoing_reports (
                    pr_id, 
                    department,
                    particulars,
                    amount,
                    supplier,
                    received_by, 
                    date_received, 
                    transaction, 
                    created_at, 
                    updated_at, 
                    updated_by,
                    status
                )
                SELECT 
                    i.pr_id, 
                    i.department,
                    i.particulars,
                    i.amount,
                    i.supplier,
                    NULL, 
                    NULL, 
                    NULL, 
                    NOW(), 
                    NOW(), 
                    'system',
                    'pending'
                FROM incoming_reports i
                LEFT JOIN outgoing_reports o ON i.pr_id = o.pr_id
                WHERE o.pr_id IS NULL
            `;
            await db.query(query);
        } catch (error) {
            throw error;
        }
    }

    static async updateOutgoingReport(data) {
        try {
            const { outgoing_id, received_by, date_received, transaction, updated_by } = data;
            
            const query = `
                UPDATE outgoing_reports
                SET 
                    received_by = ?,
                    date_received = ?,
                    transaction = ?,
                    updated_at = NOW(),
                    updated_by = ?,
                    status = 'completed'
                WHERE 
                    outgoing_id = ?
            `;
            
            const result = await db.query(query, [
                received_by,
                date_received,
                transaction,
                updated_by,
                outgoing_id
            ]);
            return result;
        } catch (error) {
            throw error;
        }
    }

    static async archiveOutgoingReport(outgoing_id, updated_by) {
        try {
            const query = `
                UPDATE outgoing_reports
                SET 
                    status = 'archived',
                    updated_at = NOW(),
                    updated_by = ?
                WHERE 
                    outgoing_id = ?
            `;
            
            const result = await db.query(query, [updated_by, outgoing_id]);
            return result;
        } catch (error) {
            throw error;
        }
    }

    static async unarchiveOutgoingReport(outgoing_id, updated_by) {
        try {
            const query = `
                UPDATE outgoing_reports
                SET 
                    status = 'completed',
                    updated_at = NOW(),
                    updated_by = ?
                WHERE 
                    outgoing_id = ?
            `;
            
            const result = await db.query(query, [updated_by, updated_by]);
            return result;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = OutgoingReportsModel;
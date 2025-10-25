const IncomingReportsModel = require('../models/incomingReportsModel');

class IncomingReportsController {
    static async displayIncomingReports(req, res) {
        try {
            const reports = await IncomingReportsModel.fetchAndUpdateIncomingReports();
            
            // Check for sync results in flash messages
            const successMsg = req.flash('success');
            const syncResult = req.flash('syncResult')[0]; // Get sync result if exists
            
            res.render('incoming-reports', { 
                reports,
                user: req.user,
                success: successMsg,
                error: req.flash('error'),
                syncResult: syncResult ? JSON.parse(syncResult) : null // Parse the sync result
            });
        } catch (error) {
            console.error('Error displaying incoming reports:', error);
            req.flash('error', 'Failed to load incoming reports');
            res.redirect('/incoming-reports');
        }
    }

    static async updateReport(req, res) {
        try {
            const { incoming_id, particulars, transaction, date } = req.body;
            const updated_by = req.user.employee_name; // Get from authenticated user
            
            await IncomingReportsModel.updateIncomingReport({
                incoming_id,
                particulars,
                transaction,
                date,
                updated_by
            });
            
            req.flash('success', 'Report updated successfully');
            res.redirect('/incoming-reports');
        } catch (error) {
            console.error('Error updating report:', error);
            req.flash('error', 'Failed to update report');
            res.redirect('/incoming-reports');
        }
    }

    static async archiveReport(req, res) {
        try {
            const { incoming_id } = req.params;
            const updated_by = req.user.employee_name; // Use employee_name from the authenticated user
            
            await IncomingReportsModel.archiveIncomingReport(incoming_id, updated_by);
            
            req.flash('success', 'Report archived successfully');
            res.redirect('/incoming-reports');
        } catch (error) {
            console.error('Error archiving report:', error);
            req.flash('error', 'Failed to archive report');
            res.redirect('/incoming-reports');
        }
    }

    static async unarchiveReport(req, res) {
        try {
            const { incoming_id } = req.params;
            const updated_by = req.user.employee_name;
            
            await IncomingReportsModel.unarchiveIncomingReport(incoming_id, updated_by);
            
            req.flash('success', 'Report unarchived successfully');
            res.redirect('/incoming-reports');
        } catch (error) {
            console.error('Error unarchiving report:', error);
            req.flash('error', 'Failed to unarchive report');
            res.redirect('/incoming-reports');
        }
    }

    static async syncICSData(req, res) {
        try {
            const result = await IncomingReportsModel.syncICSData();
            
            req.flash('syncResult', JSON.stringify(result));
            req.flash('success', 'ICS data synced successfully');
            
            res.redirect('/incoming-reports');
        } catch (error) {
            console.error('Error syncing ICS data:', error);
            req.flash('error', 'Failed to sync ICS data: ' + error.message);
            res.redirect('/incoming-reports');
        }
    }

    static async syncSingleICSData(req, res) {
        try {
            const { incoming_id } = req.params;
            
            const result = await IncomingReportsModel.syncSingleICSData(incoming_id);
            
            req.flash('success', `ICS data synced successfully for report ${incoming_id}`);
            res.redirect('/incoming-reports');
        } catch (error) {
            console.error('Error syncing single ICS data:', error);
            req.flash('error', `Failed to sync ICS data for report ${incoming_id}: ${error.message}`);
            res.redirect('/incoming-reports');
        }
    }
}

module.exports = IncomingReportsController;
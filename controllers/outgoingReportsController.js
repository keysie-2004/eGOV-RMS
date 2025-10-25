const OutgoingReportsModel = require('../models/outgoingReportsModel');

class OutgoingReportsController {
    static async displayOutgoingReports(req, res) {
        try {
            const reports = await OutgoingReportsModel.fetchAllOutgoingReports(false);
            res.render('outgoing-reports', { 
                reports,
                success: req.flash('success'),
                error: req.flash('error'),
                user: req.user
            });
        } catch (error) {
            console.error('Error displaying outgoing reports:', error);
            req.flash('error', 'Failed to load outgoing reports');
            res.redirect('/outgoing-reports');
        }
    }

static async displayArchivedReports(req, res) {
    try {
        const reports = await OutgoingReportsModel.fetchAllOutgoingReports(true); // Note the true here
        res.render('outgoing-reports', { 
            reports,
            success: req.flash('success'),
            error: req.flash('error'),
            user: req.user
        });
    } catch (error) {
        console.error('Error displaying archived reports:', error);
        req.flash('error', 'Failed to load archived reports');
        res.redirect('/outgoing-reports');
    }
}
    static async updateReport(req, res) {
        try {
            const { outgoing_id, received_by, date_received, transaction } = req.body;
            const updated_by = req.user.employee_name;
            
            await OutgoingReportsModel.updateOutgoingReport({
                outgoing_id,
                received_by,
                date_received,
                transaction,
                updated_by
            });
            
            req.flash('success', 'Report updated successfully');
            res.redirect('/outgoing-reports');
        } catch (error) {
            console.error('Error updating report:', error);
            req.flash('error', 'Failed to update report');
            res.redirect('/outgoing-reports');
        }
    }

    static async archiveReport(req, res) {
        try {
            const { outgoing_id } = req.params;
            const updated_by = req.user.employee_name;
            
            await OutgoingReportsModel.archiveOutgoingReport(outgoing_id, updated_by);
            
            req.flash('success', 'Report archived successfully');
            res.redirect('/outgoing-reports');
        } catch (error) {
            console.error('Error archiving report:', error);
            req.flash('error', 'Failed to archive report');
            res.redirect('/outgoing-reports');
        }
    }

    static async unarchiveReport(req, res) {
        try {
            const { outgoing_id } = req.params;
            const updated_by = req.user.employee_name;
            
            await OutgoingReportsModel.unarchiveOutgoingReport(outgoing_id, updated_by);
            
            req.flash('success', 'Report unarchived successfully');
            res.redirect('/outgoing-reports');
        } catch (error) {
            console.error('Error unarchiving report:', error);
            req.flash('error', 'Failed to unarchive report');
            res.redirect('/outgoing-reports');
        }
    }
}

module.exports = OutgoingReportsController;
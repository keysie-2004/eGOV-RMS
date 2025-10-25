const EppCode = require('../models/eppCodeModel');

// Render the EPP Codes page
const renderEppCodesPage = (req, res) => {
    EppCode.getAll((err, eppCodes) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error fetching EPP codes' });
        }
        res.render('epp-codes', { user: req.user, eppCodes, error: null, success: null });
    });
};

// Render the Add EPP Code page
const renderAddEppCodePage = (req, res) => {
    res.render('add-epp-code', { user: req.user, error: null, success: null });
};

// Add a new EPP code
const addEppCode = (req, res) => {
    const { epp_type, epp_name, epp_code } = req.body;
    const eppCodeData = { epp_type, epp_name, epp_code };

    EppCode.create(eppCodeData, (err, result) => {
        if (err) {
            return res.render('add-epp-code', { error: 'Error adding EPP code', success: null });
        }
        res.render('add-epp-code', { error: null, success: 'EPP code added successfully' });
    });
};

// Update an EPP code
const updateEppCode = (req, res) => {
    const id = req.params.id;
    const { epp_type, epp_name, epp_code } = req.body;
    const eppCodeData = { epp_type, epp_name, epp_code };

    EppCode.update(id, eppCodeData, (err, result) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error updating EPP code' });
        }
        res.redirect('/epp-codes');
    });
};

// Archive an EPP code
const archiveEppCode = (req, res) => {
    const id = req.params.id;

    EppCode.archive(id, (err, result) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error archiving EPP code' });
        }
        res.redirect('/epp-codes');
    });
};

module.exports = {
    renderEppCodesPage,
    renderAddEppCodePage,
    addEppCode,
    updateEppCode,
    archiveEppCode
};
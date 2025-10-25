const Condition = require('../models/conditionModel');

// Render the Conditions page
const renderConditionsPage = (req, res) => {
    console.log('renderConditionsPage: req.user:', req.user); // Debug log
    Condition.getAll((err, conditions) => {
        if (err) {
            console.error('Error fetching conditions:', err);
            return res.status(500).render('conditions', {
                user: req.user || null,
                conditions: [],
                error: 'Error fetching conditions',
                success: null
            });
        }
        res.render('conditions', { 
            user: req.user || null, // Safer handling
            conditions,
            error: null,
            success: null 
        });
    });
};

// Render the Add Condition page
const renderAddConditionPage = (req, res) => {
    console.log('renderAddConditionPage: req.user:', req.user); // Debug log
    res.render('add-condition', { 
        user: req.user || null, // Safer handling
        error: null,
        success: null 
    });
};

// Add a new condition
const addCondition = (req, res) => {
    console.log('addCondition: req.user:', req.user); // Debug log
    const { condition_code, condition_desc } = req.body;
    const conditionData = { condition_code, condition_desc };
    Condition.create(conditionData, (err, result) => {
        if (err) {
            console.error('Error adding condition:', err);
            return res.status(500).json({ success: false, message: 'Error adding condition' });
        }
        res.status(201).json({ success: true, message: 'Condition added successfully' });
    });
};

// Update a condition
const updateCondition = (req, res) => {
    console.log('updateCondition: req.user:', req.user); // Debug log
    const id = req.params.id;
    const { condition_code, condition_desc } = req.body;
    const conditionData = { condition_code, condition_desc };
    Condition.update(id, conditionData, (err, result) => {
        if (err) {
            console.error('Error updating condition:', err);
            return res.status(500).json({ success: false, message: 'Error updating condition' });
        }
        res.redirect('/conditions');
    });
};

// Archive a condition
const archiveCondition = (req, res) => {
    console.log('archiveCondition: req.user:', req.user); // Debug log
    const id = req.params.id;
    Condition.archive(id, (err, result) => {
        if (err) {
            console.error('Error archiving condition:', err);
            return res.status(500).json({ success: false, message: 'Error archiving condition' });
        }
        res.redirect('/conditions');
    });
};

module.exports = {
    renderConditionsPage,
    renderAddConditionPage,
    addCondition,
    updateCondition,
    archiveCondition,
};
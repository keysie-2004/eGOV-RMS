const acceptanceModel = require('../models/acceptanceModel');

exports.showAcceptance = async (req, res) => {
    const { id } = req.params; // Extract pr_id from the URL

    if (!id) {
        return res.status(400).json({ success: false, message: 'PR ID is required' });
    }

    try {
        // Fetch the lowest price items for the specific PR ID
        const items = await new Promise((resolve, reject) => {
            acceptanceModel.getLowestPriceItems(id, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // Calculate the total price
        const total = items.reduce((sum, item) => sum + item.total_price, 0);

        // Fetch purchase request details (assuming you have a function to get PR details)
        const purchaseRequest = await new Promise((resolve, reject) => {
            resolve({ project_description: 'Sample Project', department: 'Sample Department' });
        });

        // Render the acceptance page with the items and total
        res.render('acceptance', { 
            abstract: {
                project_description: purchaseRequest.project_description,
                department: purchaseRequest.department,
                items: items,
                total: total
            }
        });
    } catch (error) {
        console.error('Error fetching data for acceptance page:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
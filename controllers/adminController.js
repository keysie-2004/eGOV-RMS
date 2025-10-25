const AdminModel = require('../models/adminModel');

exports.listBiddings = async (req, res) => {
    try {
        const { status = 'all' } = req.query;
        res.render('admin/biddingsList', { 
            currentStatus: status,
            userType: req.user.user_type,
            user: req.user
        });
    } catch (error) {
        console.error('Error rendering biddings list:', error);
        res.status(500).render('error', { 
            message: 'Error loading biddings list',
            user: req.user
        });
    }
};

exports.getBiddingsData = async (req, res) => {
    try {
        if (req.user.user_type !== 'superadmin') {
            return res.status(403).json({ error: 'Access denied. Superadmin only.' });
        }

        const { status = 'all', start = 0, length = 10, draw = 1 } = req.query;
        console.log('Query params received:', { status, start, length, draw });

        const { totalItems, biddings } = await AdminModel.getBiddingsData({ status, start, length });

        if (totalItems === 0) {
            console.log('No records found, returning empty result');
            return res.json({
                draw: parseInt(draw),
                recordsTotal: 0,
                recordsFiltered: 0,
                data: []
            });
        }

        const formattedData = (Array.isArray(biddings) ? biddings : []).map(bidding => ({
            bidding_id: bidding.bidding_id,
            pr_id: bidding.pr_id,
            purpose: bidding.purpose || 'N/A',
            estimated_total: bidding.estimated_total || 0,
            estimated_total_formatted: new Intl.NumberFormat('en-PH', {
                style: 'currency',
                currency: 'PHP'
            }).format(bidding.estimated_total || 0),
            deadline: bidding.deadline,
            deadline_formatted: new Date(bidding.deadline).toLocaleString('en-PH', {
                dateStyle: 'medium',
                timeStyle: 'short'
            }),
            posted_by_name: bidding.posted_by_name || 'Unknown User',
            bid_count: bidding.bid_count || 0,
            status: bidding.status,
            status_badge: `
                <span class="status-badge status-${bidding.status.toLowerCase()}">
                    ${bidding.status.charAt(0).toUpperCase() + bidding.status.slice(1)}
                </span>
            `
        }));

        const response = {
            draw: parseInt(draw),
            recordsTotal: totalItems,
            recordsFiltered: totalItems,
            data: formattedData
        };

        console.log('Sending response with', formattedData.length, 'records');
        res.json(response);
    } catch (error) {
        console.error('Error fetching biddings data:', error);
        res.status(500).json({
            error: 'Error fetching biddings data',
            details: error.message,
            draw: parseInt(req.query.draw || 1),
            recordsTotal: 0,
            recordsFiltered: 0,
            data: []
        });
    }
};

exports.getBidsByPrId = async (req, res) => {
    try {
        if (req.user.user_type !== 'superadmin') {
            return res.status(403).render('error', { 
                message: 'Access denied. Superadmin only.',
                user: req.user
            });
        }

        const { prId } = req.params;
        const { purchaseRequest, bids } = await AdminModel.getBidsByPrId(prId);

        if (!purchaseRequest) {
            return res.status(404).render('error', { 
                message: 'Purchase Request not found',
                user: req.user
            });
        }

        bids.forEach(bid => {
            bid.items = JSON.parse(bid.items || '[]');
        });

        res.render('admin/bidSelection', {
            purchaseRequest,
            bids,
            userType: req.user.user_type,
            user: req.user
        });
    } catch (error) {
        console.error('Error fetching bids for PR:', error);
        res.status(500).render('error', { 
            message: 'Error loading bids for Purchase Request',
            user: req.user
        });
    }
};

exports.awardBid = async (req, res) => {
    try {
        if (req.user.user_type !== 'superadmin') {
            return res.status(403).json({ 
                success: false,
                message: 'Access denied. Superadmin only.' 
            });
        }

        const { prId, bidId } = req.params;
        const result = await AdminModel.awardBid(prId, bidId);

        res.json({ 
            success: true,
            message: 'Bid awarded successfully'
        });
    } catch (error) {
        console.error('Error awarding bid:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error awarding bid'
        });
    }
};

exports.getBiddingDetails = async (req, res) => {
    try {
        if (req.user.user_type !== 'superadmin') {
            return res.status(403).render('error', { 
                message: 'Access denied. Superadmin only.',
                user: req.user
            });
        }

        const { biddingId } = req.params;
        const { bidding, items, bids } = await AdminModel.getBiddingDetails(biddingId);

        if (!bidding) {
            return res.status(404).render('error', { 
                message: 'Bidding not found',
                user: req.user
            });
        }
        // ...
    } catch (error) {
        console.error('Error fetching bidding details:', error);
        res.status(500).render('error', { 
            message: 'Error loading bidding details',
            user: req.user
        });
    }
};

exports.listSuppliers = async (req, res) => {
    try {
        res.render('admin/supplierList', {
            userType: req.user.user_type,
            user: req.user
        });
    } catch (error) {
        console.error('Error rendering supplier list:', error);
        res.status(500).render('error', { 
            message: 'Error loading supplier list',
            user: req.user
        });
    }
};

exports.getSupplierDetails = async (req, res) => {
    try {
        if (req.user.user_type !== 'superadmin') {
            return res.status(403).render('error', { 
                message: 'Access denied. Superadmin only.',
                user: req.user
            });
        }

        const { id } = req.params;
        const { supplier, bids, ratings } = await AdminModel.getSupplierDetails(id);

        if (!supplier) {
            return res.status(404).render('error', { 
                message: 'Supplier not found',
                user: req.user
            });
        }

        // Format bids data
        const formattedBids = bids.map(bid => ({
            ...bid,
            submitted_at: new Date(bid.submitted_at).toLocaleString('en-PH', {
                dateStyle: 'medium',
                timeStyle: 'short'
            }),
            total_amount_formatted: new Intl.NumberFormat('en-PH', {
                style: 'currency',
                currency: 'PHP'
            }).format(bid.total_amount || 0),
            status_badge: `
                <span class="status-badge status-${bid.status.toLowerCase()}">
                    ${bid.status.charAt(0).toUpperCase() + bid.status.slice(1)}
                </span>
            `
        }));

        // Format ratings data
        const formattedRatings = ratings.map(rating => ({
            ...rating,
            rated_at: new Date(rating.rated_at).toLocaleString('en-PH', {
                dateStyle: 'medium',
                timeStyle: 'short'
            }),
            stars: '★'.repeat(rating.rating) + '☆'.repeat(5 - rating.rating)
        }));

        // Calculate average rating - Fixed the syntax error here
        const averageRating = ratings.length > 0 
            ? (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length) 
            : 0;

        res.render('admin/supplierDetails', {
            supplier,
            bids: formattedBids,
            ratings: formattedRatings,
            averageRating: averageRating.toFixed(1),
            ratingCount: ratings.length,
            userType: req.user.user_type,
            user: req.user,
            helpers: {
                formatCurrency: function(amount) {
                    return new Intl.NumberFormat('en-PH', {
                        style: 'currency',
                        currency: 'PHP'
                    }).format(amount || 0);
                },
                formatDate: function(dateString) {
                    return new Date(dateString).toLocaleString('en-PH', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                    });
                }
            }
        });
    } catch (error) {
        console.error('Error fetching supplier details:', error);
        res.status(500).render('error', { 
            message: 'Error loading supplier details',
            user: req.user
        });
    }
};

exports.updateSupplierStatus = async (req, res) => {
    try {
        if (req.user.user_type !== 'superadmin') {
            return res.status(403).json({ 
                success: false,
                message: 'Access denied. Superadmin only.' 
            });
        }

        const { id } = req.params;
        const { status } = req.body;
        const result = await AdminModel.updateSupplierStatus(id, status);

        res.json({ 
            success: true,
            message: 'Supplier status updated successfully'
        });
    } catch (error) {
        console.error('Error updating supplier status:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error updating supplier status'
        });
    }
};

exports.getBidDetails = async (req, res) => {
    try {
        const { bidId } = req.params;
        const { bid, items } = await AdminModel.getBidDetails(bidId);

        if (!bid) {
            return res.status(404).render('error', {
                message: 'Bid not found',
                userType: req.user.user_type,
                user: req.user
            });
        }

        items.forEach(item => {
            item.savings = (item.requested_unit_cost * item.requested_quantity) - item.supplier_total_price;
            item.savings_percentage = (item.savings / (item.requested_unit_cost * item.requested_quantity)) * 100;
        });

        const totalSavings = items.reduce((sum, item) => sum + item.savings, 0);
        const totalSavingsPercentage = (totalSavings / bid.pr_total) * 100;

        res.render('admin/bidDetails', {
            bid: {
                ...bid,
                items
            },
            totalSavings,
            totalSavingsPercentage,
            userType: req.user.user_type,
            user: req.user,
            helpers: {
                formatCurrency: function(amount) {
                    return new Intl.NumberFormat('en-PH', {
                        style: 'currency',
                        currency: 'PHP'
                    }).format(amount || 0);
                },
                formatNumber: function(num) {
                    return num ? new Intl.NumberFormat('en-PH').format(num) : '0';
                },
                formatPercentage: function(num) {
                    return num ? num.toFixed(2) : '0.00';
                }
            }
        });
    } catch (error) {
        console.error('Error in getBidDetails:', error);
        res.status(500).render('error', {
            message: 'Failed to load bid details',
            errorDetails: process.env.NODE_ENV === 'development' ? error.message : null,
            userType: req.user.user_type,
            user: req.user
        });
    }
};

exports.getSupplierHistory = async (req, res) => {
    try {
        if (req.user.user_type !== 'superadmin') {
            return res.status(403).render('error', { 
                message: 'Access denied. Superadmin only.',
                user: req.user
            });
        }

        const { supplierId } = req.params;
        const { supplier, bids, ratings } = await AdminModel.getSupplierHistory(supplierId);

        if (!supplier) {
            return res.status(404).render('error', { 
                message: 'Supplier not found',
                user: req.user
            });
        }

        res.render('admin/supplierHistory', {
            supplier,
            bids,
            ratings,
            userType: req.user.user_type,
            user: req.user
        });
    } catch (error) {
        console.error('Error fetching supplier history:', error);
        res.status(500).render('error', { 
            message: 'Error loading supplier history',
            user: req.user
        });
    }
};

exports.exportBids = async (req, res) => {
    try {
        if (req.user.user_type !== 'superadmin') {
            return res.status(403).render('error', { 
                message: 'Access denied. Superadmin only.',
                user: req.user
            });
        }

        const { biddingId } = req.params;
        const { bidding, bids } = await AdminModel.exportBids(biddingId);

        if (!bidding) {
            return res.status(404).render('error', { 
                message: 'Bidding not found',
                user: req.user
            });
        }

        res.render('admin/exportBids', {
            bidding,
            bids,
            userType: req.user.user_type,
            user: req.user
        });
    } catch (error) {
        console.error('Error exporting bids:', error);
        res.status(500).render('error', { 
            message: 'Error exporting bids',
            user: req.user
        });
    }
};

exports.compareBids = async (req, res) => {
    try {
        if (req.user.user_type !== 'superadmin') {
            return res.status(403).render('error', { 
                message: 'Access denied. Superadmin only.',
                user: req.user
            });
        }

        const { prId } = req.params;
        const { purchaseRequest, bids } = await AdminModel.compareBids(prId);

        if (!purchaseRequest) {
            return res.status(404).render('error', { 
                message: 'Purchase Request not found or archived',
                userType: req.user.user_type,
                user: req.user
            });
        }

        const processedBids = bids.map(bid => {
            // Safely parse items if it's a string, otherwise use as is
            const items = typeof bid.items === 'string' 
                ? JSON.parse(bid.items || '[]') 
                : (bid.items || []);

            const totalSavings = purchaseRequest.total - bid.total_amount;
            const percentageSavings = (totalSavings / purchaseRequest.total) * 100;
            
            return {
                ...bid,
                items,
                total_savings: totalSavings,
                percentage_savings: percentageSavings
            };
        });

        res.render('admin/bidComparison', {
            purchaseRequest,
            bids: processedBids,
            userType: req.user.user_type,
            user: req.user,
            helpers: {
                formatCurrency: function(amount) {
                    return new Intl.NumberFormat('en-PH', {
                        style: 'currency',
                        currency: 'PHP'
                    }).format(amount);
                },
                formatDate: function(dateString) {
                    return new Date(dateString).toLocaleString('en-PH', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                    });
                }
            }
        });
    } catch (error) {
        console.error('Error comparing bids:', error);
        res.status(500).render('error', {
            message: 'Error loading bid comparison',
            userType: req.user.user_type,
            user: req.user
        });
    }
};

exports.updateBiddingStatus = async (req, res) => {
    try {
        if (req.user.user_type !== 'superadmin') {
            return res.status(403).json({ 
                success: false,
                message: 'Access denied. Superadmin only.' 
            });
        }

        const { biddingId } = req.params;
        const { status } = req.body;

        if (!['open', 'closed', 'awarded'].includes(status)) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid status value' 
            });
        }

        const result = await AdminModel.updateBiddingStatus(biddingId, status);

        res.json({ 
            success: true,
            message: 'Bidding status updated successfully'
        });
    } catch (error) {
        console.error('Error updating bidding status:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error updating bidding status'
        });
    }
};

exports.archiveBidding = async (req, res) => {
    try {
        if (req.user.user_type !== 'superadmin') {
            return res.status(403).json({ 
                success: false,
                message: 'Access denied. Superadmin only.' 
            });
        }

        const { biddingId } = req.params;
        const result = await AdminModel.archiveBidding(biddingId);

        res.json({ 
            success: true,
            message: 'Bidding archived successfully'
        });
    } catch (error) {
        console.error('Error archiving bidding:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error archiving bidding'
        });
    }
};

exports.unarchiveBidding = async (req, res) => {
    try {
        if (req.user.user_type !== 'superadmin') {
            return res.status(403).json({ 
                success: false,
                message: 'Access denied. Superadmin only.' 
            });
        }

        const { biddingId } = req.params;
        const result = await AdminModel.unarchiveBidding(biddingId);

        res.json({ 
            success: true,
            message: 'Bidding unarchived successfully'
        });
    } catch (error) {
        console.error('Error unarchiving bidding:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error unarchiving bidding'
        });
    }
};

// New controller methods for modal editing
exports.getBiddingDetailsForModal = async (req, res) => {
    try {
        console.log('getBiddingDetailsForModal called with biddingId:', req.params.biddingId);
        
        const { biddingId } = req.params;
        const { bidding } = await AdminModel.getBiddingDetails(biddingId);
        
        if (!bidding) {
            console.log('No bidding found for ID:', biddingId);
            return res.status(404).json({ error: 'Bidding not found' });
        }
        
        console.log('Bidding found:', bidding);
        
        // Format data for modal
        const response = {
            bidding_id: bidding.bidding_id,
            purpose: bidding.purpose,
            deadline: bidding.deadline,
            estimated_total: bidding.estimated_total,
            status: bidding.status,
            notes: bidding.notes,
            pr_id: bidding.pr_id
        };
        
        res.json(response);
    } catch (error) {
        console.error('Error fetching bidding details for modal:', error);
        res.status(500).json({ error: 'Error loading bidding details' });
    }
};

exports.updateBiddingFromModal = async (req, res) => {
    try {
        if (req.user.user_type !== 'superadmin') {
            return res.status(403).json({ 
                success: false,
                message: 'Access denied. Superadmin only.' 
            });
        }

        const { biddingId } = req.params;
        const { purpose, deadline, estimated_total, status, notes } = req.body;
        
        // Validate required fields
        if (!purpose || !deadline || !estimated_total || !status) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required fields: purpose, deadline, estimated_total, and status are required' 
            });
        }

        // Validate status
        const validStatuses = ['open', 'closed', 'awarded'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid status. Must be one of: open, closed, awarded' 
            });
        }

        // Validate estimated_total is a positive number
        const parsedTotal = parseFloat(estimated_total);
        if (isNaN(parsedTotal) || parsedTotal < 0) {
            return res.status(400).json({ 
                success: false,
                error: 'Estimated total must be a valid positive number' 
            });
        }

        // Validate deadline is a valid date
        const deadlineDate = new Date(deadline);
        if (isNaN(deadlineDate.getTime())) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid deadline date' 
            });
        }

        console.log('Updating bidding:', {
            biddingId,
            purpose,
            deadline: deadlineDate,
            estimated_total: parsedTotal,
            status,
            notes
        });

        const updateData = {
            purpose: purpose.trim(),
            deadline: deadlineDate,
            estimated_total: parsedTotal,
            status,
            notes: notes ? notes.trim() : null
        };
        
        const result = await AdminModel.updateBidding(biddingId, updateData);
        
        if (!result || !result.success) {
            console.error('Update failed:', result);
            return res.status(500).json({ 
                success: false,
                error: result?.message || 'Failed to update bidding' 
            });
        }
        
        console.log('Update successful:', result);
        res.json({ 
            success: true, 
            message: 'Bidding updated successfully' 
        });
    } catch (error) {
        console.error('Error updating bidding from modal:', error);
        res.status(500).json({ 
            success: false,
            error: `Error updating bidding: ${error.message}` 
        });
    }
};

// Modified existing controller methods
exports.listBiddings = async (req, res) => {
    try {
        const { status = 'all' } = req.query;
        res.render('admin/biddingsList', { 
            currentStatus: status,
            userType: req.user.user_type,
            user: req.user
        });
    } catch (error) {
        console.error('Error rendering biddings list:', error);
        res.status(500).render('error', { 
            message: 'Error loading biddings list',
            user: req.user
        });
    }
};

// controller (adminController)
exports.markBidReceived = async (req, res) => {
  try {
    if (req.user.user_type !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Superadmin only.',
      });
    }

    const { bidId } = req.params;
    const result = await AdminModel.markBidReceived(bidId, req.user.id);

    res.json({
      success: true,
      message: 'Bid marked as received',
    });
  } catch (error) {
    console.error('Error marking bid as received:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.rateSupplier = async (req, res) => {
  try {
    if (req.user.user_type !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Superadmin only.',
      });
    }

    const { bidId } = req.params;
    const { supplierId, rating, comments } = req.body;

    if (!supplierId || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input: supplierId and rating (1-5) are required',
      });
    }

    const result = await AdminModel.rateSupplier({
      bidId,
      supplierId,
      rating,
      comments,
      ratedBy: req.user.id,
    });

    res.json({
      success: true,
      message: 'Supplier rated successfully',
      ratingId: result.ratingId,
    });
  } catch (error) {
    console.error('Error rating supplier:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.listReceivedBids = async (req, res) => {
    try {
        if (req.user.user_type !== 'superadmin') {
            return res.status(403).render('error', { 
                message: 'Access denied. Superadmin only.',
                user: req.user
            });
        }

        const { prId } = req.params;
        const { purchaseRequest, bids } = await AdminModel.getBidsByPrId(prId);

        if (!purchaseRequest) {
            return res.status(404).render('error', { 
                message: 'Purchase Request not found',
                user: req.user
            });
        }

        // Ensure items is a JSON string
        bids.forEach(bid => {
            if (bid.items && typeof bid.items !== 'string') {
                bid.items = JSON.stringify(bid.items);
            }
        });

        res.render('admin/received', {
            purchaseRequest,
            bids,
            userType: req.user.user_type,
            user: req.user,
            helpers: {
                formatCurrency: function(amount) {
                    return new Intl.NumberFormat('en-PH', {
                        style: 'currency',
                        currency: 'PHP'
                    }).format(amount || 0);
                },
                formatDate: function(dateString) {
                    return new Date(dateString).toLocaleString('en-PH', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                    });
                }
            }
        });
    } catch (error) {
        console.error('Error rendering received bids:', error);
        res.status(500).render('error', { 
            message: 'Error loading received bids',
            user: req.user
        });
    }
};

// Fixed rateSupplier method in AdminController
exports.rateSupplier = async (req, res) => {
    try {
        if (req.user.user_type !== 'superadmin') {
            return res.status(403).json({ 
                success: false,
                message: 'Access denied. Superadmin only.' 
            });
        }

        const { bidId } = req.params;
        const { rating, comment } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be between 1 and 5'
            });
        }

        // Use the correct user ID field - try multiple possible fields
        const userId = req.user.employee_id || req.user.id;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID not found in session'
            });
        }

        console.log('Rating supplier with userId:', userId, 'bidId:', bidId);
        
        const result = await AdminModel.rateSupplier(bidId, userId, rating, comment);
        
        res.json({ 
            success: true, 
            message: 'Rating submitted successfully' 
        });
    } catch (error) {
        console.error('Error submitting rating:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};

exports.declineBid = async (req, res) => {
    try {
        if (req.user.user_type !== 'superadmin') {
            return res.status(403).json({ 
                success: false,
                message: 'Access denied. Superadmin only.' 
            });
        }

        const { bidId } = req.params;
        const result = await AdminModel.declineBid(bidId);

        res.json({ 
            success: true,
            message: 'Bid declined successfully'
        });
    } catch (error) {
        console.error('Error declining bid:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error declining bid'
        });
    }
};

exports.listAllReceivedBids = async (req, res) => {
    try {
        if (req.user.user_type !== 'superadmin') {
            return res.status(403).render('error', { 
                message: 'Access denied. Superadmin only.',
                user: req.user
            });
        }

        const bids = await AdminModel.getAllReceivedBids();

        // Ensure items is a JSON string
        bids.forEach(bid => {
            if (bid.items && typeof bid.items !== 'string') {
                bid.items = JSON.stringify(bid.items); // Convert to JSON string if it's an object
            }
        });

        res.render('admin/received', {
            bids,
            userType: req.user.user_type,
            user: req.user,
            helpers: {
                formatCurrency: function(amount) {
                    return new Intl.NumberFormat('en-PH', {
                        style: 'currency',
                        currency: 'PHP'
                    }).format(amount || 0);
                },
                formatDate: function(dateString) {
                    return new Date(dateString).toLocaleString('en-PH', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                    });
                }
            }
        });
    } catch (error) {
        console.error('Error rendering all received bids:', error);
        res.status(500).render('error', { 
            message: 'Error loading received bids',
            user: req.user
        });
    }
};

// Mark a bid as received
exports.markAsReceived = async (req, res) => {
    try {
        if (req.user.user_type !== 'superadmin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Superadmin only.',
            });
        }

        const { bidId } = req.params;
        const { items } = req.body;
        const userId = req.user.id;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Please select at least one item' });
        }

        const result = await AdminModel.markBidAsReceived(bidId, userId, items);
        res.json({ 
            success: true, 
            message: 'Bid marked as received'
        });
    } catch (error) {
        console.error('Error marking bid as received:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get bid items
exports.getBidItems = async (req, res) => {
    const { bidId } = req.params;
    try {
        console.log('Received request for bid items, bidId:', bidId);
        const result = await AdminModel.getBidItems(bidId);
        
        // Format the response with all required fields
        const formattedItems = result.items.map(item => ({
            item_id: item.item_id,
            unit_price: item.unit_price,
            quantity: item.quantity,
            total_price: item.total_price,
            item_description: item.item_description,
            unit: item.unit
        }));

        res.json({
            success: true,
            items: formattedItems
        });
    } catch (error) {
        console.error(`Error fetching bid items for bidId ${bidId}:`, error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch bid items', 
            details: error.message 
        });
    }
};

// Fix the submitRating method
exports.submitRating = async (req, res) => {
    try {
        if (req.user.user_type !== 'superadmin') {
            return res.status(403).json({ 
                success: false,
                message: 'Access denied. Superadmin only.' 
            });
        }

        const { bidId } = req.params;
        const { rating, comment } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be between 1 and 5'
            });
        }

        // Use the correct user ID field
        const userId = req.user.id || req.user.employee_id;
        
        const result = await AdminModel.rateSupplier(bidId, userId, rating, comment);
        
        res.json({ 
            success: true, 
            message: 'Rating submitted successfully' 
        });
    } catch (error) {
        console.error('Error submitting rating:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};

// Add new method to get bid items for the receiving modal
exports.getBidItemsForReceiving = async (req, res) => {
    try {
        if (req.user.user_type !== 'superadmin') {
            return res.status(403).json({ 
                success: false,
                message: 'Access denied. Superadmin only.' 
            });
        }

        const { bidId } = req.params;
        const { bid, items } = await AdminModel.getBidItemsForReceiving(bidId);

        res.json({ 
            success: true, 
            bid, 
            items 
        });
    } catch (error) {
        console.error('Error fetching bid items:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};


exports.listSuppliers = async (req, res) => {
    try {
        const { status = 'all' } = req.query;
        res.render('admin/suppliersList', { 
            currentStatus: status,
            userType: req.user.user_type,
            user: req.user
        });
    } catch (error) {
        console.error('Error rendering suppliers list:', error);
        res.status(500).render('error', { 
            message: 'Error loading suppliers list',
            user: req.user
        });
    }
};

exports.getSuppliersData = async (req, res) => {
    try {
        const { status = 'all', start = 0, length = 10, draw = 1, search } = req.query;
        
        const { totalItems, suppliers } = await AdminModel.getSuppliersData({ 
            status, 
            start: parseInt(start),
            length: parseInt(length),
            search: search?.value || search
        });

        res.json({
            draw: parseInt(draw),
            recordsTotal: totalItems,
            recordsFiltered: totalItems,
            data: suppliers
        });
    } catch (error) {
        console.error('Error fetching suppliers data:', error);
        res.status(500).json({
            draw: parseInt(req.query.draw || 1),
            recordsTotal: 0,
            recordsFiltered: 0,
            data: [],
            error: 'Error loading supplier data'
        });
    }
};

exports.getSupplierDetails = async (req, res) => {
    try {
        if (req.user.user_type !== 'superadmin') {
            return res.status(403).render('error', { 
                message: 'Access denied. Superadmin only.',
                user: req.user
            });
        }

        const { id } = req.params;
        const { supplier, bids, ratings } = await AdminModel.getSupplierDetails(id);

        if (!supplier) {
            return res.status(404).render('error', { 
                message: 'Supplier not found',
                user: req.user
            });
        }

        // Format bids data
        const formattedBids = bids.map(bid => ({
            ...bid,
            submitted_at: new Date(bid.submitted_at).toLocaleString('en-PH', {
                dateStyle: 'medium',
                timeStyle: 'short'
            }),
            total_amount_formatted: new Intl.NumberFormat('en-PH', {
                style: 'currency',
                currency: 'PHP'
            }).format(bid.total_amount || 0),
            status_badge: `
                <span class="status-badge status-${bid.status.toLowerCase()}">
                    ${bid.status.charAt(0).toUpperCase() + bid.status.slice(1)}
                </span>
            `
        }));

        // Format ratings data
        const formattedRatings = ratings.map(rating => ({
            ...rating,
            rated_at: new Date(rating.rated_at).toLocaleString('en-PH', {
                dateStyle: 'medium',
                timeStyle: 'short'
            }),
            stars: '★'.repeat(rating.rating) + '☆'.repeat(5 - rating.rating)
        }));

        // Calculate average rating
        const averageRating = ratings.length > 0 
            ? (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length) 
            : 0;

        res.render('admin/supplierDetails', {
            supplier,
            bids: formattedBids,
            ratings: formattedRatings,
            averageRating: averageRating.toFixed(1),
            ratingCount: ratings.length,
            userType: req.user.user_type,
            user: req.user,
            helpers: {
                formatCurrency: function(amount) {
                    return new Intl.NumberFormat('en-PH', {
                        style: 'currency',
                        currency: 'PHP'
                    }).format(amount || 0);
                },
                formatDate: function(dateString) {
                    return new Date(dateString).toLocaleString('en-PH', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                    });
                }
            }
        });
    } catch (error) {
        console.error('Error fetching supplier details:', error);
        res.status(500).render('error', { 
            message: 'Error loading supplier details',
            user: req.user
        });
    }
};

exports.updateSupplierStatus = async (req, res) => {
    try {
        if (req.user.user_type !== 'superadmin') {
            return res.status(403).json({ 
                success: false,
                message: 'Access denied. Superadmin only.' 
            });
        }

        const { id } = req.params;
        const { action } = req.body;

        // Map the action to the correct status
        let status;
        switch (action) {
            case 'pending':
                status = 'pending';
                break;
            case 'approved':
                status = 'approved';
                break;
            case 'banned':
                status = 'banned';
                break;
            default:
                return res.status(400).json({ 
                    success: false,
                    message: 'Invalid action. Must be pending, approved, or banned.' 
                });
        }

        const result = await AdminModel.updateSupplierStatus(id, status);

        res.json({ 
            success: true,
            message: `Supplier status updated to ${status} successfully`
        });
    } catch (error) {
        console.error('Error updating supplier status:', error);
        res.status(500).json({ 
            success: false,
            message: error.message || 'Error updating supplier status'
        });
    }
};
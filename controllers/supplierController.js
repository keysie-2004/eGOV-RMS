const Supplier = require('../models/supplierModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const path = require('path');
const PDFDocument = require('pdfkit'); // Add this
const { Parser } = require('json2csv'); // Add this

const supplierController = {

    // Render login page
    renderLogin: (req, res) => {
        res.render('supplier/login', { 
            layout: false,
            error: req.query.error 
        });
    },

    renderDashboard: async (req, res) => {
        try {
            console.log('User in renderDashboard:', req.user);
            if (!req.user || !req.user.id) {
                console.error('No user in request');
                return res.redirect('/supplier/login');
            }

            const supplierId = req.user.id;
            const supplier = await Supplier.findById(supplierId);
            
            if (!supplier) {
                console.error('Supplier not found for ID:', supplierId);
                return res.redirect('/supplier/login');
            }
            
            const stats = {
                activeBids: 0,
                wonBids: 0,
                openBiddings: 0,
                totalSales: 0
            };
            let recentBids = [];
            let postedRequests = [];

            try {
                // Fetch supplier bids with proper query structure
                const bidsQuery = `
                    SELECT sb.*, b.deadline, pr.purpose, pr.status as pr_status,
                           b.status as bidding_status, pr.pr_id, pr.lgu, pr.department,
                           pr.date_requested, pr.requested_by, sb.submitted_at
                    FROM supplier_bids sb
                    JOIN biddings b ON sb.bidding_id = b.bidding_id
                    JOIN purchase_requests pr ON b.pr_id = pr.pr_id
                    WHERE sb.supplier_id = ?
                    ORDER BY sb.submitted_at DESC
                `;
                const bids = await db.query(bidsQuery, [supplierId]);
                console.log('Fetched bids:', bids);

                // Calculate stats correctly
                if (Array.isArray(bids)) {
                    // Active Bids = bids with status 'pending'
                    stats.activeBids = bids.filter(bid => bid.status === 'pending').length;
                    
                    // Won Bids = bids with status 'approved'
                    stats.wonBids = bids.filter(bid => bid.status === 'approved').length;

                    // Calculate total sales from approved bids only
                    stats.totalSales = bids
                        .filter(bid => bid.status === 'approved')
                        .reduce((sum, bid) => sum + parseFloat(bid.total_amount || 0), 0);

                    // Get recent bids (limit to 5) - ensure they show up when status is pending
                    recentBids = bids.slice(0, 5);
                }

                // Fixed query to properly find available biddings
                const postedQuery = `
                    SELECT DISTINCT
                        pr.pr_id, pr.lgu, pr.department, pr.date_requested, 
                        pr.total, pr.purpose, pr.requested_by, pr.status,
                        b.bidding_id, b.deadline
                    FROM purchase_requests pr
                    LEFT JOIN biddings b ON pr.pr_id = b.pr_id AND b.status = 'open'
                    LEFT JOIN supplier_bids sb ON b.bidding_id = sb.bidding_id AND sb.supplier_id = ?
                    WHERE pr.status = 'posted' 
                    AND pr.is_archived = 0 
                    AND b.bidding_id IS NOT NULL
                    AND sb.bid_id IS NULL
                    ORDER BY pr.pr_id DESC
                `;
                const postedResults = await db.query(postedQuery, [supplierId]);
                console.log('Query results for posted requests:', postedResults);

                // Get items for each posted request
                for (const request of postedResults) {
                    const itemsQuery = `
                        SELECT item_no, unit, item_description, quantity, unit_cost, total_cost
                        FROM purchase_request_items
                        WHERE pr_id = ?
                        ORDER BY item_no
                    `;
                    const items = await db.query(itemsQuery, [request.pr_id]);
                    request.items = items || [];
                }

                postedRequests = postedResults;
                stats.openBiddings = postedRequests.length;
                console.log('Open biddings count:', stats.openBiddings);

            } catch (error) {
                console.error('Error fetching dashboard data:', error);
                // Initialize with empty arrays to prevent template errors
                recentBids = [];
                postedRequests = [];
            }

            res.render('supplier/dashboard', {
                layout: 'layouts/supplierLayout',
                supplier: supplier,
                stats: stats,
                recentBids: recentBids,
                postedRequests: postedRequests,
                currentPage: 'dashboard'
            });
        } catch (error) {
            console.error('Dashboard render error:', error);
            res.redirect('/supplier/login');
        }
    },

    // Handle login
    login: async (req, res) => {
        try {
            const { email, password } = req.body;
            
            console.log('Login attempt for email:', email);
            
            const supplier = await Supplier.findByEmail(email);
            if (!supplier) {
                console.log('Supplier not found for email:', email);
                return res.status(401).json({ 
                    success: false, 
                    message: 'Invalid credentials' 
                });
            }
            
            if (!supplier.is_approved) {
                console.log('Supplier not approved:', email);
                return res.status(403).json({ 
                    success: false, 
                    message: 'Your account is pending approval. Please wait for admin approval.' 
                });
            }
            
            if (supplier.is_banned) {
                console.log('Supplier is banned:', email);
                return res.status(403).json({ 
                    success: false, 
                    message: 'Your account has been banned due to poor performance.' 
                });
            }
            
            const isMatch = await bcrypt.compare(password, supplier.password);
            if (!isMatch) {
                console.log('Password mismatch for email:', email);
                return res.status(401).json({ 
                    success: false, 
                    message: 'Invalid credentials' 
                });
            }
            
            const jwtSecret = process.env.JWT_SECRET || 'eGOV-RMS';
            const token = jwt.sign(
                { 
                    id: supplier.supplier_id, 
                    email: supplier.email,
                    type: 'supplier' 
                }, 
                jwtSecret,
                { expiresIn: '8h' }
            );
            
            console.log('Token generated for supplier:', {
                supplierId: supplier.supplier_id,
                email: supplier.email,
                tokenLength: token.length
            });

            // Set cookie with root path for broader access
            res.cookie('token', token, { 
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 8 * 60 * 60 * 1000, // 8 hours
                path: '/' // Changed from '/supplier' to '/' for broader access
            });

            console.log('Cookie set successfully for supplier login:', {
                supplierId: supplier.supplier_id,
                email: supplier.email,
                cookiePath: '/',
                tokenSet: true
            });
            
            res.json({ 
                success: true, 
                token, 
                supplier: {
                    supplier_id: supplier.supplier_id,
                    company_name: supplier.company_name,
                    contact_person: supplier.contact_person,
                    email: supplier.email,
                    profile_image: supplier.profile_image,
                    rating: supplier.rating
                }
            });
        } catch (error) {
            console.error('Supplier login error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Internal server error' 
            });
        }
    },

    // Render registration page
    renderRegister: (req, res) => {
        res.render('supplier/register', { 
            layout: false,
            error: req.query.error 
        });
    },

    // Handle registration
// Handle registration - FIXED FOR MULTER
register: async (req, res) => {
    try {
        const { 
            company_name, 
            contact_person, 
            email, 
            phone, 
            address, 
            tax_id, 
            business_permit, 
            password 
        } = req.body;
        
        console.log('Registration attempt for:', email);

        // Check if supplier already exists
        const existingSupplier = await Supplier.findByEmail(email);
        if (existingSupplier) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email already registered' 
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Handle file uploads - MULTER VERSION
        let permitFilePath = '';
        let profileImagePath = '';

        // permit_file is REQUIRED
        if (!req.files || !req.files.permit_file || !req.files.permit_file[0]) {
            return res.status(400).json({
                success: false,
                message: 'Business permit file is required'
            });
        }

        const permitFile = req.files.permit_file[0];
        permitFilePath = `/uploads/suppliers/permits/${permitFile.filename}`;

        // profile_image is OPTIONAL
        if (req.files && req.files.profile_image && req.files.profile_image[0]) {
            const profileFile = req.files.profile_image[0];
            profileImagePath = `/uploads/suppliers/profiles/${profileFile.filename}`;
        }

        // Create supplier
        const result = await Supplier.register({
            company_name,
            contact_person,
            email,
            phone,
            address,
            tax_id,
            business_permit,
            permit_file: permitFilePath,
            profile_image: profileImagePath,
            password: hashedPassword
        });
        
        if (!result.success) {
            return res.status(500).json({ 
                success: false, 
                message: result.error || 'Registration failed'
            });
        }
        
        console.log('Supplier registered successfully:', email);
        res.json({ 
            success: true, 
            message: 'Registration successful! Your account is pending approval. You will receive an email once approved.'
        });

    } catch (error) {
        console.error('Supplier registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error'
        });
    }
},

    // Logout
    logout: (req, res) => {
        console.log('Supplier logout requested');
        
        // Clear cookie with matching options
        res.clearCookie('token', { 
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });
        
        console.log('Supplier logged out successfully');
        res.redirect('/supplier/login');
    },

    // Get supplier profile
    getProfile: async (req, res) => {
        try {
            const supplierId = req.user.id;
            console.log('Getting profile for supplier ID:', supplierId);
            
            const supplier = await Supplier.findById(supplierId);
            
            if (!supplier) {
                console.error('Supplier not found for profile request:', supplierId);
                return res.status(404).json({ success: false, message: 'Supplier not found' });
            }
            
            // Remove sensitive data
            delete supplier.password;
            
            res.json({ success: true, supplier });
        } catch (error) {
            console.error('Get supplier profile error:', error);
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    },

    // Update supplier profile
    updateProfile: async (req, res) => {
        try {
            const supplierId = req.user.id;
            const updateData = req.body;
            
            console.log('Updating profile for supplier ID:', supplierId);
            
            // Handle profile image upload
            if (req.file) {
                updateData.profile_image = `/uploads/suppliers/${req.file.filename}`;
            }
            
            const result = await Supplier.updateProfile(supplierId, updateData);
            
            if (!result.success) {
                console.error('Profile update failed:', result.error);
                return res.status(400).json({ success: false, message: result.error });
            }
            
            console.log('Profile updated successfully for supplier:', supplierId);
            res.json({ success: true, message: 'Profile updated successfully' });
        } catch (error) {
            console.error('Update supplier profile error:', error);
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    },

    // Get all open biddings (for suppliers)
    getOpenBiddings: async (req, res) => {
        try {
            console.log('Getting open biddings for supplier:', req.user.id);
            const biddings = await Supplier.getOpenBiddings();
            res.json({ success: true, biddings });
        } catch (error) {
            console.error('Get open biddings error:', error);
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    },

    // Get bidding details
    getBiddingDetails: async (req, res) => {
        try {
            const { biddingId } = req.params;
            console.log('Getting bidding details for ID:', biddingId);
            
            const bidding = await Supplier.getBiddingById(biddingId);
            if (!bidding) {
                console.error('Bidding not found:', biddingId);
                return res.status(404).json({ success: false, message: 'Bidding not found' });
            }
            
            const items = await Supplier.getRequestItems(bidding.pr_id);
            
            res.json({ 
                success: true, 
                bidding: {
                    ...bidding,
                    items
                } 
            });
        } catch (error) {
            console.error('Get bidding details error:', error);
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    },

// Submit a bid - Fixed to work without connection pooling
submitBid: async (req, res) => {
    try {
        const supplierId = req.user.id;
        const { bidding_id, items, notes } = req.body;
        
        console.log(`Submitting bid - Supplier: ${supplierId}, Bidding: ${bidding_id}`);
        console.log('Items received:', items);
        
        // Validate required fields
        if (!bidding_id || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields: bidding_id and items' 
            });
        }
        
        // 1. Validate bidding exists and is open
        const biddingQuery = `
            SELECT b.*, pr.pr_id, pr.status as pr_status
            FROM biddings b
            JOIN purchase_requests pr ON b.pr_id = pr.pr_id
            WHERE b.bidding_id = ?
        `;
        const biddingResults = await db.query(biddingQuery, [bidding_id]);
        
        if (!biddingResults || biddingResults.length === 0) {
            console.log(`Bidding ${bidding_id} not found`);
            return res.status(400).json({ 
                success: false, 
                message: 'Bidding not found' 
            });
        }
        
        const bidding = biddingResults[0];
        
        // 2. Check bidding status
        if (bidding.status !== 'open') {
            console.log(`Bidding ${bidding_id} status is ${bidding.status}`);
            return res.status(400).json({ 
                success: false, 
                message: `Bidding is ${bidding.status}` 
            });
        }
        
        // 3. Check deadline
        if (new Date(bidding.deadline) < new Date()) {
            console.log(`Bidding ${bidding_id} deadline passed`);
            return res.status(400).json({ 
                success: false, 
                message: 'Bidding deadline has passed' 
            });
        }
        
        // 4. Check if supplier already bid
        const existingBidResults = await db.query(
            'SELECT bid_id FROM supplier_bids WHERE bidding_id = ? AND supplier_id = ?',
            [bidding_id, supplierId]
        );
        
        if (existingBidResults && existingBidResults.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'You already submitted a bid for this request' 
            });
        }
        
        // 5. Calculate total amount and validate items
        let total_amount = 0;
        const validatedItems = [];
        
        for (const item of items) {
            const unitPrice = parseFloat(item.unit_price) || 0;
            const quantity = parseFloat(item.quantity) || 0;
            const totalPrice = parseFloat(item.total_price) || (unitPrice * quantity);
            
            if (unitPrice <= 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Invalid unit price for item ${item.item_id}` 
                });
            }
            
            validatedItems.push({
                item_id: item.item_id,
                quantity: quantity,
                unit_price: unitPrice,
                total_price: totalPrice
            });
            
            total_amount += totalPrice;
        }
        
        console.log(`Total bid amount: ${total_amount}`);
        
        // 6. Insert bid (without transaction since we don't have connection pooling)
        try {
            // First insert the main bid
            const insertBidQuery = `
                INSERT INTO supplier_bids (bidding_id, supplier_id, total_amount, notes, status, submitted_at) 
                VALUES (?, ?, ?, ?, 'pending', NOW())
            `;
            
            const bidResult = await db.query(insertBidQuery, [
                bidding_id, 
                supplierId, 
                total_amount.toFixed(2), 
                notes || ''
            ]);
            
            // Get the bid ID - handle different result formats
            let bidId;
            if (bidResult && bidResult.insertId) {
                bidId = bidResult.insertId;
            } else if (Array.isArray(bidResult) && bidResult[0] && bidResult[0].insertId) {
                bidId = bidResult[0].insertId;
            } else {
                throw new Error('Failed to get bid ID from insert result');
            }
            
            console.log(`Bid inserted with ID: ${bidId}`);
            
            // Then insert bid items
            for (const item of validatedItems) {
                const insertItemQuery = `
                    INSERT INTO bid_items (bid_id, item_id, quantity, unit_price, total_price) 
                    VALUES (?, ?, ?, ?, ?)
                `;
                
                await db.query(insertItemQuery, [
                    bidId,
                    item.item_id,
                    item.quantity,
                    item.unit_price.toFixed(2),
                    item.total_price.toFixed(2)
                ]);
            }
            
            console.log(`Bid items inserted for bid ID: ${bidId}`);
            
            // Update purchase request status to 'bidding' if it's still 'posted'
            if (bidding.pr_status === 'posted') {
                await db.query(
                    'UPDATE purchase_requests SET status = ? WHERE pr_id = ?',
                    ['bidding', bidding.pr_id]
                );
                console.log(`PR ${bidding.pr_id} status updated to 'bidding'`);
            }
            
            res.json({ 
                success: true, 
                message: 'Bid submitted successfully',
                bidId: bidId,
                totalAmount: total_amount
            });
            
        } catch (insertError) {
            console.error('Error during bid insertion:', insertError);
            
            // If we have a bid ID, try to clean up
            if (typeof bidId !== 'undefined') {
                try {
                    await db.query('DELETE FROM supplier_bids WHERE bid_id = ?', [bidId]);
                    await db.query('DELETE FROM bid_items WHERE bid_id = ?', [bidId]);
                    console.log('Cleaned up partial bid insertion');
                } catch (cleanupError) {
                    console.error('Error during cleanup:', cleanupError);
                }
            }
            
            throw insertError;
        }
        
    } catch (error) {
        console.error('Bid submission error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to submit bid: ' + error.message
        });
    }
},
// Get supplier's bids
    getMyBids: async (req, res) => {
        try {
            const supplierId = req.user.id;
            console.log('Getting bids for supplier:', supplierId);
            
            const bids = await Supplier.getSupplierBids(supplierId);
            
            res.json({ success: true, bids });
        } catch (error) {
            console.error('Get my bids error:', error);
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    },

    // Get bid details
    getBidDetails: async (req, res) => {
        try {
            const { bidId } = req.params;
            console.log('Getting bid details for ID:', bidId);
            
            const bid = await Supplier.getBidDetails(bidId);
            
            if (!bid) {
                console.error('Bid not found:', bidId);
                return res.status(404).json({ success: false, message: 'Bid not found' });
            }
            
            res.json({ success: true, bid });
        } catch (error) {
            console.error('Get bid details error:', error);
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    },

    // Admin: Get all suppliers
    getAllSuppliers: async (req, res) => {
        try {
            console.log('Admin getting all suppliers');
            const suppliers = await Supplier.getAllApproved();
            res.json({ success: true, suppliers });
        } catch (error) {
            console.error('Get all suppliers error:', error);
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    },

    // Admin: Approve supplier
    approveSupplier: async (req, res) => {
        try {
            const { supplierId } = req.params;
            console.log('Admin approving supplier:', supplierId);
            
            const result = await Supplier.approveSupplier(supplierId);
            
            if (!result.success) {
                console.error('Supplier approval failed:', result.error);
                return res.status(400).json({ success: false, message: result.error });
            }
            
            console.log('Supplier approved successfully:', supplierId);
            res.json({ success: true, message: 'Supplier approved successfully' });
        } catch (error) {
            console.error('Approve supplier error:', error);
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    },

    // Admin: Ban supplier
    banSupplier: async (req, res) => {
        try {
            const { supplierId } = req.params;
            console.log('Admin banning supplier:', supplierId);
            
            const result = await Supplier.banSupplier(supplierId);
            
            if (!result.success) {
                console.error('Supplier ban failed:', result.error);
                return res.status(400).json({ success: false, message: result.error });
            }
            
            console.log('Supplier banned successfully:', supplierId);
            res.json({ success: true, message: 'Supplier banned successfully' });
        } catch (error) {
            console.error('Ban supplier error:', error);
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    },

    // Admin: Post a new bidding
    postBidding: async (req, res) => {
        try {
            const { pr_id, deadline } = req.body;
            const posted_by = req.user.id;
            
            console.log('Admin posting bidding for PR:', pr_id);
            
            // Check if bidding already exists for this PR
            const existingBidding = await db.query(
                'SELECT * FROM biddings WHERE pr_id = ? AND status = "open"',
                [pr_id]
            );
            
            if (existingBidding && existingBidding.length > 0) {
                console.log('Bidding already exists for PR:', pr_id);
                return res.status(400).json({ 
                    success: false, 
                    message: 'An open bidding already exists for this purchase request' 
                });
            }
            
            const result = await Supplier.createBidding({
                pr_id,
                posted_by,
                deadline
            });
            
            if (!result.success) {
                console.error('Bidding creation failed:', result.error);
                return res.status(400).json({ success: false, message: result.error });
            }
            
            console.log('Bidding posted successfully:', result.biddingId);
            res.json({ 
                success: true, 
                message: 'Bidding posted successfully',
                biddingId: result.biddingId
            });
        } catch (error) {
            console.error('Post bidding error:', error);
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    },

    // Admin: Get bids for a bidding
    getBiddingBids: async (req, res) => {
        try {
            const { biddingId } = req.params;
            console.log('Admin getting bids for bidding:', biddingId);
            
            const bids = await Supplier.getBidsForBidding(biddingId);
            
            res.json({ success: true, bids });
        } catch (error) {
            console.error('Get bidding bids error:', error);
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    },

    // Admin: Award a bid
    awardBid: async (req, res) => {
        try {
            const { biddingId, bidId } = req.params;
            console.log('Admin awarding bid:', bidId, 'for bidding:', biddingId);
            
            const result = await Supplier.awardBid(biddingId, bidId);
            
            if (!result.success) {
                console.error('Bid award failed:', result.error);
                return res.status(400).json({ success: false, message: result.error });
            }
            
            console.log('Bid awarded successfully:', bidId);
            res.json({ success: true, message: 'Bid awarded successfully' });
        } catch (error) {
            console.error('Award bid error:', error);
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    },

    // Admin: Rate a supplier
    rateSupplier: async (req, res) => {
        try {
            const { bidId } = req.params;
            const rated_by = req.user.id;
            const { rating, comments } = req.body;
            
            console.log('Admin rating supplier for bid:', bidId);
            
            // Get bid details to get supplier ID
            const bid = await Supplier.getBidDetails(bidId);
            if (!bid) {
                console.error('Bid not found for rating:', bidId);
                return res.status(404).json({ success: false, message: 'Bid not found' });
            }
            
            const result = await Supplier.rateSupplier({
                supplier_id: bid.supplier_id,
                bid_id: bidId,
                rating,
                comments,
                rated_by
            });
            
            if (!result.success) {
                console.error('Supplier rating failed:', result.error);
                return res.status(400).json({ success: false, message: result.error });
            }
            
            console.log('Supplier rated successfully for bid:', bidId);
            res.json({ success: true, message: 'Supplier rated successfully' });
        } catch (error) {
            console.error('Rate supplier error:', error);
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    },

    // Admin: Get supplier ratings
    getSupplierRatings: async (req, res) => {
        try {
            const { supplierId } = req.params;
            console.log('Admin getting ratings for supplier:', supplierId);
            
            const ratings = await Supplier.getSupplierRatings(supplierId);
            
            res.json({ success: true, ratings });
        } catch (error) {
            console.error('Get supplier ratings error:', error);
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    },

    renderMyBids: async (req, res) => {
  try {
    const supplierId = req.user.id;
    const statusFilter = req.query.status || 'all';
    
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.redirect('/supplier/login');
    }
    
    const bids = await Supplier.getSupplierBids(supplierId, statusFilter);
    
    res.render('supplier/my-bids', {
      layout: 'layouts/supplierLayout',
      supplier,
      bids,
      statusFilter,
      currentPage: 'my-bids'
    });
  } catch (error) {
    console.error('Render my bids error:', error);
    res.redirect('/supplier/login');
  }
},

// Add this method to your supplierController.js
// Replace your existing renderBidsReport method with this:

renderBidsReport: async (req, res) => {
    try {
        const supplierId = req.user.id;
        const statusFilter = req.query.status || 'all';
        const department = req.query.department || '';
        const dateStart = req.query.dateStart || '';
        const dateEnd = req.query.dateEnd || '';
        
        console.log('Rendering bids report for Supplier ID:', supplierId, 'Status Filter:', statusFilter);

        const supplier = await Supplier.findById(supplierId);
        if (!supplier) {
            console.error('Supplier not found for ID:', supplierId);
            return res.redirect('/supplier/login');
        }

        // Get the aggregated report data that your EJS template expects
        const data = await Supplier.getSupplierBidsReport(
            supplierId, 
            statusFilter, 
            department, 
            dateStart, 
            dateEnd
        );
        
        console.log('Fetched report data:', data);

        // Render the template with all required variables
        res.render('supplier/bids-report', {
            layout: 'layouts/supplierLayout',
            supplier: supplier,
            statusFilter: statusFilter,
            department: department,
            dateStart: dateStart,
            dateEnd: dateEnd,
            data: data,
            currentPage: 'bids-report' 
        });

    } catch (error) {
        console.error('Render bids report error:', error);
        res.redirect('/supplier/login');
    }
},

exportBidsReportPDF: async (req, res) => {
        try {
            const supplierId = req.user.id;
            const statusFilter = req.query.status || 'all';
            const supplier = await Supplier.findById(supplierId);
            const bids = await Supplier.getSupplierBids(supplierId, statusFilter);

            const doc = new PDFDocument();
            const fileName = `Bids_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.setHeader('Content-Type', 'application/pdf');
            doc.pipe(res);

            doc.fontSize(16).text('Supplier Bids Report', { align: 'center' });
            doc.fontSize(12).text(`Generated on: ${new Date().toLocaleString('en-PH')}`);
            doc.text(`Supplier: ${supplier.company_name} (ID: ${supplier.supplier_id})`);
            doc.text(`Filter: ${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}`);
            doc.moveDown();

            bids.forEach(bid => {
                doc.fontSize(14).text(`Bid ID: ${bid.bid_id} (PR ID: ${bid.pr_id}) - ${bid.status.toUpperCase()}`);
                doc.fontSize(10).text(`Purpose: ${bid.purpose}`);
                doc.text(`LGU: ${bid.lgu}`);
                doc.text(`Department: ${bid.department}`);
                doc.text(`Submitted: ${new Date(bid.submitted_at).toLocaleDateString('en-PH')}`);
                doc.text(`Total Amount: ₱${parseFloat(bid.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
                doc.moveDown();

                if (bid.items && bid.items.length > 0) {
                    doc.text('Items:');
                    bid.items.forEach(item => {
                        doc.text(`- ${item.item_no || ''}: ${item.item_description || 'N/A'} (${item.unit || 'N/A'})`);
                        doc.text(`  Qty: ${item.quantity || 0}, Unit Price: ₱${parseFloat(item.unit_price || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}, Total: ₱${parseFloat(item.total_price || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
                    });
                } else {
                    doc.text('No items found.');
                }
                doc.moveDown();
            });

            doc.end();
        } catch (error) {
            console.error('PDF export error:', error);
            res.status(500).send('Error generating PDF');
        }
    },

    exportBidsReportCSV: async (req, res) => {
        try {
            const supplierId = req.user.id;
            const statusFilter = req.query.status || 'all';
            const bids = await Supplier.getSupplierBids(supplierId, statusFilter);

            const fields = [
                'bid_id', 'pr_id', 'status', 'purpose', 'lgu', 'department',
                'submitted_at', 'total_amount', 'requested_by_name',
                'item.item_no', 'item.unit', 'item.item_description',
                'item.quantity', 'item.unit_price', 'item.total_price'
            ];
            const transforms = [
                (record) => {
                    if (record.items && record.items.length > 0) {
                        return record.items.map(item => ({
                            bid_id: record.bid_id,
                            pr_id: record.pr_id,
                            status: record.status,
                            purpose: record.purpose,
                            lgu: record.lgu,
                            department: record.department,
                            submitted_at: new Date(record.submitted_at).toLocaleDateString('en-PH'),
                            total_amount: `₱${parseFloat(record.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
                            requested_by_name: record.requested_by_name || 'N/A',
                            item: {
                                item_no: item.item_no || '',
                                unit: item.unit || 'N/A',
                                item_description: item.item_description || 'N/A',
                                quantity: item.quantity || 0,
                                unit_price: `₱${parseFloat(item.unit_price || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
                                total_price: `₱${parseFloat(item.total_price || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                            }
                        }));
                    }
                    return [{
                        bid_id: record.bid_id,
                        pr_id: record.pr_id,
                        status: record.status,
                        purpose: record.purpose,
                        lgu: record.lgu,
                        department: record.department,
                        submitted_at: new Date(record.submitted_at).toLocaleDateString('en-PH'),
                        total_amount: `₱${parseFloat(record.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
                        requested_by_name: record.requested_by_name || 'N/A',
                        item: { item_no: '', unit: '', item_description: '', quantity: '', unit_price: '', total_price: '' }
                    }];
                },
                require('json2csv').transforms.flatten({ objects: true, arrays: false })
            ];

            const json2csvParser = new Parser({ fields, transforms });
            const csv = json2csvParser.parse(bids);

            res.header('Content-Type', 'text/csv');
            res.attachment(`Bids_Report_${new Date().toISOString().slice(0, 10)}.csv`);
            res.send(csv);
        } catch (error) {
            console.error('CSV export error:', error);
            res.status(500).send('Error generating CSV');
        }
    },

    renderProfileSettings: async (req, res) => {
        try {
            const supplierId = req.user.id;
            console.log('Rendering profile settings for Supplier ID:', supplierId);

            const supplier = await Supplier.findById(supplierId);
            if (!supplier) {
                console.error('Supplier not found for ID:', supplierId);
                return res.redirect('/supplier/login');
            }

            let ratings = [];
            try {
                ratings = await Supplier.getSupplierRatings(supplierId);
                console.log('Fetched ratings:', ratings);
            } catch (error) {
                console.error('Error fetching ratings:', error);
            }

            res.render('supplier/profile-settings', {
                layout: 'layouts/supplierLayout',
                supplier,
                ratings: ratings || [],
                successMessage: req.session.successMessage || null,
                errorMessage: req.session.errorMessage || null,
                currentPage: 'profile-settings'
            });

            // Clear session messages after rendering
            req.session.successMessage = null;
            req.session.errorMessage = null;
        } catch (error) {
            console.error('Render profile settings error:', error);
            res.redirect('/supplier/login');
        }
    },

    updateProfile: async (req, res) => {
        try {
            const supplierId = req.user.id;
            const { company_name, contact_person, email, phone, address } = req.body;
            console.log('Updating profile for Supplier ID:', supplierId, 'Data:', { company_name, contact_person, email, phone, address });

            const supplier = await Supplier.findById(supplierId);
            if (!supplier) {
                console.error('Supplier not found for ID:', supplierId);
                return res.redirect('/supplier/login');
            }

            if (!company_name || !contact_person || !email || !phone || !address) {
                req.session.errorMessage = 'All fields are required.';
                return res.redirect('/supplier/profile-settings');
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                req.session.errorMessage = 'Invalid email format.';
                return res.redirect('/supplier/profile-settings');
            }

            const updates = { company_name, contact_person, email, phone, address };
            const updated = await Supplier.updateProfile(supplierId, updates);

            if (updated) {
                req.session.successMessage = 'Profile updated successfully.';
            } else {
                req.session.errorMessage = 'Failed to update profile.';
            }

            res.redirect('/supplier/profile-settings');
        } catch (error) {
            console.error('Update profile error:', error);
            req.session.errorMessage = 'An error occurred while updating the profile.';
            res.redirect('/supplier/profile-settings');
        }
    },

    exportRatingsPDF: async (req, res) => {
        try {
            const supplierId = req.user.id;
            const supplier = await Supplier.findById(supplierId);
            if (!supplier) {
                console.error('Supplier not found for ID:', supplierId);
                return res.status(401).send('Unauthorized');
            }

            const ratings = await Supplier.getSupplierRatings(supplierId);

            const doc = new PDFDocument({ size: 'A4', layout: 'landscape' });
            const fileName = `Ratings_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.setHeader('Content-Type', 'application/pdf');
            doc.pipe(res);

            // Header
            doc.fontSize(16).fillColor('#1E40AF').text('Supplier Ratings Report', { align: 'center' });
            doc.fontSize(12).fillColor('#6B7280');
            doc.text(`Generated on: ${new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Manila' })}`, { align: 'center' });
            doc.text(`Supplier: ${supplier.company_name} (ID: ${supplier.supplier_id})`, { align: 'center' });
            doc.text(`Average Rating: ${supplier.rating ? supplier.rating.toFixed(2) : 'N/A'}`, { align: 'center' });
            doc.text(`Bad Ratings: ${supplier.bad_rating_count || 0}`, { align: 'center' });
            doc.moveDown(2);

            // Table
            const tableTop = doc.y;
            const colWidths = [80, 80, 80, 300, 100, 100];
            const headers = ['Rating ID', 'Bid ID', 'Rating', 'Comments', 'Rated By', 'Rated At'];

            // Draw headers
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#FFFFFF');
            const headerY = doc.y;
            headers.forEach((header, i) => {
              doc.rect(50 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), headerY, colWidths[i], 20)
                 .fill('#3B82F6')
                 .fillColor('#FFFFFF')
                 .text(header, 50 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), headerY + 5, {
                   width: colWidths[i],
                   align: i === 2 ? 'right' : 'left'
                 });
            });
            doc.moveDown(1);

            // Draw rows
            doc.font('Helvetica').fillColor('#000000');
            ratings.forEach(row => {
              const rowY = doc.y;
              doc.text(row.rating_id.toString(), 50, rowY, { width: colWidths[0], align: 'left' });
              doc.text(row.bid_id.toString(), 50 + colWidths[0], rowY, { width: colWidths[1], align: 'left' });
              doc.text(row.rating.toString(), 50 + colWidths[0] + colWidths[1], rowY, { width: colWidths[2], align: 'right' });
              doc.text(row.comments || 'N/A', 50 + colWidths[0] + colWidths[1] + colWidths[2], rowY, { width: colWidths[3], align: 'left' });
              doc.text(row.rated_by, 50 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], rowY, { width: colWidths[4], align: 'left' });
              doc.text(new Date(row.rated_at).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' }), 
                50 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], rowY, { width: colWidths[5], align: 'left' });
              doc.moveDown(1);
            });

            doc.end();
          } catch (error) {
            console.error('Ratings PDF export error:', error);
            res.status(500).send('Error generating PDF');
          }
    },

    exportRatingsCSV: async (req, res) => {
        try {
            const supplierId = req.user.id;
            const supplier = await Supplier.findById(supplierId);
            if (!supplier) {
                console.error('Supplier not found for ID:', supplierId);
                return res.status(401).send('Unauthorized');
            }

            const ratings = await Supplier.getSupplierRatings(supplierId);

            const header = [
              `Supplier Ratings Report`,
              `Generated on: ${new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Manila' })}`,
              `Supplier: ${supplier.company_name} (ID: ${supplier.supplier_id})`,
              `Average Rating: ${supplier.rating ? supplier.rating.toFixed(2) : 'N/A'}`,
              `Bad Ratings: ${supplier.bad_rating_count || 0}`,
              ''
            ].filter(line => line).join('\n');

            const fields = [
              { label: 'Rating ID', value: 'rating_id' },
              { label: 'Bid ID', value: 'bid_id' },
              { label: 'Rating', value: 'rating' },
              { label: 'Comments', value: row => row.comments || 'N/A' },
              { label: 'Rated By', value: 'rated_by' },
              { label: 'Rated At', value: row => new Date(row.rated_at).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' }) }
            ];

            const json2csvParser = new Parser({ fields });
            const csvData = json2csvParser.parse(ratings);
            const csv = `${header}${csvData}`;

            res.header('Content-Type', 'text/csv');
            res.attachment(`Ratings_Report_${new Date().toISOString().slice(0, 10)}.csv`);
            res.send(csv);
        } catch (error) {
            console.error('Ratings CSV export error:', error);
            res.status(500).send('Error generating CSV');
        }
    }
};

module.exports = supplierController;
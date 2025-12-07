const db = require('../config/db');

const Supplier = {
// Replace the register method in supplierModel.js

register: async (supplierData) => {
    const query = `
        INSERT INTO suppliers 
        (company_name, contact_person, email, phone, address, tax_id, 
         business_permit, permit_file, profile_image, password)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
        supplierData.company_name,
        supplierData.contact_person,
        supplierData.email,
        supplierData.phone,
        supplierData.address,
        supplierData.tax_id,
        supplierData.business_permit,
        supplierData.permit_file || null,      // File path for permit
        supplierData.profile_image || null,    // File path for profile image
        supplierData.password
    ];
    
    try {
        const result = await db.query(query, values);
        return { success: true, supplierId: result.insertId };
    } catch (error) {
        console.error('Error registering supplier:', error);
        return { success: false, error: error.message };
    }
},

    // Find supplier by email
    findByEmail: async (email) => {
        const query = 'SELECT * FROM suppliers WHERE email = ?';
        try {
            const results = await db.query(query, [email]);
            return results[0] || null;
        } catch (error) {
            console.error('Error finding supplier by email:', error);
            return null;
        }
    },

    // Find supplier by ID
findById: async (supplierId) => {
    const query = 'SELECT supplier_id, company_name, contact_person, email, phone, address, tax_id, business_permit, profile_image, is_approved, is_banned, rating, bad_rating_count FROM suppliers WHERE supplier_id = ?';
    try {
        const results = await db.query(query, [supplierId]);
        return results[0] || null;
    } catch (error) {
        console.error('Error finding supplier by ID:', error);
        return null;
    }
},
    // Update supplier profile
    updateProfile: async (supplierId, updateData) => {
        const query = `
            UPDATE suppliers SET 
            company_name = ?, 
            contact_person = ?, 
            phone = ?, 
            address = ?, 
            tax_id = ?, 
            business_permit = ?,
            profile_image = ?
            WHERE supplier_id = ?
        `;
        const values = [
            updateData.company_name,
            updateData.contact_person,
            updateData.phone,
            updateData.address,
            updateData.tax_id,
            updateData.business_permit,
            updateData.profile_image,
            supplierId
        ];
        
        try {
            await db.query(query, values);
            return { success: true };
        } catch (error) {
            console.error('Error updating supplier profile:', error);
            return { success: false, error: error.message };
        }
    },

    // Approve supplier
    approveSupplier: async (supplierId) => {
        const query = 'UPDATE suppliers SET is_approved = TRUE WHERE supplier_id = ?';
        try {
            await db.query(query, [supplierId]);
            return { success: true };
        } catch (error) {
            console.error('Error approving supplier:', error);
            return { success: false, error: error.message };
        }
    },

    // Ban supplier
    banSupplier: async (supplierId) => {
        const query = 'UPDATE suppliers SET is_banned = TRUE WHERE supplier_id = ?';
        try {
            await db.query(query, [supplierId]);
            return { success: true };
        } catch (error) {
            console.error('Error banning supplier:', error);
            return { success: false, error: error.message };
        }
    },

    // Get all approved suppliers
    getAllApproved: async () => {
        const query = 'SELECT * FROM suppliers WHERE is_approved = TRUE AND is_banned = FALSE';
        try {
            const results = await db.query(query);
            return results;
        } catch (error) {
            console.error('Error getting approved suppliers:', error);
            return [];
        }
    },

    // Create a new bidding
    createBidding: async (biddingData) => {
        const query = `
            INSERT INTO biddings 
            (pr_id, posted_by, deadline)
            VALUES (?, ?, ?)
        `;
        const values = [
            biddingData.pr_id,
            biddingData.posted_by,
            biddingData.deadline
        ];
        
        try {
            const result = await db.query(query, values);
            return { success: true, biddingId: result.insertId };
        } catch (error) {
            console.error('Error creating bidding:', error);
            return { success: false, error: error.message };
        }
    },

    // Get all open biddings
getOpenBiddings: async () => {
    const query = `
        SELECT pr.*, e.employee_name as requested_by_name
        FROM purchase_requests pr
        JOIN employees e ON pr.requested_by = e.employee_id
        WHERE pr.status = 'posted'
        ORDER BY pr.date_requested DESC
    `;
    
    try {
        const purchaseRequests = await db.query(query);
        
        // Get items for each purchase request
        for (const pr of purchaseRequests) {
            const itemsQuery = `
                SELECT * FROM purchase_request_items 
                WHERE pr_id = ?
                ORDER BY item_no ASC
            `;
            pr.items = await db.query(itemsQuery, [pr.pr_id]);
        }
        
        return purchaseRequests;
    } catch (error) {
        console.error('Error getting posted purchase requests:', error);
        return [];
    }
},
    // Get bidding by ID
    getBiddingById: async (biddingId) => {
        const query = `
            SELECT b.*, pr.*, e.employee_name as posted_by_name
            FROM biddings b
            JOIN purchase_requests pr ON b.pr_id = pr.pr_id
            JOIN employees e ON b.posted_by = e.employee_id
            WHERE b.bidding_id = ?
        `;
        try {
            const results = await db.query(query, [biddingId]);
            return results[0] || null;
        } catch (error) {
            console.error('Error getting bidding by ID:', error);
            return null;
        }
    },

    // Get items for a purchase request
    getRequestItems: async (prId) => {
        const query = 'SELECT * FROM purchase_request_items WHERE pr_id = ?';
        try {
            const results = await db.query(query, [prId]);
            return results;
        } catch (error) {
            console.error('Error getting request items:', error);
            return [];
        }
    },

    // Submit a bid
submitBid: async (req, res) => {
    try {
        const supplierId = req.user.id;
        const { bidding_id, items, notes } = req.body;
        
        console.log('Submitting bid for supplier:', supplierId, 'bidding:', bidding_id);
        
        // Validate bidding exists and is open
        const biddingQuery = `
            SELECT b.*, pr.pr_id 
            FROM biddings b 
            JOIN purchase_requests pr ON b.pr_id = pr.pr_id 
            WHERE b.bidding_id = ? AND b.status = 'open'
        `;
        const [bidding] = await db.query(biddingQuery, [bidding_id]);
        
        if (!bidding) {
            console.log('Bidding not found or not open:', bidding_id);
            return res.status(400).json({ 
                success: false, 
                message: 'Bidding not found or no longer open' 
            });
        }
        
        // Check if deadline has passed
        if (new Date(bidding.deadline) < new Date()) {
            console.log('Bidding deadline passed:', bidding_id);
            return res.status(400).json({ 
                success: false, 
                message: 'Bidding deadline has passed' 
            });
        }
        
        // Check if supplier already submitted a bid
        const existingBidQuery = `
            SELECT bid_id FROM supplier_bids 
            WHERE bidding_id = ? AND supplier_id = ?
        `;
        const [existingBid] = await db.query(existingBidQuery, [bidding_id, supplierId]);
        
        if (existingBid) {
            return res.status(400).json({ 
                success: false, 
                message: 'You have already submitted a bid for this request' 
            });
        }
        
        // Calculate total amount
        const total_amount = items.reduce((sum, item) => sum + parseFloat(item.total_price), 0);
        
        const result = await Supplier.submitBid({
          
            bidding_id,
            supplier_id: supplierId,
            total_amount,
            notes,
            items
        });
        
        if (!result.success) {
            console.error('Bid submission failed:', result.error);
            return res.status(400).json({ success: false, message: result.error });
        }
        
        console.log('Bid submitted successfully:', result.bidId);
        res.json({ 
            success: true, 
            message: 'Bid submitted successfully',
            bidId: result.bidId
        });
    } catch (error) {
        console.error('Submit bid error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
},
    // Get bids for a bidding
    getBidsForBidding: async (biddingId) => {
        const query = `
            SELECT sb.*, s.company_name, s.rating,
                   (SELECT COUNT(*) FROM supplier_ratings sr WHERE sr.supplier_id = s.supplier_id) as rating_count
            FROM supplier_bids sb
            JOIN suppliers s ON sb.supplier_id = s.supplier_id
            WHERE sb.bidding_id = ?
            ORDER BY sb.total_amount ASC
        `;
        try {
            const results = await db.query(query, [biddingId]);
            return results;
        } catch (error) {
            console.error('Error getting bids for bidding:', error);
            return [];
        }
    },

    // Get bid details with items
    getBidDetails: async (bidId) => {
        const query = `
            SELECT sb.*, s.company_name, s.contact_person, s.email, s.phone, s.address,
                   b.pr_id, b.deadline, pr.purpose, pr.total as estimated_total
            FROM supplier_bids sb
            JOIN suppliers s ON sb.supplier_id = s.supplier_id
            JOIN biddings b ON sb.bidding_id = b.bidding_id
            JOIN purchase_requests pr ON b.pr_id = pr.pr_id
            WHERE sb.bid_id = ?
        `;
        
        const itemsQuery = `
            SELECT bi.*, pri.item_description, pri.unit, pri.unit_cost as estimated_unit_cost
            FROM bid_items bi
            JOIN purchase_request_items pri ON bi.item_id = pri.item_id
            WHERE bi.bid_id = ?
        `;
        
        try {
            const [bidDetails] = await db.query(query, [bidId]);
            const items = await db.query(itemsQuery, [bidId]);
            
            if (bidDetails) {
                bidDetails.items = items;
                return bidDetails;
            }
            return null;
        } catch (error) {
            console.error('Error getting bid details:', error);
            return null;
        }
    },

    // Approve or decline a bid
    updateBidStatus: async (bidId, status) => {
        const query = 'UPDATE supplier_bids SET status = ? WHERE bid_id = ?';
        try {
            await db.query(query, [status, bidId]);
            return { success: true };
        } catch (error) {
            console.error('Error updating bid status:', error);
            return { success: false, error: error.message };
        }
    },

    // Award a bid (close the bidding)
// In Supplier model
awardBid: async (biddingId, bidId) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        
        // Get the bid details to retrieve total_amount and supplier_id
        const [bid] = await connection.query(`
            SELECT supplier_id, total_amount
            FROM supplier_bids
            WHERE bid_id = ?
        `, [bidId]);

        if (!bid) {
            throw new Error('Bid not found');
        }

        // Close the bidding
        await connection.query('UPDATE biddings SET status = "awarded" WHERE bidding_id = ?', [biddingId]);
        
        // Approve the winning bid
        await connection.query('UPDATE supplier_bids SET status = "approved" WHERE bid_id = ?', [bidId]);
        
        // Decline all other bids
        await connection.query('UPDATE supplier_bids SET status = "declined" WHERE bidding_id = ? AND bid_id != ?', [biddingId, bidId]);
        
        // Update supplier's total_sales
        await connection.query(`
            UPDATE suppliers 
            SET total_sales = total_sales + ? 
            WHERE supplier_id = ?
        `, [bid.total_amount, bid.supplier_id]);
        
        await connection.commit();
        return { success: true };
    } catch (error) {
        await connection.rollback();
        console.error('Error awarding bid:', error);
        return { success: false, error: error.message };
    } finally {
        connection.release();
    }
},

    // Rate a supplier after bid completion
    rateSupplier: async (ratingData) => {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            
            // Insert the rating
            const ratingQuery = `
                INSERT INTO supplier_ratings 
                (supplier_id, bid_id, rating, comments, rated_by)
                VALUES (?, ?, ?, ?, ?)
            `;
            const ratingValues = [
                ratingData.supplier_id,
                ratingData.bid_id,
                ratingData.rating,
                ratingData.comments,
                ratingData.rated_by
            ];
            await connection.query(ratingQuery, ratingValues);
            
            // Update supplier's rating stats
            const supplierQuery = `
                UPDATE suppliers 
                SET rating = (
                    SELECT AVG(rating) FROM supplier_ratings 
                    WHERE supplier_id = ?
                ),
                bad_rating_count = (
                    SELECT COUNT(*) FROM supplier_ratings 
                    WHERE supplier_id = ? AND rating <= 2
                )
                WHERE supplier_id = ?
            `;
            await connection.query(supplierQuery, [
                ratingData.supplier_id,
                ratingData.supplier_id,
                ratingData.supplier_id
            ]);
            
            // Check if supplier should be banned (3+ bad ratings)
            const checkBanQuery = 'SELECT bad_rating_count FROM suppliers WHERE supplier_id = ?';
            const [supplier] = await connection.query(checkBanQuery, [ratingData.supplier_id]);
            
            if (supplier.bad_rating_count >= 3) {
                await connection.query('UPDATE suppliers SET is_banned = TRUE WHERE supplier_id = ?', [ratingData.supplier_id]);
            }
            
            await connection.commit();
            return { success: true };
        } catch (error) {
            await connection.rollback();
            console.error('Error rating supplier:', error);
            return { success: false, error: error.message };
        } finally {
            connection.release();
        }
    },

    // Get supplier ratings
    getSupplierRatings: async (supplierId) => {
        const query = `
            SELECT sr.*, e.employee_name as rated_by_name
            FROM supplier_ratings sr
            JOIN employees e ON sr.rated_by = e.employee_id
            WHERE sr.supplier_id = ?
            ORDER BY sr.rated_at DESC
        `;
        try {
            const results = await db.query(query, [supplierId]);
            return results;
        } catch (error) {
            console.error('Error getting supplier ratings:', error);
            return [];
        }
    },

    // Get bids by supplier
getSupplierBids: async (supplierId, statusFilter = 'all') => {
    try {
        let query = `
            SELECT 
                sb.*, 
                b.deadline, 
                pr.purpose, 
                pr.status AS pr_status,
                b.status AS bidding_status, 
                pr.pr_id, 
                pr.lgu, 
                pr.department,
                pr.date_requested, 
                pr.requested_by, 
                pr.total AS pr_total,
                COALESCE(e.employee_name, CONCAT(pr.requested_by)) AS requested_by_name
            FROM supplier_bids sb
            JOIN biddings b ON sb.bidding_id = b.bidding_id
            JOIN purchase_requests pr ON b.pr_id = pr.pr_id
            LEFT JOIN employees e ON pr.requested_by = e.employee_id
            WHERE sb.supplier_id = ?
        `;
        let queryParams = [supplierId];

        if (statusFilter !== 'all') {
            const validStatuses = ['pending', 'approved', 'declined', 'closed', 'awarded'];
            if (validStatuses.includes(statusFilter)) {
                if (['closed', 'awarded'].includes(statusFilter)) {
                    query += ` AND b.status = ?`;
                } else {
                    query += ` AND sb.status = ?`;
                }
                queryParams.push(statusFilter);
            }
        }

        query += ` ORDER BY sb.submitted_at DESC`;

        const bids = await db.query(query, queryParams);

        for (let bid of bids) {
            // Get all PR items first
            const prItemsQuery = `
                SELECT item_id, item_no, unit, item_description, quantity, unit_cost
                FROM purchase_request_items 
                WHERE pr_id = ? 
                ORDER BY item_no
            `;
            const prItems = await db.query(prItemsQuery, [bid.pr_id]);
            
            // Get all bid items
            const bidItemsQuery = `
                SELECT bid_item_id, item_id, quantity, unit_price, total_price
                FROM bid_items 
                WHERE bid_id = ?
            `;
            const bidItems = await db.query(bidItemsQuery, [bid.bid_id]);
            
            // Match by item_id or by index if item_id doesn't match
            bid.items = prItems.map((prItem, index) => {
                const bidItem = bidItems.find(bi => bi.item_id === prItem.item_id) || bidItems[index];
                
                return {
                    item_no: prItem.item_no || (index + 1),
                    unit: prItem.unit || 'N/A',
                    item_description: prItem.item_description || 'N/A',
                    quantity: bidItem ? bidItem.quantity : prItem.quantity,
                    unit_price: bidItem ? bidItem.unit_price : 0,
                    total_price: bidItem ? bidItem.total_price : 0,
                    estimated_unit_cost: prItem.unit_cost
                };
            });
        }

        return bids;
    } catch (error) {
        console.error('Error fetching supplier bids:', error);
        throw error;
    }
},

  getSupplierBidsReport: async (supplierId, statusFilter = 'all', department = '', dateStart = '', dateEnd = '') => {
    try {
      let query = `
        SELECT 
          DATE(sb.submitted_at) AS date,
          pr.department,
          COUNT(sb.bid_id) AS bid_count,
          SUM(sb.total_amount) AS total_amount,
          AVG(sb.total_amount) AS avg_amount
        FROM supplier_bids sb
        JOIN biddings b ON sb.bidding_id = b.bidding_id
        JOIN purchase_requests pr ON b.pr_id = pr.pr_id
        LEFT JOIN employees e ON pr.requested_by = e.employee_id
        WHERE sb.supplier_id = ?
      `;
      let queryParams = [supplierId];

      // Apply filters
      if (statusFilter !== 'all') {
        const validStatuses = ['pending', 'approved', 'declined', 'closed', 'awarded'];
        if (validStatuses.includes(statusFilter)) {
          if (['closed', 'awarded'].includes(statusFilter)) {
            query += ` AND b.status = ?`;
          } else {
            query += ` AND sb.status = ?`;
          }
          queryParams.push(statusFilter);
        }
      }

      if (department) {
        query += ` AND pr.department LIKE ?`;
        queryParams.push(`%${department}%`);
      }

      if (dateStart) {
        query += ` AND DATE(sb.submitted_at) >= ?`;
        queryParams.push(dateStart);
      }

      if (dateEnd) {
        query += ` AND DATE(sb.submitted_at) <= ?`;
        queryParams.push(dateEnd);
      }

      query += ` GROUP BY DATE(sb.submitted_at), pr.department ORDER BY date DESC, pr.department`;

      console.log('Executing query:', query, 'Params:', queryParams);
      const data = await db.query(query, queryParams);
      console.log('Fetched report data:', data);
      return data;
    } catch (error) {
      console.error('Error fetching supplier bids report:', error);
      throw error;
    }
  },

  updateProfile: async (supplierId, updates) => {
    try {
      const { company_name, contact_person, email, phone, address } = updates;
      const query = `
        UPDATE suppliers 
        SET company_name = ?, contact_person = ?, email = ?, phone = ?, address = ?, updated_at = NOW()
        WHERE supplier_id = ?
      `;
      const queryParams = [company_name, contact_person, email, phone, address, supplierId];
      console.log('Executing updateProfile query:', query, 'Params:', queryParams);
      const result = await db.query(query, queryParams);
      console.log('Update result:', result);
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error updating supplier profile:', error);
      throw error;
    }
  },

  getSupplierRatings: async (supplierId) => {
    try {
      const query = `
        SELECT rating_id, supplier_id, bid_id, rating, comments, rated_by, rated_at
        FROM supplier_ratings
        WHERE supplier_id = ?
        ORDER BY rated_at DESC
      `;
      console.log('Executing getSupplierRatings query:', query, 'Params:', [supplierId]);
      const ratings = await db.query(query, [supplierId]);
      console.log('Fetched ratings:', ratings);
      return ratings;
    } catch (error) {
      console.error('Error fetching supplier ratings:', error);
      throw error;
    }
  }
    };


    module.exports = Supplier;
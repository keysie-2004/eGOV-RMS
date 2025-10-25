const db = require('../config/db');

class AdminModel {
    static async getBiddingsData({ status = 'all', start = 0, length = 10 }) {
        let baseQuery = `
            SELECT 
                b.bidding_id,
                b.pr_id,
                b.posted_by,
                b.posted_at,
                b.deadline,
                b.status,
                pr.purpose,
                pr.total as estimated_total,
                b.posted_by as posted_by_name,
                (SELECT COUNT(sb.bid_id)
                 FROM supplier_bids sb
                 JOIN biddings b2 ON sb.bidding_id = b2.bidding_id
                 WHERE b2.pr_id = b.pr_id) as bid_count
            FROM biddings b
            LEFT JOIN purchase_requests pr ON b.pr_id = pr.pr_id AND pr.is_archived = false
        `;

        let whereClause = '';
        let queryParams = [];

        if (status && status !== 'all') {
            const validStatuses = ['open', 'closed', 'awarded', 'cancelled'];
            const statusArray = Array.isArray(status)
                ? status.map(s => s.toLowerCase()).filter(s => validStatuses.includes(s))
                : typeof status === 'string' && status.includes(',')
                    ? status.split(',').map(s => s.trim().toLowerCase()).filter(s => validStatuses.includes(s))
                    : [status.toLowerCase()].filter(s => validStatuses.includes(s));
            
            if (statusArray.length > 0) {
                whereClause = ` WHERE b.status IN (${statusArray.map(() => '?').join(', ')})`;
                queryParams.push(...statusArray);
            }
        }

        const countQuery = `
            SELECT COUNT(DISTINCT b.bidding_id) as total 
            FROM biddings b
            LEFT JOIN purchase_requests pr ON b.pr_id = pr.pr_id AND pr.is_archived = false
            ${whereClause}
        `;
        const countResult = await db.query(countQuery, queryParams);
        const totalItems = Array.isArray(countResult) 
            ? (countResult[0]?.total || 0) 
            : (countResult?.total || 0);

        if (totalItems === 0) {
            return { totalItems, biddings: [] };
        }

        const dataQuery = `
            ${baseQuery}
            ${whereClause}
            GROUP BY 
                b.bidding_id, 
                b.pr_id, 
                b.posted_by, 
                b.posted_at,
                b.deadline, 
                b.status, 
                pr.purpose,
                pr.total
            ORDER BY b.deadline DESC
            LIMIT ${parseInt(length)} OFFSET ${parseInt(start)}
        `;
        
        const biddings = await db.query(dataQuery, queryParams);
        return { totalItems, biddings };
    }

   static async getBidsByPrId(prId) {
        const [purchaseRequest] = await db.query(`
            SELECT pr.*, e.employee_name as posted_by_name
            FROM purchase_requests pr
            JOIN employees e ON pr.posted_by = e.employee_id
            WHERE pr.pr_id = ?
        `, [prId]);

        const bids = await db.query(`
            SELECT 
                sb.bid_id,
                sb.bidding_id,
                sb.supplier_id,
                sb.submitted_at,
                sb.status,
                sb.total_amount,
                sb.notes,
                sb.received_at,
                COALESCE(e.employee_name, sb.received_by) as received_by_name,
                s.company_name,
                s.contact_person,
                s.rating,
                (SELECT COUNT(*) FROM supplier_ratings sr WHERE sr.supplier_id = s.supplier_id) as rating_count,
                (
                    SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'item_id', bi.item_id,
                            'unit_price', bi.unit_price,
                            'quantity', bi.quantity,
                            'total_price', bi.total_price
                        )
                    )
                    FROM bid_items bi
                    WHERE bi.bid_id = sb.bid_id
                ) as items
            FROM supplier_bids sb
            JOIN biddings b ON sb.bidding_id = b.bidding_id
            JOIN suppliers s ON sb.supplier_id = s.supplier_id
            LEFT JOIN employees e ON sb.received_by = e.employee_id
            WHERE b.pr_id = ?
            ORDER BY sb.total_amount ASC
        `, [prId]);

        return { purchaseRequest, bids };
    }

static async awardBid(prId, bidId) {
    await db.query('START TRANSACTION');
    try {
        // 1. Update bidding status to 'closed' and record awarding timestamp
        await db.query(`
            UPDATE biddings 
            SET status = 'closed', awarded_at = NOW() 
            WHERE pr_id = ?
        `, [prId]);

        // 2. Approve the selected supplier bid
        await db.query(`
            UPDATE supplier_bids 
            SET status = 'approved' 
            WHERE bid_id = ?
        `, [bidId]);

        // 3. Decline all other bids under the same bidding
        await db.query(`
            UPDATE supplier_bids 
            SET status = 'declined' 
            WHERE bid_id != ? AND bidding_id IN (
                SELECT bidding_id FROM biddings WHERE pr_id = ?
            )
        `, [bidId, prId]);

        await db.query('COMMIT');
        return { success: true };
    } catch (error) {
        await db.query('ROLLBACK');
        throw error;
    }
}

static async getSupplierDetails(id) {
    const [supplier] = await db.query(`
        SELECT 
            supplier_id,
            company_name,
            contact_person,
            email,
            phone,
            address,
            tax_id,
            business_permit,
            rating,
            bad_rating_count,
            is_approved,
            is_banned,
            created_at,
            updated_at
        FROM suppliers 
        WHERE supplier_id = ?
    `, [id]);

    const bids = await db.query(`
        SELECT 
            sb.*,
            pr.purpose,
            pr.total as pr_total,
            b.bidding_id
        FROM supplier_bids sb
        JOIN biddings b ON sb.bidding_id = b.bidding_id
        JOIN purchase_requests pr ON b.pr_id = pr.pr_id
        WHERE sb.supplier_id = ?
        ORDER BY sb.received_at DESC
    `, [id]);

    const ratings = await db.query(`
        SELECT 
            sr.*,
            e.employee_name AS rater_name,
            pr.purpose
        FROM supplier_ratings sr
        LEFT JOIN employees e ON sr.rated_by = e.employee_id
        LEFT JOIN supplier_bids sb ON sr.bid_id = sb.bid_id
        LEFT JOIN biddings b ON sb.bidding_id = b.bidding_id
        LEFT JOIN purchase_requests pr ON b.pr_id = pr.pr_id
        WHERE sr.supplier_id = ?
        ORDER BY sr.rated_at DESC
    `, [id]);

    return { supplier, bids, ratings };
}

    static async updateSupplierStatus(id, status) {
        const updateData = {
            is_approved: status === 'approved' ? 1 : 0,
            is_banned: status === 'banned' ? 1 : 0
        };

        await db.query(`
            UPDATE suppliers 
            SET is_approved = ?, is_banned = ? 
            WHERE supplier_id = ?
        `, [updateData.is_approved, updateData.is_banned, id]);

        return { success: true };
    }

    static async getBidDetails(bidId) {
        const [bid] = await db.query(`
            SELECT 
                sb.*,
                s.company_name,
                s.contact_person,
                s.email,
                s.phone,
                b.pr_id,
                pr.purpose,
                pr.total AS pr_total
            FROM supplier_bids sb
            JOIN suppliers s ON sb.supplier_id = s.supplier_id
            JOIN biddings b ON sb.bidding_id = b.bidding_id
            JOIN purchase_requests pr ON b.pr_id = pr.pr_id
            WHERE sb.bid_id = ?
        `, [bidId]);

        const items = await db.query(`
            SELECT 
                pr.pr_id,
                pr_items.item_id AS requested_item_id,
                pr_items.item_description,
                pr_items.quantity AS requested_quantity,
                pr_items.unit_cost AS requested_unit_cost,
                sb.bid_id,
                bi.item_id AS supplier_item_id,
                bi.quantity AS supplier_quantity,
                bi.unit_price AS supplier_unit_price,
                bi.total_price AS supplier_total_price
            FROM 
                purchase_requests pr
            JOIN 
                purchase_request_items pr_items ON pr.pr_id = pr_items.pr_id
            JOIN 
                biddings b ON pr.pr_id = b.pr_id
            JOIN 
                supplier_bids sb ON b.bidding_id = sb.bidding_id
            JOIN 
                bid_items bi ON sb.bid_id = bi.bid_id
            WHERE 
                sb.bid_id = ?
        `, [bidId]);

        return { bid, items };
    }

static async getSupplierHistory(supplierId) {
    const [supplier] = await db.query(`
        SELECT 
            supplier_id,
            company_name,
            contact_person,
            email,
            phone,
            address,
            tax_id,
            business_permit,
            rating,
            bad_rating_count,
            is_approved,
            is_banned,
            created_at,
            updated_at
        FROM suppliers 
        WHERE supplier_id = ?
    `, [supplierId]);

    const bids = await db.query(`
        SELECT 
            sb.*,
            pr.purpose,
            pr.total as pr_total,
            b.bidding_id
        FROM supplier_bids sb
        JOIN biddings b ON sb.bidding_id = b.bidding_id
        JOIN purchase_requests pr ON b.pr_id = pr.pr_id
        WHERE sb.supplier_id = ?
        ORDER BY sb.received_at DESC
    `, [supplierId]);

    const ratings = await db.query(`
        SELECT 
            sr.*,
            e.employee_name AS rater_name,
            pr.purpose
        FROM supplier_ratings sr
        LEFT JOIN employees e ON sr.rated_by = e.employee_id
        LEFT JOIN supplier_bids sb ON sr.bid_id = sb.bid_id
        LEFT JOIN biddings b ON sb.bidding_id = b.bidding_id
        LEFT JOIN purchase_requests pr ON b.pr_id = pr.pr_id
        WHERE sr.supplier_id = ?
        ORDER BY sr.rated_at DESC
    `, [supplierId]);

    return { supplier, bids, ratings };
}

    static async exportBids(biddingId) {
        const [bidding] = await db.query(`
            SELECT b.*, pr.purpose
            FROM biddings b
            JOIN purchase_requests pr ON b.pr_id = pr.pr_id
            WHERE b.bidding_id = ?
        `, [biddingId]);

        const bids = await db.query(`
            SELECT sb.*, s.company_name, s.contact_person
            FROM supplier_bids sb
            JOIN suppliers s ON sb.supplier_id = s.supplier_id
            WHERE sb.bidding_id = ?
            ORDER BY sb.total_amount ASC
        `, [biddingId]);

        return { bidding, bids };
    }

    static async compareBids(prId) {
        const [purchaseRequest] = await db.query(`
            SELECT pr.*
            FROM purchase_requests pr
            WHERE pr.pr_id = ? AND pr.is_archived = false
        `, [prId]);

        const bids = await db.query(`
            SELECT 
                sb.bid_id,
                sb.bidding_id,
                sb.supplier_id,
                sb.submitted_at,
                sb.status,
                sb.total_amount,
                sb.notes,
                s.company_name,
                s.contact_person,
                s.email,
                s.phone,
                s.rating,
                (SELECT COUNT(*) FROM supplier_ratings sr WHERE sr.supplier_id = s.supplier_id) as rating_count,
                b.posted_by,
                (
                    SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'item_id', bi.item_id,
                            'description', pri.item_description,
                            'unit', pri.unit,
                            'unit_price', bi.unit_price,
                            'quantity', bi.quantity,
                            'total_price', bi.total_price
                        )
                    )
                    FROM bid_items bi
                    JOIN purchase_request_items pri ON bi.item_id = pri.item_id
                    WHERE bi.bid_id = sb.bid_id
                ) as items
            FROM supplier_bids sb
            JOIN biddings b ON sb.bidding_id = b.bidding_id
            JOIN suppliers s ON sb.supplier_id = s.supplier_id
            WHERE b.pr_id = ?
            ORDER BY sb.total_amount ASC
        `, [prId]);

        return { purchaseRequest, bids };
    }

    static async updateBiddingStatus(biddingId, status) {
        await db.query(`
            UPDATE biddings 
            SET status = ? 
            WHERE bidding_id = ?
        `, [status, biddingId]);
        return { success: true };
    }

    static async archiveBidding(biddingId) {
        await db.query(`
            UPDATE biddings 
            SET is_archived = TRUE 
            WHERE bidding_id = ?
        `, [biddingId]);
        return { success: true };
    }

    static async unarchiveBidding(biddingId) {
        await db.query(`
            UPDATE biddings 
            SET is_archived = FALSE 
            WHERE bidding_id = ?
        `, [biddingId]);
        return { success: true };
    }

static async markBidAsReceived(bidId, userId, itemIds) {
    await db.query('START TRANSACTION');
    try {
        const [bid] = await db.query(
            `SELECT * FROM supplier_bids WHERE bid_id = ? AND status = 'approved'`,
            [bidId]
        );
        if (!bid) {
            throw new Error('Bid not found or not approved');
        }

        const items = await db.query(
            `SELECT item_id FROM bid_items WHERE bid_id = ?`,
            [bidId]
        );
        const validItemIds = items.map(item => item.item_id);
        if (!itemIds.every(id => validItemIds.includes(parseInt(id)))) {
            throw new Error('Invalid item IDs provided');
        }

        await db.query(
            `UPDATE supplier_bids SET received_at = NOW(), received_by = ? WHERE bid_id = ?`,
            [userId, bidId]
        );

        await db.query('COMMIT');
        return { success: true };
    } catch (error) {
        await db.query('ROLLBACK');
        throw new Error(`Error marking bid as received: ${error.message}`);
    }
}

static async rateSupplier(bidId, userId, rating, comment) {
    await db.query('START TRANSACTION');
    try {
        const [bid] = await db.query(
            `SELECT supplier_id, received_at FROM supplier_bids WHERE bid_id = ?`,
            [bidId]
        );
        if (!bid) {
            throw new Error('Bid not found');
        }
        if (!bid.received_at) {
            throw new Error('Cannot rate supplier: Bid not yet received');
        }

        // Check if already rated
        const [existingRating] = await db.query(
            `SELECT 1 FROM supplier_ratings WHERE bid_id = ?`,
            [bidId]
        );
        if (existingRating) {
            throw new Error('Bid already rated');
        }

        await db.query(
            `INSERT INTO supplier_ratings (supplier_id, bid_id, rating, comments, rated_by, rated_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [bid.supplier_id, bidId, rating, comment, userId]
        );

        await db.query(
            `UPDATE suppliers s
             SET rating = (
                 SELECT AVG(rating) 
                 FROM supplier_ratings 
                 WHERE supplier_id = s.supplier_id
             )
             WHERE supplier_id = ?`,
            [bid.supplier_id]
        );

        await db.query('COMMIT');
        return { success: true };
    } catch (error) {
        await db.query('ROLLBACK');
        throw new Error(`Error rating supplier: ${error.message}`);
    }
}

  static async declineBid(bidId) {
    await db.query(`
        UPDATE supplier_bids 
        SET status = 'declined' 
        WHERE bid_id = ?
    `, [bidId]);
    return { success: true };
}

static async getAllReceivedBids() {
    const bids = await db.query(`
        SELECT 
            sb.bid_id,
            sb.bidding_id,
            sb.supplier_id,
            sb.submitted_at,
            sb.status,
            sb.total_amount,
            sb.notes,
            sb.received_at,
            COALESCE(e.employee_name, sb.received_by) AS received_by_name,
            s.company_name,
            s.contact_person,
            s.email,
            s.phone,
            COALESCE(s.rating, 0) AS rating,
            (
                SELECT COUNT(*) 
                FROM supplier_ratings sr 
                WHERE sr.supplier_id = s.supplier_id
            ) AS rating_count,
            b.pr_id,
            pr.purpose,
            pr.total AS pr_total,
(
  SELECT JSON_ARRAYAGG(
    JSON_OBJECT(
      'item_id', bi.item_id,
      'unit_price', bi.unit_price,
      'quantity', bi.quantity,
      'total_price', bi.total_price,
      'description', pri.item_description,
      'unit', pri.unit
    )
  )
  FROM bid_items bi
  JOIN purchase_request_items pri ON bi.item_id = pri.item_id AND pr.pr_id = pri.pr_id
  WHERE bi.bid_id = sb.bid_id
) AS items,
            EXISTS (
                SELECT 1 
                FROM supplier_ratings sr 
                WHERE sr.bid_id = sb.bid_id
            ) AS is_rated
        FROM supplier_bids sb
        JOIN biddings b ON sb.bidding_id = b.bidding_id
        JOIN purchase_requests pr ON b.pr_id = pr.pr_id
        JOIN suppliers s ON sb.supplier_id = s.supplier_id
        LEFT JOIN employees e ON sb.received_by = e.employee_id
        WHERE b.status = 'awarded'
          AND pr.is_archived = FALSE
        ORDER BY sb.submitted_at DESC
    `);
    return bids;
}

static async markBidAsReceived(bidId, userId, itemIds) {
    try {
        // Verify bid exists and is approved
        const [bid] = await db.query(
            `SELECT * FROM supplier_bids WHERE bid_id = ? AND status = 'approved'`,
            [bidId]
        );
        if (!bid) {
            throw new Error('Bid not found or not approved');
        }

        // Verify provided itemIds exist (optional, for validation)
        const items = await db.query(
            `SELECT item_id FROM bid_items WHERE bid_id = ?`,
            [bidId]
        );
        const validItemIds = items.map(item => item.item_id);
        if (!itemIds.every(id => validItemIds.includes(parseInt(id)))) {
            throw new Error('Invalid item IDs provided');
        }

        // Mark the bid as received
        await db.query(
            `UPDATE supplier_bids SET received_at = NOW(), received_by = ? WHERE bid_id = ?`,
            [userId, bidId]
        );

        return { success: true };
    } catch (error) {
        throw new Error(`Error marking bid as received: ${error.message}`);
    }
}
// Fixed rateSupplier method in AdminModel
static async rateSupplier(bidId, userId, rating, comment) {
    await db.query('START TRANSACTION');
    try {
        // Get bid and supplier information
        const [bid] = await db.query(`
            SELECT sb.supplier_id, sb.received_at, e.employee_name, e.employee_id
            FROM supplier_bids sb
            LEFT JOIN employees e ON sb.received_by = e.employee_id
            WHERE sb.bid_id = ?
        `, [bidId]);

        if (!bid) {
            throw new Error('Bid not found');
        }
        if (!bid.received_at) {
            throw new Error('Cannot rate supplier: Bid not yet received');
        }

        // Check if already rated
        const [existingRating] = await db.query(
            `SELECT 1 FROM supplier_ratings WHERE bid_id = ?`,
            [bidId]
        );
        if (existingRating) {
            throw new Error('Bid already rated');
        }

        // Get the rater's employee information
        const [rater] = await db.query(`
            SELECT employee_id, employee_name FROM employees WHERE employee_id = ?
        `, [userId]);

        if (!rater) {
            throw new Error('Invalid user ID - employee not found');
        }

        // Insert rating with proper employee ID
        await db.query(
            `INSERT INTO supplier_ratings (supplier_id, bid_id, rating, comments, rated_by, rated_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [bid.supplier_id, bidId, rating, comment, rater.employee_id]
        );

        // Update supplier's average rating
        await db.query(
            `UPDATE suppliers s
             SET rating = (
                 SELECT AVG(rating) 
                 FROM supplier_ratings 
                 WHERE supplier_id = s.supplier_id
             )
             WHERE supplier_id = ?`,
            [bid.supplier_id]
        );

        await db.query('COMMIT');
        return { success: true };
    } catch (error) {
        await db.query('ROLLBACK');
        throw new Error(`Error rating supplier: ${error.message}`);
    }
}

static async getBidItems(bidId) {
    console.log('Fetching items for bidId:', bidId);
    try {
        // First get the bidding_id from supplier_bids
        const [bid] = await db.query(`
            SELECT bidding_id FROM supplier_bids 
            WHERE bid_id = ?
        `, [bidId]);

        if (!bid) {
            throw new Error('Bid not found');
        }

        // Then get items with their descriptions using correct join logic
        const items = await db.query(`
            SELECT 
                bi.item_id,
                bi.unit_price,
                bi.quantity,
                bi.total_price,
                pri.item_description,
                pri.unit
            FROM bid_items bi
            JOIN supplier_bids sb ON bi.bid_id = sb.bid_id
            JOIN biddings b ON sb.bidding_id = b.bidding_id
            JOIN purchase_request_items pri 
                ON pri.item_no = bi.item_id 
                AND pri.pr_id = b.pr_id
            WHERE bi.bid_id = ?
        `, [bidId]);
        
        console.log('Fetched items:', items);
        
        return { 
            items: Array.isArray(items) ? items : [] 
        };
    } catch (error) {
        console.error('Error fetching bid items:', error);
        throw new Error(`Failed to fetch bid items: ${error.message}`);
    }
}

static async getBiddingDetails(biddingId) {
    console.log(`Fetching details for biddingId: ${biddingId}`);
    const [bidding] = await db.query(`
        SELECT b.*, pr.purpose, pr.total as estimated_total, e.employee_name as posted_by_name
        FROM biddings b
        LEFT JOIN purchase_requests pr ON b.pr_id = pr.pr_id
        LEFT JOIN employees e ON b.posted_by = e.employee_id
        WHERE b.bidding_id = ?
    `, [biddingId]);

    console.log('Bidding query result:', bidding);

    if (!bidding) {
        console.error(`No bidding found for biddingId: ${biddingId}`);
        throw new Error('Bidding not found');
    }

    const items = await db.query(`
        SELECT * FROM purchase_request_items
        WHERE pr_id = ?
        ORDER BY item_no
    `, [bidding.pr_id]);

    const bids = await db.query(`
        SELECT sb.*, s.company_name, s.contact_person, s.rating,
               (SELECT COUNT(*) FROM supplier_ratings sr WHERE sr.supplier_id = s.supplier_id) as rating_count,
               (
                   SELECT JSON_ARRAYAGG(
                       JSON_OBJECT(
                           'item_id', bi.item_id,
                           'unit_price', bi.unit_price,
                           'quantity', bi.quantity,
                           'total_price', bi.total_price
                       )
                   )
                   FROM bid_items bi
                   WHERE bi.bid_id = sb.bid_id
               ) as items
        FROM supplier_bids sb
        JOIN suppliers s ON sb.supplier_id = s.supplier_id
        WHERE sb.bidding_id = ?
        ORDER BY sb.total_amount ASC
    `, [biddingId]);

    return { bidding, items, bids };
}

static async updateBidding(biddingId, updateData) {
    console.log('Updating bidding:', { biddingId, updateData });
    await db.query('START TRANSACTION');
    try {
        // Update biddings table (remove notes)
        await db.query(`
            UPDATE biddings 
            SET 
                deadline = ?,
                status = ?
            WHERE bidding_id = ?
        `, [
            new Date(updateData.deadline),
            updateData.status,
            biddingId
        ]);

        // Update purchase_requests table
        await db.query(`
            UPDATE purchase_requests
            SET 
                purpose = ?,
                total = ?
            WHERE pr_id IN (SELECT pr_id FROM biddings WHERE bidding_id = ?)
        `, [
            updateData.purpose,
            parseFloat(updateData.estimated_total),
            biddingId
        ]);

        await db.query('COMMIT');
        return { success: true };
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Update error:', error);
        throw new Error(`Error updating bidding: ${error.message}`);
    }
}

static async getSuppliersData({ status = 'all', start = 0, length = 10, search = '' }) {
    let baseQuery = `SELECT * FROM suppliers`;
    let whereClause = [];
    let queryParams = [];

    // Status filtering
    if (status === 'pending') {
        whereClause.push('is_approved = FALSE AND is_banned = FALSE');
    } else if (status === 'approved') {
        whereClause.push('is_approved = TRUE AND is_banned = FALSE');
    } else if (status === 'banned') {
        whereClause.push('is_banned = TRUE');
    }

    // Search functionality
    if (search) {
        whereClause.push(`
            (company_name LIKE ? OR 
            contact_person LIKE ? OR 
            email LIKE ? OR 
            phone LIKE ?)
        `);
        const searchTerm = `%${search}%`;
        queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const whereString = whereClause.length ? `WHERE ${whereClause.join(' AND ')}` : '';

    // Get total count - FIXED THIS PART
    const countQuery = `SELECT COUNT(*) as total FROM suppliers ${whereString}`;
    const countResult = await db.query(countQuery, queryParams);
    
    // Handle different database response structures
    let totalItems;
    if (Array.isArray(countResult)) {
        // MySQL2 with rows array
        totalItems = countResult[0]?.total || 0;
    } else if (countResult && countResult.total !== undefined) {
        // Some ORMs return object directly
        totalItems = countResult.total;
    } else {
        // Fallback
        totalItems = 0;
    }

    // Return empty result if no items found
    if (totalItems === 0) {
        return { totalItems: 0, suppliers: [] };
    }

    // Get paginated data
    const dataQuery = `
        ${baseQuery}
        ${whereString}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `;
    queryParams.push(parseInt(length), parseInt(start));
    
    const suppliers = await db.query(dataQuery, queryParams);

    return { 
        totalItems, 
        suppliers: Array.isArray(suppliers) ? suppliers : (suppliers || []) 
    };
}

static async getSupplierDetails(id) {
    const [supplier] = await db.query(`
        SELECT 
            supplier_id,
            company_name,
            contact_person,
            email,
            phone,
            address,
            tax_id,
            business_permit,
            rating,
            bad_rating_count,
            is_approved,
            is_banned,
            created_at,
            updated_at
        FROM suppliers 
        WHERE supplier_id = ?
    `, [id]);

    const bids = await db.query(`
        SELECT 
            sb.*,
            pr.purpose,
            pr.total as pr_total,
            b.bidding_id
        FROM supplier_bids sb
        JOIN biddings b ON sb.bidding_id = b.bidding_id
        JOIN purchase_requests pr ON b.pr_id = pr.pr_id
        WHERE sb.supplier_id = ?
        ORDER BY sb.received_at DESC
    `, [id]);

    const ratings = await db.query(`
        SELECT 
            sr.*,
            e.employee_name AS rater_name,
            pr.purpose
        FROM supplier_ratings sr
        LEFT JOIN employees e ON sr.rated_by = e.employee_id
        LEFT JOIN supplier_bids sb ON sr.bid_id = sb.bid_id
        LEFT JOIN biddings b ON sb.bidding_id = b.bidding_id
        LEFT JOIN purchase_requests pr ON b.pr_id = pr.pr_id
        WHERE sr.supplier_id = ?
        ORDER BY sr.rated_at DESC
    `, [id]);

    return { supplier, bids, ratings };
}

    static async updateSupplierStatus(id, status, reason) {
        await db.query('START TRANSACTION');
        try {
            const updateData = {
                is_approved: status === 'approved' ? 1 : 0,
                is_banned: status === 'banned' ? 1 : 0,
                updated_at: new Date()
            };

            await db.query(`
                UPDATE suppliers 
                SET 
                    is_approved = ?,
                    is_banned = ?,
                    updated_at = ?
                WHERE supplier_id = ?
            `, [updateData.is_approved, updateData.is_banned, updateData.updated_at, id]);

            if (reason && (status === 'banned' || status === 'pending')) {
                await db.query(`
                    INSERT INTO supplier_status_changes 
                    (supplier_id, status, reason, changed_by, changed_at)
                    VALUES (?, ?, ?, ?, NOW())
                `, [id, status, reason, null]); // changed_by could be updated with actual user ID
            }

            await db.query('COMMIT');
            return { success: true };
        } catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }
    }

    static async getSupplierHistory(supplierId) {
        const [supplier] = await db.query(`
            SELECT 
                supplier_id,
                company_name,
                contact_person,
                email,
                phone,
                address,
                tax_id,
                business_permit,
                rating,
                bad_rating_count,
                is_approved,
                is_banned,
                created_at,
                updated_at
            FROM suppliers 
            WHERE supplier_id = ?
        `, [supplierId]);

        const bids = await db.query(`
            SELECT 
                sb.*,
                pr.purpose,
                pr.total as pr_total,
                b.bidding_id
            FROM supplier_bids sb
            JOIN biddings b ON sb.bidding_id = b.bidding_id
            JOIN purchase_requests pr ON b.pr_id = pr.pr_id
            WHERE sb.supplier_id = ?
            ORDER BY sb.received_at DESC
        `, [supplierId]);

        const ratings = await db.query(`
            SELECT 
                sr.*,
                e.employee_name as rater_name,
                pr.purpose
            FROM supplier_ratings sr
            JOIN employees e ON sr.rated_by = e.employee_id
            JOIN purchase_requests pr ON sr.pr_id = pr.pr_id
            WHERE sr.supplier_id = ?
            ORDER BY sr.created_at DESC
        `, [supplierId]);

        return { supplier, bids, ratings };
    }
}

module.exports = AdminModel;
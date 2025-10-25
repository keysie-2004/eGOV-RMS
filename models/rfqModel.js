const db = require('../config/db');

const rfqModel = {
    //rfq.ejs

// For admins/superadmins - get all approved, e-sign, and posted items categorized
getAllApprovedPurchaseRequestsCategorized: (callback) => {
    const sql = `
        SELECT pr.*, 
               pri.item_id, pri.item_no, pri.unit, 
               pri.item_description, pri.quantity, 
               pri.unit_cost, pri.total_cost,
               EXISTS(SELECT 1 FROM rfq WHERE rfq.pr_id = pr.pr_id) AS rfq_completed,
               EXISTS(SELECT 1 FROM abstract WHERE abstract.pr_id = pr.pr_id) AS abstract_completed,
               EXISTS(SELECT 1 FROM acceptance WHERE acceptance.pr_id = pr.pr_id) AS acceptance_completed,
               EXISTS(SELECT 1 FROM purchase_orders WHERE purchase_orders.pr_id = pr.pr_id) AS po_completed
        FROM purchase_requests pr
        JOIN purchase_request_items pri ON pr.pr_id = pri.pr_id
        WHERE pr.status IN ('approved', 'e-sign', 'posted')
    `;
    db.query(sql, (err, results) => {
        if (err) return callback(err, null);
        
        const categorized = {
            all: [],
            completed: [],
            inProgress: []
        };
        
        const requests = results.reduce((acc, row) => {
            if (!acc[row.pr_id]) {
                acc[row.pr_id] = {
                    ...row,
                    items: []
                };
            }
            acc[row.pr_id].items.push({
                item_id: row.item_id,
                item_no: row.item_no,
                unit: row.unit,
                item_description: row.item_description,
                quantity: row.quantity,
                unit_cost: row.unit_cost,
                total_cost: row.total_cost
            });
            return acc;
        }, {});
        
        const requestList = Object.values(requests);
        
        // Categorize the requests
        requestList.forEach(request => {
            categorized.all.push(request);
            
            if (request.po_completed) {
                categorized.completed.push(request);
            } else {
                categorized.inProgress.push(request);
            }
        });
        
        callback(null, categorized);
    });
},

// For regular users - get approved, e-sign, and posted items by department categorized
getApprovedPurchaseRequestsByDepartmentCategorized: (department, callback) => {
    const sql = `
        SELECT pr.*, 
               pri.item_id, pri.item_no, pri.unit, 
               pri.item_description, pri.quantity, 
               pri.unit_cost, pri.total_cost,
               EXISTS(SELECT 1 FROM rfq WHERE rfq.pr_id = pr.pr_id) AS rfq_completed,
               EXISTS(SELECT 1 FROM abstract WHERE abstract.pr_id = pr.pr_id) AS abstract_completed,
               EXISTS(SELECT 1 FROM acceptance WHERE acceptance.pr_id = pr.pr_id) AS acceptance_completed,
               EXISTS(SELECT 1 FROM purchase_orders WHERE purchase_orders.pr_id = pr.pr_id) AS po_completed
        FROM purchase_requests pr
        JOIN purchase_request_items pri ON pr.pr_id = pri.pr_id
        WHERE pr.status IN ('approved', 'e-sign', 'posted') AND pr.department = ?
    `;
    db.query(sql, [department], (err, results) => {
        if (err) return callback(err, null);
        
        const categorized = {
            all: [],
            completed: [],
            inProgress: []
        };
        
        const requests = results.reduce((acc, row) => {
            if (!acc[row.pr_id]) {
                acc[row.pr_id] = {
                    ...row,
                    items: []
                };
            }
            acc[row.pr_id].items.push({
                item_id: row.item_id,
                item_no: row.item_no,
                unit: row.unit,
                item_description: row.item_description,
                quantity: row.quantity,
                unit_cost: row.unit_cost,
                total_cost: row.total_cost
            });
            return acc;
        }, {});
        
        const requestList = Object.values(requests);
        
        // Categorize the requests
        requestList.forEach(request => {
            categorized.all.push(request);
            
            if (request.po_completed) {
                categorized.completed.push(request);
            } else {
                categorized.inProgress.push(request);
            }
        });
        
        callback(null, categorized);
    });
},

// For admins/superadmins - get all approved items categorized
getAllApprovedPurchaseRequestsCategorized: (callback) => {
    const sql = `
        SELECT pr.*, 
               pri.item_id, pri.item_no, pri.unit, 
               pri.item_description, pri.quantity, 
               pri.unit_cost, pri.total_cost,
               EXISTS(SELECT 1 FROM rfq WHERE rfq.pr_id = pr.pr_id) AS rfq_completed,
               EXISTS(SELECT 1 FROM abstract WHERE abstract.pr_id = pr.pr_id) AS abstract_completed,
               EXISTS(SELECT 1 FROM acceptance WHERE acceptance.pr_id = pr.pr_id) AS acceptance_completed,
               EXISTS(SELECT 1 FROM purchase_orders WHERE purchase_orders.pr_id = pr.pr_id) AS po_completed
        FROM purchase_requests pr
        JOIN purchase_request_items pri ON pr.pr_id = pri.pr_id
        WHERE pr.status IN ('approved', 'e-sign', 'posted')
    `;
    db.query(sql, (err, results) => {
        if (err) return callback(err, null);
        
        const categorized = {
            all: [],
            completed: [],
            inProgress: []
        };
        
        const requests = results.reduce((acc, row) => {
            if (!acc[row.pr_id]) {
                acc[row.pr_id] = {
                    ...row,
                    items: []
                };
            }
            acc[row.pr_id].items.push({
                item_id: row.item_id,
                item_no: row.item_no,
                unit: row.unit,
                item_description: row.item_description,
                quantity: row.quantity,
                unit_cost: row.unit_cost,
                total_cost: row.total_cost
            });
            return acc;
        }, {});
        
        const requestList = Object.values(requests);
        
        // Categorize the requests
        requestList.forEach(request => {
            categorized.all.push(request);
            
            if (request.po_completed) {
                categorized.completed.push(request);
            } else {
                categorized.inProgress.push(request);
            }
        });
        
        callback(null, categorized);
    });
},

// For regular users - get items by department categorized
getApprovedPurchaseRequestsByDepartmentCategorized: (department, callback) => {
    const sql = `
        SELECT pr.*, 
               pri.item_id, pri.item_no, pri.unit, 
               pri.item_description, pri.quantity, 
               pri.unit_cost, pri.total_cost,
               EXISTS(SELECT 1 FROM rfq WHERE rfq.pr_id = pr.pr_id) AS rfq_completed,
               EXISTS(SELECT 1 FROM abstract WHERE abstract.pr_id = pr.pr_id) AS abstract_completed,
               EXISTS(SELECT 1 FROM acceptance WHERE acceptance.pr_id = pr.pr_id) AS acceptance_completed,
               EXISTS(SELECT 1 FROM purchase_orders WHERE purchase_orders.pr_id = pr.pr_id) AS po_completed
        FROM purchase_requests pr
        JOIN purchase_request_items pri ON pr.pr_id = pri.pr_id
        WHERE pr.status = 'approved' AND pr.department = ?
    `;
    db.query(sql, [department], (err, results) => {
        if (err) return callback(err, null);
        
        const categorized = {
            all: [],
            completed: [],
            inProgress: []
        };
        
        const requests = results.reduce((acc, row) => {
            if (!acc[row.pr_id]) {
                acc[row.pr_id] = {
                    ...row,
                    items: []
                };
            }
            acc[row.pr_id].items.push({
                item_id: row.item_id,
                item_no: row.item_no,
                unit: row.unit,
                item_description: row.item_description,
                quantity: row.quantity,
                unit_cost: row.unit_cost,
                total_cost: row.total_cost
            });
            return acc;
        }, {});
        
        const requestList = Object.values(requests);
        
        // Categorize the requests
        requestList.forEach(request => {
            categorized.all.push(request);
            
            if (request.po_completed) {
                categorized.completed.push(request);
            } else {
                categorized.inProgress.push(request);
            }
        });
        
        callback(null, categorized);
    });
},
    //rfq.ejs - showRfqForm

    // Fetch purchase request by ID
    getPurchaseRequestById: (pr_id, callback) => {
        const sql = `
            SELECT * FROM purchase_requests
            WHERE pr_id = ?
        `;
        db.query(sql, [pr_id], (err, results) => {
            if (err) return callback(err, null);
            callback(null, results[0]); // Return the first row
        });
    },

    // Fetch items by PR ID
    getItemsByPrId: (pr_id, callback) => {
        const sql = `
            SELECT pri.item_id, pri.item_no, pri.unit, pri.item_description, pri.quantity, pri.unit_cost, pri.total_cost
            FROM purchase_request_items pri
            WHERE pri.pr_id = ?
        `;
        db.query(sql, [pr_id], (err, results) => {
            if (err) return callback(err, null);
            callback(null, results);
        });
    },

    // Fetch all suppliers for a specific PR ID
    getSuppliersByPrId: (pr_id, callback) => {
        const sql = `
        SELECT DISTINCT supplier_name 
        FROM supplier_quotes 
        WHERE pr_id = ?
        `;
        db.query(sql, [pr_id], (err, results) => {
        if (err) return callback(err, null);
        callback(null, results);
        });
    },

    // Fetch RFQ and supplier quotes for a specific supplier
    getRfqAndQuotesBySupplier: (pr_id, supplier_name, callback) => {
        const sql = `
            SELECT 
                rfq.*, 
                sq.item_id, 
                sq.brand, 
                sq.unit_cost, 
                sq.total_cost, 
                sq.total,
                pri.item_no,
                pri.quantity,
                pri.unit,
                pri.item_description
            FROM rfq
            INNER JOIN supplier_quotes sq ON rfq.pr_id = sq.pr_id AND rfq.supplier_name = sq.supplier_name
            INNER JOIN purchase_request_items pri ON sq.item_id = pri.item_id
            WHERE rfq.pr_id = ? AND rfq.supplier_name = ?    `;
        db.query(sql, [pr_id, supplier_name], (err, results) => {
        if (err) return callback(err, null);
        callback(null, results);
        });
    },

    //rfqForm.ejs - saveSupplierQuotes

    // Save RFQ details
    saveRfqDetails: (rfq, callback) => {
        const sql = `
            INSERT INTO rfq 
            (pr_id, supplier_name, company_name, date_sent, quotation_number, printed_name, contact, date) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            rfq.pr_id,
            rfq.supplier_name, 
            rfq.company_name,
            rfq.date_sent,
            rfq.quotation_number,
            rfq.printed_name,
            rfq.contact,
            rfq.date
        ];

        db.query(sql, values, (err, result) => {
            if (err) {
                console.error('Error in saveRfqDetails:', err);
                return callback(err, null);
            }
            console.log('RFQ details saved successfully:', result);
            callback(null, result);
        });
    },

    // Save supplier quotes
    saveSupplierQuotes: (quote, callback) => {
        const sql = `
        INSERT INTO supplier_quotes 
        (pr_id, supplier_name, item_id, brand, unit_cost, total_cost, total) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
        quote.pr_id,
        quote.supplier_name,
        quote.item_id,
        quote.brand,
        quote.unit_cost,
        quote.total_cost,
        quote.total
        ];
    
        db.query(sql, values, (err, result) => {
        if (err) return callback(err, null);
        callback(null, result);
        });
    },
    
    // Fetch all suppliers
    getSuppliers: (callback) => {
        const sql = `
        SELECT * FROM supplier_quotes
        `;
        db.query(sql, (err, results) => {
        if (err) return callback(err, null);
        callback(null, results);
        });
    },

    // Fetch RFQ details by PR ID
    getRfqByPrId: (pr_id, callback) => {
        const sql = `
          SELECT * FROM rfq
          WHERE pr_id = ?
        `;
        db.query(sql, [pr_id], (err, results) => {
          if (err) return callback(err, null);
          callback(null, results);
        });
      },

      updateSupplierQuote: (quote, callback) => {
        const sql1 = `
          UPDATE supplier_quotes
          SET 
            brand = ?,
            unit_cost = ?,
            total_cost = ?
          WHERE pr_id = ? AND supplier_name = ? AND item_id = ?
        `;
    
        const sql2 = `
          UPDATE rfq
          SET 
            company_name = ?,
            date_sent = ?,
            quotation_number = ?,
            printed_name = ?,
            contact = ?,
            date = ?
          WHERE pr_id = ? AND supplier_name = ?
        `;
    
        const values1 = [
          quote.brand,
          quote.unit_cost,
          quote.total_cost,
          quote.pr_id,
          quote.supplier_name,
          quote.item_id,
        ];
    
        const values2 = [
          quote.company_name,
          quote.date_sent,
          quote.quotation_number,
          quote.printed_name,
          quote.contact,
          quote.date,
          quote.pr_id,
          quote.supplier_name,
        ];
    
        // Run both queries in a transaction
        db.beginTransaction((err) => {
          if (err) return callback(err, null);
    
          db.query(sql1, values1, (err, result1) => {
            if (err) return db.rollback(() => callback(err, null));
    
            db.query(sql2, values2, (err, result2) => {
              if (err) return db.rollback(() => callback(err, null));
    
              db.commit((err) => {
                if (err) return db.rollback(() => callback(err, null));
                callback(null, { message: "Update successful!" });
              });
            });
          });
        });
      },

    getSupplierQuotesByPrId: (pr_id, callback) => {
        const sql = `
            SELECT supplier_name, item_id, brand, unit_cost, total_cost 
            FROM supplier_quotes
            WHERE pr_id = ?
        `;
        db.query(sql, [pr_id], (err, results) => {
            if (err) return callback(err, null);
            callback(null, results);
        });
    },

    getRfqAndQuotesByPrId: (pr_id, supplier_name, callback) => {
        if (!pr_id || !supplier_name) {
            return callback(new Error("Invalid parameters: pr_id and supplier_name are required"), null);
        }
    
        const sql = `
            SELECT rfq.*, quotes.*
            FROM  rfq 
            LEFT JOIN quotes ON rfq.rfq_id = quotes.rfq_id
            WHERE rfq.pr_id = ? AND rfq.supplier_name = ?;
        `;
    
        db.query(sql, [String(pr_id), String(supplier_name)], (err, results) => {
            if (err) return callback(err, null);
            callback(null, results);
        });
    },
          
    getRfqByPrId: (pr_id, callback) => {
        const sql = `
          SELECT * FROM rfq
          WHERE pr_id = ?
        `;
        db.query(sql, [pr_id], (err, results) => {
          if (err) return callback(err, null);
          callback(null, results);
        });
 },

    saveProjectQuotes: (data, callback) => {
        const sql = `
            INSERT INTO supplier_quotes 
            (pr_id, supplier_name, item_id, unit_cost, total_cost, total, supplier_name) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
    
        // Loop through items and save each one
        data.items.forEach(item => {
            const values = [
                data.pr_id,
                'Lowest Price Supplier', // Placeholder for supplier name
                item.item_id,
                item.lowest_price,
                item.lowest_price * item.quantity, // total_cost
                data.total
            ];
    
            db.query(sql, values, (err, result) => {
                if (err) return callback(err, null);
                callback(null, result);
            });
        });
    },

  getSupplierQuotesByPrIdAndSupplier: (pr_id, supplier_name, item_id, callback) => {
    const sql = `
      SELECT 
        sq.*, 
        rfq.company_name, 
        rfq.date_sent, 
        rfq.quotation_number, 
        rfq.printed_name, 
        rfq.contact, 
        rfq.date
      FROM supplier_quotes sq
      LEFT JOIN rfq ON sq.pr_id = rfq.pr_id AND sq.supplier_name = rfq.supplier_name
      WHERE sq.pr_id = ? AND sq.supplier_name = ? AND sq.item_id = ?
    `;
    db.query(sql, [pr_id, supplier_name, item_id], (err, results) => {
      if (err) return callback(err, null);
      callback(null, results);
    });
  },

// Fetch requestor and BAC Secretariat details by PR ID
getRequestorAndBacSecretariat: (pr_id, callback) => {
    const sql = `
        SELECT
            pr.requested_by,
            e1.employee_name AS requestor_name,
            e1.position AS requestor_position,
            e2.employee_name AS bac_secretariat_name,
            e2.position AS bac_secretariat_position,
            CONCAT(e2.employee_name, ' (', e2.position, ', ', e2.bac_position, ')') AS bac_head
        FROM purchase_requests pr
        -- Match requestor by NAME
        LEFT JOIN employees e1 
            ON LOWER(TRIM(e1.employee_name)) = LOWER(TRIM(pr.requested_by))
        -- Always fetch the Head - BAC Secretariat
        LEFT JOIN (
            SELECT employee_id, employee_name, position, bac_position
            FROM employees
            WHERE LOWER(bac_position) LIKE '%head%'
              AND LOWER(bac_position) LIKE '%bac secretariat%'
            ORDER BY updated_at DESC
            LIMIT 1
        ) AS e2 ON 1=1
        WHERE pr.pr_id = ?;
    `;

    db.query(sql, [pr_id], (err, results) => {
        if (err) return callback(err, null);
        callback(null, results[0] || {});
    });
},

  //abstract form

// Get abstract by PR ID (simple version)
getAbstractByPrId: (pr_id, callback) => {
    const sql = `SELECT * FROM abstract WHERE pr_id = ?`;
    db.query(sql, [pr_id], (err, results) => {
        if (err) return callback(err, null);
        callback(null, results[0] || null);
    });
},

    saveOrUpdateAbstract: (data, callback) => {
        const { pr_id, date, bacMembers } = data;
        
        if (!pr_id || !date) {
            return callback(new Error('pr_id and date are required'));
        }

        const mysqlDate = new Date(date).toISOString().split('T')[0];

        db.beginTransaction(async (err) => {
            if (err) return callback(err);

            try {
                // 1. Save/update the abstract
                const abstractResult = await new Promise((resolve, reject) => {
                    const sql = `
                        INSERT INTO abstract (pr_id, date)
                        VALUES (?, ?)
                        ON DUPLICATE KEY UPDATE date = VALUES(date)
                    `;
                    db.query(sql, [pr_id, mysqlDate], (err, results) => {
                        if (err) reject(err);
                        else resolve(results);
                    });
                });

                const abstract_id = abstractResult.insertId || (
                    await new Promise((resolve, reject) => {
                        db.query('SELECT abstract_id FROM abstract WHERE pr_id = ?', [pr_id], (err, results) => {
                            if (err) reject(err);
                            else resolve(results[0].abstract_id);
                        });
                    })
                );

                // 2. Delete existing BAC members
                await new Promise((resolve, reject) => {
                    db.query('DELETE FROM abstract_bac_members WHERE abstract_id = ?', [abstract_id], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });

                // 3. Insert new BAC members
                if (bacMembers && bacMembers.length > 0) {
                    const values = bacMembers.map(member => [
                        abstract_id,
                        member.employee_id,
                        member.employee_name,
                        member.position,
                        member.bac_position
                    ]);

                    await new Promise((resolve, reject) => {
                        const sql = `
                            INSERT INTO abstract_bac_members 
                            (abstract_id, employee_id, employee_name, position, bac_position)
                            VALUES ?
                        `;
                        db.query(sql, [values], (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                }

                db.commit((err) => {
                    if (err) {
                        db.rollback(() => callback(err));
                    } else {
                        callback(null, {
                            abstract_id,
                            date: mysqlDate,
                            bacMembersCount: bacMembers ? bacMembers.length : 0
                        });
                    }
                });
            } catch (error) {
                db.rollback(() => callback(error));
            }
        });
    },

// Get all BAC members from employees table
getAllBacMembers: (callback) => {
    const sql = `
        SELECT 
            employee_id,
            employee_name,
            position,
            bac_position,
            signature
        FROM 
            employees 
        WHERE 
            bac_position IS NOT NULL 
            AND bac_position != ''
        ORDER BY 
            CASE 
                WHEN bac_position = 'BAC Chairperson' THEN 1
                WHEN bac_position = 'BAC Vice - Chairperson' THEN 2
                WHEN bac_position = 'BAC Member' THEN 3
                WHEN bac_position = 'Approved by' THEN 4
                ELSE 5
            END
    `;
    db.query(sql, (err, results) => {
        if (err) return callback(err, null);
        callback(null, results);
    });
},

// Save abstract (only date)
saveAbstract: (pr_id, date, callback) => {
    const sql = `
        INSERT INTO abstract (pr_id, date)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE 
            date = VALUES(date)
    `;
    db.query(sql, [pr_id, date], (err, results) => {
        if (err) return callback(err, null);
        callback(null, {
            abstract_id: results.insertId || null,
            updated: results.affectedRows > 1
        });
    });
},

// Save BAC members to abstract_bac_members
saveAbstractBacMembers: (abstract_id, bacMembers, callback) => {
    // First delete existing members for this abstract
    const deleteSql = `DELETE FROM abstract_bac_members WHERE abstract_id = ?`;
    
    db.query(deleteSql, [abstract_id], (deleteErr) => {
        if (deleteErr) return callback(deleteErr);
        
        // If no members to insert, return early
        if (!bacMembers || bacMembers.length === 0) {
            return callback(null, { success: true, message: 'BAC members updated' });
        }
        
        // Prepare values for batch insert
        const values = bacMembers.map(member => [
            abstract_id,
            member.employee_id,
            member.employee_name,
            member.position,
            member.bac_position,
            member.signature
        ]);
        
        const insertSql = `
            INSERT INTO abstract_bac_members 
            (abstract_id, employee_id, employee_name, position, bac_position, signature)
            VALUES ?
        `;
        
        db.query(insertSql, [values], (insertErr, results) => {
            if (insertErr) return callback(insertErr);
            callback(null, { 
                success: true, 
                message: 'BAC members saved successfully',
                affectedRows: results.affectedRows 
            });
        });
    });
},

// Get BAC members for a specific abstract
getAbstractBacMembers: (abstract_id, callback) => {
    const sql = `
        SELECT 
            abm.*,
            e.signature
        FROM 
            abstract_bac_members abm
        JOIN 
            employees e ON abm.employee_id = e.employee_id
        WHERE 
            abm.abstract_id = ?
        ORDER BY
            CASE 
                WHEN abm.bac_position = 'BAC Chairperson' THEN 1
                WHEN abm.bac_position = 'BAC Vice - Chairperson' THEN 2
                WHEN abm.bac_position = 'BAC Member' THEN 3
                WHEN abm.bac_position = 'Approved by' THEN 4
                ELSE 5
            END
    `;
    
    db.query(sql, [abstract_id], (err, results) => {
        if (err) return callback(err, null);
        callback(null, results);
    });
},    

getSupplierQuotesWithCompanyNamesByPrId: (pr_id, callback) => {
    const sql = `
        SELECT 
            sq.item_id, 
            sq.unit_cost, 
            r.company_name 
        FROM 
            supplier_quotes sq
        INNER JOIN 
            rfq r 
        ON 
            sq.pr_id = r.pr_id AND sq.supplier_name = r.supplier_name
        WHERE 
            sq.pr_id = ?
    `;
    db.query(sql, [pr_id], (err, results) => {
        if (err) return callback(err, null);
        callback(null, results);
    });
},

// Get specific BAC members from employees table
getSpecificBacMembers: (callback) => {
    const sql = `
        SELECT 
            employee_id,
            employee_name,
            position,
            bac_position,
            signature
        FROM 
            employees 
        WHERE 
            bac_position LIKE '%BAC Chairperson%' OR
            bac_position LIKE '%BAC Vice - Chairperson%' OR
            bac_position LIKE '%BAC Member%' OR
            bac_position LIKE '%Approved by%'
        ORDER BY 
            CASE 
                WHEN bac_position LIKE '%BAC Chairperson%' THEN 1
                WHEN bac_position LIKE '%BAC Vice - Chairperson%' THEN 2
                WHEN bac_position LIKE '%BAC Member%' THEN 3
                WHEN bac_position LIKE '%Approved by%' THEN 4
                ELSE 5
            END
    `;
    db.query(sql, (err, results) => {
        if (err) return callback(err, null);
        callback(null, results);
    });
},

    getLowestQuotesByPrId: (pr_id, callback) => {
        const sql = `
            SELECT 
                sq.item_id, 
                sq.supplier_name, 
                sq.unit_cost, 
                sq.total_cost, 
                a.philgeps_reg_no
            FROM supplier_quotes sq
            LEFT JOIN acceptance a ON sq.pr_id = a.pr_id
            INNER JOIN (
                SELECT item_id, MIN(total_cost) AS min_total_cost
                FROM supplier_quotes
                WHERE pr_id = ?
                GROUP BY item_id
            ) AS lowest ON sq.item_id = lowest.item_id AND sq.total_cost = lowest.min_total_cost
            WHERE sq.pr_id = ?
        `;
        db.query(sql, [pr_id, pr_id], (err, results) => {
            if (err) return callback(err, null);
            callback(null, results);
        });
    },

    saveAcceptance: (data, callback) => {
        const sql = `
            INSERT INTO acceptance 
            (pr_id, philgeps_reg_no, date) 
            VALUES (?, ?, ?)
        `;
        const values = [
            data.pr_id,
            data.philgeps_reg_no,
            data.date
        ];
    
        db.query(sql, values, (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    // Handle duplicate entry error
                    return callback({ message: 'Duplicate entry for pr_id' }, null);
                }
                return callback(err, null);
            }
            callback(null, result);
        });
    },
    
    editAcceptance: (data, callback) => {
        const sql = `
            UPDATE acceptance 
            SET philgeps_reg_no = ?, date = ?
            WHERE pr_id = ?
        `;
        const values = [
            data.philgeps_reg_no,
            data.date,
            data.pr_id
        ];
    
        db.query(sql, values, (err, result) => {
            if (err) return callback(err, null);
            callback(null, result);
        });
    },

    getAcceptanceByPrId: (pr_id, callback) => {
        const sql = `
            SELECT * FROM acceptance
            WHERE pr_id = ?
        `;
        db.query(sql, [pr_id], (err, results) => {
            if (err) return callback(err, null);
            callback(null, results);
        });
    },

    getSignatures: (callback) => {
        const sql = `
            SELECT * FROM signatures
            WHERE archived = 0
        `;
        db.query(sql, (err, results) => {
            if (err) return callback(err, null);
            callback(null, results);
        });
    },

    getLowestBidderByPrId: (pr_id, callback) => {
        const sql = `
            SELECT r.company_name 
            FROM rfq r
            JOIN supplier_quotes sq ON r.pr_id = sq.pr_id
            WHERE r.pr_id = ?
            GROUP BY r.rfq_id
            ORDER BY sq.total_cost ASC
            LIMIT 1
        `;
        db.query(sql, [pr_id], (err, results) => {
            if (err) return callback(err, null);
            callback(null, results);
        });
    },

        // Fetch company name from the rfq table
        getCompanyNameByPrId: (pr_id, callback) => {
            const sql = `
                SELECT company_name 
                FROM rfq 
                WHERE pr_id = ?
            `;
            db.query(sql, [pr_id], (err, results) => {
                if (err) return callback(err, null);
                callback(null, results[0]);
            });
        },
    
        // Fetch city mayor from the signatures table
        getCityMayor: (callback) => {
            const sql = `
                SELECT employee_name 
                FROM employees 
                WHERE position = 'City Mayor'
            `;
            db.query(sql, (err, results) => {
                if (err) return callback(err, null);
                callback(null, results[0]);
            });
        },
    
        //purchase order

// Save purchase order
// In your rfqModel.js - make sure the savePurchaseOrder function handles null po_id
savePurchaseOrder: (data, callback) => {
  // First check if a PO exists for this PR
  const checkSql = `SELECT po_id FROM purchase_orders WHERE pr_id = ? LIMIT 1`;
 
  db.query(checkSql, [data.pr_id], (checkErr, checkResults) => {
    if (checkErr) return callback(checkErr, null);
   
    if (checkResults.length > 0 && data.po_id) {
      // Update existing record
      const po_id = data.po_id;
      const updateSql = `
        UPDATE purchase_orders
        SET
          company_name = ?,
          address = ?,
          tin = ?,
          date_issued = ?,
          mode_of_procurement = ?,
          place_of_delivery = ?,
          date_of_delivery = ?,
          delivery_term = ?,
          payment_term = ?,
          resolution_no = ?,
          secretary = ?
        WHERE po_id = ?
      `;
      const updateValues = [
        data.company_name,
        data.address,
        data.tin,
        data.date_issued,
        data.mode_of_procurement,
        data.place_of_delivery,
        data.date_of_delivery,
        data.delivery_term,
        data.payment_term,
        data.resolution_no,
        data.secretary,
        po_id
      ];
     
      db.query(updateSql, updateValues, (updateErr, updateResult) => {
        if (updateErr) return callback(updateErr, null);
        callback(null, { affectedRows: updateResult.affectedRows, po_id: po_id });
      });
    } else {
      // Insert new record (po_id will be auto-generated)
      const insertSql = `
        INSERT INTO purchase_orders
        (pr_id, company_name, address, tin, date_issued, mode_of_procurement, place_of_delivery, date_of_delivery, delivery_term, payment_term, resolution_no, secretary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const insertValues = [
        data.pr_id,
        data.company_name,
        data.address,
        data.tin,
        data.date_issued,
        data.mode_of_procurement,
        data.place_of_delivery,
        data.date_of_delivery,
        data.delivery_term,
        data.payment_term,
        data.resolution_no,
        data.secretary
      ];
      db.query(insertSql, insertValues, (insertErr, insertResult) => {
        if (insertErr) return callback(insertErr, null);
        callback(null, insertResult);
      });
    }
  });
},

savePurchaseOrderItem: (data, callback) => {
  // First check if item already exists for this PO
  const checkSql = `SELECT id FROM purchase_order_items WHERE po_id = ? AND item_id = ? LIMIT 1`;
  
  db.query(checkSql, [data.po_id, data.item_id], (checkErr, checkResults) => {
    if (checkErr) return callback(checkErr, null);
    
    if (checkResults.length > 0) {
      // Update existing item
      const updateSql = `
        UPDATE purchase_order_items 
        SET 
          stock_property_no = ?,
          unit = ?,
          item_description = ?,
          quantity = ?,
          unit_cost = ?,
          total_cost = ?,
          supplier_name = ?
        WHERE po_id = ? AND item_id = ?
      `;
      const updateValues = [
        data.stock_property_no,
        data.unit,
        data.item_description,
        data.quantity,
        data.unit_cost,
        data.total_cost,
        data.supplier_name,
        data.po_id,
        data.item_id
      ];
      
      db.query(updateSql, updateValues, (updateErr, updateResult) => {
        if (updateErr) return callback(updateErr, null);
        callback(null, updateResult);
      });
    } else {
      // Insert new item
      const insertSql = `
        INSERT INTO purchase_order_items 
        (po_id, item_id, stock_property_no, unit, item_description, quantity, unit_cost, total_cost, supplier_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const insertValues = [
        data.po_id,
        data.item_id,
        data.stock_property_no,
        data.unit,
        data.item_description,
        data.quantity,
        data.unit_cost,
        data.total_cost,
        data.supplier_name
      ];
      db.query(insertSql, insertValues, (insertErr, insertResult) => {
        if (insertErr) return callback(insertErr, null);
        callback(null, insertResult);
      });
    }
  });
},

// Get purchase order by PR ID
getPurchaseOrderByPrId: (pr_id, callback) => {
  const sql = `
      SELECT 
          po_id,
          pr_id,
          company_name, 
          address, 
          tin, 
          date_issued, 
          DATE_FORMAT(date_issued, '%Y-%m-%d') as date_issued, 
          mode_of_procurement,
          place_of_delivery, 
          DATE_FORMAT(date_of_delivery, '%Y-%m-%d') as date_of_delivery, 
          delivery_term, 
          payment_term, 
          resolution_no, 
          secretary
      FROM purchase_orders
      WHERE pr_id = ?
      ORDER BY date_issued DESC
      LIMIT 1
  `;
  db.query(sql, [pr_id], (err, results) => {
      if (err) return callback(err, null);
      callback(null, results[0]); // Return the most recent PO for this PR
  });
},

        getItemsWithLowestPrice: (pr_id, callback) => {
            // First, get the PO ID for this PR
            const getPoIdSql = `SELECT po_id FROM purchase_orders WHERE pr_id = ? LIMIT 1`;
            
            db.query(getPoIdSql, [pr_id], (poIdErr, poIdResults) => {
                if (poIdErr) return callback(poIdErr, null);
                
                const po_id = poIdResults[0]?.po_id;
                
                // Then, fetch items with lowest price, stock property numbers, mode_of_procurement, and company name
                const itemsSql = `
                    SELECT 
                        sq.item_id, 
                        sq.supplier_name, 
                        sq.unit_cost, 
                        sq.total_cost, 
                        pri.item_description, 
                        pri.quantity, 
                        pri.unit,
                        poi.stock_property_no,
                        po.mode_of_procurement,
                        po.company_name AS supplier_company_name
                    FROM supplier_quotes sq
                    JOIN purchase_request_items pri ON sq.item_id = pri.item_id
                    LEFT JOIN purchase_order_items poi ON sq.item_id = poi.item_id AND poi.po_id = ?
                    LEFT JOIN purchase_orders po ON po.po_id = poi.po_id
                    INNER JOIN (
                        SELECT item_id, MIN(total_cost) AS min_total_cost
                        FROM supplier_quotes
                        WHERE pr_id = ?
                        GROUP BY item_id
                    ) AS lowest ON sq.item_id = lowest.item_id AND sq.total_cost = lowest.min_total_cost
                    WHERE sq.pr_id = ?
                `;
                
                db.query(itemsSql, [po_id, pr_id, pr_id], (itemsErr, itemsResults) => {
                    if (itemsErr) return callback(itemsErr, null);
                    callback(null, itemsResults);
                });
            });
        },
                
        getPurchaseOrderDetails: (pr_id, callback) => {
            const sql = `
                SELECT pr_no
                FROM purchase_orders
                WHERE pr_id = ?
            `;
            db.query(sql, [pr_id], (err, results) => {
                if (err) return callback(err, null);
                callback(null, results[0]); // Return the first row
            });
        },

// In rfqModel.js
getBacMembers: (callback) => {
  const sql = `
    SELECT 
      e.employee_id,
      e.employee_name,
      e.position,
      b.bac_position,
      b.display_order
    FROM employees e
    JOIN bac_members b ON e.employee_id = b.employee_id
    WHERE b.is_active = 1
    ORDER BY 
      CASE 
        WHEN b.bac_position = 'Member' THEN 1
        WHEN b.bac_position = 'Vice Chair' THEN 2
        WHEN b.bac_position = 'Chair' THEN 3
        WHEN b.bac_position = 'Approved by' THEN 4
        ELSE 5
      END,
      b.display_order
  `;
  db.query(sql, (err, results) => {
    if (err) return callback(err, null);
    callback(null, results);
  });
}    
};


module.exports = rfqModel;

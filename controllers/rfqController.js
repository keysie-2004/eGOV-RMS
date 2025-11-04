const rfqModel = require('../models/rfqModel');
const db = require('../config/db');
const { generateToken, verifyToken, decodeToken } = require('../utils/token');
const jwt = require('jsonwebtoken'); 

// In rfqController.js
exports.showRfqPage = async (req, res) => {
try {
// ✅ Ensure user data exists
if (!req.user) {
console.log('No user found in request');
return res.redirect('/homepage');
}

// ✅ Extract user info
const user = {
  user_id: req.user.user_id,
  employee_name: req.user.employee_name,
  user_type: req.user.user_type,
  department_id: req.user.department_id,
  department_name: req.user.department_name || req.user.department,
};

console.log('User data:', user);

const isAdmin = user.user_type === 'admin' || user.user_type === 'superadmin';
let categorizedItems;

if (isAdmin) {
  // ✅ Admin or Superadmin: Fetch all RFQs
  console.log('Fetching all RFQs for admin/superadmin');
  categorizedItems = await new Promise((resolve, reject) => {
    rfqModel.getAllApprovedPurchaseRequestsCategorized((err, results) => {
      if (err) {
        console.error('Error fetching all RFQs:', err);
        reject(err);
      } else {
        console.log(`Fetched ${results.all.length} RFQs for admin`);
        resolve(results);
      }
    });
  });

} else {
  // ✅ Regular user: Fetch by department_id
  const department = user.department_id;

  if (!department) {
    console.error('No department found for user:', user);
    return res.status(400).render('error', {
      message: 'User department not found. Please contact the administrator.',
      user
    });
  }

  console.log(`Fetching RFQs for department_id: ${department}`);

  categorizedItems = await new Promise((resolve, reject) => {
    rfqModel.getApprovedPurchaseRequestsByDepartmentCategorized(department, (err, results) => {
      if (err) {
        console.error('Error fetching department RFQs:', err);
        reject(err);
      } else {
        console.log(`Fetched ${results.all.length} RFQs for department ${department}`);
        resolve(results);
      }
    });
  });
}

// ✅ Add JWT token for each item
const addTokens = (items) =>
  items.map((item) => ({
    ...item,
    token: generateToken(item.pr_id),
  }));

// ✅ Optional: Debug output to confirm data
console.log('Sample categorized items:', categorizedItems.all.map(r => ({
  pr_id: r.pr_id,
  department_name: r.department_name
})));

// ✅ Render the page
res.render('rfq', {
  allItems: addTokens(categorizedItems.all),
  completedItems: addTokens(categorizedItems.completed),
  inProgressItems: addTokens(categorizedItems.inProgress),
  user,
  activeTab: req.query.tab || 'all',
});




} catch (error) {
console.error('Error fetching approved purchase requests:', error);
res.status(500).json({ success: false, message: 'Server error' });
}
};

//rfqForm.ejs

exports.showRfqForm = async (req, res) => {
  const { token } = req.params;

  if (!token) {
    return res.status(400).json({ 
      success: false, 
      message: 'PR token is required',
      user: req.user || null 
    });
  }

  try {
    const pr_id = decodeToken(token);

    if (!req.user) {
      console.log('No user found in request');
      return res.redirect('/homepage');
    }

    const user = {
      ...req.user,
      department: req.user.department || req.user.department_name
    };

    const [purchaseRequest, items, allSuppliers, requestorAndBac] = await Promise.all([
      new Promise((resolve, reject) => {
        rfqModel.getPurchaseRequestById(pr_id, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      }),
      new Promise((resolve, reject) => {
        rfqModel.getItemsByPrId(pr_id, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      }),
      new Promise((resolve, reject) => {
        rfqModel.getSuppliersByPrId(pr_id, (err, results) => {
          if (err) reject(err);
          else resolve(results || []);
        });
      }),
      new Promise((resolve, reject) => {
        rfqModel.getRequestorAndBacSecretariat(pr_id, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      })
    ]);

    if (!purchaseRequest) {
      return res.status(404).render('error', {
        message: 'Purchase request not found',
        user: user
      });
    }

    const purchaseRequestWithToken = {
      ...purchaseRequest,
      token: generateToken(purchaseRequest.pr_id),
    };

    const defaultSuppliers = ['Supplier 1', 'Supplier 2', 'Supplier 3'];
    const existingSupplierNames = allSuppliers.map(s => s.supplier_name);
    
    defaultSuppliers.forEach(supplierName => {
      if (!existingSupplierNames.includes(supplierName)) {
        allSuppliers.push({ supplier_name: supplierName });
      }
    });

    const limitedSuppliers = allSuppliers.slice(0, 3);

    const suppliersWithData = await Promise.all(
      limitedSuppliers.map(async (supplier) => {
        try {
          const rfqAndQuotes = await new Promise((resolve, reject) => {
            rfqModel.getRfqAndQuotesBySupplier(pr_id, supplier.supplier_name, (err, results) => {
              if (err) reject(err);
              else resolve(results || []);
            });
          });

          return {
            supplier_name: supplier.supplier_name,
            rfq: rfqAndQuotes[0] || null,
            quotes: rfqAndQuotes
          };
        } catch (error) {
          console.error(`Error processing supplier ${supplier.supplier_name}:`, error);
          return {
            supplier_name: supplier.supplier_name,
            rfq: null,
            quotes: []
          };
        }
      })
    );

    res.render('rfqForm', { 
      purchaseRequest: purchaseRequestWithToken,
      items, 
      suppliers: suppliersWithData, 
      pr_id: pr_id,
      requestorAndBac: requestorAndBac, // Pass requestor and BAC Secretariat details
      user: user, 
      currentPath: req.path 
    });
  } catch (error) {
    console.error('Error in showRfqForm:', error);
    res.status(500).render('error', {
      message: 'Failed to load RFQ form',
      user: req.user || null
    });
  }
};

exports.saveSupplierQuotes = async (req, res) => {
  const { 
    pr_id,
    supplier_name,
    company_name,
    date_sent,
    quotation_number,
    printed_name,
    contact,
    date,
    items,
    total
  } = req.body;

  console.log('Received data:', req.body); 

  if (!pr_id || !supplier_name || !items || items.length === 0) {
    console.error('Missing required fields');
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  try {
    // First, save/update RFQ details
    await new Promise((resolve, reject) => {
      // Check if RFQ exists for this supplier
      const checkSql = `SELECT * FROM rfq WHERE pr_id = ? AND supplier_name = ?`;
      db.query(checkSql, [pr_id, supplier_name], (err, results) => {
        if (err) return reject(err);

        if (results.length > 0) {
          // Update existing RFQ
          const updateSql = `
            UPDATE rfq SET
              company_name = ?,
              date_sent = ?,
              quotation_number = ?,
              printed_name = ?,
              contact = ?,
              date = ?
            WHERE pr_id = ? AND supplier_name = ?
          `;
          db.query(updateSql, [
            company_name,
            date_sent,
            quotation_number,
            printed_name,
            contact,
            date,
            pr_id,
            supplier_name
          ], (err, result) => {
            if (err) return reject(err);
            resolve(result);
          });
        } else {
          // Insert new RFQ
          const insertSql = `
            INSERT INTO rfq 
            (pr_id, supplier_name, company_name, date_sent, quotation_number, printed_name, contact, date) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `;
          db.query(insertSql, [
            pr_id,
            supplier_name,
            company_name,
            date_sent,
            quotation_number,
            printed_name,
            contact,
            date
          ], (err, result) => {
            if (err) return reject(err);
            resolve(result);
          });
        }
      });
    });

    // Then save/update each item quote
    await Promise.all(items.map(item => {
      return new Promise((resolve, reject) => {
        // Check if quote exists for this item
        const checkSql = `SELECT * FROM supplier_quotes WHERE pr_id = ? AND supplier_name = ? AND item_id = ?`;
        db.query(checkSql, [pr_id, supplier_name, item.item_id], (err, results) => {
          if (err) return reject(err);

          if (results.length > 0) {
            // Update existing quote
            const updateSql = `
              UPDATE supplier_quotes SET
                brand = ?,
                unit_cost = ?,
                total_cost = ?,
                total = ?
              WHERE pr_id = ? AND supplier_name = ? AND item_id = ?
            `;
            db.query(updateSql, [
              item.brand,
              item.unit_cost,
              item.total_cost,
              total,
              pr_id,
              supplier_name,
              item.item_id
            ], (err, result) => {
              if (err) return reject(err);
              resolve(result);
            });
          } else {
            // Insert new quote
            const insertSql = `
              INSERT INTO supplier_quotes 
              (pr_id, supplier_name, item_id, brand, unit_cost, total_cost, total) 
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            db.query(insertSql, [
              pr_id,
              supplier_name,
              item.item_id,
              item.brand,
              item.unit_cost,
              item.total_cost,
              total
            ], (err, result) => {
              if (err) return reject(err);
              resolve(result);
            });
          }
        });
      });
    }));

    // Fetch updated data to return
    const updatedData = await new Promise((resolve, reject) => {
      rfqModel.getRfqAndQuotesBySupplier(pr_id, supplier_name, (err, results) => {
        if (err) return reject(err);
        resolve(results);
      });
    });

    res.json({ 
      success: true, 
      message: 'Supplier quotes saved successfully',
      data: updatedData
    });

  } catch (error) {
    console.error('Error saving supplier quotes:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
};

exports.getSupplierQuoteByPrIdAndSupplier = async (req, res) => {
  const { pr_id, supplier_name, item_id } = req.params;

  if (!pr_id || !supplier_name || !item_id) {
    return res.status(400).json({ success: false, message: 'PR ID, Supplier Name, and Item ID are required' });
  }

  try {
    const supplierQuotes = await new Promise((resolve, reject) => {
      rfqModel.getSupplierQuotesByPrIdAndSupplier(pr_id, supplier_name, item_id, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    // Log the fetched data
    console.log('Fetched Supplier Quotes:', supplierQuotes);

    res.json({ success: true, supplierQuotes });
  } catch (error) {
    console.error('Error fetching supplier quotes:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Render the list of approved purchase requests
exports.showPurchaseRequestItems = async (req, res) => {
    try {
        const items = await new Promise((resolve, reject) => {
            rfqModel.getApprovedPurchaseRequestItems((err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        res.render('rfq', { items });
    } catch (error) {
        console.error('Error fetching purchase request items:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.updateSupplierQuote = async (req, res) => {
  const formData = req.body;

  try {
    await new Promise((resolve, reject) => {
      rfqModel.updateSupplierQuote(formData, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    res.json({ success: true, message: 'Supplier quote updated successfully' });
  } catch (error) {
    console.error('Error updating supplier quote:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.saveProjectQuotes = async (req, res) => {
    const formData = req.body;

    // Debugging: Log the form data
    console.log('Form Data:', formData);

    const {
        project_description,
        department,
        pr_id
    } = formData;

    // Extract supplier prices for each item
    const items = [];
    Object.keys(formData).forEach(key => {
        if (key.startsWith('supplier1_price_')) {
            const itemId = key.replace('supplier1_price_', '');
            items.push({
                item_id: itemId,
                supplier1_price: parseFloat(formData[key]),
                supplier2_price: parseFloat(formData[`supplier2_price_${itemId}`]),
                supplier3_price: parseFloat(formData[`supplier3_price_${itemId}`])
            });
        }
    });

    // Find the lowest price for each item
    const lowestPrices = items.map(item => {
        const lowestPrice = Math.min(item.supplier1_price, item.supplier2_price, item.supplier3_price);
        return {
            ...item,
            lowest_price: lowestPrice
        };
    });

    try {
        // Save project quotes to supplier_quotes table
        const result = await new Promise((resolve, reject) => {
            rfqModel.saveProjectQuotes(
                {
                    pr_id,
                    project_description,
                    department,
                    items: lowestPrices
                },
                (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                }
            );
        });

        res.status(201).json({ success: true, message: 'Project quotes saved successfully' });
    } catch (error) {
        console.error('Error saving project quotes:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Helper function to format date for display
function formatDateForDisplay(dateString) {
  if (!dateString) return null;

  const date = new Date(dateString);
  return date.toLocaleDateString('en-CA'); // outputs YYYY-MM-DD format in local timezone
}
  
exports.showAbstractForm = async (req, res) => {
  const { token } = req.params;

  if (!token) {
      return res.status(400).json({ 
          success: false, 
          message: 'PR token is required',
          user: req.user || null 
      });
  }

  try {
      const pr_id = decodeToken(token);

      const [purchaseRequest, items, supplierQuotes, abstract] = await Promise.all([
          new Promise((resolve, reject) => {
              rfqModel.getPurchaseRequestById(pr_id, (err, results) => {
                  if (err) reject(err);
                  else resolve(results);
              });
          }),
          new Promise((resolve, reject) => {
              rfqModel.getItemsByPrId(pr_id, (err, results) => {
                  if (err) reject(err);
                  else resolve(results);
              });
          }),
          new Promise((resolve, reject) => {
              rfqModel.getSupplierQuotesWithCompanyNamesByPrId(pr_id, (err, results) => {
                  if (err) reject(err);
                  else resolve(results || []);
              });
          }),
          new Promise((resolve, reject) => {
              rfqModel.getAbstractByPrId(pr_id, (err, results) => {
                  if (err) reject(err);
                  else resolve(results || null);
              });
          })
      ]);

      if (!purchaseRequest) {
          return res.status(404).send('Purchase request not found');
      }

      // Get BAC members from employees table
      const specificBacMembers = await new Promise((resolve, reject) => {
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
          `;
          db.query(sql, (err, results) => {
              if (err) reject(err);
              else resolve(results);
          });
      });

      // Get saved BAC members if abstract exists
      let abstractBacMembers = [];
      if (abstract) {
          abstractBacMembers = await new Promise((resolve, reject) => {
              rfqModel.getAbstractBacMembers(abstract.abstract_id, (err, results) => {
                  if (err) reject(err);
                  else resolve(results || []);
              });
          });
      }

      // Use saved members if they exist, otherwise use all specific members
      const displayBacMembers = abstractBacMembers.length > 0 ? abstractBacMembers : specificBacMembers;

      // Group BAC members for display
      const groupedBacMembers = {
        chairperson: displayBacMembers.find(m => m.bac_position.includes('Chairperson') && !m.bac_position.includes('Vice')),
        viceChairperson: displayBacMembers.find(m =>
          m.bac_position.includes('Vice') && m.bac_position.includes('Chairperson')),
          members: displayBacMembers.filter(m => m.bac_position.includes('Member') && !m.bac_position.includes('Vice')),
        approvedBy: displayBacMembers.find(m => m.bac_position.includes('Approved by'))
      };
      
      // Fix date display issue
      let correctedAbstract = abstract;
      if (abstract && abstract.date) {
          correctedAbstract = {
              ...abstract,
              displayDate: formatDateForDisplay(abstract.date)
          };
      }

      res.render('abstract', {
          purchaseRequest: {
              ...purchaseRequest,
              token: generateToken(purchaseRequest.pr_id),
          },
          items,
          supplierQuotes,
          companyNames: [...new Set(supplierQuotes.map(sq => sq.company_name))],
          abstractBacMembers: displayBacMembers, // Pass this to the view
          groupedBacMembers, // Pass the grouped members
          abstract: correctedAbstract,
          user: req.user,
          currentPath: req.path,
      });

  } catch (error) {
      console.error('Error in showAbstractForm:', error);
      res.status(500).send(`
          <h1>Server Error</h1>
          <p>${error.message}</p>
          ${req.user ? `<p>Logged in as: ${req.user.employee_name}</p>` : ''}
      `);
  }
};

exports.saveOrUpdateAbstract = async (req, res) => {
  try {
      const { pr_id, date } = req.body;
      
      if (!pr_id || !date) {
          return res.status(400).json({ 
              success: false, 
              message: 'pr_id and date are required' 
          });
      }

      // Get the specific BAC members from employees table
      const specificBacMembers = await new Promise((resolve, reject) => {
          const sql = `
              SELECT 
                  employee_id,
                  employee_name,
                  position,
                  bac_position
              FROM 
                  employees 
              WHERE 
                  bac_position LIKE '%BAC Chairperson%' OR
                  bac_position LIKE '%BAC Vice - Chairperson%' OR
                  bac_position LIKE '%BAC Member%' OR
                  bac_position LIKE '%Approved by%'
          `;
          db.query(sql, (err, results) => {
              if (err) reject(err);
              else resolve(results);
          });
      });

      // Save to database
      rfqModel.saveOrUpdateAbstract({
          pr_id,
          date,
          bacMembers: specificBacMembers
      }, (err, result) => {
          if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ 
                  success: false, 
                  message: err.message || 'Error saving abstract' 
              });
          }
          
          res.json({ 
              success: true, 
              message: 'Abstract saved successfully',
              data: result
          });
      });
  } catch (error) {
      console.error('Controller error:', error);
      res.status(500).json({ 
          success: false, 
          message: error.message 
      });
  }
};

exports.getAbstractByPrId = async (req, res) => {
  try {
      const { pr_id } = req.params;
      rfqModel.getAbstractByPrId(pr_id, (err, abstract) => {
          if (err) {
              console.error('Error fetching abstract:', err);
              return res.status(500).json({ 
                  success: false, 
                  message: 'Error fetching abstract' 
              });
          }
          res.json({ 
              success: true, 
              abstract: abstract || null 
          });
      });
  } catch (error) {
      console.error('Controller error:', error);
      res.status(500).json({ 
          success: false, 
          message: error.message 
      });
  }
};

exports.saveAcceptance = async (req, res) => {
    const { pr_id, philgeps_reg_no, date } = req.body;

    try {
        // Check if an entry already exists for the given pr_id
        const existingEntry = await new Promise((resolve, reject) => {
            rfqModel.getAcceptanceByPrId(pr_id, (err, results) => {
                if (err) reject(err);
                else resolve(results[0]); // Return the first row (if it exists)
            });
        });

        const result = await new Promise((resolve, reject) => {
            if (existingEntry) {
                // Update existing entry
                rfqModel.editAcceptance(
                    { pr_id, philgeps_reg_no, date },
                    (err, result) => {
                        if (err) reject(err);
                        else resolve({ result, action: 'updated' });
                    }
                );
            } else {
                // Insert new entry
                rfqModel.saveAcceptance(
                    { pr_id, philgeps_reg_no, date },
                    (err, result) => {
                        if (err) reject(err);
                        else resolve({ result, action: 'saved' });
                    }
                );
            }
        });

        const message = result.action === 'updated' 
            ? 'Acceptance updated successfully' 
            : 'Acceptance saved successfully';
        const statusCode = result.action === 'updated' ? 200 : 201;

        res.status(statusCode).json({ success: true, message });
    } catch (error) {
        console.error('Error saving/updating acceptance:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.showAcceptance = async (req, res) => {
    const { token } = req.params;

    if (!token) {
        return res.status(400).json({
            success: false,
            message: 'PR token is required',
            user: req.user || null,
        });
    }

    try {
        const pr_id = decodeToken(token);

        const [purchaseRequest, items, supplierQuotes, acceptanceData, bacMembers, lowestQuotes, lowestBidder] = await Promise.all([
            new Promise((resolve, reject) => {
                rfqModel.getPurchaseRequestById(pr_id, (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                });
            }),
            new Promise((resolve, reject) => {
                rfqModel.getItemsByPrId(pr_id, (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                });
            }),
            new Promise((resolve, reject) => {
                rfqModel.getSupplierQuotesByPrId(pr_id, (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                });
            }),
            new Promise((resolve, reject) => {
                rfqModel.getAcceptanceByPrId(pr_id, (err, results) => {
                    if (err) reject(err);
                    else resolve(results[0]);
                });
            }),
            new Promise((resolve, reject) => {
                rfqModel.getSpecificBacMembers((err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                });
            }),
            new Promise((resolve, reject) => {
                rfqModel.getLowestQuotesByPrId(pr_id, (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                });
            }),
            new Promise((resolve, reject) => {
                rfqModel.getLowestBidderByPrId(pr_id, (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                });
            }),
        ]);

        if (!purchaseRequest) {
            return res.status(404).render('error', {
                message: 'Purchase request not found',
                user: req.user,
            });
        }

        // Calculate total from lowest quotes
        const total = lowestQuotes.reduce((sum, quote) => sum + parseFloat(quote.total_cost), 0);

        // Map items with lowest quotes and company names
        const itemsWithDetails = items.map(item => {
            const lowestQuote = lowestQuotes.find(q => q.item_id === item.item_id);
            return {
                ...item,
                supplier_name: lowestQuote ? lowestQuote.supplier_name : 'N/A',
                unit_price: lowestQuote ? lowestQuote.unit_cost : 'N/A',
                total_price: lowestQuote ? lowestQuote.total_cost : 'N/A',
                philgeps_reg_no: lowestQuote ? lowestQuote.philgeps_reg_no : 'N/A'
            };
        });

        // Get company name for lowest bidder
        const lowestBidderDisplay = lowestBidder ? lowestBidder.company_name : 'N/A';

        const abstract = {
            pr_id: purchaseRequest.pr_id,
            project_description: purchaseRequest.purpose,
            department: purchaseRequest.department,
            items: itemsWithDetails,
            total: total.toFixed(2), // Use calculated total from lowest quotes
            acceptanceData: acceptanceData ? {
                ...acceptanceData,
                date: formatDateForDisplay(acceptanceData.date)
            } : null,
            bacMembers: bacMembers,
            lowest_bidder: lowestBidderDisplay,
            lowest_quotes: lowestQuotes
        };

        const abstractWithToken = {
            ...abstract,
            token: generateToken(abstract.pr_id),
        };

        res.render('acceptance', { abstract: abstractWithToken, purchaseRequest, user: req.user });
    } catch (error) {
        console.error('Error fetching data for acceptance page:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.editAcceptance = async (req, res) => {
    const { pr_id, philgeps_reg_no, date } = req.body;

    try {
        // Update the acceptance data in the database
        const result = await new Promise((resolve, reject) => {
            rfqModel.editAcceptance(
                { pr_id, philgeps_reg_no, date },
                (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                }
            );
        });

        // Send a success response
        res.status(200).json({ success: true, message: 'Acceptance updated successfully' });
    } catch (error) {
        console.error('Error updating acceptance:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Helper function to convert numbers to words
function convertToWords(num) {
    const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
    const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "Ten", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    if (num === 0) return "Zero";

    let words = "";
    if (num >= 1000) {
        words += units[Math.floor(num / 1000)] + " Thousand ";
        num %= 1000;
    }
    if (num >= 100) {
        words += units[Math.floor(num / 100)] + " Hundred ";
        num %= 100;
    }
    if (num >= 20) {
        words += tens[Math.floor(num / 10)] + " ";
        num %= 10;
    } else if (num >= 10) {
        words += teens[num - 10] + " ";
        num = 0;
    }
    if (num > 0) {
        words += units[num] + " ";
    }
    return words.trim() + " Pesos Only";
}

exports.showPurchaseOrder = async (req, res) => {
  const { token } = req.params;

  if (!token) {
    return res.status(400).json({
      success: false,
      message: 'PR token is required',
    });
  }

  try {
    const pr_id = decodeToken(token);

    // Fetch all data in parallel for better performance
    const [company, items, existingPO, mayor] = await Promise.all([
      new Promise((resolve, reject) => {
        rfqModel.getCompanyNameByPrId(pr_id, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      }),
      new Promise((resolve, reject) => {
        rfqModel.getItemsWithLowestPrice(pr_id, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      }),
      new Promise((resolve, reject) => {
        rfqModel.getPurchaseOrderByPrId(pr_id, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      }),
      new Promise((resolve, reject) => {
        rfqModel.getCityMayor((err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      })
    ]);

    const totalAmount = items.reduce((sum, item) => sum + item.total_cost, 0);
    const totalAmountInWords = convertToWords(totalAmount);

    const purchaseOrderData = {
      po_id: existingPO?.po_id || null,
      pr_id,
      company_name: company ? company.company_name : 'N/A',
      items: items || [],
      totalAmount: totalAmount,
      totalAmountInWords: totalAmountInWords,
      mayor_name: mayor ? mayor.employee_name : 'Paulino Salvador Leachon', // Fallback to default if not found
      ...(existingPO ? existingPO : {}),
    };

    res.render('purchaseOrder', { purchaseOrderData, user: req.user });
  } catch (error) {
    console.error('Error fetching data for purchase order:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.savePurchaseOrder = async (req, res) => {
  console.log('Received purchase order data:', req.body);
  
  try {
    const {
      pr_id,
      po_id, // This can be null for new POs
      company_name,
      address,
      tin,
      date_issued,
      mode_of_procurement,
      place_of_delivery,
      date_of_delivery,
      delivery_term,
      payment_term,
      resolution_no,
      secretary,
      items,
      totalAmount,
      totalAmountInWords
    } = req.body;

    // Validate required fields (but po_id is optional)
    if (!pr_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'PR ID is required' 
      });
    }

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Items array is required' 
      });
    }

    // Validate each item has required fields
    for (const item of items) {
      if (!item.item_id) {
        return res.status(400).json({ 
          success: false, 
          message: 'All items must have an item_id' 
        });
      }
    }

    // Save/update purchase order - po_id can be null
    const purchaseOrderResult = await new Promise((resolve, reject) => {
      rfqModel.savePurchaseOrder(
        {
          pr_id,
          po_id: po_id || null, // Explicitly set to null if empty
          company_name,
          address,
          tin,
          date_issued,
          mode_of_procurement,
          place_of_delivery,
          date_of_delivery,
          delivery_term,
          payment_term,
          resolution_no,
          secretary
        },
        (err, result) => {
          if (err) {
            console.error('Database error saving purchase order:', err);
            reject(err);
          } else {
            resolve(result);
          }
        }
      );
    });
   
    // Get the PO ID (either from insert or update)
    const newPoId = purchaseOrderResult.insertId || purchaseOrderResult.po_id || po_id;
   
    if (!newPoId) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to save purchase order - no PO ID returned' 
      });
    }

    // Save/update items
    for (const item of items) {
      await new Promise((resolve, reject) => {
        rfqModel.savePurchaseOrderItem(
          {
            po_id: newPoId,
            item_id: item.item_id,
            stock_property_no: item.stock_property_no || '',
            unit: item.unit,
            item_description: item.item_description,
            quantity: item.quantity,
            unit_cost: item.unit_cost,
            total_cost: item.total_cost,
            supplier_name: item.supplier_name
          },
          (err, result) => {
            if (err) {
              console.error('Database error saving purchase order item:', err);
              reject(err);
            } else {
              resolve(result);
            }
          }
        );
      });
    }

    console.log('Purchase order saved successfully with PO ID:', newPoId);
    
    // Return success with the PO ID
    res.json({
      success: true,
      message: 'Purchase order saved successfully',
      po_id: newPoId,
      pr_id: pr_id
    });

  } catch (error) {
    console.error('Error saving purchase order:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error: ' + error.message 
    });
  }
};
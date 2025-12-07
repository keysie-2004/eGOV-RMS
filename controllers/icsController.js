const ICSModel = require('../models/icsModel');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const db = require('../config/db');

class ICSController {
    static async showScanner(req, res) {
        try {
            const statistics = await ICSModel.getScanStatistics();
            res.render('scanner', { 
                title: 'ICS Inventory Scanner',
                statistics 
            });
        } catch (error) {
            console.error('Error rendering scanner page:', error);
            res.status(500).send('Internal Server Error');
        }
    }

static async handleScan(req, res) {
    try {
        const { qrCode, scanType, condition_code } = req.body;
        
        if (!['first', 'second'].includes(scanType)) {
            return res.status(400).json({ success: false, message: 'Invalid scan type' });
        }
        
        // Validate condition_code (should be 1-4)
        if (condition_code) {
            const conditionInt = parseInt(condition_code);
            if (isNaN(conditionInt) || conditionInt < 1 || conditionInt > 4) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Invalid condition code. Must be 1-4 (1=Serviceable, 2=Unserviceable, 3=Donation, 4=For Monitoring)' 
                });
            }
        }
        
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const validFirstScan = currentMonth >= 1 && currentMonth <= 6;
        const validSecondScan = currentMonth >= 7 && currentMonth <= 12;
        
        if ((scanType === 'first' && !validFirstScan) || (scanType === 'second' && !validSecondScan)) {
            return res.status(400).json({
                success: false,
                message: `Scan type "${scanType}" is not valid for the current month (${currentMonth})`
            });
        }
        
        const item = await ICSModel.getItemByQRCode(qrCode);
        
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }
        
        if (item.unit_of_value <= 50000) {
            return res.status(400).json({ 
                success: false, 
                message: 'Scanning is only allowed for items with value above ₱50,000' 
            });
        }
        
        if ((scanType === 'first' && item.first_scan_date) ||
            (scanType === 'second' && item.second_scan_date)) {
            return res.status(400).json({
                success: false,
                message: `Item already scanned for ${scanType} scan period`
            });
        }
        
        if (item.status === 'archived') {
            return res.status(400).json({
                success: false,
                message: 'Cannot scan archived item'
            });
        }
        
        const scanDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
        await ICSModel.updateScanStatus(item.id, scanType, scanDate, condition_code);
        
        const updatedItem = await ICSModel.getItemById(item.id);
        res.json({
            success: true,
            message: 'Scan successful',
            item: updatedItem
        });
    } catch (error) {
        console.error('Error handling scan:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal Server Error',
            error: error.message 
        });
    }
}

    static async getStatistics(req, res) {
        try {
            const statistics = await ICSModel.getScanStatistics();
            res.json({ 
                success: true, 
                statistics 
            });
        } catch (error) {
            console.error('Error getting statistics:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Internal Server Error',
                error: error.message 
            });
        }
    }

    static async getItemDetails(req, res) {
        try {
            const { id } = req.params;
            const item = await ICSModel.getItemById(id);
            
            if (!item) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Item not found' 
                });
            }

            // Format currency values
            const formattedItem = {
                ...item,
                unit_of_value: item.unit_of_value ? `₱${parseFloat(item.unit_of_value).toLocaleString()}` : 'N/A',
                balcard: item.balcard ? `₱${parseFloat(item.balcard).toLocaleString()}` : 'N/A',
                onhand: item.onhand ? `₱${parseFloat(item.onhand).toLocaleString()}` : 'N/A',
                department_name: item.department_name || item.dept || 'N/A'
            };

            res.json({ 
                success: true, 
                item: formattedItem 
            });
        } catch (error) {
            console.error('Error getting item details:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Internal Server Error',
                error: error.message 
            });
        }
    }
    
    static async showInventory(req, res) {
        try {
            res.render('ics', { 
                title: 'ICS Inventory',
                user: req.user
            });
        } catch (error) {
            console.error('Error rendering inventory page:', error);
            res.status(500).send('Internal Server Error');
        }
    }

    static async updateItemClassifications(smallItems, mediumItems, largeItems) {
        try {
            for (const item of smallItems) {
                await db.query(
                    'UPDATE ics SET item_classification = ? WHERE id = ?',
                    [item.item_classification, item.id]
                );
            }
            for (const item of mediumItems) {
                await db.query(
                    'UPDATE ics SET item_classification = ? WHERE id = ?',
                    [item.item_classification, item.id]
                );
            }
            for (const item of largeItems) {
                await db.query(
                    'UPDATE ics SET item_classification = ? WHERE id = ?',
                    [item.item_classification, item.id]
                );
            }
        } catch (error) {
            console.error('Error updating item classifications:', error);
            throw error;
        }
    }
    
static async generateQRCode(req, res) {
    try {
        const { id } = req.params;
        const item = await ICSModel.getItemById(id);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }
        if (item.unit_of_value <= 50000) {
            return res.status(400).json({ success: false, message: 'QR code generation is only allowed for items with value above ₱50,000' });
        }
        const qrCodeData = JSON.stringify({
            id: item.id,
            property_no: item.property_no,
            description: item.description,
            dept: item.dept,
            unit_value: item.unit_of_value,
            date_acq: item.date_acq
        });
        const qrCodePath = await ICSController.generateQRCodeImage(qrCodeData, item.id);
        await db.query(
            'UPDATE ics SET qr_code_path = ? WHERE id = ?',
            [qrCodePath, id]
        );
        res.json({
            success: true,
            message: 'QR code generated successfully',
            qrCodePath
        });
    } catch (error) {
        console.error('Error generating QR code:', error);
        res.status(500).json({
            success: false,
            message: 'Internal Server Error',
            error: error.message
        });
    }
}

    static async generateQRCodeImage(data, itemId) {
        try {
            const uploadDir = path.join(__dirname, '../public/qrcodes');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            const filePath = path.join(uploadDir, `qrcode-${itemId}.png`);
            const qrCodeUrl = `/qrcodes/qrcode-${itemId}.png`;
            await QRCode.toFile(filePath, data, {
                color: {
                    dark: '#000000',
                    light: '#ffffff00'
                },
                width: 300,
                margin: 2,
                errorCorrectionLevel: 'H'
            });
            return qrCodeUrl;
        } catch (error) {
            console.error('Error in generateQRCodeImage:', error);
            throw error;
        }
    }

static async generateAllMissingQRCodes(req, res) {
    try {
        const query = 'SELECT * FROM ics WHERE (qr_code_path IS NULL OR qr_code_path = "") AND unit_of_value > 50000 AND (status IS NULL OR status != "archived")';
        const items = await db.query(query);
        let generatedCount = 0;
        const errors = [];
        for (const item of items) {
            try {
                const qrCodeData = JSON.stringify({
                    id: item.id,
                    property_no: item.property_no,
                    description: item.description,
                    dept: item.dept
                });
                const qrCodePath = await ICSController.generateQRCodeImage(qrCodeData, item.id);
                await db.query(
                    'UPDATE ics SET qr_code_path = ? WHERE id = ?',
                    [qrCodePath, item.id]
                );
                generatedCount++;
            } catch (error) {
                errors.push({
                    itemId: item.id,
                    error: error.message
                });
            }
        }
        res.json({
            success: true,
            message: `Generated ${generatedCount} QR codes`,
            totalItems: items.length,
            generatedCount,
            errorCount: errors.length,
            errors
        });
    } catch (error) {
        console.error('Error in generateAllMissingQRCodes:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating QR codes',
            error: error.message
        });
    }
}

    static async getItemsByClassification(req, res) {
        try {
            const { classification } = req.params;
            const { draw, start, length, search, order, columns } = req.body;

            // Validate classification
            const classificationRanges = {
                small: { min: 0, max: 5000, label: 'Property Small (<₱5,000)' },
                medium: { min: 5000, max: 50000, label: 'Semi-Expendable (₱5,000-₱50,000)' },
                large: { min: 50000, max: Infinity, label: 'Property, Plant & Equipment (>₱50,000)' }
            };

            const range = classificationRanges[classification];
            if (!range) {
                return res.status(400).json({ error: 'Invalid classification' });
            }

            // Build base query
            let query = 'SELECT * FROM ics WHERE unit_of_value >= ? AND (status IS NULL OR status != "archived")';
            let params = [range.min];
            if (range.max !== Infinity) {
                query += ' AND unit_of_value <= ?';
                params.push(range.max);
            }

            // Add search filter
            if (search && search.value) {
                const searchValue = `%${search.value}%`;
                query += ' AND (property_no LIKE ? OR description LIKE ? OR dept LIKE ? OR condition_code LIKE ?)';
                params.push(searchValue, searchValue, searchValue, searchValue);
            }

            // Count total and filtered records
            const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
            const totalCountQuery = 'SELECT COUNT(*) as count FROM ics WHERE (status IS NULL OR status != "archived")';
            const [filteredCountResult, totalCountResult] = await Promise.all([
                db.query(countQuery, params),
                db.query(totalCountQuery)
            ]);
            const recordsFiltered = filteredCountResult[0].count;
            const recordsTotal = totalCountResult[0].count;

            // Handle sorting
            if (order && columns) {
                const column = columns[order[0].column].data;
                const dir = order[0].dir.toUpperCase();
                if ([
                    'id', 'pos_no', 'pr_id', 'ppe_code', 'charging', 'dept', 'property_no', 'note',
                    'description', 'date_acq', 'qty', 'unit_of_measurement', 'unit_of_value',
                    'balcard', 'onhand', 'com_name', 'condition_code', 'sticker', 'attachment',
                    'condemned', 'disposed', 'forPRNTrpci', 'w_ARE', 'property_card', 'notes',
                    'remarks', 'qr_code_path', 'first_scan_date', 'second_scan_date', 'scan_status',
                    'scan_percentage', 'status'
                ].includes(column)) {
                    query += ` ORDER BY ${column} ${dir}`;
                } else {
                    query += ' ORDER BY id ASC';
                }
            } else {
                query += ' ORDER BY id ASC';
            }

            // Add pagination
            query += ' LIMIT ? OFFSET ?';
            params.push(parseInt(length), parseInt(start));

            // Fetch items
            const items = await db.query(query, params);

            // Add classification to each item
            items.forEach(item => {
                item.item_classification = range.label;
            });

            // Update classifications in database
            await db.query(
                'UPDATE ics SET item_classification = ? WHERE unit_of_value >= ?' + (range.max !== Infinity ? ' AND unit_of_value <= ?' : '') + ' AND (status IS NULL OR status != "archived")',
                range.max !== Infinity ? [range.label, range.min, range.max] : [range.label, range.min]
            );

            res.json({
                draw: parseInt(draw),
                recordsTotal,
                recordsFiltered,
                data: items
            });
        } catch (error) {
            console.error('Error in getItemsByClassification:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }

    static async updateItem(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            const allowedFields = [
                'description', 'dept', 'unit_of_value', 'condition_code',
                'qty', 'unit_of_measurement', 'notes', 'remarks'
            ];

            // Validate fields
            const updateFields = Object.keys(updates).filter(field => allowedFields.includes(field));
            if (updateFields.length === 0) {
                return res.status(400).json({ success: false, message: 'No valid fields to update' });
            }

            // Build update query
            let query = 'UPDATE ics SET ';
            const params = [];
            updateFields.forEach((field, index) => {
                query += `${field} = ?`;
                if (index < updateFields.length - 1) query += ', ';
                params.push(updates[field]);
            });
            query += ' WHERE id = ?';
            params.push(id);

            const result = await db.query(query, params);
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Item not found' });
            }

            res.json({ success: true, message: 'Item updated successfully' });
        } 
        catch (error) {
            console.error('Error updating item:', error);
            res.status(500).json({ success: false, message: 'Internal Server Error', error: error.message });
        }
    }

    static async archiveItem(req, res) {
        try {
            const { id } = req.params;
            const query = 'UPDATE ics SET status = "archived" WHERE id = ?';
            const result = await db.query(query, [id]);

            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Item not found' });
            }

            res.json({ success: true, message: 'Item archived successfully' });
        } catch (error) {
            console.error('Error archiving item:', error);
            res.status(500).json({ success: false, message: 'Internal Server Error', error: error.message });
        }
    }
}

module.exports = ICSController;
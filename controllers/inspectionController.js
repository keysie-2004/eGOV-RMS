const inspectionModel = require('../models/inspectionModel');

exports.showInspectionPage = (req, res) => {
  inspectionModel.getInspectionItems((err, items) => {
    if (err) {
      console.error('Detailed error:', err);
      return res.status(500).render('error', {
        message: 'Failed to load inspection items',
        error: err,
        user: req.user
      });
    }

    res.render('inspection', { 
      items: items || [], 
      message: items.length === 0 ? 'No items available for inspection' : '',
      user: req.user
    });
  });
};

const formatDate = (date) => {
  if (!date || date === "0000-00-00" || date === "NULL") return "";
  
  try {
    if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return date;
    }
    
    const parsedDate = new Date(date);
    
    if (isNaN(parsedDate.getTime())) {
      return "";
    }
    
    return parsedDate.toISOString().split("T")[0];
  } catch (e) {
    console.error('Error formatting date:', date, e);
    return "";
  }
};

exports.showInspectionForm = (req, res) => {
  const { pr_id } = req.params;

  inspectionModel.getInspectionData(pr_id, (err, items) => {
    if (err) {
      console.error('Error:', err);
      return res.status(500).render('error', { message: 'Server error', user: req.user });
    }

    console.log('Raw items from DB:', JSON.stringify(items, null, 2));

    if (!items || items.length === 0) {
      return res.render('inspectionReport', {
        report: null,
        editMode: false,
        message: 'No inspection data found for this PR ID',
        user: req.user
      });
    }

    const firstItem = items[0];

    const reportData = {
      pr_info: {
        pr_id: pr_id,
        pr_no: firstItem.pr_no || '',
        requisitioning_office: firstItem.requisitioning_office || '',
        fund: firstItem.fund || '',
        air_no: firstItem.air_no || '',
        air_date: formatDate(firstItem.air_date)
      },
      po_info: {
        po_id: firstItem.po_id || '',
        po_no: firstItem.po_id || firstItem.po_no || '',
        po_date: formatDate(firstItem.po_date),
        invoice_no: firstItem.invoice_no || '',
        invoice_date: formatDate(firstItem.invoice_date),
        supplier: firstItem.supplier || ''
      },
      items: items.map(item => ({
        stock_property_no: item.stock_property_no || '',
        item_description: item.item_description || '',
        unit: item.unit || '',
        quantity: item.quantity || 0
      })),
      acceptance: {
        date_received: formatDate(firstItem.date_received),
        status: firstItem.acceptance_status || 'complete',
        notes: firstItem.notes || ''
      },
      inspection: {
        date_inspected: formatDate(firstItem.date_inspected)
      },
      signatures: {
        inspector: {
          name: firstItem.inspector_name || 'ROMMEL P. MASONGSONG',
          position: firstItem.inspector_position || 'Asst. City General Services Officer'
        },
        receiver: {
          name: firstItem.receiver_name || 'DARWIN C. LOPEZ',
          position: firstItem.receiver_position || 'Inspection Officer'
        }
      }
    };

    const editMode = !!firstItem.date_received || !!firstItem.date_inspected;

    console.log('Processed report data:', JSON.stringify(reportData, null, 2));

    res.render('inspectionReport', {
      report: reportData,
      editMode: editMode,
      message: '',
      user: req.user
    });
  });
};

exports.saveInspectionReport = (req, res) => {
  const { pr_id } = req.params;

  console.log('=== RAW REQ.BODY ===');
  console.log(JSON.stringify(req.body, null, 2));

  const validateDate = (date) => {
    if (!date || date === '0000-00-00' || date === 'NULL') return null;
    const parsedDate = new Date(date);
    return isNaN(parsedDate.getTime()) ? null : date;
  };

  const extractedData = {
    pr_id: pr_id,
    po_id: req.body.po_id || null,
    po_no: req.body.po_no || '',
    po_date: validateDate(req.body.po_date),
    requisitioning_office: req.body.requisitioning_office || '',
    fund: req.body.fund || '',
    air_no: req.body.air_no || '',
    air_date: validateDate(req.body.air_date),
    invoice_no: req.body.invoice_no || '',
    invoice_date: validateDate(req.body.invoice_date),
    date_received: validateDate(req.body.date_received),
    acceptance_status: req.body.acceptance_status || 'complete',
    notes: req.body.acceptance_status === 'partial' ? (req.body.notes || '') : null,
    date_inspected: validateDate(req.body.date_inspected)
  };

  console.log('=== EXTRACTED DATA ===');
  console.log(JSON.stringify(extractedData, null, 2));

  const requiredFields = ['po_no', 'requisitioning_office', 'fund', 'date_received', 'date_inspected', 'acceptance_status'];
  const missingFields = [];

  requiredFields.forEach(field => {
    if (!extractedData[field] || (typeof extractedData[field] === 'string' && extractedData[field].trim() === '')) {
      missingFields.push(field);
    }
  });

  if (missingFields.length > 0) {
    console.log('Missing required fields:', missingFields);
    return res.status(400).json({
      success: false,
      error: `Missing required fields: ${missingFields.join(', ')}`,
      received_data: extractedData
    });
  }

  if (!['complete', 'partial'].includes(extractedData.acceptance_status)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid acceptance status. Must be "complete" or "partial"',
      received_status: extractedData.acceptance_status
    });
  }

  if (extractedData.acceptance_status === 'partial' && !extractedData.notes) {
    return res.status(400).json({
      success: false,
      error: 'Notes are required for partial acceptance'
    });
  }

  inspectionModel.saveInspectionReport(extractedData, (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to save report to database',
        details: err.message,
        sql_error: err.sql || 'No SQL provided'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Report saved successfully',
      saved_data: extractedData
    });
  });
};

exports.showInspectionReport = (req, res) => {
  const { po_id } = req.params;

  inspectionModel.getInspectionData(po_id, (err, items) => {
    if (err) {
      return res.status(500).render('error', { message: 'Server error', user: req.user });
    }

    if (!items || items.length === 0) {
      return res.render('inspectionReport', { 
        report: null, 
        message: 'No inspection report found', 
        po_id 
      });
    }

    const reportData = formatReportData(items[0], items);
    res.render('inspectionReport', { 
      report: reportData, 
      message: req.flash('message') || '',
      user: req.user
    });
  });
};

function formatReportData(header, items) {
  return {
    po_info: {
      po_id: header.po_id,
      po_no: header.po_no,
      po_date: header.po_date,
      supplier: header.supplier
    },
    inspection_info: {
      requisitioning_office: header.requisitioning_office,
      fund: header.fund,
      air_no: header.air_no,
      air_date: header.air_date,
      invoice_no: header.invoice_no,
      invoice_date: header.invoice_date
    },
    items: items.map(item => ({
      stock_property_no: item.stock_property_no,
      unit: item.unit,
      item_description: item.item_description,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      total_cost: item.total_cost
    })),
    acceptance: {
      date_received: header.date_received,
      status: header.acceptance_status,
      notes: header.notes
    },
    inspection: {
      date_inspected: header.date_inspected
    },
    signatures: {
      inspector: {
        name: header.inspector_name,
        position: header.inspector_position
      },
      receiver: {
        name: header.receiver_name,
        position: header.receiver_position
      }
    },
    timestamp: new Date().toLocaleString()
  };
}

exports.generateQRCode = (req, res) => {
  const { id } = req.params;
  const itemUrl = `${req.protocol}://${req.get('host')}/item/${id}`;
  
  const qrCode = qr.image(itemUrl, { type: 'png' });
  
  const qrPath = `public/qrcodes/item-${id}.png`;
  qrCode.pipe(fs.createWriteStream(qrPath));
  
  inspectionModel.updateQRCodePath(id, qrPath, (err) => {
      if (err) {
          return res.status(500).json({ success: false, error: 'Failed to save QR code' });
      }
      res.json({ success: true, message: 'QR code generated successfully' });
  });
};

exports.viewQRItem = (req, res) => {
  const { id } = req.params;
  
  inspectionModel.getItemById(id, (err, item) => {
      if (err) {
          console.error('Error fetching item:', err);
          return res.status(500).render('error', { message: 'Failed to load item details' });
      }
      
      if (!item) {
          return res.status(404).render('error', { message: 'Item not found' });
      }
      
      res.render('itemDetails', { item });
  });
};
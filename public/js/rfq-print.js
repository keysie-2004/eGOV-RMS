function printForm(supplier) {
    const form = document.getElementById(`${supplier}Form`);
    
    // Get form data
    const companyName = form.querySelector('input[name="company_name"]').value;
    const dateSent = form.querySelector('input[name="date_sent"]').value;
    const quotationNumber = form.querySelector('input[name="quotation_number"]').value;
    const printedName = form.querySelector('input[name="printed_name"]').value;
    const contact = form.querySelector('input[name="contact"]').value;
    const date = form.querySelector('input[name="date"]').value;
    const totalItems = parseInt(form.querySelector('input[name="total_items"]').value) || 0;
    // Get requestor and BAC Secretariat details
    const requestorName = form.querySelector('input[name="requestor_name"]').value || 'Unknown';
    const requestorPosition = form.querySelector('input[name="requestor_position"]').value || 'Unknown';
    const bacSecretariatName = form.querySelector('input[name="bac_secretariat_name"]').value || 'Unknown';
    const bacSecretariatPosition = form.querySelector('input[name="bac_secretariat_position"]').value || 'Unknown';
    
    // Format dates
    const formattedDateSent = dateSent ? new Date(dateSent).toLocaleDateString() : '';
    const formattedDate = date ? new Date(date).toLocaleDateString() : '';
    
    // Calculate total pages
    const itemsPerPage = 32;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    // Get all table rows from the form's table body
    const tableRows = form.querySelector('tbody').querySelectorAll('tr');
    
    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    let printContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Request for Quotation</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 15px;
                    font-size: 11px;
                    line-height: 1.0;
                    background-color: white;
                }
                
                .form-container {
                    background-color: white;
                    max-width: 8.5in;
                    margin: 0 auto;
                    padding: 15px;
                    page-break-after: always;
                }
                
                .form-container:last-child {
                    page-break-after: auto;
                }
                
                .header {
                    display: flex;
                    align-items: flex-start;
                    margin-bottom: 8px;
                    position: relative;
                }
                
                .logo-container {
                    position: absolute;
                    top: -30px;
                    left: 0;
                    z-index: 100;
                }
                
                .logo {
                    width: 120px;
                    height: 120px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 7px;
                    text-align: center;
                    color: #000;
                    font-weight: bold;
                    flex-shrink: 0;
                }
                
                .title-section {
                    text-align: center;
                    flex-grow: 1;
                    margin: 0 auto;
                    width: 100%;
                }
                
                .rfq-title {
                    font-size: 20px;
                    font-weight: bold;
                    margin: 0;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    padding: 5px;
                    background-color: white;
                }
                
                .city-government {
                    font-size: 12px;
                    margin: 3px 0;
                    text-transform: uppercase;
                    font-weight: bold;
                }
                
                .date-quotation {
                    position: absolute;
                    right: 0;
                    top: 0;
                    font-size: 11px;
                    text-align: right;
                }
                
                .date-quotation p {
                    margin: 3px 0;
                }
                
                .underline {
                    border-bottom: 1px solid #000;
                    display: inline-block;
                    width: 120px;
                    text-align: center;
                    height: 15px;
                    vertical-align: bottom;
                }
                
                .company-section {
                    margin: 12px 0;
                    padding: 8px 0;
                }
                
                .company-name-line {
                    border-bottom: 1px solid #000;
                    height: 18px;
                    width: 25%;
                    margin: 6px 0;
                    padding: 3px 0;
                    font-weight: bold;
                }
                
                .description-text {
                    font-size: 11px;
                    line-height: 1.0;
                    margin: 6px 0;
                    text-align: justify;
                }
                
                .signature-right {
                    text-align: right;
                    margin: 8px 0;
                    font-size: 11px;
                    font-weight: bold;
                }
                
                .signature-right p {
                    margin: 1px 0;
                }
                
                .notes-section {
                    margin: 10px 0;
                }
                
                .notes-section p {
                    font-weight: bold;
                    margin: 5px 0;
                    font-size: 11px;
                }
                
                .notes-section ol {
                    margin: 0;
                    padding-left: 15px;
                    font-size: 11px;
                }
                
                .notes-section li {
                    margin-bottom: 1px;
                    line-height: 1.0;
                }
                
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 10px 0;
                    font-size: 11px;
                    border: 1px solid #000;
                }
                
                th, td {
                    border: 1px solid #000;
                    padding: 1px;
                    text-align: center;
                    vertical-align: middle;
                }
                
                th {
                    font-weight: bold;
                    font-size: 11px;
                    height: 35px;
                    background-color: #f8f8f8;
                    text-transform: uppercase;
                }
                
                .item-col { width: 8%; }
                .qty-col { width: 8%; }
                .unit-col { width: 8%; }
                .description-col { width: 35%; }
                .brand-col { width: 15%; }
                .unit-cost-col { width: 13%; }
                .total-cost-col { width: 13%; }
                
                .table-row {
                    height: 16px;
                }
                
                .total-row {
                    border-top: 3px double #000;
                    font-weight: bold;
                    background-color: #f0f0f0;
                }
                
                .signature-section {
                    margin-top: 12px;
                    text-align: right;
                    font-size: 11px;
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                }
                
                .signature-section p {
                    margin: 4px 0;
                }
                
                .signature-line {
                    border-bottom: 1px solid #000;
                    display: block;
                    width: 200px;
                    text-align: center;
                    margin-bottom: 2px;
                    height: 15px;
                    padding: 1px;
                }
                
                .contact-line {
                    border-bottom: 1px solid #000;
                    display: block;
                    width: 200px;
                    height: 12px;
                    padding: 1px;
                    text-align: center;
                    margin-bottom: 2px;
                }
                
                .date-line-sig {
                    border-bottom: 1px solid #000;
                    display: block;
                    width: 200px;
                    height: 12px;
                    padding: 1px;
                    text-align: center;
                    margin-bottom: 2px;
                }
                
                .contact-info {
                    margin-top: 8px;
                    text-align: right;
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                }
                
                .contact-label {
                    display: block;
                    margin-bottom: 2px;
                    font-size: 11px;
                    text-align: center;
                    width: 200px;
                    margin-top: 2px;
                }

                .certification {
                    margin-top: 15px;
                    font-size: 11px;
                    text-align: center;
                    font-style: italic;
                }
                
                .bottom-signatures {
                    display: flex;
                    justify-content: space-between;
                    margin-top: 15px;
                    font-size: 11px;
                }
                
                .bottom-signatures div {
                    width: 45%;
                    text-align: center;
                }
                
                .bottom-signatures .right {
                    text-align: center;
                }
                
                .bottom-signatures .signature-name {
                    border-bottom: 1px solid #000;
                    display: inline-block;
                    width: 180px;
                    text-align: center;
                    margin-bottom: 2px;
                    height: 15px;
                    font-weight: bold;
                }
                
                .bottom-signatures p {
                    margin: 1px 0;
                    font-weight: bold;
                }
                
                @media print {
                    @page {
                        margin: .5in;
                        size: 8.5in 13in;
                    }
                    body {
                        margin: 0;
                        background-color: white;
                        padding: 0;
                    }
                    .form-container {
                        margin: 0;
                        padding: 10px;
                        max-width: 100%;
                    }
                }
            </style>
        </head>
        <body>
    `;
    
    // Calculate total amount for all items
    let totalAmount = 0;
    for (let index = 0; index < totalItems; index++) {
        const totalCost = form.querySelector(`input[name="total_cost_${index}"]`)?.value || '0';
        totalAmount += parseFloat(totalCost) || 0;
    }
    
    // Generate content for each page
    for (let page = 0; page < totalPages; page++) {
        let itemsRows = '';
        const startIndex = page * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
        
        // Process items for the current page
        for (let index = startIndex; index < endIndex; index++) {
            const itemIdInput = form.querySelector(`input[name="item_id_${index}"]`);
            if (!itemIdInput) continue; // Skip if item doesn't exist
            
            const tableRow = tableRows[index];
            if (!tableRow) continue; // Skip if table row doesn't exist
            
            // Get data from table cells and form inputs
            const itemNo = startIndex + tableRow.cells[0].textContent.trim();
            const description = tableRow.cells[1].textContent.trim();
            const unit = tableRow.cells[3].textContent.trim();
            
            // Get values from form inputs
            const quantity = form.querySelector(`input[name="quantity_${index}"]`)?.value || '';
            const brand = form.querySelector(`input[name="brand_${index}"]`)?.value || '';
            const unitCost = form.querySelector(`input[name="unit_cost_${index}"]`)?.value || '0';
            const totalCost = form.querySelector(`input[name="total_cost_${index}"]`)?.value || '0';
            
            itemsRows += `
                <tr class="table-row">
                    <td style="text-align: center;">${itemNo}</td>
                    <td style="text-align: center;">${quantity}</td>
                    <td style="text-align: center;">${unit}</td>
                    <td>${description}</td>
                    <td>${brand}</td>
                    <td style="text-align: right;">${parseFloat(unitCost || 0).toFixed(2)}</td>
                    <td style="text-align: right;">${parseFloat(totalCost || 0).toFixed(2)}</td>
                </tr>
            `;
        }
        
        // Add empty rows to fill up to 32 rows on the current page
        for (let i = endIndex - startIndex; i < itemsPerPage; i++) {
            itemsRows += `
                <tr class="table-row">
                    <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                </tr>
            `;
        }
        
        // Add total row only on the last page
        const totalRow = page === totalPages - 1 ? `
            <tr class="total-row">
                <td colspan="6" style="text-align: right; font-weight: bold;">TOTAL</td>
                <td style="text-align: right; font-weight: bold;">${totalAmount.toFixed(2)}</td>
            </tr>
        ` : '';
        
        // Build the page content
        printContent += `
            <div class="form-container">
                <div class="header">
                    <div class="logo-container">
                        <div class="logo">
                            <img src="/img/Calapan_City_Logo.png" alt="City Logo" style="width: 55px; height: 55px; border-radius: 50%;">
                        </div>
                    </div>
                    <div class="title-section">
                        <h1 class="rfq-title">Request for Quotation</h1>
                        <h2 class="city-government">City Government of Calapan</h2>
                    </div>
                    <div class="date-quotation">
                        <p>Date: <span class="underline">${formattedDateSent}</span></p>
                        <p>Quotation No.: <span class="underline">${quotationNumber}</span></p>
                    </div>
                </div>

                <div class="company-section">
                    <div class="company-name-line">${companyName}</div>
                    <p style="font-size: 11px; margin: 5px 0;"><strong>Company / Store Name & Address</strong></p>
                    
                    <div class="description-text">
                        Please quote your lowest price on the item listed below, subject to the General Conditions on the first page, stating the shortest time of delivery and submit your quotation duly signed by your representative not later than <strong>five (5) days</strong> in the return envelope.
                    </div>
                </div>

                <div class="signature-right">
                    <p>${requestorName.toUpperCase()}</p>
                    <p>${requestorPosition}</p>
                </div>

                <div class="notes-section">
                    <p>NOTE:</p>
                    <ol>
                        <li>ALL ENTRIES MUST BE TYPEWRITTEN OR HANDWRITTEN.</li>
                        <li>DELIVERY PERIOD WITHIN FIFTEEN (15) CALENDAR DAYS.</li>
                        <li>WARRANTY SHALL BE FOR A PERIOD OF SIX (6) MONTHS FOR SUPPLIES & MATERIALS, ONE (1) YEAR FOR EQUIPMENT, FROM DATE OF ACCEPTANCE BY THE PROCURING ENTITY.</li>
                        <li>PRICE VALIDITY SHALL BE FOR A PERIOD OF THIRTY (30) CALENDAR DAYS.</li>
                        <li>BIDDERS SHALL SUBMIT ORIGINAL BROCHURES SHOWING CERTIFICATIONS OF THE PRODUCT BEING OFFERED.</li>
                    </ol>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th class="item-col">ITEM<br>NO.</th>
                            <th class="qty-col">QTY.</th>
                            <th class="unit-col">UNIT<br>OF<br>MEA.</th>
                            <th class="description-col">ITEM & DESCRIPTION</th>
                            <th class="brand-col">BRAND</th>
                            <th class="unit-cost-col">UNIT<br>COST</th>
                            <th class="total-cost-col">TOTAL<br>COST</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsRows}
                        ${totalRow}
                    </tbody>
                </table> <br>

                <div class="signature-section">
                    <div class="signature-line">${printedName}</div>
                    <span class="contact-label">Printed Name / Signature:</span>
                    
                    <div class="contact-info">
                        <div class="contact-line">${contact}</div>
                        <span class="contact-label">Tel. No / Cellphone No./e-mail address:</span>
                    </div>
                    
                    <div class="contact-info">
                        <div class="date-line-sig">${formattedDate}</div>
                        <span class="contact-label">Date:</span>
                    </div>
                </div> <br>

                <div class="certification">
                    <p>This is to certify that the undersigned conducted request for quotations for the above stated items.</p>
                </div> <br>

                <div class="bottom-signatures">
                    <div>
                        <span class="signature-name">${requestorName.toUpperCase()}</span>
                        <p>${requestorPosition}</p>
                    </div>
                    <div class="right">
                        <span class="signature-name">${bacSecretariatName.toUpperCase()}</span>
                        <p>${bacSecretariatPosition}</p>
                        <p>Head, BAC Secretariat</p>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Close the HTML document
    printContent += `
            <script>
                window.addEventListener('load', function() {
                    setTimeout(function() {
                        window.print();
                        window.close();
                    }, 200);
                });
            </script>
        </body>
        </html>
    `;
    
    // Write content to the print window
    printWindow.document.write(printContent);
    printWindow.document.close();
}
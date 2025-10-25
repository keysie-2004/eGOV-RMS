document.addEventListener('DOMContentLoaded', function() {
  // Save button functionality
  document.getElementById('saveButton').addEventListener('click', saveAbstract);
  
  // Print button functionality
  document.getElementById('printButton').addEventListener('click', preparePrint);
});

// Save function
async function saveAbstract() {
    try {
        const formData = {
            pr_id: document.getElementById('pr_id').value,
            date: document.getElementById('abstractDate').value
        };

        if (!formData.pr_id || !formData.date) {
            alert('Please fill in all required fields');
            return;
        }

        const response = await fetch('/save-abstract', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || 'Server returned an error');
        }

        if (result.success) {
            alert(result.message);
            window.location.reload();
        } else {
            throw new Error(result.message || 'Failed to save abstract');
        }
    } catch (error) {
        console.error('Save error:', error);
        alert('Error saving abstract: ' + error.message);
    }
}

// Print function
function preparePrint() {
    console.log("Print button clicked");
    
    // Update the date in print section
    const dateInput = document.getElementById('abstractDate').value;
    if (dateInput) {
        try {
            const printDate = new Date(dateInput);
            document.getElementById('printDate').textContent = printDate.toLocaleDateString();
        } catch (e) {
            console.error('Date format error:', e);
            document.getElementById('printDate').textContent = 'Invalid date';
        }
    }
    
    // Show the print section
    const printSection = document.getElementById('printSection');
    printSection.classList.remove('hidden');
    
    // Add print-specific styles
    const printStyle = document.createElement('style');
    printStyle.innerHTML = `
        @page {
            size: A4;
            margin: 10mm;
        }
        body {
            background-color: white !important;
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
        }
        #printSection {
            position: relative;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
            background-color: white;
        }
        #printSection table {
            width: 100%;
            border-collapse: collapse;
            page-break-inside: auto;
        }
        #printSection table tr {
            page-break-inside: avoid;
            page-break-after: auto;
        }
        /* Create vertical lines only */
        #printSection table td, 
        #printSection table th {
            border-top: none;
            border-bottom: none;
            border-right: 1px solid black;
            border-left: 1px solid black;
            padding: 4px;
            font-size: 12px;
        }
        /* Add bottom border only to the last row */
        #printSection table tr:last-child td {
            border-bottom: 1px solid black;
        }
        /* Add top border only to the first row */
        #printSection table tr:first-child th {
            border-top: 1px solid black;
        }
        #printSection .signature-line {
            border-bottom: 1px solid black;
            width: 150px;
            display: inline-block;
            margin-bottom: 5px;
        }
    `;
    document.head.appendChild(printStyle);
    
    // Print the document
    window.print();
    
    // Clean up after printing
    setTimeout(() => {
        printSection.classList.add('hidden');
        document.head.removeChild(printStyle);
    }, 500);
}
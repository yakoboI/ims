// Script to add SEO and Accessibility features to HTML files
// Run this in Node.js to automatically add required scripts and stylesheets to HTML files

const fs = require('fs');
const path = require('path');

const htmlFiles = [
    'dashboard.html',
    'inventory-items.html',
    'inventory-operations.html',
    'sales.html',
    'purchases.html',
    'invoices.html',
    'receipts.html',
    'reports.html',
    'settings.html',
    'users.html',
    'shops.html',
    'customers.html',
    'suppliers.html',
    'categories.html',
    'expenses.html',
    'installment-payments.html',
    'subscription-plans.html',
    'shop-statistics.html',
    'goods-prices.html',
    'goods-barcodes.html',
    'stock-manage.html',
    'terms-and-service.html'
];

const headAdditions = `
    <!-- Cookie Consent CSS -->
    <link rel="stylesheet" href="cookie-consent.css">
    
    <!-- Accessibility Styles -->
    <link rel="stylesheet" href="styles-accessibility.css">
    
    <!-- Accessibility Utilities -->
    <script src="accessibility-utils.js"></script>
    
    <!-- SEO Utilities -->
    <script src="seo-utils.js"></script>`;

const bodyAdditions = `
    <!-- Cookie Consent -->
    <script src="cookie-consent.js"></script>`;

function addToHTML(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let modified = false;
        
        // Check if already added
        if (content.includes('cookie-consent.css') && content.includes('accessibility-utils.js')) {
            console.log(`✓ ${filePath} already has SEO/accessibility features`);
            return;
        }
        
        // Add to head (before </head>)
        if (content.includes('</head>')) {
            content = content.replace('</head>', headAdditions + '\n</head>');
            modified = true;
        }
        
        // Add to body (before </body>)
        if (content.includes('</body>')) {
            // Find last script tag before </body>
            const bodyEnd = content.lastIndexOf('</body>');
            const beforeBody = content.substring(0, bodyEnd);
            const afterBody = content.substring(bodyEnd);
            
            // Add before </body> but after last script
            const lastScriptIndex = beforeBody.lastIndexOf('</script>');
            if (lastScriptIndex !== -1) {
                const insertPoint = beforeBody.lastIndexOf('\n', lastScriptIndex) + 1;
                content = beforeBody.substring(0, insertPoint) + bodyAdditions + '\n' + beforeBody.substring(insertPoint) + afterBody;
            } else {
                content = beforeBody + bodyAdditions + '\n' + afterBody;
            }
            modified = true;
        }
        
        if (modified) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`✓ Updated ${filePath}`);
        } else {
            console.log(`⚠ Could not update ${filePath} - structure not recognized`);
        }
    } catch (error) {
        console.error(`✗ Error processing ${filePath}:`, error.message);
    }
}

// Process all HTML files
console.log('Adding SEO and Accessibility features to HTML files...\n');

htmlFiles.forEach(file => {
    const filePath = path.join(__dirname, 'public', file);
    if (fs.existsSync(filePath)) {
        addToHTML(filePath);
    } else {
        console.log(`⚠ File not found: ${file}`);
    }
});

console.log('\nDone!');


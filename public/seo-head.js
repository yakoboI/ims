/**
 * SEO Head Injection Helper
 * Adds comprehensive SEO meta tags to pages
 */

function addSEOHead(pageConfig) {
    const head = document.head;
    
    // Remove existing meta tags if any
    const existingMeta = head.querySelectorAll('meta[name="description"], meta[name="keywords"], meta[property^="og:"], meta[name^="twitter:"]');
    existingMeta.forEach(meta => meta.remove());
    
    // Add description
    if (pageConfig.description) {
        const desc = document.createElement('meta');
        desc.name = 'description';
        desc.content = pageConfig.description;
        head.appendChild(desc);
    }
    
    // Add keywords
    if (pageConfig.keywords) {
        const keywords = document.createElement('meta');
        keywords.name = 'keywords';
        keywords.content = pageConfig.keywords;
        head.appendChild(keywords);
    }
    
    // Add Open Graph tags
    if (pageConfig.ogTitle) {
        const ogTitle = document.createElement('meta');
        ogTitle.setAttribute('property', 'og:title');
        ogTitle.content = pageConfig.ogTitle;
        head.appendChild(ogTitle);
    }
    
    if (pageConfig.ogDescription) {
        const ogDesc = document.createElement('meta');
        ogDesc.setAttribute('property', 'og:description');
        ogDesc.content = pageConfig.ogDescription;
        head.appendChild(ogDesc);
    }
    
    // Add Twitter Card tags
    if (pageConfig.twitterTitle) {
        const twTitle = document.createElement('meta');
        twTitle.name = 'twitter:title';
        twTitle.content = pageConfig.twitterTitle;
        head.appendChild(twTitle);
    }
    
    if (pageConfig.twitterDescription) {
        const twDesc = document.createElement('meta');
        twDesc.name = 'twitter:description';
        twDesc.content = pageConfig.twitterDescription;
        head.appendChild(twDesc);
    }
}


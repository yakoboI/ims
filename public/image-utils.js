/**
 * Image Utilities for Cloudinary Integration
 * Provides helper functions for optimized image URLs with CDN
 */

/**
 * Get optimized Cloudinary image URL with transformations
 * @param {string} imageUrl - Original image URL (Cloudinary or other)
 * @param {Object} options - Transformation options
 * @param {number} options.width - Desired width (default: 400)
 * @param {number} options.height - Desired height (default: 400)
 * @param {string} options.crop - Crop mode: 'fill', 'fit', 'limit', 'scale' (default: 'limit')
 * @param {string} options.quality - Quality: 'auto', 'auto:good', 'auto:best', or number (default: 'auto:good')
 * @param {string} options.format - Format: 'webp', 'jpg', 'png' (default: 'webp')
 * @returns {string} Optimized Cloudinary URL
 */
function getOptimizedImageUrl(imageUrl, options = {}) {
    if (!imageUrl) {
        return '/favicon.svg'; // Fallback image
    }
    
    // If it's already a Cloudinary URL, apply transformations
    if (imageUrl.includes('res.cloudinary.com')) {
        const {
            width = 400,
            height = 400,
            crop = 'limit',
            quality = 'auto:good',
            format = 'webp'
        } = options;
        
        // Extract Cloudinary URL parts
        const urlParts = imageUrl.split('/upload/');
        if (urlParts.length === 2) {
            // Insert transformations before /upload/
            const transformations = `w_${width},h_${height},c_${crop},q_${quality},f_${format}`;
            return `${urlParts[0]}/upload/${transformations}/${urlParts[1]}`;
        }
    }
    
    // If it's a base64 data URL (legacy), return as-is (will be migrated)
    if (imageUrl.startsWith('data:image/')) {
        return imageUrl;
    }
    
    // For other URLs (external), return as-is
    return imageUrl;
}

/**
 * Get thumbnail image URL (small optimized version)
 * @param {string} imageUrl - Original image URL
 * @returns {string} Thumbnail URL
 */
function getThumbnailUrl(imageUrl) {
    return getOptimizedImageUrl(imageUrl, {
        width: 150,
        height: 150,
        crop: 'fill',
        quality: 'auto:good',
        format: 'webp'
    });
}

/**
 * Get medium-sized image URL (for modals/details)
 * @param {string} imageUrl - Original image URL
 * @returns {string} Medium-sized URL
 */
function getMediumImageUrl(imageUrl) {
    return getOptimizedImageUrl(imageUrl, {
        width: 800,
        height: 800,
        crop: 'limit',
        quality: 'auto:good',
        format: 'webp'
    });
}

/**
 * Get full-size image URL (original or high quality)
 * @param {string} imageUrl - Original image URL
 * @returns {string} Full-size URL
 */
function getFullImageUrl(imageUrl) {
    if (!imageUrl) {
        return '/favicon.svg';
    }
    
    // If Cloudinary URL, return with high quality
    if (imageUrl.includes('res.cloudinary.com')) {
        return getOptimizedImageUrl(imageUrl, {
            width: 1920,
            height: 1920,
            crop: 'limit',
            quality: 'auto:best',
            format: 'webp'
        });
    }
    
    return imageUrl;
}

/**
 * Check if image URL is a Cloudinary URL
 * @param {string} imageUrl - Image URL to check
 * @returns {boolean} True if Cloudinary URL
 */
function isCloudinaryUrl(imageUrl) {
    return imageUrl && imageUrl.includes('res.cloudinary.com');
}

/**
 * Check if image URL is a base64 data URL (legacy)
 * @param {string} imageUrl - Image URL to check
 * @returns {boolean} True if base64 data URL
 */
function isBase64Url(imageUrl) {
    return imageUrl && imageUrl.startsWith('data:image/');
}

// Export functions for use in other scripts
if (typeof window !== 'undefined') {
    window.ImageUtils = {
        getOptimizedImageUrl,
        getThumbnailUrl,
        getMediumImageUrl,
        getFullImageUrl,
        isCloudinaryUrl,
        isBase64Url
    };
}

// For Node.js environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getOptimizedImageUrl,
        getThumbnailUrl,
        getMediumImageUrl,
        getFullImageUrl,
        isCloudinaryUrl,
        isBase64Url
    };
}


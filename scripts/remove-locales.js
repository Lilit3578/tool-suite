#!/usr/bin/env node

/**
 * Remove unused locale files from packaged Electron app
 * This script runs after electron-builder packages the app
 * Reduces app size by removing unnecessary language packs
 */

const fs = require('fs');
const path = require('path');

// Locale codes to KEEP (based on your supported languages)
const KEEP_LOCALES = new Set([
    'en',           // English
    'en_GB',        // English (UK) - keep for completeness
    'zh_CN',        // Chinese (Mandarin - Simplified)
    'zh_TW',        // Chinese (Traditional) - keep for completeness
    'es',           // Spanish
    'es_419',       // Spanish (Latin America) - keep for completeness
    'fr',           // French
    'de',           // German
    'ar',           // Arabic
    'pt_PT',        // Portuguese (Portugal)
    'pt_BR',        // Portuguese (Brazil) - keep for completeness
    'ru',           // Russian
    'ja',           // Japanese
    'hi',           // Hindi
    'it',           // Italian
    'nl',           // Dutch
    'pl',           // Polish
    'tr',           // Turkish
    'hy',           // Armenian
    'fa',           // Persian
    'vi',           // Vietnamese
    'id',           // Indonesian
    'ko',           // Korean
    'bn',           // Bengali
    'ur',           // Urdu
    'th',           // Thai
    'sv',           // Swedish
    'da',           // Danish
    'fi',           // Finnish
    'hu',           // Hungarian
]);

/**
 * Remove locale files from a directory
 * @param {string} resourcesPath - Path to Resources directory
 */
function removeUnusedLocales(resourcesPath) {
    if (!fs.existsSync(resourcesPath)) {
        console.log(`⚠️  Resources path not found: ${resourcesPath}`);
        return;
    }

    const items = fs.readdirSync(resourcesPath);
    let removedCount = 0;
    let keptCount = 0;
    let totalSizeSaved = 0;

    items.forEach(item => {
        if (item.endsWith('.lproj')) {
            const localeName = item.replace('.lproj', '');
            const localePath = path.join(resourcesPath, item);

            if (!KEEP_LOCALES.has(localeName)) {
                try {
                    // Get size before removing
                    const stats = fs.statSync(localePath);
                    const size = getDirectorySize(localePath);

                    // Remove the locale directory
                    fs.rmSync(localePath, { recursive: true, force: true });

                    removedCount++;
                    totalSizeSaved += size;
                    console.log(`  ✓ Removed: ${item} (${formatBytes(size)})`);
                } catch (error) {
                    console.error(`  ✗ Failed to remove ${item}:`, error.message);
                }
            } else {
                keptCount++;
                console.log(`  → Kept: ${item}`);
            }
        }
    });

    console.log(`\n📊 Summary:`);
    console.log(`   Kept: ${keptCount} locales`);
    console.log(`   Removed: ${removedCount} locales`);
    console.log(`   Space saved: ${formatBytes(totalSizeSaved)}`);
}

/**
 * Get total size of a directory
 * @param {string} dirPath - Directory path
 * @returns {number} Size in bytes
 */
function getDirectorySize(dirPath) {
    let size = 0;

    try {
        const items = fs.readdirSync(dirPath);
        items.forEach(item => {
            const itemPath = path.join(dirPath, item);
            const stats = fs.statSync(itemPath);

            if (stats.isDirectory()) {
                size += getDirectorySize(itemPath);
            } else {
                size += stats.size;
            }
        });
    } catch (error) {
        // Ignore errors
    }

    return size;
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Main function - called by electron-builder afterPack hook
 * @param {Object} context - electron-builder context
 */
exports.default = async function (context) {
    console.log('\n🧹 Removing unused locale files...\n');

    const { appOutDir, electronPlatformName } = context;

    if (electronPlatformName === 'darwin') {
        // macOS: Electron Framework contains the locales
        const frameworkPath = path.join(
            appOutDir,
            `${context.packager.appInfo.productFilename}.app`,
            'Contents',
            'Frameworks',
            'Electron Framework.framework',
            'Versions',
            'A',
            'Resources'
        );

        console.log(`📂 Cleaning macOS locales from:\n   ${frameworkPath}\n`);
        removeUnusedLocales(frameworkPath);

    } else if (electronPlatformName === 'win32') {
        // Windows: locales are in the locales folder
        const localesPath = path.join(appOutDir, 'locales');

        console.log(`📂 Cleaning Windows locales from:\n   ${localesPath}\n`);

        if (fs.existsSync(localesPath)) {
            const items = fs.readdirSync(localesPath);
            let removedCount = 0;
            let keptCount = 0;

            items.forEach(item => {
                if (item.endsWith('.pak')) {
                    const localeName = item.replace('.pak', '');

                    if (!KEEP_LOCALES.has(localeName)) {
                        const filePath = path.join(localesPath, item);
                        try {
                            fs.unlinkSync(filePath);
                            removedCount++;
                            console.log(`  ✓ Removed: ${item}`);
                        } catch (error) {
                            console.error(`  ✗ Failed to remove ${item}:`, error.message);
                        }
                    } else {
                        keptCount++;
                        console.log(`  → Kept: ${item}`);
                    }
                }
            });

            console.log(`\n📊 Summary:`);
            console.log(`   Kept: ${keptCount} locales`);
            console.log(`   Removed: ${removedCount} locales`);
        }
    }

    console.log('\n✅ Locale cleanup complete!\n');
};

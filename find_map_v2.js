import fs from 'fs';
import path from 'path';

function scanDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
                scanDir(fullPath);
            }
        } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            // Regex to find Map() call without 'new'
            // We want to skip .map( and MapIcon( and MapPin( etc.
            // Look for whitespace or beginning of line followed by Map(
            const regex = /(^|[^.a-zA-Z0-9])Map\(/g;
            let match;
            while ((match = regex.exec(content)) !== null) {
                // Check if preceded by 'new'
                const pre = content.substring(0, match.index).trim();
                if (!pre.endsWith('new')) {
                    console.log(`FOUND POSSIBLE BUG in ${fullPath} at index ${match.index}:`);
                    console.log(content.substring(match.index - 20, match.index + 20));
                }
            }
        }
    }
}

scanDir('./src');

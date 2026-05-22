const fs = require('fs');
const babel = require('@babel/core');

function testJSX(content) {
    try {
        babel.transformSync(content, {
            presets: ['@babel/preset-react'],
            filename: 'App.jsx'
        });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message, line: e.loc ? e.loc.line : null, col: e.loc ? e.loc.column : null };
    }
}

let content = fs.readFileSync('src/App.jsx', 'utf8');

console.log('Testing current App.jsx...');
let res = testJSX(content);
console.log(res);


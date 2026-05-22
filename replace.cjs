const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'src');

function replaceInFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    content = content.replace(/Cobro Diario/g, 'Clientes Habituales');
    content = content.replace(/cobro diario/gi, 'cliente habitual'); // Fallback para minúsculas en comentarios
    content = content.replace(/Libre Escritura/g, 'Clientes Habituales');

    // Fix some case sensitivity/grammar issues from global replace in comments:
    // "de cliente habitual" -> "cliente habitual"
    content = content.replace(/de cliente habitual/g, 'cliente habitual');

    if (original !== content) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Updated:', filePath);
    }
}

function traverseDir(dir) {
    fs.readdirSync(dir).forEach(file => {
        let fullPath = path.join(dir, file);
        if (fs.lstatSync(fullPath).isDirectory()) {
            traverseDir(fullPath);
        } else if (fullPath.endsWith('.js') || fullPath.endsWith('.jsx')) {
            replaceInFile(fullPath);
        }
    });
}

traverseDir(directoryPath);
console.log('Done.');

const fs = require('fs');

let app = fs.readFileSync('src/App.jsx', 'utf8');
let modalFile = fs.readFileSync('src/components/drivers/GpsAlertsModal.jsx', 'utf8');

// The block to extract
const modalRegex = /      \{\/\* MODAL DE HISTORIAL DE ALERTAS CONFIRMADAS \*\/\}[\s\S]*?      \)\}/;

const match = app.match(modalRegex);

if (!match) {
    console.error('Modal history not found in App.jsx');
    process.exit(1);
}

let historyModalCode = match[0];

// Remove it from App.jsx
app = app.replace(historyModalCode, '');

// Fix encoding issues in the history modal that might have occurred from before if I just copied it
// Or it's already encoded properly in App.jsx. Let's just fix known Spanish characters if any.
historyModalCode = historyModalCode.replace(/Mi/g, 'Mié');
historyModalCode = historyModalCode.replace(/Sb/g, 'Sáb');
historyModalCode = historyModalCode.replace(/aparecern aqu/g, 'aparecerán aquí');

// The GpsAlertsModal.jsx ends with:
//         </div>
//     );
// }

// I will insert the historyModalCode just before `    );`
modalFile = modalFile.replace(
    '        </div>\n    );\n}',
    '        </div>\n\n' + historyModalCode + '\n    );\n}'
);

// We also need to import `Clock` in GpsAlertsModal.jsx since it uses `<Clock size={20} />`
if (!modalFile.includes('Clock')) {
    modalFile = modalFile.replace(
        "import { X, Save, Plus, Trash2, Settings } from 'lucide-react';",
        "import { X, Save, Plus, Trash2, Settings, Clock } from 'lucide-react';"
    );
}

fs.writeFileSync('src/App.jsx', app, 'utf8');
fs.writeFileSync('src/components/drivers/GpsAlertsModal.jsx', modalFile, 'utf8');
console.log('Fixed history modal');

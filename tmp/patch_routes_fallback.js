import fs from 'fs';

const path = 'src/components/drivers/RoutesManagerModal.jsx';
let content = fs.readFileSync(path, 'utf8');

const oldImports = `import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, MapPin } from 'lucide-react';`;

const newImports = `import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, MapPin } from 'lucide-react';
import { DEFAULT_RUTAS } from '../../data/rutas';`;

content = content.replace(oldImports, newImports);

const oldUseEffect = `    useEffect(() => {
        if (isOpen) {
            setLocalRoutes(JSON.parse(JSON.stringify(routes)));
        }
    }, [isOpen, routes]);`;

const newUseEffect = `    useEffect(() => {
        if (isOpen) {
            const initialRoutes = routes && routes.length > 0 ? routes : DEFAULT_RUTAS;
            setLocalRoutes(JSON.parse(JSON.stringify(initialRoutes)));
        }
    }, [isOpen, routes]);`;

content = content.replace(oldUseEffect, newUseEffect);

fs.writeFileSync(path, content, 'utf8');
console.log('✅ RoutesManagerModal updated to use DEFAULT_RUTAS when empty');

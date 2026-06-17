import { Search, Filter, MapPin, Building2, Calendar, Database, Lock, Edit2, Trash2, Check, X, Plus, Upload, FileSpreadsheet, Download, ChevronUp, ChevronDown, Copy } from 'lucide-react';
import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import CreateClientModal from '../components/clients/CreateClientModal';

export default function Clients({ clients, allPoblaciones, articles, onUpdateClient, onAddClient, onImportClients, onDeleteClient, tariffs }) {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingClient, setEditingClient] = useState(null);
    const fileInputRef = useRef(null);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
    const [filterGPS, setFilterGPS] = useState(false);
    const [expandedClients, setExpandedClients] = useState(new Set());

    const filteredClients = useMemo(() => {
        const safeClients = Array.isArray(clients) ? clients : [];
        let result = safeClients.filter(c => {
            // Only show validated/active clients in the master list
            if (c.status === 'pending') return false;
            
            // GPS filter
            if (filterGPS && !(c.coordinates && c.coordinates.trim())) return false;
            
            const search = (searchTerm || '').toLowerCase();
            const mainMatch = (c.name || '').toLowerCase().includes(search) ||
                   (c.legalName || '').toLowerCase().includes(search) ||
                   (c.address || '').toLowerCase().includes(search) ||
                   (c.city || '').toLowerCase().includes(search) ||
                   (c.cif || '').toLowerCase().includes(search);
            if (mainMatch) return true;
            // Also search in branches
            if (Array.isArray(c.branches) && c.branches.length > 0) {
                return c.branches.some(b => 
                    (b.name || '').toLowerCase().includes(search) ||
                    (b.address || '').toLowerCase().includes(search) ||
                    (b.city || '').toLowerCase().includes(search)
                );
            }
            return false;
        });


        if (sortConfig.key) {
            result.sort((a, b) => {
                let aVal = String(a[sortConfig.key] || '').toLowerCase();
                let bVal = String(b[sortConfig.key] || '').toLowerCase();
                
                if (sortConfig.key === 'clientNumber') {
                    const padNum = (str) => str.replace(/(\d+)/g, (match) => match.padStart(10, '0'));
                    aVal = padNum(aVal);
                    bVal = padNum(bVal);
                }

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return result;
    }, [clients, searchTerm, sortConfig, filterGPS]);

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const SortIcon = ({ column }) => {
        if (sortConfig.key !== column) return <div className="w-4 h-4 opacity-10 group-hover:opacity-30"><ChevronUp size={14} /></div>;
        return sortConfig.direction === 'asc' ? <ChevronUp size={14} className="text-blue-600" /> : <ChevronDown size={14} className="text-blue-600" />;
    };


    // Edit Handler: Open modal with client data
    const handleEdit = (client) => {
        setEditingClient(client);
        setIsCreateModalOpen(true);
    };

    // Duplicate Handler: Open modal with copied data (without ID)
    const handleDuplicate = (client) => {
        const { id, createdAt, updatedAt, ...clientCopy } = client;
        setEditingClient({ ...clientCopy, name: `${client.name || 'Cliente'} (Copia)` });
        setIsCreateModalOpen(true);
    };

    // Save Handler: Distinguishes between Create and Update based on presence of ID
    const handleSave = (clientData) => {
        if (clientData.id) {
            // Update existing
            onUpdateClient(clientData.id, clientData);
        } else {
            // Create new
            onAddClient(clientData);
        }
        setEditingClient(null); // Clear editing state
    };

    const handleModalClose = () => {
        setIsCreateModalOpen(false);
        setEditingClient(null);
    };

    const handleExportToFactusol = async () => {
        const ExcelJS = (await import('exceljs')).default;
        const { saveAs } = await import('file-saver');

        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Clientes');

        const headers = [
            'Código', 'Código para contabilidad', 'NIF', 'Nombre fiscal', 'Nombre comercial',
            'Domicilio', 'Población', 'Código postal', 'Provincia', 'País',
            'Teléfono', 'Fax', 'Móvil', 'Persona de contacto', 'Agente comercial',
            'Banco', 'Entidad', 'Oficina', 'Autor (delegado)', 'Name',
            'Forma de pago', '% Financiación', '% Pronto pago', 'Tarifa',
            'Día de pago 1', 'Día de pago 2', 'Día de pago 3', 'Tipo de cliente',
            'Descuento fijo 1', 'Descuento fijo 2', 'Descuento fijo 3', 'Tarifa especial',
            'Código de proveedor', 'Actividades', 'Tipo de portes', 'Texto de portes',
            'Aplicarlo al cliente', 'Tipo de IVA del cliente', 'Recargo de equivalencia',
            'Fecha de alta', 'Fecha de nacimiento', 'E-mail',
            'Autor (delegado)2', 'Modificado por (delegado)', 'Modificado por (delegado)3',
            'Unidad de negocio propietaria', 'Equipo propietario', 'Equipo propietario4',
            'Usuario propietario', 'Número de secuencia de importación',
            'Fecha de creación del registro', 'Número de versión de regla de zona horaria',
            'Código de zona horaria de conversión UTC', 'Número de versión',
            'Modificado por', 'Modificado por5', 'CLI', 'Cuenta', 'Dígito de control',
        ];

        // Add columns with width
        ws.columns = headers.map(h => ({ header: h, key: h, width: 22 }));

        // Style header row — azul oscuro, texto blanco, negrita
        const headerRow = ws.getRow(1);
        headerRow.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2F5496' } };
            cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 10, name: 'Calibri' };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFFFFF' } },
                bottom: { style: 'thin', color: { argb: 'FFFFFF' } },
                left: { style: 'thin', color: { argb: 'FFFFFF' } },
                right: { style: 'thin', color: { argb: 'FFFFFF' } },
            };
        });
        headerRow.height = 20;

        // --- LÓGICA DE AGRUPACIÓN DE DELEGACIONES ---
        const clientsToExportMap = new Map();

        // Primera pasada: Añadir clientes principales (sin sufijo de letra)
        clients.forEach(client => {
            const rawClientNumber = client.clientNumber || '';
            const matchSuffix = String(rawClientNumber).match(/^(.*?\d)[-_ ]?[a-zA-Z]{1,2}$/);
            
            if (!matchSuffix && rawClientNumber) {
                clientsToExportMap.set(String(rawClientNumber), client);
            }
        });

        // Segunda pasada: Rellenar con delegaciones si falta el cliente principal
        clients.forEach(client => {
            const rawClientNumber = client.clientNumber || '';
            const matchSuffix = String(rawClientNumber).match(/^(.*?\d)[-_ ]?[a-zA-Z]{1,2}$/);
            
            if (matchSuffix) {
                const baseNumber = matchSuffix[1];
                if (!clientsToExportMap.has(baseNumber)) {
                    // Usar esta delegación como principal, pero con el número base
                    clientsToExportMap.set(baseNumber, { ...client, clientNumber: baseNumber });
                }
            }
        });

        // Añadir también aquellos que no tienen clientNumber
        const clientsWithoutNumber = clients.filter(c => !c.clientNumber);
        
        const clientsToExport = [...Array.from(clientsToExportMap.values()), ...clientsWithoutNumber];

        // Add data rows with alternating colors
        clientsToExport.forEach((client, index) => {
            const row = ws.addRow({
                'Código': client.clientNumber || client.id || '',
                'Código para contabilidad': '',
                'NIF': client.cif || '',
                'Nombre fiscal': client.legalName || client.name || '',
                'Nombre comercial': client.name || '',
                'Domicilio': client.address || '',
                'Población': client.city || '',
                'Código postal': client.zip || '',
                'Provincia': client.province || '',
                'País': client.country || '',
                'Teléfono': client.phone || '',
                'Fax': client.fax || '',
                'Móvil': client.mobile || '',
                'Persona de contacto': client.contactPerson || '',
                'Agente comercial': client.agent || '',
                'Banco': client.bank || '',
                'Entidad': client.bankEntity || '',
                'Oficina': client.bankOffice || '',
                'Autor (delegado)': '',
                'Name': '',
                'Forma de pago': client.paymentMethod || '',
                '% Financiación': client.financingPct || '',
                '% Pronto pago': client.promptPaymentPct || '',
                'Tarifa': client.tariff || '',
                'Día de pago 1': client.payDay1 || '',
                'Día de pago 2': client.payDay2 || '',
                'Día de pago 3': client.payDay3 || '',
                'Tipo de cliente': client.type || '',
                'Descuento fijo 1': client.discount1 || '',
                'Descuento fijo 2': client.discount2 || '',
                'Descuento fijo 3': client.discount3 || '',
                'Tarifa especial': client.specialTariff || '',
                'Código de proveedor': client.supplierCode || '',
                'Actividades': client.activities || '',
                'Tipo de portes': client.freightType || '',
                'Texto de portes': client.freightText || '',
                'Aplicarlo al cliente': '',
                'Tipo de IVA del cliente': client.vatType || '',
                'Recargo de equivalencia': client.equivalenceSurcharge || '',
                'Fecha de alta': client.registrationDate || '',
                'Fecha de nacimiento': client.birthDate || '',
                'E-mail': client.email || '',
                'Autor (delegado)2': '',
                'Modificado por (delegado)': '',
                'Modificado por (delegado)3': '',
                'Unidad de negocio propietaria': '',
                'Equipo propietario': '',
                'Equipo propietario4': '',
                'Usuario propietario': '',
                'Número de secuencia de importación': '',
                'Fecha de creación del registro': '',
                'Número de versión de regla de zona horaria': '',
                'Código de zona horaria de conversión UTC': '',
                'Número de versión': '',
                'Modificado por': '',
                'Modificado por5': '',
                'CLI': '',
                'Cuenta': client.account || '',
                'Dígito de control': client.controlDigit || '',
            });

            // Alternating row colors: blanco / azul claro
            const bgColor = index % 2 === 0 ? 'FFFFFF' : 'D9E1F2';
            row.eachCell({ includeEmpty: true }, cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
                cell.font = { size: 10, name: 'Calibri' };
                cell.alignment = { vertical: 'middle' };
            });
            row.height = 16;
        });

        // Add autofilter covering ALL columns in row 1
        const colToLetter = n => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
        ws.autoFilter = { from: 'A1', to: `${colToLetter(headers.length - 1)}1` };

        // Freeze header row
        ws.views = [{ state: 'frozen', ySplit: 1 }];

        const buffer = await wb.xlsx.writeBuffer();
        saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'CLI.xlsx');
    };

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        event.target.value = ''; // Reset input

        try {
            const ExcelJS = (await import('exceljs')).default;
            const wb = new ExcelJS.Workbook();
            const buffer = await file.arrayBuffer();
            await wb.xlsx.load(buffer);
            const ws = wb.worksheets[0];
            if (!ws) { alert('No se encontró ninguna hoja en el archivo.'); return; }

            // Read headers from first row
            const headerRow = ws.getRow(1).values; // 1-indexed, index 0 is empty
            const headerMap = {};
            headerRow.forEach((h, i) => { if (h) headerMap[String(h).trim()] = i; });

            const newClients = [];
            ws.eachRow((row, rowNum) => {
                if (rowNum === 1) return; // Skip header
                const get = (col) => {
                    const idx = headerMap[col];
                    if (!idx) return '';
                    const v = row.getCell(idx).value;
                    return v !== null && v !== undefined ? String(v).trim() : '';
                };
                const name = get('Nombre comercial') || get('Nombre fiscal');
                if (!name) return; // Skip empty rows
                newClients.push({
                    id: get('Código') || undefined,
                    clientNumber: get('Código') ? parseInt(get('Código'), 10) : undefined,
                    name,
                    legalName: get('Nombre fiscal'),
                    cif: get('NIF'),
                    address: get('Domicilio'),
                    city: get('Población'),
                    zip: get('Código postal'),
                    province: get('Provincia'),
                    phone: get('Teléfono'),
                    mobile: get('Móvil'),
                    email: get('E-mail'),
                    type: 'Remitente',
                });
            });

            if (newClients.length > 0) {
                onImportClients(newClients);
                alert(`✅ Se han importado ${newClients.length} clientes desde Factusol correctamente.`);
            } else {
                alert('No se encontraron clientes en el archivo. Asegúrate de que el archivo sea un CLI.xlsx exportado de Factusol.');
            }
        } catch (err) {
            console.error('Error al importar:', err);
            alert('Error al leer el archivo. Asegúrate de que sea un archivo CLI.xlsx válido de Factusol.');
        }
    };

    return (
        <div className="space-y-6">
            {/* Header / Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg flex items-center justify-between">
                    <div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Base de Datos</p>
                        <h2 className="text-2xl font-bold">{(clients?.length || 0)} Ubicaciones</h2>

                        <span className="text-xs text-emerald-400 flex items-center gap-1 mt-2">
                            <Lock size={12} />
                            Ubicaciones Protegidas
                        </span>
                    </div>
                    <div className="p-3 bg-slate-800 rounded-full">
                        <Database size={24} className="text-blue-400" />
                    </div>
                </div>
            </div>

            {/* Actions Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <div className="relative w-full sm:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar cliente o dirección..."
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <button
                        onClick={() => setFilterGPS(!filterGPS)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all border ${
                            filterGPS
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                        title="Filtrar clientes con ubicación GPS guardada"
                    >
                        <MapPin size={18} className={filterGPS ? 'text-emerald-600' : 'text-slate-400'} />
                        {filterGPS ? `Con GPS (${filteredClients.length})` : 'Con GPS'}
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".csv"
                        className="hidden"
                    />
                    <button
                        onClick={() => fileInputRef.current.click()}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors font-medium text-sm"
                    >
                        <FileSpreadsheet size={18} className="text-green-600" />
                        Importar Excel (CSV)
                    </button>
                    <button
                        onClick={handleExportToFactusol}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors font-medium text-sm"
                    >
                        <Download size={18} className="text-blue-600" />
                        Exportar a Factusol
                    </button>
                    <button
                        onClick={() => {
                            setEditingClient(null);
                            setIsCreateModalOpen(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm shadow-lg shadow-blue-500/20"
                    >
                        <Plus size={18} />
                        Nuevo Cliente
                    </button>
                </div>
            </div>

            {/* Clients Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('clientNumber')}>
                                <div className="flex items-center gap-1">
                                    Nº Cliente
                                    <SortIcon column="clientNumber" />
                                </div>
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('name')}>
                                <div className="flex items-center gap-1">
                                    Comercial / Razón Social
                                    <SortIcon column="name" />
                                </div>
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('city')}>
                                <div className="flex items-center gap-1">
                                    Ubicación
                                    <SortIcon column="city" />
                                </div>
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('phone')}>
                                <div className="flex items-center gap-1">
                                    Contacto
                                    <SortIcon column="phone" />
                                </div>
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('type')}>
                                <div className="flex items-center gap-1">
                                    Tipo
                                    <SortIcon column="type" />
                                </div>
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('billingType')}>
                                <div className="flex items-center gap-1">
                                    Cobro
                                    <SortIcon column="billingType" />
                                </div>
                            </th>
                            <th className="px-6 py-4 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredClients.map((client) => (
                            <React.Fragment key={client.id}>
                            <tr className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-medium font-mono">
                                    {client.clientNumber ? String(client.clientNumber).replace(/(\d+)/, match => match.padStart(4, '0')) : '--'}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-slate-100 text-slate-600 rounded-lg shrink-0">
                                            <Building2 size={18} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <div className="font-bold text-slate-800">{client.name}</div>
                                                {Array.isArray(client.branches) && client.branches.length > 0 && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-100">
                                                        <Building2 size={10} /> {client.branches.length} sedes
                                                    </span>
                                                )}
                                            </div>
                                            {client.legalName && <div className="text-xs text-slate-500 mt-0.5">{client.legalName}</div>}
                                            {client.cif && <div className="text-[10px] text-slate-400 font-mono mt-0.5">{client.cif}</div>}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="text-sm">
                                        <div className="flex items-start gap-2 text-slate-700">
                                            <Lock size={12} className="text-amber-400 shrink-0 mt-1" title="Ubicación Bloqueada" />
                                            <span className="font-medium">{client.address}</span>
                                        </div>
                                        {(client.city || client.zip) && (
                                            <div className="ml-5 text-slate-500 text-xs mt-0.5">
                                                {client.zip} {client.city}
                                            </div>
                                        )}
                                        {client.coordinates && (
                                            <div className="ml-5 text-blue-400 text-[10px] mt-0.5 font-mono flex items-center gap-1">
                                                <MapPin size={8} />
                                                {client.coordinates}
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {client.phone ? (
                                        <div className="text-sm text-slate-600">{client.phone}</div>
                                    ) : (
                                        <span className="text-xs text-slate-300 italic">--</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                        ${client.type === 'Remitente' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                                            client.type === 'Destinatario' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                                'bg-purple-50 text-purple-700 border border-purple-100'}`}>
                                        {client.type}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider
                                                    ${(client.priority || 'urgent') === 'urgent' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
                                                    {(client.priority || 'urgent') === 'urgent' ? 'Urgente' : 'Estándar'}
                                                </span>
                                            </div>
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                                ${client.billingType === 'Clientes Habituales' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-slate-50 text-slate-600 border border-slate-200'}`}>
                                                {client.billingType || 'Facturación'}
                                            </span>
                                            {client.color && (
                                                <div className="flex items-center gap-1.5 mt-1">
                                                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: client.color }}></div>
                                                    <span className="text-[10px] text-slate-400">Color</span>
                                                </div>
                                            )}
                                            {client.tariffType === 'Por Kilos' && client.weightTariff && client.weightTariff.length > 0 && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 mt-1">
                                                    ⚖️ {client.weightTariff.length} tramos
                                                </span>
                                            )}
                                        </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        {Array.isArray(client.branches) && client.branches.length > 0 && (
                                            <button
                                                onClick={() => {
                                                    setExpandedClients(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(client.id)) next.delete(client.id);
                                                        else next.add(client.id);
                                                        return next;
                                                    });
                                                }}
                                                className={`p-2 rounded-lg transition-colors ${expandedClients.has(client.id) ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'}`}
                                                title={expandedClients.has(client.id) ? 'Ocultar sedes' : 'Ver sedes'}
                                            >
                                                {expandedClients.has(client.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDuplicate(client)}
                                            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                            title="Duplicar Ubicación / Crear Delegación"
                                        >
                                            <Copy size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleEdit(client)}
                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="Editar Ubicación"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => onDeleteClient(client.id)}
                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Eliminar Cliente"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                            {/* Expandable branch rows */}
                            {Array.isArray(client.branches) && client.branches.length > 0 && expandedClients.has(client.id) && (
                                client.branches.map((branch) => (
                                    <tr key={`${client.id}-${branch.id}`} className="bg-blue-50/40 border-l-4 border-blue-200 hover:bg-blue-50 transition-colors">
                                        <td className="px-6 py-2.5 whitespace-nowrap text-sm text-slate-400 font-mono">
                                            <span className="text-[10px]">└─</span>
                                        </td>
                                        <td className="px-6 py-2.5">
                                            <div className="flex items-center gap-2 pl-5">
                                                <div className="p-1.5 bg-blue-100 text-blue-500 rounded-md shrink-0">
                                                    <MapPin size={14} />
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-slate-700 text-sm">{branch.name || 'Sede sin nombre'}</div>
                                                    {branch.contactPerson && <div className="text-[10px] text-slate-400 mt-0.5">Contacto: {branch.contactPerson}</div>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-2.5">
                                            <div className="text-sm">
                                                <div className="flex items-start gap-2 text-slate-600">
                                                    <MapPin size={12} className="text-blue-400 shrink-0 mt-0.5" />
                                                    <span className="font-medium text-xs">{branch.address || '--'}</span>
                                                </div>
                                                {(branch.city || branch.zip) && (
                                                    <div className="ml-5 text-slate-500 text-xs mt-0.5">
                                                        {branch.zip} {branch.city}
                                                    </div>
                                                )}
                                                {branch.coordinates && (
                                                    <div className="ml-5 text-blue-400 text-[10px] mt-0.5 font-mono flex items-center gap-1">
                                                        <MapPin size={8} />
                                                        {branch.coordinates}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-2.5 whitespace-nowrap">
                                            {branch.phone ? (
                                                <div className="text-sm text-slate-600">{branch.phone}</div>
                                            ) : (
                                                <span className="text-xs text-slate-300 italic">--</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-2.5" colSpan="2">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-500 border border-blue-100">
                                                Sede
                                            </span>
                                        </td>
                                        <td className="px-6 py-2.5">
                                        </td>
                                    </tr>
                                ))
                            )}
                            </React.Fragment>
                        ))}
                        {filteredClients.length === 0 && (
                            <tr>
                                <td colSpan="6" className="text-center py-8 text-slate-400">
                                    No hay ubicaciones registradas aún.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <CreateClientModal
                isOpen={isCreateModalOpen}
                onClose={handleModalClose}
                onSave={handleSave}
                articles={articles}
                tariffs={tariffs}
                allPoblaciones={allPoblaciones}
                initialData={editingClient}
                allClients={clients}
            />
        </div>
    );
}

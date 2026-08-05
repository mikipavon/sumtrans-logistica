import { Search, Filter, Plus, MoreVertical, MapPin, Calendar, Truck, User, BarChart2, CheckCircle, Clock, AlertCircle, FileText, Printer, Trash2, ChevronUp, ChevronDown, PackagePlus, X, Banknote } from 'lucide-react';
import { printShipmentTicket } from '../utils/printShipment';
import { useState, useMemo, useEffect } from 'react';
import CreateShipmentModal from '../components/shipments/CreateShipmentModal';
import CreatePickupModal from '../components/shipments/CreatePickupModal';
import ShipmentDetailsModal from '../components/shipments/ShipmentDetailsModal';
import { getPackagesCount } from '../utils/shipmentUtils';
import ImportExcelShipments from '../components/clients/ImportExcelShipments';
import BudgetLiquidationModal from '../components/shipments/BudgetLiquidationModal';
import CodReceiptUploadModal from '../components/shipments/CodReceiptUploadModal';
import { Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
const { utils, writeFile } = XLSX;

export default function Shipments({ shipments, allShipments, drivers, clients, allPoblaciones, onAssignDriver, onCreateShipment, onAddClient, onUpdateClient, tariffs, onUpdateShipment, onUpdateMultipleShipments, articles, defaultCodFee, onDeleteShipment, onDeleteMultipleShipments, familyOrder, coverageZones, isGhostModeUnlocked, initialStatusFilter, onClearStatusFilter, driverNamePreference = 'both' }) {
    const getDriverDisplayName = (driver) => {
        if (!driver) return '';
        const name = driver.name || '';
        const alias = driver.alias || '';
        if (driverNamePreference === 'alias' && alias) return alias;
        if (driverNamePreference === 'name') return name;
        return alias ? `${name} (${alias})` : name;
    };

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isPickupModalOpen, setIsPickupModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
    const [isCodReceiptModalOpen, setIsCodReceiptModalOpen] = useState(false);
    const [importClientId, setImportClientId] = useState('');
    const [importClientSearch, setImportClientSearch] = useState('');
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'stats'
    const [assignmentModal, setAssignmentModal] = useState({ isOpen: false, shipmentId: null, driverId: '', scheduledDate: '' });


    // Details Modal State
    const [selectedShipment, setSelectedShipment] = useState(null);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    
    // Export Modal State
    const [exportModal, setExportModal] = useState({ isOpen: false, startDate: '', endDate: '', onlyFacturacion: true, excludeExported: true, specificId: '' });

    // Filters State
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState(initialStatusFilter || 'all');
    const [driverFilter, setDriverFilter] = useState('all');
    const [selectedIds, setSelectedIds] = useState([]);
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    // Apply initial filter from Dashboard navigation
    useEffect(() => {
        if (initialStatusFilter) {
            setStatusFilter(initialStatusFilter);
            if (onClearStatusFilter) onClearStatusFilter();
        }
    }, [initialStatusFilter]);


    // Helper para parsear fechas en formato español
    const parseShipmentDate = (d) => {
        if (!d) return null;
        if (d instanceof Date) return d;
        if (typeof d === 'number') return new Date(d);
        const dObj = new Date(d);
        if (!isNaN(dObj.getTime())) return dObj;
        const slashMatch = String(d).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (slashMatch) return new Date(slashMatch[3], slashMatch[2] - 1, slashMatch[1]);
        const months = { ene:0, feb:1, mar:2, abr:3, may:4, jun:5, jul:6, ago:7, sep:8, oct:9, nov:10, dic:11 };
        const spaceMatch = String(d).toLowerCase().match(/^(\d{1,2})\s+([a-z]{3,})\.?\s+(\d{4})$/);
        if (spaceMatch) {
            const m = spaceMatch[2].substring(0, 3);
            if (months[m] !== undefined) return new Date(spaceMatch[3], months[m], spaceMatch[1]);
        }
        return null;
    };

    // Filter Logic
    const filteredShipments = useMemo(() => {
        const safeShipments = Array.isArray(shipments) ? shipments : [];
        let result = safeShipments.filter(shipment => {
            const matchesSearch =
                (shipment.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (shipment.client || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (shipment.origin || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (shipment.destination || '').toLowerCase().includes(searchTerm.toLowerCase());

            const PENDING_STATUSES = ['Pendiente', 'Asignado', 'Pendiente de asignar'];
            const matchesStatus = statusFilter === 'all' || statusFilter === 'cod_no_receipt' || 
                (statusFilter === 'Pendiente' ? PENDING_STATUSES.includes(shipment.status) : shipment.status === statusFilter);

            const matchesDriver = driverFilter === 'all' ||
                (driverFilter === 'unassigned' ? !shipment.assignedDriverId : String(shipment.assignedDriverId) === driverFilter);

            // Special filter: COD receipts pending upload
            const matchesCodReceipt = statusFilter !== 'cod_no_receipt' || 
                (shipment.hasCod && shipment.codPaid && !shipment.codReceiptPhoto);

            // Date range filter
            let matchesDate = true;
            if (dateFrom || dateTo) {
                const shipDate = shipment.createdAt ? new Date(shipment.createdAt) : parseShipmentDate(shipment.date);
                if (shipDate) {
                    const shipDay = new Date(shipDate.getFullYear(), shipDate.getMonth(), shipDate.getDate());
                    if (dateFrom) {
                        const from = new Date(dateFrom + 'T00:00:00');
                        if (shipDay < from) matchesDate = false;
                    }
                    if (dateTo) {
                        const to = new Date(dateTo + 'T23:59:59');
                        if (shipDay > to) matchesDate = false;
                    }
                } else {
                    matchesDate = false;
                }
            }

            return matchesSearch && matchesStatus && matchesDriver && matchesCodReceipt && matchesDate;
        });

        // Apply Sorting
        if (sortConfig.key) {
            result.sort((a, b) => {
                let aVal = a[sortConfig.key];
                let bVal = b[sortConfig.key];

                // Handle Amounts/Numbers
                if (sortConfig.key === 'amount') {
                    const cleanA = parseFloat(String(aVal || '0').replace(/[^0-9.-]/g, '')) || 0;
                    const cleanB = parseFloat(String(bVal || '0').replace(/[^0-9.-]/g, '')) || 0;
                    return sortConfig.direction === 'asc' ? cleanA - cleanB : cleanB - cleanA;
                }

                // Handle Dates
                if (sortConfig.key === 'date' || sortConfig.key === 'createdAt') {
                    const parseSpanishDate = (d) => {
                        if (!d) return 0;
                        if (d instanceof Date) return d.getTime();
                        if (typeof d === 'number') return d;
                        
                        // Si ya es un ISO, new Date lo pillará bien.
                        const dObj = new Date(d);
                        if (!isNaN(dObj.getTime())) return dObj.getTime();

                        // Formato DD/MM/YYYY
                        const slashMatch = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                        if (slashMatch) return new Date(slashMatch[3], slashMatch[2] - 1, slashMatch[1]).getTime();

                        // Formato "9 abr 2024" o similar
                        const months = { ene:0, feb:1, mar:2, abr:3, may:4, jun:5, jul:6, ago:7, sep:8, oct:9, nov:10, dic:11 };
                        const spaceMatch = d.toLowerCase().match(/^(\d{1,2})\s+([a-z]{3,})\.?\s+(\d{4})$/);
                        if (spaceMatch) {
                            const m = spaceMatch[2].substring(0, 3);
                            if (months[m] !== undefined) return new Date(spaceMatch[3], months[m], spaceMatch[1]).getTime();
                        }
                        return 0;
                    };

                    // Priorizamos createdAt si existe, ya que es ISO y 100% fiable
                    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : parseSpanishDate(a.date);
                    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : parseSpanishDate(b.date);
                    
                    return sortConfig.direction === 'asc' ? timeA - timeB : timeB - timeA;
                }

                // Handle IDs numerically (TR-1, TR-2, ..., TR-100)
                if (sortConfig.key === 'id') {
                    const numA = parseInt(String(aVal || '').replace(/\D/g, ''), 10) || 0;
                    const numB = parseInt(String(bVal || '').replace(/\D/g, ''), 10) || 0;
                    return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
                }

                // Default String Comparison
                const strA = String(aVal || '').toLowerCase();
                const strB = String(bVal || '').toLowerCase();
                
                if (strA < strB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (strA > strB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [shipments, searchTerm, statusFilter, driverFilter, sortConfig, dateFrom, dateTo]);

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


    // Statistics Logic
    const stats = useMemo(() => {
        const total = filteredShipments.length;
        const delivered = filteredShipments.filter(s => s.status === 'Entregado').length;
        const pending = filteredShipments.filter(s => s.status === 'Pendiente de asignar').length;
        const transit = filteredShipments.filter(s => s.status === 'En reparto').length;
        const incident = filteredShipments.filter(s => s.status === 'Incidencia').length;
        const deferred = filteredShipments.filter(s => s.status === 'Entrega aplazada').length;

        const safeDrivers = Array.isArray(drivers) ? drivers : [];

        // Group by City (Destination)
        const byCity = {};
        filteredShipments.forEach(s => {
            const city = s.destinationCity || (s.destination ? s.destination.split(',')[0].trim() : 'Desconocido'); // Fallback to parsing string if city field missing
            byCity[city] = (byCity[city] || 0) + 1;
        });

        // Group by Driver
        const byDriver = {};
        filteredShipments.forEach(s => {
            if (s.assignedDriverId) {
                const driver = safeDrivers.find(d => d.id === s.assignedDriverId);
                const name = driver ? driver.name : 'Desconocido';
                byDriver[name] = (byDriver[name] || 0) + 1;
            } else {
                byDriver['Sin Asignar'] = (byDriver['Sin Asignar'] || 0) + 1;
            }
        });

        return { total, delivered, pending, transit, incident, deferred, byCity, byDriver };
    }, [filteredShipments, drivers]);

    // Export to Excel Logic — estructura exacta de ALB.xlsx y LAL.xlsx de Factusol
    const handleExportToExcel = async () => {
        const ExcelJS = (await import('exceljs')).default;
        const { saveAs } = await import('file-saver');

        const today = new Date();
        const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        // --- FILTRADO SELECTIVO ---
        const getClientInfo = (s) => {
            const payingClientName = String(s.porteType === 'Debido' ? (s.destinationName || s.destination) : s.client).trim();

            
            let foundClient = (clients || []).find(cl => 
                (payingClientName && (cl.name || '').toLowerCase().trim() === payingClientName.toLowerCase()) || 
                (payingClientName && (cl.legalName || '').toLowerCase().trim() === payingClientName.toLowerCase()) ||
                (s.porteType !== 'Debido' && s.clientId && String(cl.id) === String(s.clientId))
            );



            if (foundClient) {
                const rawNum = foundClient.clientNumber || '';
                const matchSuffix = String(rawNum).trim().match(/^(.*?\d)[-_ ]?[a-zA-Z]{1,2}$/);
                if (matchSuffix) {
                    const baseNumber = matchSuffix[1];
                    const parentClient = (clients || []).find(c => String(c.clientNumber || '').trim() === baseNumber);

                    if (parentClient) return parentClient;
                }
                return foundClient;
            }

            return {};
        };

        const getBillingType = (s) => {
            if (s.billingType) return s.billingType;
            return getClientInfo(s).billingType || 'Clientes Habituales';
        };

        const getClientNumber = (s) => {
            return getClientInfo(s).clientNumber || '';
        };

        const parseDateString = (d) => {
            if (!d) return null;
            if (d instanceof Date) return d.getTime();
            if (typeof d === 'number') return d;
            
            const dObj = new Date(d);
            if (!isNaN(dObj.getTime())) return dObj.getTime();

            const slashMatch = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (slashMatch) return new Date(slashMatch[3], slashMatch[2] - 1, slashMatch[1]).getTime();

            const months = { ene:0, feb:1, mar:2, abr:3, may:4, jun:5, jul:6, ago:7, sep:8, oct:9, nov:10, dic:11 };
            const spaceMatch = d.toLowerCase().match(/^(\d{1,2})\s+([a-z]{3,})\.?\s+(\d{4})$/);
            if (spaceMatch) {
                const m = spaceMatch[2].substring(0, 3);
                if (months[m] !== undefined) return new Date(spaceMatch[3], months[m], spaceMatch[1]).getTime();
            }
            return null;
        };

        let start = exportModal.startDate ? new Date(exportModal.startDate) : null;
        if (start) {
            start.setHours(0, 0, 0, 0);
            start = start.getTime();
        }
        
        let end = exportModal.endDate ? new Date(exportModal.endDate) : null;
        if (end) {
            end.setHours(23, 59, 59, 999);
            end = end.getTime();
        }

        const shipmentsToExport = filteredShipments.filter(s => {
            if (exportModal.onlyFacturacion && getBillingType(s) !== 'Facturación') return false;

            if (start || end) {
                const sTime = s.createdAt ? new Date(s.createdAt).getTime() : parseDateString(s.date);
                if (sTime) {
                    if (start && sTime < start) return false;
                    if (end && sTime > end) return false;
                }
            }
            return true;
        });

        if (shipmentsToExport.length === 0) {
            alert("No hay envíos que coincidan con la selección de fechas y facturación para exportar.");
            setExportModal(prev => ({ ...prev, isOpen: false }));
            return;
        }

        const applyTableStyle = (ws, headers, dataRows) => {
            ws.columns = headers.map(h => ({ header: h, key: h, width: 22 }));
            // Style header
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
            // Style data rows
            dataRows.forEach((rowData, index) => {
                const row = ws.addRow(rowData);
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
            ws.views = [{ state: 'frozen', ySplit: 1 }];
        };

        // 1. ALB — Cabecera de Albarán (85 columnas)
        const albHeaders = [
            'Tipo de documento', 'Número de documento', 'Referencia', 'Fecha', 'Estado2',
            'Almacén', 'Agente', 'Código del proveedor', 'Código de cliente', 'Nombre del Cliente',
            'Domicilio del cliente', 'Población', 'Código postal', 'Provincia', 'N.I.F.',
            'Tipo de IVA', 'Recargo de equivalencia', 'Teléfono del cliente',
            'Importe neto 1', 'Importe neto 2', 'Importe neto 3',
            'Porcentaje de descuento 1', 'Porcentaje de descuento 2', 'Porcentaje de descuento 3',
            'Importe de descuento 1', 'Importe de descuento 2', 'Importe de descuento 3',
            'Porcentaje pronto pago 1', 'Porcentaje pronto pago 2', 'Porcentaje pronto pago 3',
            'Importe pronto pago 1', 'Importe pronto pago 2', 'Importe pronto pago 3',
            'Porcentaje portes 1', 'Porcentaje portes 2', 'Porcentaje portes 3',
            'Importe portes 1', 'Importe portes 2', 'Importe portes 3',
            'Porcentaje de financiación 1', 'Porcentaje de financiación 2', 'Porcentaje de financiación 3',
            'Importe de financiación 1', 'Importe de financiación 2', 'Importe de financiación 3',
            'Base imponible 1', 'Base imponible 2', 'Base imponible 3',
            'Porcentaje de IVA 1', 'Porcentaje de IVA 2', 'Porcentaje de IVA 3',
            'Importe de IVA 1', 'Importe de IVA 2', 'Importe de IVA 3',
            'Porcentaje de recargo de equivalencia 1', 'Porcentaje de recargo de equivalencia 2', 'Porcentaje de recargo de equivalencia 3',
            'Importe de recargo de equivalencia 1', 'Importe de recargo de equivalencia 2', 'Importe de recargo de equivalencia 3',
            'Porcentaje de la retención', 'Importe de la retención', 'Precio con IVA',
            'Forma de pago', 'Portes', 'Texto de portes', 'Observación', 'Descripción',
            'Obra de entrega', 'Remitido por', 'Embalado por', 'A la atención de', 'Referencia2',
            'Estado', 'Propietario (búsqueda)', 'BI2', 'BI3', 'línea de observaciones 2',
            'Nº de su pedido', 'Nombre Comercial', 'Total', 'Z ARTICULO', 'Z Cantidad',
            'Z Cantidad Galary', 'Z Posicion de la linea',
        ];
        const albRows = shipmentsToExport.map((s, index) => {
            const amount = parseFloat((s.amount || '0').toString().replace(/[^0-9.]/g, '')) || 0;
            const bType = getBillingType(s);
            const isPresupuesto = bType === 'Presupuesto';
            const vatRate = isPresupuesto ? 0 : 21;
            const vatAmount = parseFloat((amount * (vatRate / 100)).toFixed(2));
            const totalWithVat = parseFloat((amount + vatAmount).toFixed(2));

            const cInfo = getClientInfo(s);

            const hasReembolso = s.hasCod || parseFloat(String(s.codAmount || '0').replace(/[^0-9.-]/g, '')) > 0;
            const reembolsoText = hasReembolso ? ' (+ Reembolso)' : '';

            const baseArticleDesc = Array.isArray(s.articles) && s.articles.length > 0 
                ? s.articles.map(a => a.name).filter(Boolean).join(' ') 
                : 'PORTES';
                
            const otherPartyText = s.porteType === 'Debido' 
                ? ` (Remite: ${s.originName || s.origin || 'Desconocido'})`
                : ` (Dest: ${s.destinationName || s.destination || 'Desconocido'})`;

            const articleDesc = baseArticleDesc + reembolsoText + otherPartyText;

            const originalTotal = Array.isArray(s.articles) 
                ? s.articles.reduce((sum, art) => sum + (parseFloat(art.price) || 0) * (parseInt(art.quantity) || 1), 0)
                : amount;

            const docNumberStr = String(s.id || '').replace(/\D/g, '');
            const docNumber = docNumberStr ? parseInt(docNumberStr, 10) : (index + 1);

            const rawClientNumber = String(cInfo.clientNumber || '').trim();
            const matchSuffix = rawClientNumber.match(/^(.*?\d)[-_ ]?[a-zA-Z]{1,2}$/);
            const exportClientNumber = matchSuffix ? matchSuffix[1] : rawClientNumber;

            const fallbackClientName = s.porteType === 'Debido' ? (s.destinationName || s.destination || s.client) : s.client;


            return {
                'Tipo de documento': 1, 'Número de documento': docNumber, 'Referencia': s.id || '',
                'Fecha': formattedDate, 'Estado2': '', 'Almacén': '', 'Agente': '', 'Código del proveedor': '',
                'Código de cliente': exportClientNumber, 'Nombre del Cliente': cInfo.legalName || cInfo.name || fallbackClientName || '',
                'Domicilio del cliente': cInfo.address || '', 'Población': cInfo.city || '',
                'Código postal': cInfo.zip || '', 'Provincia': cInfo.province || '',
                'N.I.F.': cInfo.cif || s.clientNif || '', 'Tipo de IVA': 0, 'Recargo de equivalencia': '',
                'Teléfono del cliente': cInfo.phone || cInfo.mobile || s.clientPhone || '', 'Forma de pago': cInfo.paymentMethod || '', 
                'Importe neto 1': amount,
                'Importe neto 2': '', 'Importe neto 3': '',
                'Base imponible 1': amount, 'Porcentaje de IVA 1': vatRate,
                'Importe de IVA 1': vatAmount,
                'Precio con IVA': totalWithVat,
                'Observación': (s.observations || '').replace(/\[COBRO PENDIENTE\]/gi, '').trim(), 'Descripción': articleDesc,
                'Estado': s.status || 'Activo', 'BI2': amount, 'BI3': originalTotal,
                'Nombre Comercial': cInfo.name || fallbackClientName || '', 'Total': amount, 'Z Posicion de la linea': 1,
                'Z Cantidad': 1,
            };
        });

        // 2. LAL — Líneas de Albarán
        const lalHeaders = [
            'Tipo de documento', 'Número de documento', 'Z Posicion de la linea',
            'Z ARTICULO', 'Descripción', 'Z Cantidad',
            'Porcentaje de descuento 1', 'Porcentaje de descuento 2', 'Porcentaje de descuento 3',
            'Z Precio del artículo', 'Total', 'Tipo de IVA', 'Fecha de creación',
            'B12', 'B13'
        ];
        const lalRows = [];
        shipmentsToExport.forEach((s, index) => {
            const docNumberStr = String(s.id || '').replace(/\D/g, '');
            const documentNumber = docNumberStr ? parseInt(docNumberStr, 10) : (index + 1);
            const amount = parseFloat((s.amount || '0').toString().replace(/[^0-9.]/g, '')) || 0;
            const hasReembolso = s.hasCod || parseFloat(String(s.codAmount || '0').replace(/[^0-9.-]/g, '')) > 0;
            const reembolsoText = hasReembolso ? ' (+ Reembolso)' : '';

            const baseDesc = Array.isArray(s.articles) && s.articles.length > 0
                ? s.articles.map(a => a.name || a.description).filter(Boolean).join(' ')
                : 'PORTES';

            const otherPartyText = s.porteType === 'Debido' 
                ? ` (Remite: ${s.originName || s.origin || 'Desconocido'})`
                : ` (Dest: ${s.destinationName || s.destination || 'Desconocido'})`;

            const finalDesc = baseDesc + reembolsoText + otherPartyText;

            const priceTarifa = Array.isArray(s.articles) 
                ? s.articles.reduce((sum, art) => sum + (parseFloat(art.price) || 0) * (parseInt(art.quantity) || 1), 0)
                : amount;

            lalRows.push({
                'Tipo de documento': 1, 'Número de documento': documentNumber,
                'Z Posicion de la linea': 1, 'Z ARTICULO': '1',
                'Descripción': finalDesc, 'Z Cantidad': 1,
                'Porcentaje de descuento 1': '', 'Porcentaje de descuento 2': '', 'Porcentaje de descuento 3': '',
                'Z Precio del artículo': amount, 'Total': amount,
                'Tipo de IVA': 0, 'Fecha de creación': formattedDate,
                'B12': amount,
                'B13': priceTarifa
            });
        });

        const wbAlb = new ExcelJS.Workbook();
        const wsAlb = wbAlb.addWorksheet('ALB');
        applyTableStyle(wsAlb, albHeaders, albRows);
        const bufAlb = await wbAlb.xlsx.writeBuffer();
        saveAs(new Blob([bufAlb], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'ALB.xlsx');

        const wbLal = new ExcelJS.Workbook();
        const wsLal = wbLal.addWorksheet('LAL');
        applyTableStyle(wsLal, lalHeaders, lalRows);
        const bufLal = await wbLal.xlsx.writeBuffer();
        saveAs(new Blob([bufLal], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'LAL.xlsx');
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header & Controls */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <Truck className="text-blue-600" />
                            Gestión de Envíos
                        </h1>
                        <p className="text-slate-500 mt-1">Control logístico y seguimiento en tiempo real</p>
                    </div>

                    <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'list' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Listado
                        </button>
                        <button
                            onClick={() => setViewMode('stats')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'stats' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Estadísticas
                        </button>
                    </div>
                </div>

                {/* Filters Row */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col gap-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Buscar ID, cliente, ciudad..."
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-sm"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <select
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-600 font-medium cursor-pointer text-sm"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="all">Todos los Estados</option>
                            <option value="Pendiente">📋 Todos Pendientes</option>
                            <option value="Pendiente de asignar">Pendiente de asignar</option>
                            <option value="En reparto">En reparto</option>
                            <option value="Entregado">Entregado</option>
                            <option value="Incidencia">Incidencia</option>
                            <option value="Entrega aplazada">Entrega aplazada</option>
                            <option value="cod_no_receipt">📄 Sin Justificante COD ({(Array.isArray(shipments) ? shipments : []).filter(s => s.hasCod && s.codPaid && !s.codReceiptPhoto).length})</option>
                        </select>

                        <select
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-600 font-medium cursor-pointer text-sm"
                            value={driverFilter}
                            onChange={(e) => setDriverFilter(e.target.value)}
                        >
                            <option value="all">Todos los Conductores</option>
                            <option value="unassigned">Sin Asignar</option>
                            {(drivers || []).map(d => (
                                <option key={d.id} value={d.id}>{getDriverDisplayName(d)}</option>
                            ))}
                        </select>

                        <div className="flex items-center gap-1.5">
                            <div className="relative flex-1">
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className={`w-full px-2 py-2.5 bg-slate-50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium cursor-pointer transition-all text-xs ${
                                        dateFrom ? 'border-blue-400 text-blue-700 bg-blue-50' : 'border-slate-200 text-slate-500'
                                    }`}
                                    title="Desde"
                                />
                            </div>
                            <span className="text-slate-400 text-xs font-bold shrink-0">→</span>
                            <div className="relative flex-1">
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className={`w-full px-2 py-2.5 bg-slate-50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium cursor-pointer transition-all text-xs ${
                                        dateTo ? 'border-blue-400 text-blue-700 bg-blue-50' : 'border-slate-200 text-slate-500'
                                    }`}
                                    title="Hasta"
                                />
                            </div>
                            {(dateFrom || dateTo) && (
                                <button
                                    onClick={() => { setDateFrom(''); setDateTo(''); }}
                                    className="text-slate-400 hover:text-red-500 transition-colors shrink-0"
                                    title="Quitar filtro de fechas"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Action Buttons Row */}
                    <div className="flex flex-wrap items-center gap-2">
                        {selectedIds.length > 0 && (
                            <button
                                onClick={() => {
                                    if (window.confirm(`¿Estás seguro de que deseas borrar los ${selectedIds.length} envíos seleccionados?`)) {
                                        onDeleteMultipleShipments(selectedIds);
                                        setSelectedIds([]);
                                    }
                                }}
                                className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors border border-red-200 text-xs font-bold"
                            >
                                <Trash2 size={15} />
                                Eliminar ({selectedIds.length})
                            </button>
                        )}
                        <button
                            onClick={() => setExportModal(prev => ({ ...prev, isOpen: true }))}
                            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors border border-emerald-200 text-xs font-bold"
                        >
                            <FileText size={15} />
                            Excel
                        </button>

                        {isGhostModeUnlocked && (
                            <button
                                onClick={() => setIsBudgetModalOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors border border-indigo-200 text-xs font-bold"
                            >
                                <BarChart2 size={15} />
                                Presupuestos
                            </button>
                        )}

                        <button
                            onClick={() => setIsCodReceiptModalOpen(true)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors border border-amber-200 text-xs font-bold"
                            title="Subir justificantes de reembolso en lote"
                        >
                            <Upload size={15} />
                            Justificantes COD
                        </button>

                        <button
                            onClick={() => setIsImportModalOpen(true)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors border border-indigo-200 text-xs font-bold"
                        >
                            <Plus size={15} />
                            Importar
                        </button>

                        <div className="flex-1" />

                        <button
                            onClick={() => setIsPickupModalOpen(true)}
                            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-bold text-xs shadow-md shadow-amber-500/20"
                        >
                            <PackagePlus size={15} />
                            Recogida
                        </button>
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-bold text-xs shadow-md shadow-blue-500/20"
                        >
                            <Plus size={15} />
                            Nuevo Envío
                        </button>
                    </div>
                </div>
            </div>

            {/* Content View */}
            {viewMode === 'list' ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="px-4 py-4 text-center">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                                            checked={filteredShipments.length > 0 && selectedIds.length === filteredShipments.length}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedIds(filteredShipments.map(s => s.id));
                                                } else {
                                                    setSelectedIds([]);
                                                }
                                            }}
                                        />
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('id')}>
                                        <div className="flex items-center gap-1">
                                            ID Envío
                                            <SortIcon column="id" />
                                        </div>
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('client')}>
                                        <div className="flex items-center gap-1">
                                            Clientes
                                            <SortIcon column="client" />
                                        </div>
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('destinationCity')}>
                                        <div className="flex items-center gap-1">
                                            Ruta
                                            <SortIcon column="destinationCity" />
                                        </div>
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('date')}>
                                        <div className="flex items-center gap-1">
                                            Fecha
                                            <SortIcon column="date" />
                                        </div>
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('status')}>
                                        <div className="flex items-center gap-1">
                                            Estado
                                            <SortIcon column="status" />
                                        </div>
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Conductor</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('amount')}>
                                        <div className="flex items-center justify-end gap-1">
                                            Valor
                                            <SortIcon column="amount" />
                                        </div>
                                    </th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredShipments.map((shipment) => {
                                    const isProgrammed = shipment.scheduledDate && shipment.status === 'En reparto' && (new Date(shipment.scheduledDate).getTime() > new Date().getTime());
                                    const programmedStr = isProgrammed ? new Date(shipment.scheduledDate).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
                                    
                                    return (
                                    <tr
                                        key={shipment.id}
                                        className={`hover:bg-slate-50 transition-colors group cursor-pointer ${selectedIds.includes(shipment.id) ? 'bg-blue-50/50' : ''}`}
                                        onClick={() => {
                                            setSelectedShipment(shipment);
                                            setIsDetailsModalOpen(true);
                                        }}
                                    >
                                        <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                                                checked={selectedIds.includes(shipment.id)}
                                                onChange={() => {
                                                    setSelectedIds(prev =>
                                                        prev.includes(shipment.id)
                                                            ? prev.filter(id => id !== shipment.id)
                                                            : [...prev, shipment.id]
                                                    );
                                                }}
                                            />
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-900 tracking-tight">{shipment.id}</span>
                                                {shipment.exportedAt && (
                                                    <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[8px] font-bold rounded-full uppercase tracking-wider" title={`Exportado: ${new Date(shipment.exportedAt).toLocaleString('es-ES')}`}>FACT</span>
                                                )}
                                                {shipment.hasSimplifiedInvoice && (
                                                    <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[8px] font-bold rounded-full uppercase tracking-wider" title="Factura Simplificada emitida — No se exporta a Factusol">SIMPLIFICADA</span>
                                                )}
                                                {Array.isArray(shipment.scannedPackages) && shipment.scannedPackages.length > 0 && (
                                                    <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded-full uppercase tracking-wider shadow-sm ${
                                                        shipment.scannedPackages.length >= getPackagesCount(shipment)
                                                            ? 'bg-green-600 text-white'
                                                            : 'bg-orange-500 text-white'
                                                    }`}>
                                                        {shipment.scannedPackages.length}/{getPackagesCount(shipment)} BULTOS
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 min-w-[150px] max-w-[220px]">
                                            {shipment.porteType === 'Debido' ? (
                                                <div className="flex flex-col">
                                                    <span className="text-slate-500 font-medium block text-[11px] flex items-center gap-1 mb-0.5">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0"></div>
                                                        <span className="truncate">{shipment.client}</span>
                                                    </span>
                                                    <span className="text-slate-900 font-bold block text-sm truncate">
                                                        {shipment.destinationName || 'Destinatario'}
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col">
                                                    <span className="text-slate-900 font-bold block text-sm truncate">{shipment.client}</span>
                                                    <span className="text-slate-500 font-medium block text-[11px] flex items-center gap-1 mt-0.5">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0"></div>
                                                        <span className="truncate">{shipment.destinationName || 'Destinatario'}</span>
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 min-w-[150px] max-w-[220px]">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                                                    <span className="truncate max-w-[150px]" title={shipment.origin}>{shipment.origin}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-xs text-slate-900 font-medium">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                                    <span className="truncate max-w-[150px]" title={shipment.destination}>{shipment.destination}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-500">
                                            <div className="flex items-center gap-2">
                                                <Calendar size={14} className="text-slate-400" />
                                                {shipment.date}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 min-w-[160px]">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border
                                                ${isProgrammed ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                                                shipment.status === 'En reparto' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                                    shipment.status === 'Entregado' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                                        shipment.status === 'Pendiente de asignar' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                                            shipment.status === 'Incidencia' ? 'bg-red-50 text-red-700 border-red-100' :
                                                                shipment.status === 'Entrega aplazada' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                                                    'bg-slate-50 text-slate-700 border-slate-100'}`}>
                                                {isProgrammed ? (
                                                    <Clock size={12} className="text-indigo-500" />
                                                ) : (
                                                    <span className={`w-1.5 h-1.5 rounded-full
                                                        ${shipment.status === 'En reparto' ? 'bg-blue-500' :
                                                            shipment.status === 'Entregado' ? 'bg-emerald-500' :
                                                                shipment.status === 'Pendiente de asignar' ? 'bg-amber-500' :
                                                                    shipment.status === 'Incidencia' ? 'bg-red-500' :
                                                                        shipment.status === 'Entrega aplazada' ? 'bg-purple-500' :
                                                                            'bg-slate-500'}`}></span>
                                                )}
                                                {isProgrammed ? `Prog: ${programmedStr}` : shipment.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 min-w-[160px] max-w-[220px]">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <User size={14} className="text-slate-400 shrink-0" />
                                                <select
                                                    className="bg-transparent text-sm text-slate-700 font-medium border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none transition-colors cursor-pointer py-0.5 w-full min-w-0 truncate"
                                                    value={shipment.assignedDriverId || ''}
                                                    onClick={(e) => e.stopPropagation()} // Prevent opening details when clicking select
                                                    onChange={(e) => {
                                                        const driverId = e.target.value;
                                                        if (driverId) {
                                                            const nowLocal = new Date();
                                                            nowLocal.setMinutes(nowLocal.getMinutes() - nowLocal.getTimezoneOffset());
                                                            const localDatetime = nowLocal.toISOString().slice(0, 16);
                                                            setAssignmentModal({
                                                                isOpen: true,
                                                                shipmentId: shipment.id,
                                                                driverId: driverId,
                                                                scheduledDate: shipment.scheduledDate || localDatetime
                                                            });
                                                        } else {
                                                            onAssignDriver(shipment.id, '', null);
                                                        }
                                                    }}
                                                >
                                                    <option value="">-- Asignar --</option>
                                                    {(drivers || []).map(driver => (
                                                        <option key={driver.id} value={driver.id}>{getDriverDisplayName(driver)}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right min-w-[110px]">
                                            <div className="flex flex-col items-end gap-1">
                                                <span className="text-sm font-bold text-slate-700 whitespace-nowrap">{shipment.amount}</span>
                                                {shipment.hasCod && parseFloat(shipment.codAmount || 0) > 0 && (
                                                    <span
                                                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap leading-none ${
                                                            shipment.codPaid
                                                                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
                                                                : 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200'
                                                        }`}
                                                        title={shipment.codPaid ? 'Reembolso cobrado' : 'Reembolso pendiente de cobro'}
                                                    >
                                                        <Banknote size={11} className="shrink-0" />
                                                        {parseFloat(shipment.codAmount).toFixed(2)} €
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        printShipmentTicket(shipment);
                                                    }}
                                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Imprimir Albarán"
                                                >
                                                    <Printer size={18} />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (window.confirm('¿Estás seguro de que deseas borrar este envío?')) {
                                                            onDeleteShipment(shipment.id);
                                                        }
                                                    }}
                                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Borrar Envío"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                                <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                                    <MoreVertical size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )})}
                                {filteredShipments.length === 0 && (
                                    <tr>
                                        <td colSpan="9" className="text-center py-12">
                                            <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                                <Search size={32} />
                                            </div>
                                            <h3 className="text-lg font-medium text-slate-900">No se encontraron envíos</h3>
                                            <p className="text-slate-500 mt-1">Prueba a ajustar los filtros o términos de búsqueda.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {/* Pagination Mockup */}
                    <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
                        <span>Mostrando {filteredShipments.length} envíos</span>
                        <div className="flex gap-2">
                            <button className="px-3 py-1 border border-slate-200 rounded hover:bg-white disabled:opacity-50" disabled>Anterior</button>
                            <button className="px-3 py-1 border border-slate-200 rounded hover:bg-white disabled:opacity-50" disabled>Siguiente</button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
                            <div className="flex justify-between items-start mb-2">
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                    <Truck size={20} />
                                </div>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total</span>
                            </div>
                            <div className="text-3xl font-bold text-slate-800">{stats.total}</div>
                            <div className="text-xs text-slate-500 mt-1">Envíos registrados</div>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
                            <div className="flex justify-between items-start mb-2">
                                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                                    <CheckCircle size={20} />
                                </div>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Entregados</span>
                            </div>
                            <div className="text-3xl font-bold text-slate-800">{stats.delivered}</div>
                            <div className="text-xs text-emerald-600 mt-1 font-medium">{Math.round((stats.delivered / stats.total) * 100) || 0}% Completado</div>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
                            <div className="flex justify-between items-start mb-2">
                                <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                                    <Clock size={20} />
                                </div>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pendientes</span>
                            </div>
                            <div className="text-3xl font-bold text-slate-800">{stats.pending}</div>
                            <div className="text-xs text-amber-600 mt-1 font-medium">Requieren atención</div>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
                            <div className="flex justify-between items-start mb-2">
                                <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                                    <AlertCircle size={20} />
                                </div>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">En Ruta</span>
                            </div>
                            <div className="text-3xl font-bold text-slate-800">{stats.transit}</div>
                            <div className="text-xs text-purple-600 mt-1 font-medium">Activos ahora</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Stats by City */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                                <MapPin size={18} className="text-blue-500" />
                                Envíos por Población Destino
                            </h3>
                            <div className="space-y-4">
                                {Object.entries(stats.byCity)
                                    .sort(([, a], [, b]) => b - a)
                                    .slice(0, 5)
                                    .map(([city, count]) => (
                                        <div key={city}>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="font-medium text-slate-700">{city}</span>
                                                <span className="text-slate-500">{count} envíos</span>
                                            </div>
                                            <div className="w-full bg-slate-100 rounded-full h-2">
                                                <div
                                                    className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                                                    style={{ width: `${(count / stats.total) * 100}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </div>

                        {/* Stats by Driver */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                                <User size={18} className="text-purple-500" />
                                Carga de Trabajo por Conductor
                            </h3>
                            <div className="space-y-4">
                                {Object.entries(stats.byDriver)
                                    .sort(([, a], [, b]) => b - a)
                                    .slice(0, 5)
                                    .map(([name, count]) => (
                                        <div key={name}>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="font-medium text-slate-700">{name}</span>
                                                <span className="text-slate-500">{count} envíos</span>
                                            </div>
                                            <div className="w-full bg-slate-100 rounded-full h-2">
                                                <div
                                                    className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                                                    style={{ width: `${(count / stats.total) * 100}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ShipmentDetailsModal
                isOpen={isDetailsModalOpen}
                onClose={() => setIsDetailsModalOpen(false)}
                shipment={selectedShipment}
                drivers={drivers}
                allPoblaciones={allPoblaciones}
                onUpdate={onUpdateShipment}
                clients={clients}
                articles={articles}
                tariffs={tariffs}
                familyOrder={[]}
                driverNamePreference={driverNamePreference}
            />

            <CreateShipmentModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSave={onCreateShipment}
                drivers={drivers}
                clients={clients}
                allPoblaciones={allPoblaciones}
                onAddClient={onAddClient}
                onUpdateClient={onUpdateClient}
                tariffs={tariffs}
                articles={articles}
                defaultCodFee={defaultCodFee}
                familyOrder={familyOrder}
                coverageZones={coverageZones}
                allShipments={allShipments || shipments}
                onUpdateShipment={onUpdateShipment}
            />

            {assignmentModal.isOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <Calendar size={16} className="text-blue-500" />
                                Programar Asignación
                            </h3>
                            <button onClick={() => setAssignmentModal({ isOpen: false, shipmentId: null, driverId: '', scheduledDate: '' })} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Conductor Seleccionado</label>
                                <div className="text-sm font-semibold text-slate-800 p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-2">
                                    <User size={16} className="text-slate-400" />
                                     {(() => {
                                         const drv = drivers.find(d => String(d.id) === String(assignmentModal.driverId));
                                         return drv ? getDriverDisplayName(drv) : 'Conductor';
                                     })()}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Fecha y Hora de Asignación</label>
                                <input 
                                    type="datetime-local"
                                    value={assignmentModal.scheduledDate}
                                    onChange={(e) => setAssignmentModal(prev => ({ ...prev, scheduledDate: e.target.value }))}
                                    className="w-full text-sm border-2 border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none font-semibold text-slate-700"
                                />
                            </div>
                        </div>
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
                            <button 
                                onClick={() => setAssignmentModal({ isOpen: false, shipmentId: null, driverId: '', scheduledDate: '' })}
                                className="flex-1 py-3 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={() => {
                                    onAssignDriver(assignmentModal.shipmentId, assignmentModal.driverId, assignmentModal.scheduledDate);
                                    setAssignmentModal({ isOpen: false, shipmentId: null, driverId: '', scheduledDate: '' });
                                }}
                                className="flex-[2] py-3 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <CheckCircle size={16} />
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <CreatePickupModal
                isOpen={isPickupModalOpen}
                onClose={() => setIsPickupModalOpen(false)}
                onSave={onCreateShipment}
                clients={clients}
                allPoblaciones={allPoblaciones}
                allShipments={shipments}
            />

            {/* Import Excel Modal */}
            {isImportModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center sm:p-4">
                    <div className="bg-white sm:rounded-2xl w-full max-w-2xl modal-mobile-full overflow-y-auto shadow-xl animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center sticky top-0 z-10">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <Plus size={16} className="text-indigo-500" />
                                Importar Envíos desde Excel
                            </h3>
                            <button onClick={() => { setIsImportModalOpen(false); setImportClientId(''); }} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4 border-b border-slate-100 bg-indigo-50">
                            <label className="text-xs font-bold text-indigo-700 mb-2 block">¿Para qué cliente es este Excel?</label>
                            <div className="flex flex-col gap-2">
                                <input
                                    type="text"
                                    placeholder="🔍 Buscar cliente..."
                                    value={importClientId ? '' : (importClientSearch || '')}
                                    onChange={(e) => { setImportClientId(''); setImportClientSearch(e.target.value); }}
                                    className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
                                />
                                <select
                                    value={importClientId}
                                    onChange={(e) => { setImportClientId(e.target.value); setImportClientSearch(''); }}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white truncate"
                                >
                                    <option value="">— O selecciona del desplegable —</option>
                                    {(clients || []).filter(c => c.status === 'approved').sort((a,b) => a.name.localeCompare(b.name)).map(c => (
                                        <option key={c.id} value={c.id}>{c.name} {c.clientNumber ? `(${c.clientNumber})` : ''}</option>
                                    ))}
                                </select>
                            </div>
                            {!importClientId && importClientSearch && (
                                <div className="mt-2 max-h-[180px] overflow-y-auto bg-white rounded-lg border border-indigo-200 divide-y divide-slate-50 shadow-sm">
                                    {(clients || [])
                                        .filter(c => c.status === 'approved')
                                        .filter(c => {
                                            const q = importClientSearch.toLowerCase();
                                            return (c.name || '').toLowerCase().includes(q) || String(c.clientNumber || '').toLowerCase().includes(q) || (c.legalName || '').toLowerCase().includes(q);
                                        })
                                        .sort((a,b) => a.name.localeCompare(b.name))
                                        .slice(0, 15)
                                        .map(c => (
                                            <button key={c.id} onClick={() => { setImportClientId(c.id); setImportClientSearch(''); }}
                                                className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors flex items-center justify-between gap-2">
                                                <span className="text-sm font-bold text-slate-800 truncate">{c.name}</span>
                                                {c.clientNumber && <span className="text-xs text-slate-400 shrink-0">({c.clientNumber})</span>}
                                            </button>
                                        ))
                                    }
                                    {(clients || []).filter(c => c.status === 'approved').filter(c => { const q = importClientSearch.toLowerCase(); return (c.name||'').toLowerCase().includes(q)||String(c.clientNumber||'').toLowerCase().includes(q); }).length === 0 && (
                                        <p className="text-xs text-slate-400 text-center py-3">No se encontraron clientes</p>
                                    )}
                                </div>
                            )}
                            {importClientId && (
                                <div className="mt-2 flex items-center gap-2">
                                    <span className="text-xs text-green-700 font-bold">✅ {(clients || []).find(c => String(c.id) === String(importClientId))?.name}</span>
                                    <button onClick={() => { setImportClientId(''); setImportClientSearch(''); }} className="text-xs text-red-500 hover:text-red-700 font-bold">(cambiar)</button>
                                </div>
                            )}
                        </div>
                        {importClientId ? (
                            <ImportExcelShipments
                                isAdmin={true}
                                selectedClientOverride={(clients || []).find(c => String(c.id) === String(importClientId))}
                                onCreateShipment={onCreateShipment}
                                allShipments={shipments}
                                articles={articles}
                                tariffs={tariffs}
                                coverageZones={coverageZones}
                                allClients={clients}
                                onClose={() => { setIsImportModalOpen(false); setImportClientId(''); }}
                            />
                        ) : (
                            <div className="p-12 text-center text-slate-400 text-sm">
                                Selecciona un cliente arriba para continuar con la importación.
                            </div>
                        )}
                    </div>
                </div>
            )}


            {exportModal.isOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <FileText size={16} className="text-emerald-500" />
                                Exportar a Factusol
                            </h3>
                            <button onClick={() => setExportModal(prev => ({ ...prev, isOpen: false }))} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Fecha Inicio (Opcional)</label>
                                <input 
                                    type="date"
                                    value={exportModal.startDate}
                                    onChange={(e) => setExportModal(prev => ({ ...prev, startDate: e.target.value }))}
                                    className="w-full text-sm border-2 border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 focus:outline-none font-semibold text-slate-700"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Fecha Fin (Opcional)</label>
                                <input 
                                    type="date"
                                    value={exportModal.endDate}
                                    onChange={(e) => setExportModal(prev => ({ ...prev, endDate: e.target.value }))}
                                    className="w-full text-sm border-2 border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 focus:outline-none font-semibold text-slate-700"
                                />
                            </div>
                            <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                    checked={exportModal.onlyFacturacion}
                                    onChange={(e) => setExportModal(prev => ({ ...prev, onlyFacturacion: e.target.checked }))}
                                />
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-slate-800">Solo Facturación</span>
                                    <span className="text-[10px] text-slate-500">Excluye presupuestos/habituales</span>
                                </div>
                            </label>
                            <label className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                    checked={exportModal.excludeExported}
                                    onChange={(e) => setExportModal(prev => ({ ...prev, excludeExported: e.target.checked }))}
                                />
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-slate-800">Excluir ya facturados</span>
                                    <span className="text-[10px] text-slate-500">Omite albaranes ya exportados anteriormente</span>
                                </div>
                            </label>

                            {/* Campo para exportar un albarán específico */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Albarán Específico (Opcional)</label>
                                <input 
                                    type="text"
                                    placeholder="Ej: SUM-109"
                                    value={exportModal.specificId}
                                    onChange={(e) => setExportModal(prev => ({ ...prev, specificId: e.target.value.toUpperCase() }))}
                                    className="w-full text-sm border-2 border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-orange-500 focus:outline-none font-bold text-slate-700 placeholder:font-normal placeholder:text-slate-400"
                                />
                                <p className="text-[9px] text-slate-400">Si rellenas este campo, se exportará SOLO este albarán (ignora los demás filtros)</p>
                            </div>
                        </div>
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
                            <button 
                                onClick={() => setExportModal(prev => ({ ...prev, isOpen: false }))}
                                className="flex-1 py-3 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={() => {
                                    const executeExport = async () => {
                                        const ExcelJS = (await import('exceljs')).default;
                                        const { saveAs } = await import('file-saver');

                                        const today = new Date();
                                        const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

                                        const getClientInfo = (s) => {
                                            const payingClientName = String(s.porteType === 'Debido' ? (s.destinationName || s.destination) : s.client).trim();
                                            
                                            let foundClient = (clients || []).find(cl => 
                                                (payingClientName && (cl.name || '').toLowerCase().trim() === payingClientName.toLowerCase()) || 
                                                (payingClientName && (cl.legalName || '').toLowerCase().trim() === payingClientName.toLowerCase()) ||
                                                (s.porteType !== 'Debido' && s.clientId && String(cl.id) === String(s.clientId))
                                            );

                                            // If not found by direct name, check if it's a branch name
                                            if (!foundClient && payingClientName) {
                                                const pName = payingClientName.toLowerCase();
                                                for (const cl of (clients || [])) {
                                                    if (Array.isArray(cl.branches) && cl.branches.some(b => (b.name || '').toLowerCase().trim() === pName)) {
                                                        foundClient = cl;
                                                        break;
                                                    }
                                                }
                                            }

                                            if (foundClient) {
                                                const rawNum = foundClient.clientNumber || '';
                                                const matchSuffix = String(rawNum).trim().match(/^(.*?\d)[-_ ]?[a-zA-Z]{1,2}$/);
                                                if (matchSuffix) {
                                                    const baseNumber = matchSuffix[1];
                                                    const parentClient = (clients || []).find(c => String(c.clientNumber || '').trim() === baseNumber);
                                                    if (parentClient) return parentClient;
                                                }
                                                return foundClient;
                                            }
                                            return {};
                                        };

                                        const getBillingType = (s) => {
                                            const cInfo = getClientInfo(s);
                                            const type = cInfo.billingType || s.billingType || 'Clientes Habituales';
                                            return String(type).trim();
                                        };

                                        const parseDateString = (d) => {
                                            if (!d) return null;
                                            if (d instanceof Date) return d.getTime();
                                            if (typeof d === 'number') return d;
                                            
                                            const dObj = new Date(d);
                                            if (!isNaN(dObj.getTime())) return dObj.getTime();

                                            const slashMatch = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                                            if (slashMatch) return new Date(slashMatch[3], slashMatch[2] - 1, slashMatch[1]).getTime();

                                            const months = { ene:0, feb:1, mar:2, abr:3, may:4, jun:5, jul:6, ago:7, sep:8, oct:9, nov:10, dic:11 };
                                            const spaceMatch = d.toLowerCase().match(/^(\d{1,2})\s+([a-z]{3,})\.?\s+(\d{4})$/);
                                            if (spaceMatch) {
                                                const m = spaceMatch[2].substring(0, 3);
                                                if (months[m] !== undefined) return new Date(spaceMatch[3], months[m], spaceMatch[1]).getTime();
                                            }
                                            return null;
                                        };

                                        let start = exportModal.startDate ? new Date(exportModal.startDate) : null;
                                        if (start) {
                                            start.setHours(0, 0, 0, 0);
                                            start = start.getTime();
                                        }
                                        
                                        let end = exportModal.endDate ? new Date(exportModal.endDate) : null;
                                        if (end) {
                                            end.setHours(23, 59, 59, 999);
                                            end = end.getTime();
                                        }

                                        const shipmentsToExport = (() => {
                                            // Si se especifica un ID concreto, exportar solo ese (ignorando todos los filtros)
                                            const specificId = (exportModal.specificId || '').trim();
                                            if (specificId) {
                                                const found = (shipments || []).filter(s => s.id === specificId);
                                                if (found.length === 0) {
                                                    alert(`No se encontró el albarán "${specificId}".`);
                                                    return [];
                                                }
                                                return found;
                                            }

                                            // Filtro normal
                                            return filteredShipments.filter(s => {
                                                const bType = getBillingType(s).toLowerCase();
                                                const isFacturacion = bType.includes('factur') && !bType.includes('presupuesto');

                                                if (exportModal.onlyFacturacion && !isFacturacion) return false;
                                                if (exportModal.excludeExported && s.exportedAt) return false;
                                                if (s.hasSimplifiedInvoice) return false; // Ya facturada como simplificada — no exportar a Factusol

                                                if (start || end) {
                                                    const sTime = s.createdAt ? new Date(s.createdAt).getTime() : parseDateString(s.date);
                                                    if (sTime) {
                                                        if (start && sTime < start) return false;
                                                        if (end && sTime > end) return false;
                                                    }
                                                }
                                                return true;
                                            });
                                        })();

                                        if (shipmentsToExport.length === 0) {
                                            alert("No hay envíos que coincidan con la selección de fechas y facturación para exportar.");
                                            setExportModal(prev => ({ ...prev, isOpen: false }));
                                            return;
                                        }

                                        const applyTableStyle = (ws, headers, dataRows) => {
                                            ws.columns = headers.map(h => ({ header: h, key: h, width: 22 }));
                                            const headerRow = ws.getRow(1);
                                            headerRow.eachCell(cell => {
                                                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2F5496' } };
                                                cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 10, name: 'Calibri' };
                                                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                                            });
                                            headerRow.height = 20;
                                            dataRows.forEach((rowData, index) => {
                                                const row = ws.addRow(rowData);
                                                const bgColor = index % 2 === 0 ? 'FFFFFF' : 'D9E1F2';
                                                row.eachCell({ includeEmpty: true }, cell => {
                                                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
                                                    cell.font = { size: 10, name: 'Calibri' };
                                                    cell.alignment = { vertical: 'middle' };
                                                });
                                                row.height = 16;
                                            });
                                            const colToLetter = n => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
                                            ws.autoFilter = { from: 'A1', to: `${colToLetter(headers.length - 1)}1` };
                                            ws.views = [{ state: 'frozen', ySplit: 1 }];
                                        };

                                        const albHeaders = [
                                            'Tipo de documento', 'Número de documento', 'Referencia', 'Fecha', 'Estado2',
                                            'Almacén', 'Agente', 'Código del proveedor', 'Código de cliente', 'Nombre del Cliente',
                                            'Domicilio del cliente', 'Población', 'Código postal', 'Provincia', 'N.I.F.',
                                            'Tipo de IVA', 'Recargo de equivalencia', 'Teléfono del cliente',
                                            'Importe neto 1', 'Importe neto 2', 'Importe neto 3',
                                            'Porcentaje de descuento 1', 'Porcentaje de descuento 2', 'Porcentaje de descuento 3',
                                            'Importe de descuento 1', 'Importe de descuento 2', 'Importe de descuento 3',
                                            'Porcentaje pronto pago 1', 'Porcentaje pronto pago 2', 'Porcentaje pronto pago 3',
                                            'Importe pronto pago 1', 'Importe pronto pago 2', 'Importe pronto pago 3',
                                            'Porcentaje portes 1', 'Porcentaje portes 2', 'Porcentaje portes 3',
                                            'Importe portes 1', 'Importe portes 2', 'Importe portes 3',
                                            'Porcentaje de financiación 1', 'Porcentaje de financiación 2', 'Porcentaje de financiación 3',
                                            'Importe de financiación 1', 'Importe de financiación 2', 'Importe de financiación 3',
                                            'Base imponible 1', 'Base imponible 2', 'Base imponible 3',
                                            'Porcentaje de IVA 1', 'Porcentaje de IVA 2', 'Porcentaje de IVA 3',
                                            'Importe de IVA 1', 'Importe de IVA 2', 'Importe de IVA 3',
                                            'Porcentaje de recargo de equivalencia 1', 'Porcentaje de recargo de equivalencia 2', 'Porcentaje de recargo de equivalencia 3',
                                            'Importe de recargo de equivalencia 1', 'Importe de recargo de equivalencia 2', 'Importe de recargo de equivalencia 3',
                                            'Porcentaje de la retención', 'Importe de la retención', 'Precio con IVA',
                                            'Forma de pago', 'Portes', 'Texto de portes', 'Observación', 'Descripción',
                                            'Obra de entrega', 'Remitido por', 'Embalado por', 'A la atención de', 'Referencia2',
                                            'Estado', 'Propietario (búsqueda)', 'BI2', 'BI3', 'línea de observaciones 2',
                                            'Nº de su pedido', 'Nombre Comercial', 'Total', 'Z ARTICULO', 'Z Cantidad',
                                            'Z Cantidad Galary', 'Z Posicion de la linea',
                                        ];
                                        const albRows = shipmentsToExport.map((s, index) => {
                                            const amount = parseFloat((s.amount || '0').toString().replace(/[^0-9.]/g, '')) || 0;
                                            const bTypeLower = getBillingType(s).toLowerCase();
                                            const isPresupuesto = bTypeLower.includes('presupuesto');
                                            const vatRate = isPresupuesto ? 0 : 21;
                                            const vatAmount = parseFloat((amount * (vatRate / 100)).toFixed(2));
                                            const totalWithVat = parseFloat((amount + vatAmount).toFixed(2));

                                            const cInfo = getClientInfo(s);

                                            const hasReembolso = s.hasCod || parseFloat(String(s.codAmount || '0').replace(/[^0-9.-]/g, '')) > 0;
                                            const reembolsoText = hasReembolso ? ' (+ Reembolso)' : '';

                                            const baseArticleDesc = Array.isArray(s.articles) && s.articles.length > 0 
                                                ? s.articles.map(a => a.name).filter(Boolean).join(' ') 
                                                : 'PORTES';
                                                
                                            const otherPartyText = s.porteType === 'Debido' 
                                                ? `(Remite: ${s.originName || s.origin || s.client || 'Desconocido'})`
                                                : `(Dest: ${s.destinationName || s.destination || 'Desconocido'})`;

                                            const descripcionExtra = `${baseArticleDesc}${reembolsoText} ${otherPartyText}`.trim();

                                            const originalTotal = Array.isArray(s.articles) 
                                                ? s.articles.reduce((sum, art) => sum + (parseFloat(art.price) || 0) * (parseInt(art.quantity) || 1), 0)
                                                : amount;

                                            let docNumberStr = String(s.id || '').replace(/\D/g, '');
                                            if (docNumberStr.length > 6) {
                                                docNumberStr = docNumberStr.slice(-6); // Tomar los últimos 6 dígitos (ej: 2026123 -> 026123 -> 26123)
                                            }
                                            const docNumber = docNumberStr ? parseInt(docNumberStr, 10) : (index + 1);

                                            const shipmentTime = s.createdAt ? new Date(s.createdAt).getTime() : parseDateString(s.date);
                                            const sDateObj = shipmentTime ? new Date(shipmentTime) : new Date();
                                            const shipmentDate = `${sDateObj.getFullYear()}-${String(sDateObj.getMonth() + 1).padStart(2, '0')}-${String(sDateObj.getDate()).padStart(2, '0')}`;

                                            const rawClientNumber = String(cInfo.clientNumber || '').trim();
                                            const matchSuffix = rawClientNumber.match(/^(.*?\d)[-_ ]?[a-zA-Z]{1,2}$/);
                                            const exportClientNumber = matchSuffix ? matchSuffix[1] : rawClientNumber;

                                            const fallbackClientName = s.porteType === 'Debido' ? (s.destinationName || s.destination || s.client) : s.client;

                                            return {
                                                'Tipo de documento': 1, 'Número de documento': docNumber, 'Referencia': s.id || '',
                                                'Fecha': shipmentDate, 'Estado2': '', 'Almacén': '', 'Agente': '', 'Código del proveedor': '',
                                                'Código de cliente': exportClientNumber, 'Nombre del Cliente': cInfo.legalName || cInfo.name || fallbackClientName || '',
                                                'Domicilio del cliente': cInfo.address || '', 'Población': cInfo.city || '',
                                                'Código postal': cInfo.zip || '', 'Provincia': cInfo.province || '',
                                                'N.I.F.': cInfo.cif || s.clientNif || '', 'Tipo de IVA': 0, 'Recargo de equivalencia': '',
                                                'Teléfono del cliente': cInfo.phone || cInfo.mobile || s.clientPhone || '', 'Forma de pago': cInfo.paymentMethod || '', 
                                                'Importe neto 1': amount,
                                                'Importe neto 2': '', 'Importe neto 3': '',
                                                'Base imponible 1': amount, 'Porcentaje de IVA 1': vatRate,
                                                'Importe de IVA 1': vatAmount,
                                                'Precio con IVA': totalWithVat,
                                                'Observación': (s.observations || '').replace(/\[COBRO PENDIENTE\]/gi, '').trim(), 'Descripción': descripcionExtra,
                                                'Estado': s.status || 'Activo', 'BI2': amount, 'BI3': originalTotal,
                                                'Nombre Comercial': cInfo.name || fallbackClientName || '', 'Total': amount, 'Z Posicion de la linea': 1,
                                                'Z ARTICULO': '', 'Z Cantidad': 1,
                                            };
                                        });

                                        const lalHeaders = [
                                            'Tipo de documento', 'Número de documento', 'Z Posicion de la linea',
                                            'Z ARTICULO', 'Descripción', 'Z Cantidad',
                                            'Porcentaje de descuento 1', 'Porcentaje de descuento 2', 'Porcentaje de descuento 3',
                                            'Z Precio del artículo', 'Total', 'Tipo de IVA', 'Fecha de creación',
                                            'B12', 'B13'
                                        ];
                                        const lalRows = [];
                                        shipmentsToExport.forEach((s, index) => {
                                            let docNumberStr = String(s.id || '').replace(/\D/g, '');
                                            if (docNumberStr.length > 6) {
                                                docNumberStr = docNumberStr.slice(-6);
                                            }
                                            const documentNumber = docNumberStr ? parseInt(docNumberStr, 10) : (index + 1);
                                            const amount = parseFloat((s.amount || '0').toString().replace(/[^0-9.]/g, '')) || 0;
                                            const hasReembolso = s.hasCod || parseFloat(String(s.codAmount || '0').replace(/[^0-9.-]/g, '')) > 0;
                                            const reembolsoText = hasReembolso ? ' (+ Reembolso)' : '';

                                            const baseDesc = Array.isArray(s.articles) && s.articles.length > 0
                                                ? s.articles.map(a => a.name || a.description).filter(Boolean).join(' ')
                                                : 'PORTES';

                                            const otherPartyText = s.porteType === 'Debido' 
                                                ? `(Remite: ${s.originName || s.origin || s.client || 'Desconocido'})`
                                                : `(Dest: ${s.destinationName || s.destination || 'Desconocido'})`;

                                            const finalDesc = `${baseDesc}${reembolsoText} ${otherPartyText}`.trim();

                                            const priceTarifa = Array.isArray(s.articles) 
                                                ? s.articles.reduce((sum, art) => sum + (parseFloat(art.price) || 0) * (parseInt(art.quantity) || 1), 0)
                                                : amount;

                                            const shipmentTime = s.createdAt ? new Date(s.createdAt).getTime() : parseDateString(s.date);
                                            const sDateObj = shipmentTime ? new Date(shipmentTime) : new Date();
                                            const shipmentDate = `${sDateObj.getFullYear()}-${String(sDateObj.getMonth() + 1).padStart(2, '0')}-${String(sDateObj.getDate()).padStart(2, '0')}`;

                                            lalRows.push({
                                                'Tipo de documento': 1, 'Número de documento': documentNumber,
                                                'Z Posicion de la linea': 1, 'Z ARTICULO': '',
                                                'Descripción': finalDesc, 'Z Cantidad': 1,
                                                'Porcentaje de descuento 1': '', 'Porcentaje de descuento 2': '', 'Porcentaje de descuento 3': '',
                                                'Z Precio del artículo': amount, 'Total': amount,
                                                'Tipo de IVA': 0, 'Fecha de creación': shipmentDate,
                                                'B12': amount,
                                                'B13': priceTarifa
                                            });
                                        });

                                        const wbAlb = new ExcelJS.Workbook();
                                        const wsAlb = wbAlb.addWorksheet('ALB');
                                        applyTableStyle(wsAlb, albHeaders, albRows);
                                        const bufAlb = await wbAlb.xlsx.writeBuffer();
                                        saveAs(new Blob([bufAlb], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'ALB.xlsx');

                                        const wbLal = new ExcelJS.Workbook();
                                        const wsLal = wbLal.addWorksheet('LAL');
                                        applyTableStyle(wsLal, lalHeaders, lalRows);
                                        const bufLal = await wbLal.xlsx.writeBuffer();
                                        saveAs(new Blob([bufLal], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'LAL.xlsx');
                                        
                                        // Marcar albaranes como exportados
                                        if (onUpdateShipment) {
                                            const exportTimestamp = new Date().toISOString();
                                            for (const s of shipmentsToExport) {
                                                try {
                                                    await onUpdateShipment(s.id, { ...s, exportedAt: exportTimestamp });
                                                } catch (err) {
                                                    console.error(`Error marcando ${s.id} como exportado:`, err);
                                                }
                                            }
                                        }

                                        setExportModal(prev => ({ ...prev, isOpen: false }));
                                    };
                                    executeExport();
                                }}
                                className="flex-[2] py-3 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <FileText size={16} />
                                Exportar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            <BudgetLiquidationModal
                isOpen={isBudgetModalOpen}
                onClose={() => setIsBudgetModalOpen(false)}
                shipments={shipments}
                clients={clients}
                drivers={drivers}
                onCreateShipment={onCreateShipment}
                onUpdateMultipleShipments={onUpdateMultipleShipments}
            />

            <CodReceiptUploadModal
                isOpen={isCodReceiptModalOpen}
                onClose={() => setIsCodReceiptModalOpen(false)}
                shipments={shipments}
                onUpdate={onUpdateShipment}
            />
        </div>
    );
}

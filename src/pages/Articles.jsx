import { useState, useRef, useMemo, useEffect, Fragment } from 'react';

import { Search, Plus, FileText, Trash2, Edit, Euro, Tag, Map as MapIcon, Upload, Download, ChevronUp, ChevronDown, FileSpreadsheet, RotateCcw, Save, Package } from 'lucide-react';
import { read, utils, writeFile } from 'xlsx';

import { BAREMO_1_PUEBLOS, BAREMO_2_PUEBLOS } from '../data/baremos';


export default function Articles({ 
    articles, 
    onAddArticle, 
    onUpdateArticle, 
    onDeleteArticle, 
    onDeleteAllArticles, 
    tariffs, 
    onAddTariff, 
    onUpdateTariff, 
    onDeleteTariff, 
    onImportArticles, 
    onImportTariffs, 
    defaultCodFee, 
    onUpdateDefaultCodFee, 
    familyOrder = [], 
    onUpdateFamilyOrder, 
    onRenameCategory,
    coverageZones = [],
    onAddCoverageZone,
    onUpdateCoverageZone,
    onDeleteCoverageZone,
    onImportCoverageZones,
    onNormalizeClients
}) {
    const [searchTerm, setSearchTerm] = useState('');
    const [isFormatModalOpen, setIsFormatModalOpen] = useState(false);
    const [isTariffModalOpen, setIsTariffModalOpen] = useState(false);
    const [isZonesModalOpen, setIsZonesModalOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

    const [baremoPrices, setBaremoPrices] = useState([
        { bultos: 1, b1: '7.00', b2: '9.00' },
        { bultos: 2, b1: '12.00', b2: '16.00' },
        { bultos: 3, b1: '16.00', b2: '19.00' },
        { bultos: 4, b1: '21.00', b2: '22.00' }
    ]);

    // Sync baremo prices with existing articles if they exist
    useEffect(() => {
        if (!articles || articles.length === 0) return;
        
        const newPrices = baremoPrices.map(bp => {
            const article = articles.find(a => (a.name || '').toLowerCase() === `${bp.bultos} bultos` || (a.name || '').toLowerCase() === `${bp.bultos} bulto`);
            if (article) {
                return {
                    ...bp,
                    b1: article.price || bp.b1,
                    b2: article.priceB2 || bp.b2
                };
            }
            return bp;
        });
        
        // Deep equality check to avoid infinite loops
        if (JSON.stringify(newPrices) !== JSON.stringify(baremoPrices)) {
            setBaremoPrices(newPrices);
        }
    }, [articles]);

    const handleSaveBaremoPrices = () => {
        baremoPrices.forEach(bp => {
            const articleName = `${bp.bultos} Bulto${bp.bultos > 1 ? 's' : ''}`;
            const existing = articles.find(a => (a.name || '').toLowerCase() === articleName.toLowerCase());
            
            const articleData = {
                name: articleName,
                description: `Tarifa estándar para envío de ${bp.bultos} bulto${bp.bultos > 1 ? 's' : ''}`,
                category: 'Tarifas Estándar',
                price: bp.b1,
                priceB2: bp.b2,
                unit: 'Servicio'
            };

            if (existing) {
                onUpdateArticle(existing.id, articleData);
            } else {
                onAddArticle({ ...articleData, id: Date.now() + bp.bultos });
            }
        });
        alert('Precios de Baremo actualizados correctamente.');
    };

    const handleAutoFixB2Prices = () => {
        const toFix = (articles || []).filter(a => {
            const p2 = parseFloat(String(a.priceB2 || '0').replace(',', '.'));
            return isNaN(p2) || p2 === 0;
        });

        if (toFix.length === 0) {
            alert('No se encontraron artículos con Baremo 2 en 0.');
            return;
        }

        if (!window.confirm(`Se van a actualizar ${toFix.length} artículos. El precio de Baremo 2 pasará a ser (Baremo 1 + 2€). ¿Continuar?`)) return;

        toFix.forEach(a => {
            const p1 = parseFloat(String(a.price || '0').replace(',', '.'));
            const newP2 = (p1 + 2).toFixed(2);
            onUpdateArticle(a.id, { ...a, priceB2: newP2 });
        });

        alert(`¡Listo! Se han ajustado ${toFix.length} artículos.`);
    };
    
    const [bulkPrices, setBulkPrices] = useState({});

    // Initialize bulk prices from articles
    useEffect(() => {
        if (!articles) return;
        const initialBulk = {};
        articles.forEach(a => {
            initialBulk[a.id] = {
                price: a.price || '0.00',
                priceB2: a.priceB2 || '0.00'
            };
        });
        setBulkPrices(initialBulk);
    }, [articles]);

    const handleSaveAllBulkPrices = () => {
        let count = 0;
        Object.entries(bulkPrices).forEach(([id, data]) => {
            const article = articles.find(a => String(a.id) === String(id));
            if (article && (article.price !== data.price || article.priceB2 !== data.priceB2)) {
                onUpdateArticle(article.id, { ...article, price: data.price, priceB2: data.priceB2 });
                count++;
            }
        });
        if (count > 0) {
            alert(`Se han actualizado ${count} artículos correctamente.`);
        } else {
            alert('No se detectaron cambios en los precios.');
        }
    };

    const handleNormalizeBaremos = async () => {
        const baseB2 = BAREMO_2_PUEBLOS.map(p => ({ ...p, normName: p.name.toLowerCase().trim() }));
        let count = 0;

        // 1. Check Coverage Zones
        for (const zone of coverageZones) {
            const isB1 = Number(zone.baremo) === 1;
            const normName = (zone.name || '').toLowerCase().trim();
            const shouldBeB2 = baseB2.find(p => p.normName === normName || p.zip === String(zone.zip));

            if (isB1 && shouldBeB2) {
                const confirmed = await onUpdateCoverageZone(zone.id, { ...zone, baremo: 2 });
                if (confirmed) count++;
            }
        }

        // 2. Check Tariffs (Zonas Especiales) - Ensure they have baremo if they match B2 towns
        for (const tariff of (tariffs || [])) {
            const hasNoBaremo = !tariff.baremo;
            const normMatch = (tariff.match || '').toLowerCase().trim();
            const normName = (tariff.name || '').toLowerCase().trim();
            const shouldBeB2 = baseB2.find(p => p.normName === normMatch || p.normName === normName || p.zip === String(tariff.zipPrefix));

            if (shouldBeB2 && tariff.baremo !== 2) {
                const confirmed = await onUpdateTariff(tariff.id, { ...tariff, baremo: 2 });
                if (confirmed) count++;
            }
        }

        if (count > 0) {
            alert(`¡Listo! Se han corregido ${count} poblaciones (incluyendo Antequera si era necesario) para que sean Baremo 2.`);
        } else {
            alert('No se detectaron inconsistencias en los baremos de las poblaciones base.');
        }
    };


    // File Import State
    const fileInputRef = useRef(null);
    const [importType, setImportType] = useState(null); // 'articles' or 'tariffs'

    const handleImportBaseZones = async () => {
        if (!window.confirm('¿Deseas importar el listado base de poblaciones? Se añadirán unas 50 poblaciones conocidas (Aguilar, Montilla, Lucena...) a tu configuración actual.')) return;
        
        const existingZips = new Set((coverageZones || []).map(z => String(z.zip)));
        const allBase = [...BAREMO_1_PUEBLOS, ...BAREMO_2_PUEBLOS];
        const toImport = allBase.filter(z => !existingZips.has(String(z.zip)));

        if (toImport.length === 0) {
            alert('Todas las poblaciones base ya están en tu lista.');
            return;
        }

        const success = await onImportCoverageZones(toImport);
        if (success) {
            alert(`Se han importado ${toImport.length} poblaciones con éxito.`);
        }
    };

    // Article Form State
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        category: '',
        price: '',
        priceB2: '',
        unit: 'Unidad',
        zonePrices: {}
    });
    const [editingId, setEditingId] = useState(null);

    // Tariff Form State
    const [tariffData, setTariffData] = useState({
        name: '', // Display Name e.g. "Zona Córdoba"
        match: '', // Keyword or City e.g. "Córdoba"
        zipPrefix: '', // ZIP Start e.g. "14"
        province: '',
        country: 'España',
        price: '',
        baremo: 1 // 1: Local (B1), 2: Extra (B2)
    });
    const [editingTariffId, setEditingTariffId] = useState(null);

    // New Zone Form State
    const [newZoneData, setNewZoneData] = useState({ name: '', zip: '', baremo: 1 });

    const handleAddZoneClick = (baremo) => {
        if (!newZoneData.name || !newZoneData.zip) {
            alert('Por favor, rellena nombre y CP');
            return;
        }
        onAddCoverageZone({ ...newZoneData, baremo });
        setNewZoneData({ name: '', zip: '', baremo: 1 });
    };

    const sortedArticles = useMemo(() => {
        let result = (articles || []).filter(article => {
            const matchesSearch = (article.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
                (article.description || '').toLowerCase().includes((searchTerm || '').toLowerCase());
            const matchesCategory = selectedCategory === 'all' || article.category === selectedCategory;
            return matchesSearch && matchesCategory;
        });


        if (sortConfig.key) {
            result.sort((a, b) => {
                let aVal = a[sortConfig.key];
                let bVal = b[sortConfig.key];

                if (sortConfig.key === 'price') {
                    const nA = parseFloat(String(aVal).replace(/[^0-9.-]/g, '')) || 0;
                    const nB = parseFloat(String(bVal).replace(/[^0-9.-]/g, '')) || 0;
                    return sortConfig.direction === 'asc' ? nA - nB : nB - nA;
                }

                const sA = String(aVal || '').toLowerCase();
                const sB = String(bVal || '').toLowerCase();
                if (sA < sB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (sA > sB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return result;
    }, [articles, searchTerm, selectedCategory, sortConfig]);


    const categories = ['all', ...new Set((articles || []).map(a => a.category).filter(Boolean))];

    // Group articles by category
    const rawGroupedArticles = sortedArticles.reduce((acc, article) => {
        const cat = article.category || 'Sin Categoría';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(article);
        return acc;
    }, {});

    // Sort categories based on familyOrder
    const sortedCategoryNames = Object.keys(rawGroupedArticles).sort((a, b) => {
        const indexA = familyOrder.indexOf(a);
        const indexB = familyOrder.indexOf(b);
        
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.localeCompare(b);
    });

    const handleMoveCategory = (categoryName, direction) => {
        // We use the full list of categories present in the articles, not just the filtered ones
        const allCategoryNames = [...new Set((articles || []).map(a => a.category || 'Sin Categoría').filter(Boolean))];
        
        // Build the current effective order
        const currentOrder = [...familyOrder];
        // Add any missing categories to the end of the order list if they are not there yet
        allCategoryNames.forEach(cat => {
            if (!currentOrder.includes(cat)) currentOrder.push(cat);
        });

        const index = currentOrder.indexOf(categoryName);
        if (index === -1) return;

        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= currentOrder.length) return;

        // Swap
        const temp = currentOrder[index];
        currentOrder[index] = currentOrder[newIndex];
        currentOrder[newIndex] = temp;

        onUpdateFamilyOrder(currentOrder);
    };

    const filteredTariffs = (tariffs || []).filter(tariff =>
        (tariff.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
        (tariff.match || '').toLowerCase().includes((searchTerm || '').toLowerCase())
    );


    // --- IMPORT HANDLERS ---
    const handleImportClick = (type) => {
        setImportType(type);
        if (fileInputRef.current) {
            fileInputRef.current.value = ''; // Reset
            fileInputRef.current.click();
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const data = await file.arrayBuffer();
            const workbook = read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = utils.sheet_to_json(worksheet);

            if (importType === 'articles') {
                // Expects: Name, Description, Price, Unit (case insensitive loose match)
                const newArticles = jsonData.map(row => {
                    // Try to find fields regardless of exact casing
                    const findKey = (keys) => Object.keys(row).find(k => keys.includes(k.toLowerCase()));

                    // Heuristic: If "NOMBRE" column contains only a number/code, and "DESCRIPCION" has text,
                    // maybe the user meant the description to be the name (common in some exports).
                    let nameKey = findKey(['name', 'nombre', 'articulo', 'servicio']);
                    let descKey = findKey(['description', 'descripción', 'descripcion', 'detalles']);
                    
                    let rawName = row[nameKey];
                    let rawDesc = row[descKey] || '';

                    // Si no venía nombre pero sí descripción, usamos la descripción como nombre
                    if (!rawName && rawDesc) {
                        rawName = rawDesc;
                        rawDesc = '';
                    } else if (!rawName) {
                        rawName = 'Nuevo Servicio';
                    }

                    // Si el nombre es solo un número (código) y hay texto en descripción, los intercambiamos
                    if (/^\d+$/.test(String(rawName).trim()) && rawDesc && !/^\d+$/.test(String(rawDesc).trim())) {
                        const tempDesc = rawDesc;
                        rawDesc = `Código: ${rawName}`;
                        rawName = tempDesc;
                    }

                    let rawUnit = row[findKey(['unit', 'unidad', 'tipo', 'unid', 'un'])] || 'Unidad';
                    let rawCat = row[findKey(['category', 'categoría', 'categoria', 'familia', 'familiares', 'grupo', 'grup'])] || '';
                    
                    // HEURISTIC: If UNIDAD contains codes like 'B1', 'VIDE', it's actually the family
                    const commonUnits = ['unidad', 'unid', 'unidades', 'hora', 'km', 'kg', 'servicio', 'palet', 'uds', 'u.', 'un', 'un.'];
                    const isStandardUnit = commonUnits.includes(String(rawUnit).toLowerCase().trim().replace('.', ''));
                    
                    let finalCat = rawCat;
                    let finalUnit = rawUnit;

                    if (!rawCat && rawUnit && !isStandardUnit) {
                        finalCat = rawUnit;
                        finalUnit = 'Unidad'; // Default unit if it was actually a family code
                    }

                    // Heuristic for Price
                    let rawPrice = row[findKey(['price', 'precio', 'coste', 'valor', 'pvp', 'costo'])] || '0';

                    return {
                        name: String(rawName).trim(),
                        description: String(rawDesc).trim(),
                        category: String(finalCat).trim(),
                        price: String(rawPrice).trim(),
                        unit: String(finalUnit).trim()
                    };
                }).filter(a => a.name && a.name !== 'Nuevo Servicio'); // Basic validation

                if (newArticles.length > 0 && onImportArticles) {
                    onImportArticles(newArticles);
                    alert(`Se han importado ${newArticles.length} artículos correctamente.`);
                } else {
                    alert('No se encontraron artículos válidos en el archivo.');
                }
            } else if (importType === 'tariffs') {
                // Expects: Name, Match, Zip, Price
                const newTariffs = jsonData.map(row => {
                    const findKey = (keys) => Object.keys(row).find(k => keys.includes(k.toLowerCase()));

                    return {
                        name: row[findKey(['name', 'nombre', 'zona', 'tarifa'])] || 'Nueva Tarifa',
                        match: row[findKey(['match', 'ciudad', 'poblacion', 'municipio'])] || '',
                        zipPrefix: row[findKey(['zip', 'cp', 'postal', 'prefijo'])] || '',
                        price: row[findKey(['price', 'precio', 'coste', 'porte'])] || '0'
                    };
                }).filter(t => t.name && t.price);

                if (newTariffs.length > 0 && onImportTariffs) {
                    onImportTariffs(newTariffs);
                    alert(`Se han importado ${newTariffs.length} tarifas correctamente.`);
                } else {
                    alert('No se encontraron tarifas válidas en el archivo.');
                }
            }
        } catch (error) {
            console.error("Error importing file:", error);
            alert("Error al leer el archivo Excel. Asegúrate de que es válido.");
        }
    };

    // --- TEMPLATE DOWNLOAD ---
    const handleDownloadTemplate = (type = 'articles') => {
        const headers = type === 'articles'
            ? [{ Nombre: 'Ejemplo Servicio', Descripción: 'Descripción del servicio', Precio: '10.50', Unidad: 'Unidad', Familia: 'Transporte' }]
            : [{ Nombre: 'Zona Ejemplo', Ciudad: 'Madrid', CP: '28', Precio: '45.00' }];

        const ws = utils.json_to_sheet(headers);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Plantilla");
        
        const fileName = type === 'articles' ? "plantilla_articulos.xlsx" : "plantilla_tarifas.xlsx";
        writeFile(wb, fileName);
    };

    // --- ARTICLE HANDLERS ---
    const handleSubmit = (e) => {
        e.preventDefault();
        if (editingId) {
            onUpdateArticle(editingId, formData);
        } else {
            onAddArticle({ ...formData, id: Date.now() });
        }
        resetForm();
    };

    const resetForm = () => {
        setFormData({ name: '', description: '', category: '', price: '', priceB2: '', unit: 'Unidad', zonePrices: {} });
        setEditingId(null);
        setIsFormatModalOpen(false);
    };

    const handleEdit = (article) => {
        setFormData({
            name: article.name,
            description: article.description,
            category: article.category || '',
            price: article.price,
            priceB2: article.priceB2 || '',
            unit: article.unit || 'Unidad',
            zonePrices: article.zonePrices || {}
        });
        setEditingId(article.id);
        setIsFormatModalOpen(true);
    };

    // --- TARIFF HANDLERS ---
    const handleTariffSubmit = (e) => {
        e.preventDefault();
        if (editingTariffId) {
            onUpdateTariff(editingTariffId, tariffData);
        } else {
            onAddTariff({ ...tariffData, id: Date.now() });
        }
        resetTariffForm();
    };

    const resetTariffForm = () => {
        setTariffData({ name: '', match: '', zipPrefix: '', province: '', country: 'España', price: '', baremo: 1 });
        setEditingTariffId(null);
        setIsTariffModalOpen(false);
    };

    const handleEditTariff = (tariff) => {
        setTariffData({
            name: tariff.name,
            match: tariff.match,
            zipPrefix: tariff.zipPrefix,
            province: tariff.province || '',
            country: tariff.country || 'España',
            price: tariff.price,
            baremo: tariff.baremo || 1
        });
        setEditingTariffId(tariff.id);
        setIsTariffModalOpen(true);
    };

    const handleLoadPueblosServicio = () => {
        if (confirm(`¿Deseas cargar los ${PUEBLOS_SERVICIO_DB.length} pueblos de servicio del PDF?`)) {
            const bulkData = PUEBLOS_SERVICIO_DB.map(town => ({
                name: `Zona ${town.name}`,
                match: town.match,
                zipPrefix: town.zipPrefix,
                province: town.province,
                country: town.country,
                price: 0,
                baremo: !String(town.zipPrefix).startsWith('14') ? 2 : 1
            }));
            onImportTariffs(bulkData);
            alert('Pueblos enviados a la base de datos.');
        }
    };

    const handleAutoBaremo = () => {
        if (!confirm('¿Deseas clasificar automáticamente como "Baremo 2" todas las poblaciones que no empiecen por C.P. 14 (Córdoba)?')) return;
        
        let count = 0;
        tariffs.forEach(t => {
            const isB2 = t.zipPrefix && !String(t.zipPrefix).startsWith('14');
            const targetBaremo = isB2 ? 2 : 1;
            
            if (t.baremo !== targetBaremo) {
                onUpdateTariff(t.id, { ...t, baremo: targetBaremo });
                count++;
            }
        });
        
        alert(`Se han actualizado ${count} poblaciones.`);
    };

    const handleDeduplicateTariffs = () => {
        if (!confirm('¿Deseas eliminar las tarifas duplicadas (mismo nombre y código postal)?')) return;
        
        const seen = new Set();
        const duplicates = [];
        
        tariffs.forEach(t => {
            const key = `${t.name}-${t.zipPrefix}`.toLowerCase();
            if (seen.has(key)) {
                duplicates.push(t.id);
            } else {
                seen.add(key);
            }
        });

        if (duplicates.length === 0) {
            alert('No se encontraron duplicados.');
            return;
        }

        if (confirm(`Se han encontrado ${duplicates.length} duplicados. ¿Proceder al borrado?`)) {
            duplicates.forEach(id => onDeleteTariff(id));
            alert('Limpieza de duplicados completada.');
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Hidden File Input */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".xlsx, .xls"
                style={{ display: 'none' }}
            />

            {/* Header / Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Tag className="text-blue-600" />
                        Catálogo de Artículos y Tarifas
                    </h1>
                    <p className="text-slate-500 mt-1">
                        Gestiona tus servicios, precios de baremo y zonas de transporte
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setIsZonesModalOpen(true)}
                        className="bg-white hover:bg-slate-50 text-blue-600 border border-blue-200 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 shadow-sm"
                    >
                        <MapIcon size={20} />
                        Zonas B1/B2
                    </button>

                    <button
                        onClick={() => setIsTariffModalOpen(true)}
                        className="bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 shadow-sm"
                    >
                        <MapIcon size={20} />
                        Nueva Zona Especial
                    </button>

                    <button
                        onClick={() => setIsFormatModalOpen(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all hover:scale-105 active:scale-95"
                    >
                        <Plus size={20} />
                        Nuevo Servicio
                    </button>
                </div>
            </div>

            {/* Quick Pricing Config Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                            <Package size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800">Precios por Bulto (Gestión Rápida)</h3>
                            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Tarifa Oficial 2026</p>
                        </div>
                    </div>
                    <button 
                        onClick={handleSaveBaremoPrices}
                        className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                    >
                        <Save size={18} />
                        Actualizar Bultos
                    </button>
                </div>
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {baremoPrices.map((bp, idx) => (
                        <div key={idx} className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 hover:border-blue-200 transition-colors">
                            <div className="text-[10px] font-black text-slate-400 uppercase mb-3 flex items-center gap-2">
                                <Tag size={12} />
                                {bp.bultos} Bulto{bp.bultos > 1 ? 's' : ''}
                            </div>
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <span className="w-8 text-[10px] font-black text-blue-500">B1</span>
                                    <div className="relative flex-1">
                                        <input 
                                            type="number" step="0.01" value={bp.b1}
                                            onChange={(e) => {
                                                const newPrices = [...baremoPrices];
                                                newPrices[idx].b1 = e.target.value;
                                                setBaremoPrices(newPrices);
                                            }}
                                            className="w-full pl-6 pr-2 py-1.5 text-sm font-bold text-slate-700 bg-white border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                                        />
                                        <Euro className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300" size={12} />
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-8 text-[10px] font-black text-purple-500">B2</span>
                                    <div className="relative flex-1">
                                        <input 
                                            type="number" step="0.01" value={bp.b2}
                                            onChange={(e) => {
                                                const newPrices = [...baremoPrices];
                                                newPrices[idx].b2 = e.target.value;
                                                setBaremoPrices(newPrices);
                                            }}
                                            className="w-full pl-6 pr-2 py-1.5 text-sm font-bold text-slate-700 bg-white border border-slate-200 rounded-lg focus:border-purple-500 focus:outline-none"
                                        />
                                        <Euro className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300" size={12} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
                   {/* Search Bar & Global Settings */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2 bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input
                            type="text"
                            placeholder="Buscar en el catálogo..."
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex flex-col gap-2">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-2">
                        <select 
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                        >
                            <option value="all">Todas las Familias</option>
                            {categories.filter(c => c !== 'all').map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                </div>


                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                            <Euro size={16} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-600 uppercase">Comisión Reembolso</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <input 
                            type="number" 
                            step="0.01"
                            className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-right font-bold text-blue-600 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                            value={defaultCodFee}
                            onChange={(e) => onUpdateDefaultCodFee(e.target.value)}
                        />
                        <span className="text-xs font-bold text-slate-400">€</span>
                    </div>
                </div>
            </div>
              {/* MAIN CATALOG */}
            <div className="space-y-8">
                {sortedCategoryNames.map((categoryName, index) => (
                        <div key={categoryName} className="space-y-4">
                            <div className="flex items-center gap-4 group/cat">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg font-bold text-slate-700 bg-slate-100 px-4 py-1 rounded-full border border-slate-200">
                                        {categoryName}
                                    </h2>
                                    <button 
                                        onClick={() => {
                                            const newName = prompt(`Cambiar nombre de la familia "${categoryName}" a:`, categoryName);
                                            if (newName && newName !== categoryName) {
                                                onRenameCategory(categoryName, newName);
                                            }
                                        }}
                                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all opacity-0 group-hover/cat:opacity-100"
                                        title="Renombrar familia"
                                    >
                                        <Edit size={16} />
                                    </button>
                                    <div className="flex items-center gap-1 opacity-0 group-hover/cat:opacity-100 transition-opacity">
                                        <button 
                                            onClick={() => handleMoveCategory(categoryName, 'up')}
                                            disabled={index === 0}
                                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all disabled:opacity-0"
                                            title="Subir familia"
                                        >
                                            <ChevronUp size={18} />
                                        </button>
                                        <button 
                                            onClick={() => handleMoveCategory(categoryName, 'down')}
                                            disabled={index === sortedCategoryNames.length - 1}
                                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all disabled:opacity-0"
                                            title="Bajar familia"
                                        >
                                            <ChevronDown size={18} />
                                        </button>
                                    </div>
                                </div>
                                <div className="h-px bg-slate-200 flex-1"></div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {rawGroupedArticles[categoryName].map(article => (
                                    <div key={article.id} className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-all group relative overflow-hidden">
                                        <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                            <button onClick={() => handleEdit(article)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors">
                                                <Edit size={16} />
                                            </button>
                                            <button onClick={() => onDeleteArticle(article.id)} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>

                                        <div className="flex items-start justify-between mb-3">
                                            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                                                <FileText size={24} />
                                            </div>
                                             <div className="text-right space-y-1">
                                                <div className="flex flex-col items-end">
                                                    <div className="text-lg font-bold text-slate-800 flex items-center justify-end gap-1">
                                                        {article.price} €
                                                        <span className="text-[10px] text-blue-500 font-black ml-1">B1</span>
                                                    </div>
                                                    {article.priceB2 && (
                                                        <div className="text-sm font-bold text-purple-600 flex items-center justify-end gap-1 -mt-1">
                                                            {article.priceB2} €
                                                            <span className="text-[9px] text-purple-400 font-black ml-1">B2</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                    por {article.unit || 'Unidad'}
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <h3 className="font-bold text-slate-800 mb-1">{article.name}</h3>
                                            {article.description && (
                                                <p className="text-sm text-slate-500 line-clamp-2">{article.description}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                    {sortedArticles.length === 0 && (
                        <div className="text-center py-12">
                            <p className="text-slate-500">No se encontraron servicios.</p>
                        </div>
                    )}
                </div>

                {/* SPECIAL ZONES SECTION (Custom Tariffs) */}
                {tariffs && tariffs.length > 0 && (
                    <div className="mt-12 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                                <MapIcon size={20} />
                            </div>
                            <h2 className="text-xl font-bold text-slate-800">Zonas Especiales Personalizadas</h2>
                        </div>
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                                    <tr>
                                        <th className="px-6 py-4 text-left">Zona</th>
                                        <th className="px-6 py-4 text-left">Ciudad / Match</th>
                                        <th className="px-6 py-4 text-center">Prefijo CP</th>
                                        <th className="px-6 py-4 text-center">Baremo</th>
                                        <th className="px-6 py-4 text-right">Precio Auto</th>
                                        <th className="px-6 py-4 text-center w-24">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {tariffs.map((t) => (
                                        <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="px-6 py-3 font-bold text-slate-700">{t.name}</td>
                                            <td className="px-6 py-3 text-slate-500">{t.match || '-'}</td>
                                            <td className="px-6 py-3 text-center font-mono text-slate-400">{t.zipPrefix || '-'}</td>
                                            <td className="px-6 py-3 text-center">
                                                <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${t.baremo === 2 ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                                                    B{t.baremo || 1}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 text-right font-bold text-blue-600">{t.price} €</td>
                                            <td className="px-6 py-3 text-center">
                                                <div className="flex justify-center gap-2">
                                                    <button onClick={() => {
                                                        setTariffData({ ...t });
                                                        setEditingTariffId(t.id);
                                                        setIsTariffModalOpen(true);
                                                    }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg">
                                                        <Edit size={14} />
                                                    </button>
                                                    <button onClick={() => onDeleteTariff(t.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

            {/* Modal Zonas de Cobertura B1/B2 */}
            {isZonesModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div className="flex items-center gap-4">
                                <div>
                                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                        <MapIcon className="text-blue-600" size={20} />
                                        Zonas de Cobertura y Baremos
                                    </h3>
                                    <p className="text-xs text-slate-500">Distribución geográfica para cálculo automático de precios</p>
                                </div>
                                <button 
                                    onClick={handleImportBaseZones}
                                    className="px-3 py-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-lg hover:bg-blue-700 transition-all flex items-center gap-2 shadow-sm"
                                >
                                    <Upload size={14} />
                                    IMPORTAR LISTADO BASE
                                </button>
                            </div>
                                <button 
                                    onClick={handleNormalizeBaremos}
                                    className="px-3 py-1.5 bg-amber-600 text-white text-[10px] font-bold rounded-lg hover:bg-amber-700 transition-all flex items-center gap-2 shadow-sm"
                                    title="Corrige poblaciones que deberían ser B2 (como Antequera)"
                                >
                                    <RotateCcw size={14} />
                                    AUTO-CORREGIR BAREMOS
                                </button>
                                <button onClick={() => setIsZonesModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                    <X size={24} />
                                </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-slate-100">
                                {/* Columna Baremo 1 */}
                                <div className="p-6">
                                    <div className="flex items-center gap-3 mb-4 bg-blue-50 p-3 rounded-xl border border-blue-100">
                                        <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">B1</div>
                                        <div>
                                            <h4 className="font-bold text-blue-900 text-sm">BAREMO 1 (Local)</h4>
                                            <p className="text-[10px] text-blue-700">Córdoba Capital y Campiña Sur</p>
                                        </div>
                                    </div>
                                    
                                    <div className="mb-4 flex gap-2">
                                        <input 
                                            placeholder="Nombre" 
                                            className="flex-1 text-xs px-3 py-1.5 border rounded-lg"
                                            value={newZoneData.baremo === 1 ? newZoneData.name : ''}
                                            onChange={e => setNewZoneData({ name: e.target.value, zip: newZoneData.zip, baremo: 1 })}
                                        />
                                        <input 
                                            placeholder="CP" 
                                            className="w-20 text-xs px-3 py-1.5 border rounded-lg font-mono"
                                            value={newZoneData.baremo === 1 ? newZoneData.zip : ''}
                                            onChange={e => setNewZoneData({ name: newZoneData.name, zip: e.target.value, baremo: 1 })}
                                        />
                                        <button 
                                            onClick={() => handleAddZoneClick(1)}
                                            className="bg-blue-600 text-white p-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                                        >
                                            <Plus size={16} />
                                        </button>
                                    </div>

                                    <div className="max-h-[400px] overflow-y-auto pr-2">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase sticky top-0 bg-white">
                                                <tr>
                                                    <th className="px-4 py-2 text-left">Población</th>
                                                    <th className="px-4 py-2 text-right">C.P.</th>
                                                    <th className="w-8"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {coverageZones.filter(z => Number(z.baremo) === 1).map((p, idx) => (
                                                    <tr key={p.id || idx} className="hover:bg-blue-50/30 transition-colors group">
                                                        <td className="px-4 py-2 font-medium text-slate-700">{p.name}</td>
                                                        <td className="px-4 py-2 text-right font-mono text-slate-400 text-xs">{p.zip}</td>
                                                        <td className="px-2 py-2 text-right">
                                                            <button 
                                                                onClick={() => onDeleteCoverageZone(p.id)}
                                                                className="text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                                                title="Eliminar de Baremo 1"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Columna Baremo 2 */}
                                <div className="p-6">
                                    <div className="flex items-center gap-3 mb-4 bg-purple-50 p-3 rounded-xl border border-purple-100">
                                        <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold text-xs">B2</div>
                                        <div>
                                            <h4 className="font-bold text-purple-900 text-sm">BAREMO 2 (Extra)</h4>
                                            <p className="text-[10px] text-purple-700">Periferia y resto de poblaciones</p>
                                        </div>
                                    </div>

                                    <div className="mb-4 flex gap-2">
                                        <input 
                                            placeholder="Nombre" 
                                            className="flex-1 text-xs px-3 py-1.5 border rounded-lg"
                                            value={newZoneData.baremo === 2 ? newZoneData.name : ''}
                                            onChange={e => setNewZoneData({ name: e.target.value, zip: newZoneData.zip, baremo: 2 })}
                                        />
                                        <input 
                                            placeholder="CP" 
                                            className="w-20 text-xs px-3 py-1.5 border rounded-lg font-mono"
                                            value={newZoneData.baremo === 2 ? newZoneData.zip : ''}
                                            onChange={e => setNewZoneData({ name: newZoneData.name, zip: e.target.value, baremo: 2 })}
                                        />
                                        <button 
                                            onClick={() => handleAddZoneClick(2)}
                                            className="bg-purple-600 text-white p-1.5 rounded-lg hover:bg-purple-700 transition-colors"
                                        >
                                            <Plus size={16} />
                                        </button>
                                    </div>

                                    <div className="max-h-[400px] overflow-y-auto pr-2">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase sticky top-0 bg-white">
                                                <tr>
                                                    <th className="px-4 py-2 text-left">Población</th>
                                                    <th className="px-4 py-2 text-right">C.P.</th>
                                                    <th className="w-8"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {coverageZones.filter(z => Number(z.baremo) === 2).map((p, idx) => (
                                                    <tr key={p.id || idx} className="hover:bg-purple-50/30 transition-colors group">
                                                        <td className="px-4 py-2 font-medium text-slate-700">{p.name}</td>
                                                        <td className="px-4 py-2 text-right font-mono text-slate-400 text-xs">{p.zip}</td>
                                                        <td className="px-2 py-2 text-right">
                                                            <button 
                                                                onClick={() => onDeleteCoverageZone(p.id)}
                                                                className="text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                                                title="Eliminar de Baremo 2"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-between items-center px-6">
                            <p className="text-[10px] text-slate-400 italic max-w-md text-left">
                                Esta tabla se basa en la normativa de transporte 2026. Cualquier población NO listada en B1 y fuera de Córdoba (CP 14) se considera B2.
                            </p>
                            <button 
                                onClick={onNormalizeClients}
                                className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-md shadow-emerald-500/20"
                            >
                                <RotateCcw size={16} />
                                NORMALIZAR CIUDADES DE CLIENTES
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Articles */}
            {isFormatModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                <Tag className="text-blue-600" size={20} />
                                {editingId ? 'Editar Servicio' : 'Nuevo Servicio'}
                            </h3>
                            <button onClick={resetForm} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nombre</label>
                                <input type="text" required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Familia / Categoría</label>
                                    <input 
                                        type="text" 
                                        placeholder="Ej: Neumáticos" 
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20" 
                                        value={formData.category} 
                                        onChange={e => setFormData({ ...formData, category: e.target.value })} 
                                        list="category-suggestions"
                                    />
                                    <datalist id="category-suggestions">
                                        {categories.filter(c => c !== 'all').map(cat => (
                                            <option key={cat} value={cat} />
                                        ))}
                                    </datalist>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Unidad</label>
                                    <select 
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20" 
                                        value={formData.unit} 
                                        onChange={e => setFormData({ ...formData, unit: e.target.value })}
                                    >
                                        <option value="Unidad">Unidad</option>
                                        <option value="Hora">Hora</option>
                                        <option value="Km">Km</option>
                                        <option value="Servicio">Servicio</option>
                                        <option value="Palet">Palet</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Precio Baremo 1 (Local) (€)</label>
                                    <input type="number" step="0.01" required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-purple-500 uppercase tracking-wider mb-2">Precio Baremo 2 (Extra) (€)</label>
                                    <input type="number" step="0.01" placeholder="Ej: 15.00" className="w-full px-4 py-2 bg-purple-50 border border-purple-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500" value={formData.priceB2} onChange={e => setFormData({ ...formData, priceB2: e.target.value })} />
                                </div>
                            </div>

                            {/* Zone Specific Prices */}
                            {tariffs && tariffs.length > 0 && (
                                <div className="space-y-3 pt-2">
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Precios Especiales por Zona (Opcional)</h4>
                                    <div className="max-h-40 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                        {tariffs.map(tariff => (
                                            <div key={tariff.id} className="flex items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                <div className="flex-1">
                                                    <span className="text-[10px] font-bold text-slate-600 block leading-tight">{tariff.name}</span>
                                                    <span className="text-[9px] text-slate-400 font-mono italic">
                                                        ({tariff.match || '-'} / {tariff.zipPrefix || '-'})
                                                    </span>
                                                </div>
                                                <div className="relative w-24">
                                                    <Euro className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300" size={12} />
                                                    <input 
                                                        type="number" 
                                                        step="0.01"
                                                        placeholder="Base"
                                                        className="w-full pl-6 pr-2 py-1 bg-white border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-500/20"
                                                        value={formData.zonePrices?.[tariff.id] || ''}
                                                        onChange={(e) => {
                                                            const newPrices = { ...formData.zonePrices };
                                                            if (e.target.value) newPrices[tariff.id] = e.target.value;
                                                            else delete newPrices[tariff.id];
                                                            setFormData({ ...formData, zonePrices: newPrices });
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-[9px] text-slate-400 italic">Si dejas el campo vacío, se usará el Precio Base General.</p>
                                </div>
                            )}

                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={resetForm} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancelar</button>
                                <button type="submit" className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Tariffs */}
            {isTariffModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                <MapIcon className="text-blue-600" size={20} />
                                {editingTariffId ? 'Editar Tarifa' : 'Nueva Tarifa'}
                            </h3>
                            <button onClick={resetTariffForm} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleTariffSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nombre Identificativo</label>
                                <input type="text" placeholder="Ej: Zona Córdoba Capital" required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg" value={tariffData.name} onChange={e => setTariffData({ ...tariffData, name: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Ciudad (Coincidencia)</label>
                                    <input type="text" placeholder="Ej: Córdoba" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg" value={tariffData.match} onChange={e => setTariffData({ ...tariffData, match: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Prefijo CP</label>
                                    <input type="text" placeholder="Ej: 14" maxLength="2" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg" value={tariffData.zipPrefix} onChange={e => setTariffData({ ...tariffData, zipPrefix: e.target.value })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Provincia</label>
                                    <input type="text" placeholder="Ej: Córdoba" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg" value={tariffData.province} onChange={e => setTariffData({ ...tariffData, province: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">País</label>
                                    <input type="text" placeholder="Ej: España" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg" value={tariffData.country} onChange={e => setTariffData({ ...tariffData, country: e.target.value })} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Precio Automático Genérico (€)</label>
                                <input type="number" step="0.01" required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-lg text-blue-600" value={tariffData.price} onChange={e => setTariffData({ ...tariffData, price: e.target.value })} />
                            </div>
                            
                            <div className="space-y-3">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Tipo de Baremo</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <label className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${tariffData.baremo === 1 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
                                        <input 
                                            type="radio" 
                                            name="baremo" 
                                            className="hidden" 
                                            checked={tariffData.baremo === 1}
                                            onChange={() => setTariffData({ ...tariffData, baremo: 1 })}
                                        />
                                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${tariffData.baremo === 1 ? 'border-blue-600' : 'border-slate-300'}`}>
                                            {tariffData.baremo === 1 && <div className="w-2 h-2 bg-blue-600 rounded-full"></div>}
                                        </div>
                                        <span className="font-bold text-sm">Baremo 1 (Local)</span>
                                    </label>
                                    <label className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${tariffData.baremo === 2 ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
                                        <input 
                                            type="radio" 
                                            name="baremo" 
                                            className="hidden" 
                                            checked={tariffData.baremo === 2}
                                            onChange={() => setTariffData({ ...tariffData, baremo: 2 })}
                                        />
                                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${tariffData.baremo === 2 ? 'border-purple-600' : 'border-slate-300'}`}>
                                            {tariffData.baremo === 2 && <div className="w-2 h-2 bg-purple-600 rounded-full"></div>}
                                        </div>
                                        <span className="font-bold text-sm">Baremo 2 (Extra)</span>
                                    </label>
                                </div>
                            </div>
                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={resetTariffForm} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancelar</button>
                                <button type="submit" className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20">Guardar Tarifa</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

// Simple X icon component if not imported or available globally
function X({ size = 24, className = "" }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
        </svg>
    )
}

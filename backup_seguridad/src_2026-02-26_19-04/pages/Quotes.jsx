import React, { useState, useEffect, useMemo } from 'react';
import { Package, Scale, ArrowRight, DollarSign, Settings, Truck, Box, Calculator, Info, Sparkles, X, Copy, MessageSquare, Loader2, Database, Save, Upload, Edit3, Trash2, FileText, HelpCircle, Plus, LayoutGrid, Users, RefreshCw, History, Calendar, Wand2, BarChart3 } from 'lucide-react';

const LogisticsCalculator = () => {
    // --- Estados Principales ---
    const [formData, setFormData] = useState({
        weight: 10,       // Kilos reales
        width: 40,        // cm
        height: 30,       // cm
        depth: 25,        // cm
        margin: 30,       // Porcentaje de beneficio
        volumetricFactor: 5000 // Divisor estándar
    });

    const [results, setResults] = useState({
        volumetricWeight: 0,
        chargeableWeight: 0,
        isVolumetric: false
    });

    // Estado para precios manuales (Override)
    const [manualPrices, setManualPrices] = useState({});

    // --- NUEVA ESTRUCTURA DE AGENCIAS ---
    const [agencies, setAgencies] = useState([
        {
            id: 'gls',
            name: "GLS",
            color: "bg-blue-50 border-blue-200",
            rates: [],
            basePrice: 5.00,
            pricePerKg: 0.85
        },
        {
            id: 'tsb',
            name: "TSB",
            color: "bg-green-50 border-green-200",
            rates: [],
            basePrice: 8.50,
            pricePerKg: 0.70
        },
        {
            id: 'ontime',
            name: "Ontime",
            color: "bg-purple-50 border-purple-200",
            rates: [],
            basePrice: 3.00,
            pricePerKg: 1.10
        }
    ]);

    // Estado para el Modal de Tarifas
    const [isRateModalOpen, setIsRateModalOpen] = useState(false);
    const [selectedAgencyId, setSelectedAgencyId] = useState('gls');
    const [bulkImportText, setBulkImportText] = useState("");
    const [singleImportText, setSingleImportText] = useState("");
    const [importError, setImportError] = useState("");

    // --- Estados para Historial de Presupuestos ---
    const [savedQuotes, setSavedQuotes] = useState([]);
    const [isQuotesModalOpen, setIsQuotesModalOpen] = useState(false);

    // --- Estados para IA, Plantillas y Nuevas Funciones ---
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [aiContent, setAiContent] = useState("");
    const [aiLoading, setAiLoading] = useState(false);
    const [aiTitle, setAiTitle] = useState("");
    const [aiError, setAiError] = useState("");

    // Estado para el Estimador de Medidas
    const [isEstimatorOpen, setIsEstimatorOpen] = useState(false);
    const [estimatorText, setEstimatorText] = useState("");
    const [isEstimating, setIsEstimating] = useState(false);

    // Estado para el Análisis de Ofertas
    const [analysisResult, setAnalysisResult] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Plantilla por defecto
    const defaultTemplate = `Hola,

Adjunto cotización solicitada para el envío con los siguientes detalles:

📦 Agencia: {AGENCY_NAME}
⚖️ Peso Tasable: {WEIGHT} kg
📏 Medidas: {DIMENSIONS} cm

💰 PRECIO FINAL: {PRICE} €

Quedo a la espera de tu confirmación para proceder.

Saludos cordiales.`;

    const [isEmailTemplateOpen, setIsEmailTemplateOpen] = useState(false);
    const [emailTemplate, setEmailTemplate] = useState(defaultTemplate);

    // Cargar presupuestos guardados al inicio
    useEffect(() => {
        const saved = localStorage.getItem('logistics_saved_quotes');
        if (saved) {
            try {
                setSavedQuotes(JSON.parse(saved));
            } catch (e) {
                console.error("Error cargando presupuestos", e);
            }
        }
    }, []);

    // Calcular métricas y limpiar análisis previo si cambian los datos
    useEffect(() => {
        const { weight, width, height, depth, volumetricFactor } = formData;
        const volumeWeight = (width * height * depth) / volumetricFactor;
        const chargeable = Math.max(parseFloat(weight), volumeWeight);

        setResults({
            volumetricWeight: parseFloat(volumeWeight.toFixed(2)),
            chargeableWeight: parseFloat(chargeable.toFixed(2)),
            isVolumetric: volumeWeight > weight
        });
        setAnalysisResult(null); // Resetear análisis si cambian los datos
    }, [formData]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: parseFloat(value) || 0
        }));
    };

    const handleManualPriceChange = (agencyId, value) => {
        setManualPrices(prev => ({
            ...prev,
            [agencyId]: value
        }));
    };

    // --- LÓGICA DE CÁLCULO DE COSTES ---
    const calculateCost = (agency) => {
        if (agency.rates && agency.rates.length > 0) {
            const weight = results.chargeableWeight;
            let bracket = agency.rates.find(r => r.limit >= weight);
            if (!bracket) {
                bracket = agency.rates[agency.rates.length - 1];
            }
            return bracket.price;
        }
        return agency.basePrice + (results.chargeableWeight * agency.pricePerKg);
    };

    const calculateAutoPrice = (cost) => {
        return cost * (1 + (formData.margin / 100));
    };

    // --- GESTIÓN DE AGENCIAS Y TARIFAS ---
    const handleAddAgency = () => {
        const newId = `agency_${Date.now()}`;
        const newAgency = {
            id: newId,
            name: "Nueva Agencia",
            color: "bg-slate-50 border-slate-200",
            rates: [],
            basePrice: 0,
            pricePerKg: 0
        };
        setAgencies([...agencies, newAgency]);
        setSelectedAgencyId(newId);
        setSingleImportText("");
    };

    const handleDeleteAgency = (id) => {
        if (confirm("¿Seguro que quieres borrar esta agencia?")) {
            const newAgencies = agencies.filter(a => a.id !== id);
            setAgencies(newAgencies);
            if (selectedAgencyId === id) setSelectedAgencyId('gls');
        }
    };

    const handleUpdateAgency = (id, field, value) => {
        setAgencies(agencies.map(a => a.id === id ? { ...a, [field]: value } : a));
    };

    const handleSingleImport = (agencyId) => {
        setImportError("");
        if (!singleImportText.trim()) return;
        try {
            const lines = singleImportText.trim().split('\n');
            const newRates = [];
            for (let line of lines) {
                const parts = line.replace(/,/g, '.').split(/[\t; ]+/);
                if (parts.length >= 2) {
                    const limit = parseFloat(parts[0]);
                    const price = parseFloat(parts[1]);
                    if (!isNaN(limit) && !isNaN(price)) {
                        newRates.push({ limit, price });
                    }
                }
            }
            if (newRates.length === 0) throw new Error("No se detectaron datos válidos.");
            newRates.sort((a, b) => a.limit - b.limit);
            handleUpdateAgency(agencyId, 'rates', newRates);
            setSingleImportText("");
            alert(`¡Importadas ${newRates.length} tarifas correctamente!`);
        } catch (err) {
            setImportError("Error: " + err.message);
        }
    };

    const handleBulkImport = () => {
        setImportError("");
        if (!bulkImportText.trim()) {
            setImportError("Pega los datos primero.");
            return;
        }
        try {
            const lines = bulkImportText.trim().split('\n');
            if (lines.length < 2) throw new Error("Faltan datos.");
            const headerParts = lines[0].trim().split(/\t+| {2,}/);
            const newAgenciesData = [];
            for (let i = 1; i < headerParts.length; i++) {
                const name = headerParts[i].trim() || `Agencia ${i}`;
                const existing = agencies.find(a => a.name.toLowerCase() === name.toLowerCase());
                newAgenciesData.push({
                    id: existing ? existing.id : `imp_${Date.now()}_${i}`,
                    name: name,
                    color: existing ? existing.color : "bg-slate-50 border-slate-200",
                    rates: [],
                    basePrice: 0,
                    pricePerKg: 0
                });
            }
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const parts = line.replace(/,/g, '.').split(/\t+| {2,}/);
                const limit = parseFloat(parts[0]);
                if (isNaN(limit)) continue;
                for (let j = 0; j < newAgenciesData.length; j++) {
                    const price = parseFloat(parts[j + 1]);
                    if (!isNaN(price)) {
                        newAgenciesData[j].rates.push({ limit, price });
                    }
                }
            }
            newAgenciesData.forEach(a => a.rates.sort((x, y) => x.limit - y.limit));
            setAgencies(newAgenciesData);
            setBulkImportText("");
            alert(`Importadas ${newAgenciesData.length} agencias.`);
            setSelectedAgencyId(newAgenciesData[0].id);
        } catch (err) {
            console.error(err);
            setImportError("Error procesando masivo: " + err.message);
        }
    };

    // --- GESTIÓN DE PRESUPUESTOS ---
    const handleSaveQuote = (agencyName, finalPrice) => {
        const newQuote = {
            id: Date.now(),
            date: new Date().toLocaleString(),
            agency: agencyName,
            weight: results.chargeableWeight,
            dimensions: `${formData.width}x${formData.height}x${formData.depth}`,
            price: finalPrice
        };

        const updatedQuotes = [newQuote, ...savedQuotes];
        setSavedQuotes(updatedQuotes);
        localStorage.setItem('logistics_saved_quotes', JSON.stringify(updatedQuotes));
        alert("✅ Presupuesto guardado correctamente en el historial.");
    };

    const handleDeleteQuote = (id) => {
        if (confirm("¿Estás seguro de borrar este presupuesto del historial?")) {
            const updatedQuotes = savedQuotes.filter(q => q.id !== id);
            setSavedQuotes(updatedQuotes);
            localStorage.setItem('logistics_saved_quotes', JSON.stringify(updatedQuotes));
        }
    };

    // --- Integración con Gemini API ---
    const callGeminiAPI = async (prompt) => {
        const apiKey = "";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            return data.candidates?.[0]?.content?.parts?.[0]?.text;
        } catch (error) {
            console.error("Error API:", error);
            throw error;
        }
    };

    // --- FUNCIONALIDAD IA 1: OPTIMIZACIÓN (Ya existente) ---
    const handleOptimizePackage = async () => {
        setAiTitle("Análisis de Embalaje Inteligente");
        setAiModalOpen(true);
        setAiLoading(true);
        const prompt = `Actúa como experto logístico. Envío: ${formData.width}x${formData.height}x${formData.depth}cm, ${formData.weight}kg. Factor ${formData.volumetricFactor}. Volumétrico: ${results.volumetricWeight}. ¿Reducir medidas bajaría tramo? Responde breve en Español.`;
        try {
            const text = await callGeminiAPI(prompt);
            setAiContent(text || "Sin respuesta");
        } catch (e) { setAiError("Error IA"); }
        finally { setAiLoading(false); }
    };

    // --- FUNCIONALIDAD IA 2: GENERAR EMAIL (Ya existente) ---
    const handleGenerateQuote = async (agencyName, finalPrice) => {
        setAiTitle(`Presupuesto - ${agencyName}`);
        setAiModalOpen(true);
        setAiLoading(true);

        let filledTemplate = emailTemplate
            .replace(/{AGENCY_NAME}/gi, agencyName)
            .replace(/{PRICE}/gi, finalPrice.toFixed(2))
            .replace(/{PRECIO}/gi, finalPrice.toFixed(2))
            .replace(/{WEIGHT}/gi, results.chargeableWeight)
            .replace(/{PESO}/gi, results.chargeableWeight)
            .replace(/{DIMENSIONS}/gi, `${formData.width}x${formData.height}x${formData.depth}`);

        const strictPrompt = `
    Actúa como un asistente de corrección de textos.
    A continuación te doy un BORRADOR DE EMAIL que ya contiene los datos correctos (precios, medidas, etc.).
    TU TAREA: Devuelve el correo listo para enviar. NO cambies los números, precios ni el nombre de la agencia. Respeta el contenido original.
    BORRADOR ORIGINAL:
    """
    ${filledTemplate}
    """
    `;

        try {
            const text = await callGeminiAPI(strictPrompt);
            setAiContent(text || "Sin respuesta");
        } catch (e) { setAiError("Error IA"); }
        finally { setAiLoading(false); }
    };

    // --- FUNCIONALIDAD IA 3: ESTIMAR MEDIDAS POR DESCRIPCIÓN ---
    const handleEstimateFromDescription = async () => {
        if (!estimatorText.trim()) return;
        setIsEstimating(true);
        const prompt = `
    Actúa como un experto en logística y envíos.
    Estima el peso (en kg) y las dimensiones (largo, alto, ancho en cm) promedio para el siguiente objeto: "${estimatorText}".
    
    Reglas:
    1. Sé realista. Si es "una bici", piensa en la caja desmontada.
    2. Devuelve SOLAMENTE 4 números separados por comas en este orden estricto: PESO, LARGO, ALTO, ANCHO.
    3. No añadas texto, ni unidades, solo los números.
    Ejemplo de respuesta válida: 12.5, 140, 80, 25
    `;

        try {
            const text = await callGeminiAPI(prompt);
            const parts = text.split(',').map(s => parseFloat(s.trim()));

            if (parts.length >= 4 && !parts.some(isNaN)) {
                setFormData(prev => ({
                    ...prev,
                    weight: parts[0],
                    width: parts[1],
                    height: parts[2],
                    depth: parts[3]
                }));
                setIsEstimatorOpen(false);
                setEstimatorText("");
                alert("✅ Medidas estimadas aplicadas correctamente.");
            } else {
                alert("No pude entender las medidas para ese objeto. Intenta ser más específico.");
            }
        } catch (e) {
            alert("Error al conectar con la IA de estimación.");
        } finally {
            setIsEstimating(false);
        }
    };

    // --- FUNCIONALIDAD IA 4: ANÁLISIS DE OFERTAS ---
    const handleAnalyzeQuotes = async () => {
        setIsAnalyzing(true);

        // Preparar datos para la IA
        const quotesSummary = agencies.map(agency => {
            const cost = calculateCost(agency);
            const autoPrice = calculateAutoPrice(cost);
            const manualPrice = manualPrices[agency.id];
            const finalPrice = manualPrice !== undefined && manualPrice !== "" ? parseFloat(manualPrice) : autoPrice;
            const profit = finalPrice - cost;
            const marginPercent = ((profit / cost) * 100).toFixed(1);
            return `- ${agency.name}: Coste ${cost.toFixed(2)}, Venta ${finalPrice.toFixed(2)}, Margen ${marginPercent}%`;
        }).join('\n');

        const prompt = `
    Actúa como un consultor logístico senior. Analiza estas opciones de envío para un paquete de ${results.chargeableWeight}kg:
    
    ${quotesSummary}
    
    Tu tarea:
    1. Recomienda la mejor opción considerando rentabilidad vs precio de mercado.
    2. ¿El margen aplicado es saludable para este tipo de carga?
    3. Da un consejo breve y estratégico para cerrar la venta.
    Responde en Español, usa negritas para resaltar lo importante y sé conciso (máx 3-4 frases).
    `;

        try {
            const text = await callGeminiAPI(prompt);
            setAnalysisResult(text);
        } catch (e) {
            setAnalysisResult("Error al realizar el análisis.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(aiContent);
        alert("¡Copiado!");
    };

    return (
        <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans text-slate-800 relative">
            <div className="max-w-6xl mx-auto">

                {/* Header */}
                <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
                            <Truck className="w-8 h-8 text-blue-600" />
                            Cotizador Logístico Pro
                            <span className="bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 shadow-sm">
                                <Sparkles className="w-3 h-3" /> AI Powered
                            </span>
                        </h1>
                        <p className="text-slate-500 mt-1">Calculadora de tarifas con importación de Excel</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setIsQuotesModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-medium transition-colors shadow-sm"
                        >
                            <History className="w-4 h-4 text-orange-500" />
                            Mis Presupuestos
                        </button>
                        <button
                            onClick={() => setIsEmailTemplateOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-medium transition-colors shadow-sm"
                        >
                            <FileText className="w-4 h-4 text-purple-600" />
                            Configurar Email
                        </button>
                        <button
                            onClick={() => {
                                setSelectedAgencyId('bulk');
                                setIsRateModalOpen(true);
                            }}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg border font-medium transition-colors bg-blue-600 text-white border-blue-700 shadow-md hover:bg-blue-700"
                        >
                            <Database className="w-4 h-4" />
                            Gestionar Tarifas
                        </button>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                    {/* Panel Izquierdo: Inputs */}
                    <div className="lg:col-span-4 space-y-6">

                        {/* Dimensiones */}
                        <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200 relative overflow-hidden">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-700">
                                    <Box className="w-5 h-5 text-blue-500" />
                                    Medidas
                                </h2>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => setIsEstimatorOpen(true)}
                                        className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full border border-indigo-100 transition-colors hover:bg-indigo-100"
                                        title="Estimar medidas con IA"
                                    >
                                        <Wand2 className="w-3 h-3" /> Estimar
                                    </button>
                                    {results.isVolumetric && (
                                        <button onClick={handleOptimizePackage} className="flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full border border-purple-200 transition-colors hover:bg-purple-200">
                                            <Sparkles className="w-3 h-3" /> Optimizar
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Peso Real (kg)</label>
                                    <div className="relative">
                                        <input type="number" name="weight" value={formData.weight} onChange={handleInputChange} className="w-full p-3 pl-10 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-lg font-mono" />
                                        <Scale className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    {['height', 'width', 'depth'].map(dim => (
                                        <div key={dim}>
                                            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">{dim === 'height' ? 'Alto' : dim === 'width' ? 'Ancho' : 'Prof.'}</label>
                                            <input type="number" name={dim} value={formData[dim]} onChange={handleInputChange} className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-center" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Rentabilidad */}
                        <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200">
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-700">
                                <DollarSign className="w-5 h-5 text-green-500" />
                                Rentabilidad
                            </h2>
                            <label className="flex justify-between text-sm font-medium text-slate-700 mb-2">
                                <span>Margen Comercial</span>
                                <span className="text-blue-600 font-bold">{formData.margin}%</span>
                            </label>
                            <input type="range" name="margin" min="0" max="100" step="5" value={formData.margin} onChange={handleInputChange} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                        </div>

                        {/* Configuración */}
                        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 flex justify-between items-center">
                            <label className="text-xs text-slate-500 font-medium">Factor Volumétrico</label>
                            <select name="volumetricFactor" value={formData.volumetricFactor} onChange={handleInputChange} className="text-xs bg-white border border-slate-300 rounded px-2 py-1">
                                <option value="5000">5000 (Estándar)</option>
                                <option value="4000">4000 (Marítimo)</option>
                                <option value="3333">3333 (Volum.)</option>
                                <option value="6000">6000 (Eco)</option>
                            </select>
                        </div>
                    </div>

                    {/* Panel Derecho: Resultados */}
                    <div className="lg:col-span-8 space-y-6">

                        {/* Tarjetas de Peso */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className={`p-5 rounded-xl border-2 transition-all ${!results.isVolumetric ? 'bg-white border-blue-500 shadow-md ring-1 ring-blue-200' : 'bg-slate-50 border-transparent opacity-60'}`}>
                                <div className="flex justify-between items-start mb-2"><span className="text-sm font-bold uppercase text-slate-500">Peso Real</span>{!results.isVolumetric && <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full font-bold">SELECCIONADO</span>}</div>
                                <div className="text-3xl font-bold text-slate-800">{formData.weight} <span className="text-lg text-slate-400 font-normal">kg</span></div>
                            </div>
                            <div className={`p-5 rounded-xl border-2 transition-all ${results.isVolumetric ? 'bg-white border-blue-500 shadow-md ring-1 ring-blue-200' : 'bg-slate-50 border-transparent opacity-60'}`}>
                                <div className="flex justify-between items-start mb-2"><span className="text-sm font-bold uppercase text-slate-500">Peso Volumétrico</span>{results.isVolumetric && <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full font-bold">SELECCIONADO</span>}</div>
                                <div className="text-3xl font-bold text-slate-800">{results.volumetricWeight} <span className="text-lg text-slate-400 font-normal">kg</span></div>
                            </div>
                        </div>

                        <div className="bg-blue-600 text-white p-4 rounded-lg flex items-center justify-between shadow-lg">
                            <div className="flex items-center gap-3">
                                <Calculator className="w-6 h-6 text-blue-200" />
                                <div>
                                    <p className="text-blue-200 text-xs uppercase font-bold">Peso Tasable Final</p>
                                    <p className="text-xl font-bold">Se cobrará por: {results.chargeableWeight} kg</p>
                                </div>
                            </div>
                        </div>

                        {/* SECCIÓN ANÁLISIS IA */}
                        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl border border-indigo-100 p-4">
                            {!analysisResult ? (
                                <button
                                    onClick={handleAnalyzeQuotes}
                                    disabled={isAnalyzing}
                                    className="w-full py-3 flex items-center justify-center gap-2 text-indigo-700 font-medium hover:bg-white/50 rounded-lg transition-all"
                                >
                                    {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <BarChart3 className="w-5 h-5" />}
                                    {isAnalyzing ? "Analizando mercado..." : "Analizar Ofertas con IA"}
                                </button>
                            ) : (
                                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-bold text-indigo-900 flex items-center gap-2"><Sparkles className="w-4 h-4 text-yellow-500" /> Consejo Estratégico</h4>
                                        <button onClick={() => setAnalysisResult(null)} className="text-xs text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                                    </div>
                                    <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                                        {analysisResult}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Tabla Comparativa */}
                        <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
                            <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                                <h3 className="font-bold text-slate-700">Comparativa de Agencias</h3>
                                <span className="text-xs text-slate-500">Calculado sobre {results.chargeableWeight} kg</span>
                            </div>

                            <div className="divide-y divide-slate-100">
                                {agencies.length === 0 ? (
                                    <div className="p-8 text-center text-slate-500">No hay agencias configuradas.</div>
                                ) : (
                                    agencies.map((agency) => {
                                        const cost = calculateCost(agency);
                                        const autoPrice = calculateAutoPrice(cost);

                                        const manualPrice = manualPrices[agency.id];
                                        const hasManualPrice = manualPrice !== undefined && manualPrice !== "";

                                        const finalPrice = hasManualPrice ? parseFloat(manualPrice) : autoPrice;
                                        const profit = finalPrice - cost;

                                        return (
                                            <div key={agency.id} className="p-4 md:p-6 hover:bg-slate-50 transition-colors grid grid-cols-1 md:grid-cols-12 gap-4 items-center group">

                                                {/* 1. Agencia */}
                                                <div className="md:col-span-3 flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${agency.color || "bg-slate-100"}`}>
                                                        <Package className="w-5 h-5 text-slate-600" />
                                                    </div>
                                                    <div className="overflow-hidden">
                                                        <p className="font-bold text-slate-800 truncate" title={agency.name}>{agency.name}</p>
                                                        <p className="text-xs text-slate-400">
                                                            {agency.rates.length > 0 ? 'Tarifa por tramo' : 'Tarifa Simulada'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* 2. Tu Coste */}
                                                <div className="md:col-span-2 hidden sm:block">
                                                    <p className="text-xs text-slate-400 uppercase font-semibold">Tu Coste</p>
                                                    <p className="font-mono text-lg text-slate-600">{cost.toFixed(2)} €</p>
                                                </div>

                                                {/* 3. Beneficio */}
                                                <div className="md:col-span-2 hidden sm:block">
                                                    <p className="text-xs text-green-600 uppercase font-semibold">Beneficio</p>
                                                    <div className="flex items-center gap-1">
                                                        <p className={`font-mono text-sm font-bold ${profit < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                                            {profit > 0 ? '+' : ''}{profit.toFixed(2)} €
                                                        </p>
                                                        {hasManualPrice && <span className="text-[10px] bg-slate-200 text-slate-600 px-1 rounded">Manual</span>}
                                                    </div>
                                                </div>

                                                {/* 4. Precio Manual */}
                                                <div className="md:col-span-2">
                                                    <p className="text-xs text-slate-400 uppercase font-semibold mb-1 flex items-center gap-1">
                                                        <Edit3 className="w-3 h-3" /> Manual
                                                    </p>
                                                    <input
                                                        type="number"
                                                        placeholder={autoPrice.toFixed(2)}
                                                        value={manualPrices[agency.id] || ""}
                                                        onChange={(e) => handleManualPriceChange(agency.id, e.target.value)}
                                                        className={`w-full p-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 transition-colors ${hasManualPrice ? 'border-blue-500 bg-blue-50 text-blue-900 font-bold' : 'border-slate-200 bg-white text-slate-600'}`}
                                                    />
                                                </div>

                                                {/* 5. Acciones */}
                                                <div className="md:col-span-3 flex flex-col items-end gap-2 pl-2 border-l border-slate-100">
                                                    <div className="text-right">
                                                        <p className="text-xs text-slate-400 uppercase font-semibold">Tarifa Cliente</p>
                                                        <span className="text-2xl font-bold text-blue-900">{finalPrice.toFixed(2)} €</span>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleGenerateQuote(agency.name, finalPrice)}
                                                            className="flex items-center gap-1.5 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg transition-colors border border-indigo-100 shadow-sm"
                                                        >
                                                            <Sparkles className="w-3 h-3" /> Email
                                                        </button>
                                                        <button
                                                            onClick={() => handleSaveQuote(agency.name, finalPrice)}
                                                            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors shadow-sm"
                                                            title="Guardar en historial"
                                                        >
                                                            <Save className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* MODAL ESTIMADOR DE MEDIDAS (NUEVO) */}
                {isEstimatorOpen && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
                            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <Wand2 className="w-5 h-5 text-indigo-600" /> Estimar Medidas
                                </h2>
                                <button onClick={() => setIsEstimatorOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><X className="w-5 h-5" /></button>
                            </div>
                            <div className="p-6">
                                <p className="text-sm text-slate-600 mb-3">
                                    Describe qué vas a enviar y la IA calculará el peso y volumen aproximado.
                                </p>
                                <textarea
                                    value={estimatorText}
                                    onChange={(e) => setEstimatorText(e.target.value)}
                                    placeholder="Ej: Una caja de 6 botellas de vino, una bicicleta de montaña, un sofá de 3 plazas..."
                                    className="w-full h-32 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 mb-4 text-sm"
                                />
                                <button
                                    onClick={handleEstimateFromDescription}
                                    disabled={isEstimating || !estimatorText.trim()}
                                    className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isEstimating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    {isEstimating ? "Calculando..." : "Estimar con IA"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- MODAL GESTIÓN TARIFAS --- */}
                {isRateModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
                            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white z-10">
                                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                    <Database className="w-6 h-6 text-blue-600" /> Gestión de Tarifas
                                </h2>
                                <button onClick={() => setIsRateModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><X className="w-5 h-5" /></button>
                            </div>

                            <div className="flex flex-1 overflow-hidden">
                                {/* Sidebar */}
                                <div className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col">
                                    <div className="p-4 border-b border-slate-200">
                                        <button onClick={() => setSelectedAgencyId('bulk')} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${selectedAgencyId === 'bulk' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-200'}`}><LayoutGrid className="w-4 h-4" /> Importación Masiva</button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                        <p className="px-3 py-2 text-xs font-bold text-slate-400 uppercase">Mis Agencias</p>
                                        {agencies.map(agency => (
                                            <button key={agency.id} onClick={() => { setSelectedAgencyId(agency.id); setSingleImportText(""); }} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${selectedAgencyId === agency.id ? 'bg-white border border-blue-200 shadow-sm text-blue-700' : 'text-slate-600 hover:bg-slate-200 border border-transparent'}`}>
                                                <div className={`w-2 h-2 rounded-full ${agency.color.split(' ')[0].replace('50', '500')}`}></div>
                                                {agency.name}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="p-4 border-t border-slate-200">
                                        <button onClick={handleAddAgency} className="w-full py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Añadir Agencia</button>
                                    </div>
                                </div>

                                {/* Main */}
                                <div className="flex-1 overflow-y-auto bg-white p-6">
                                    {selectedAgencyId === 'bulk' ? (
                                        <div className="max-w-2xl mx-auto">
                                            <div className="mb-6 flex items-center gap-3"><div className="p-3 bg-blue-100 rounded-full"><LayoutGrid className="w-6 h-6 text-blue-600" /></div><div><h3 className="text-lg font-bold text-slate-800">Carga Masiva (Excel Completo)</h3><p className="text-sm text-slate-500">Pega tu Excel con múltiples columnas.</p></div></div>
                                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs font-mono text-slate-600 mb-4">KILOS &nbsp; GLS &nbsp; TSB &nbsp; ONTIME ...<br />10 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 5,26 &nbsp; 6,17 &nbsp; 7,32 ...</div>
                                            <textarea value={bulkImportText} onChange={(e) => setBulkImportText(e.target.value)} placeholder="Pega aquí..." className="w-full h-64 p-4 font-mono text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 mb-4"></textarea>
                                            {importError && <div className="text-red-600 text-sm mb-4 bg-red-50 p-3 rounded-lg flex items-center gap-2"><X className="w-4 h-4" /> {importError}</div>}
                                            <button onClick={handleBulkImport} className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 flex justify-center items-center gap-2"><Save className="w-4 h-4" /> Procesar</button>
                                        </div>
                                    ) : (
                                        (() => {
                                            const agency = agencies.find(a => a.id === selectedAgencyId);
                                            if (!agency) return null;
                                            return (
                                                <div className="max-w-2xl mx-auto animate-in fade-in duration-300">
                                                    <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
                                                        <div><label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nombre Agencia</label><input type="text" value={agency.name} onChange={(e) => handleUpdateAgency(agency.id, 'name', e.target.value)} className="text-2xl font-bold text-slate-800 border-none p-0 focus:ring-0 w-full" /></div>
                                                        <button onClick={() => handleDeleteAgency(agency.id)} className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg"><Trash2 className="w-5 h-5" /></button>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-6 mb-8">
                                                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200"><h4 className="font-semibold text-slate-700 mb-3 flex items-center gap-2"><Settings className="w-4 h-4" /> Básico</h4><div className="space-y-3"><div><label className="text-xs text-slate-500 block mb-1">Base (€)</label><input type="number" value={agency.basePrice} onChange={(e) => handleUpdateAgency(agency.id, 'basePrice', parseFloat(e.target.value))} className="w-full p-2 text-sm border rounded" /></div><div><label className="text-xs text-slate-500 block mb-1">Extra (€/Kg)</label><input type="number" value={agency.pricePerKg} onChange={(e) => handleUpdateAgency(agency.id, 'pricePerKg', parseFloat(e.target.value))} className="w-full p-2 text-sm border rounded" /></div></div></div>
                                                        <div className="p-4 bg-blue-50 rounded-xl border border-blue-100"><h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2"><Upload className="w-4 h-4" /> Tarifas (Kilos / Precio)</h4><textarea value={singleImportText} onChange={(e) => setSingleImportText(e.target.value)} placeholder={`10  5.50\n20  7.20`} className="w-full h-32 p-2 text-xs font-mono border border-blue-200 rounded mb-2"></textarea><button onClick={() => handleSingleImport(agency.id)} className="w-full py-2 bg-blue-600 text-white text-xs font-bold rounded">Actualizar</button></div>
                                                    </div>
                                                    <div><h4 className="font-bold text-slate-800 mb-4">Tabla Actual ({agency.rates.length} tramos)</h4><div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto"><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-xs uppercase text-slate-500 sticky top-0"><tr><th className="px-4 py-2">Hasta (Kg)</th><th className="px-4 py-2 text-right">Precio (€)</th></tr></thead><tbody className="divide-y divide-slate-100">{agency.rates.map((rate, idx) => (<tr key={idx} className="hover:bg-slate-50"><td className="px-4 py-2 font-medium">{rate.limit} kg</td><td className="px-4 py-2 text-right font-mono text-slate-600">{rate.price.toFixed(2)} €</td></tr>))}</tbody></table></div></div>
                                                </div>
                                            );
                                        })()
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* MODAL CONFIGURAR PLANTILLA EMAIL */}
                {isEmailTemplateOpen && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                        <FileText className="w-6 h-6 text-purple-600" />
                                        Configurar Plantilla de Email
                                    </h2>
                                    <p className="text-sm text-slate-500">Escribe aquí tu correo base y usa las variables.</p>
                                </div>
                                <button onClick={() => setIsEmailTemplateOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><X className="w-5 h-5" /></button>
                            </div>

                            <div className="p-6 bg-slate-50 flex-1 overflow-y-auto">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex gap-3">
                                    <HelpCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-blue-800">
                                        <p className="font-bold mb-1">Variables Mágicas (se rellenan solas):</p>
                                        <ul className="list-disc list-inside space-y-0.5 font-mono text-xs mt-2">
                                            <li>{`{PRICE}`} o {`{PRECIO}`} - Precio final calculado</li>
                                            <li>{`{AGENCY_NAME}`} - Nombre de la agencia</li>
                                            <li>{`{WEIGHT}`} - Peso tasable usado</li>
                                            <li>{`{DIMENSIONS}`} - Medidas</li>
                                        </ul>
                                    </div>
                                </div>

                                <label className="block text-sm font-medium text-slate-700 mb-2">Borrador de Correo:</label>
                                <textarea
                                    value={emailTemplate}
                                    onChange={(e) => setEmailTemplate(e.target.value)}
                                    className="w-full h-80 p-4 font-mono text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 shadow-sm"
                                    placeholder="Escribe aquí tu email..."
                                ></textarea>
                            </div>

                            <div className="p-4 border-t border-slate-100 flex justify-between gap-2">
                                <button onClick={() => setEmailTemplate(defaultTemplate)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-800 flex items-center gap-2">
                                    <RefreshCw className="w-3 h-3" /> Resetear
                                </button>
                                <button onClick={() => setIsEmailTemplateOpen(false)} className="px-4 py-2 text-sm font-medium bg-slate-800 text-white rounded-lg hover:bg-slate-900 shadow-sm">
                                    Guardar Plantilla
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* MODAL HISTORIAL DE PRESUPUESTOS */}
                {isQuotesModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                        <History className="w-6 h-6 text-orange-500" />
                                        Mis Presupuestos Guardados
                                    </h2>
                                    <p className="text-sm text-slate-500">Historial de cotizaciones guardadas</p>
                                </div>
                                <button onClick={() => setIsQuotesModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><X className="w-5 h-5" /></button>
                            </div>

                            <div className="p-6 bg-slate-50 flex-1 overflow-y-auto">
                                {savedQuotes.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                                        <History className="w-12 h-12 mb-2 opacity-20" />
                                        <p>No tienes presupuestos guardados aún.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {savedQuotes.map(quote => (
                                            <div key={quote.id} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
                                                <div className="flex items-center gap-4 flex-1">
                                                    <div className="p-3 bg-blue-50 text-blue-600 rounded-full">
                                                        <Package className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <h4 className="font-bold text-slate-800">{quote.agency}</h4>
                                                            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                                <Calendar className="w-3 h-3" /> {quote.date}
                                                            </span>
                                                        </div>
                                                        <div className="text-sm text-slate-500 mt-1 flex gap-4">
                                                            <span className="flex items-center gap-1"><Scale className="w-3 h-3" /> {quote.weight} kg</span>
                                                            <span className="flex items-center gap-1"><Box className="w-3 h-3" /> {quote.dimensions}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="text-right">
                                                        <p className="text-xs text-slate-400 uppercase font-semibold">Precio Final</p>
                                                        <p className="text-xl font-bold text-blue-600">{quote.price.toFixed(2)} €</p>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeleteQuote(quote.id)}
                                                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal de Resultados IA Genericos (Para Emails y Optimización) */}
                {aiModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in duration-200">
                            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Sparkles className="w-5 h-5 text-purple-600" />{aiTitle}</h3>
                                <button onClick={() => setAiModalOpen(false)} className="p-1 hover:bg-slate-200 rounded-full"><X className="w-5 h-5 text-slate-500" /></button>
                            </div>
                            <div className="p-6 overflow-y-auto flex-1 bg-white">
                                {aiLoading ? <div className="flex flex-col items-center py-12 gap-3"><Loader2 className="w-10 h-10 animate-spin text-purple-500" /><p className="text-sm font-medium animate-pulse">Pensando...</p></div> : <div className="prose prose-sm text-slate-700 whitespace-pre-wrap">{aiContent}</div>}
                            </div>
                            {!aiLoading && !aiError && <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2"><button onClick={copyToClipboard} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"><Copy className="w-4 h-4" /> Copiar</button></div>}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default LogisticsCalculator;

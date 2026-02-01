import { useState } from 'react';
import { Search, Plus, FileText, Trash2, Edit, Euro, Tag, Map } from 'lucide-react';

export default function Articles({ articles, onAddArticle, onUpdateArticle, onDeleteArticle, tariffs, onAddTariff, onUpdateTariff, onDeleteTariff }) {
    const [activeTab, setActiveTab] = useState('articles'); // 'articles' or 'tariffs'
    const [searchTerm, setSearchTerm] = useState('');
    const [isFormatModalOpen, setIsFormatModalOpen] = useState(false);
    const [isTariffModalOpen, setIsTariffModalOpen] = useState(false);

    // Article Form State
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        unit: 'Unidad'
    });
    const [editingId, setEditingId] = useState(null);

    // Tariff Form State
    const [tariffData, setTariffData] = useState({
        name: '', // Display Name e.g. "Zona Córdoba"
        match: '', // Keyword or City e.g. "Córdoba"
        zipPrefix: '', // ZIP Start e.g. "14"
        price: ''
    });
    const [editingTariffId, setEditingTariffId] = useState(null);

    const filteredArticles = (articles || []).filter(article =>
        article.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        article.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredTariffs = (tariffs || []).filter(tariff =>
        tariff.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tariff.match.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
        setFormData({ name: '', description: '', price: '', unit: 'Unidad' });
        setEditingId(null);
        setIsFormatModalOpen(false);
    };

    const handleEdit = (article) => {
        setFormData({
            name: article.name,
            description: article.description,
            price: article.price,
            unit: article.unit || 'Unidad'
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
        setTariffData({ name: '', match: '', zipPrefix: '', price: '' });
        setEditingTariffId(null);
        setIsTariffModalOpen(false);
    };

    const handleEditTariff = (tariff) => {
        setTariffData({
            name: tariff.name,
            match: tariff.match,
            zipPrefix: tariff.zipPrefix,
            price: tariff.price
        });
        setEditingTariffId(tariff.id);
        setIsTariffModalOpen(true);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Tag className="text-blue-600" />
                        {activeTab === 'articles' ? 'Artículos y Servicios' : 'Tarifas por Zona'}
                    </h1>
                    <p className="text-slate-500 mt-1">
                        {activeTab === 'articles' ? 'Catálogo de servicios extra' : 'Configuración de precios automáticos por destino'}
                    </p>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => setActiveTab('articles')}
                        className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === 'articles' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-100'}`}
                    >
                        Servicios
                    </button>
                    <button
                        onClick={() => setActiveTab('tariffs')}
                        className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === 'tariffs' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-100'}`}
                    >
                        Tarifas Zonas
                    </button>
                </div>

                <button
                    onClick={() => activeTab === 'articles' ? setIsFormatModalOpen(true) : setIsTariffModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all hover:scale-105 active:scale-95"
                >
                    <Plus size={20} />
                    {activeTab === 'articles' ? 'Nuevo Servicio' : 'Nueva Tarifa'}
                </button>
            </div>

            {/* Search Bar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder={activeTab === 'articles' ? "Buscar servicio..." : "Buscar tarifa o zona..."}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* CONTENT: ARTICLES */}
            {activeTab === 'articles' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredArticles.map(article => (
                        <div key={article.id} className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-all group relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                <button onClick={() => handleEdit(article)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors">
                                    <Edit size={16} />
                                </button>
                            </div>

                            <div className="flex items-start justify-between mb-3">
                                <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                                    <FileText size={24} />
                                </div>
                                <div className="text-right">
                                    <div className="text-lg font-bold text-slate-800 flex items-center justify-end gap-1">
                                        {article.price} €
                                        <span className="text-xs font-normal text-slate-500">/ {article.unit}</span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="font-bold text-slate-800 mb-1">{article.name}</h3>
                                <p className="text-sm text-slate-500 line-clamp-2">{article.description || 'Sin descripción'}</p>
                            </div>
                        </div>
                    ))}
                    {filteredArticles.length === 0 && (
                        <div className="col-span-full text-center py-12">
                            <p className="text-slate-500">No se encontraron servicios.</p>
                        </div>
                    )}
                </div>
            )}

            {/* CONTENT: TARIFFS */}
            {activeTab === 'tariffs' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {filteredTariffs.map(tariff => (
                        <div key={tariff.id} className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-all group relative">
                            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                <button onClick={() => handleEditTariff(tariff)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors">
                                    <Edit size={14} />
                                </button>
                                <button onClick={() => onDeleteTariff(tariff.id)} className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors">
                                    <Trash2 size={14} />
                                </button>
                            </div>

                            <h3 className="font-bold text-slate-800 text-lg mb-1">{tariff.name}</h3>
                            <div className="text-2xl font-bold text-blue-600 mb-4">{tariff.price} €</div>

                            <div className="space-y-2 text-sm text-slate-500 bg-slate-50 p-3 rounded-lg">
                                <div className="flex justify-between">
                                    <span>Ciudad:</span>
                                    <span className="font-medium text-slate-700">{tariff.match || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Prefijo CP:</span>
                                    <span className="font-mono bg-white px-1 rounded border border-slate-200 text-slate-700">{tariff.zipPrefix || '-'}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {filteredTariffs.length === 0 && (
                        <div className="col-span-full text-center py-12">
                            <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                <Map size={32} />
                            </div>
                            <h3 className="text-lg font-medium text-slate-900">No hay tarifas configuradas</h3>
                            <p className="text-slate-500 mt-1">Añade tarifas por ciudad o código postal.</p>
                        </div>
                    )}
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
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Precio (€)</label>
                                <input type="number" step="0.01" required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} />
                            </div>
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
                                <Map className="text-blue-600" size={20} />
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
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Precio Automático (€)</label>
                                <input type="number" step="0.01" required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-lg text-blue-600" value={tariffData.price} onChange={e => setTariffData({ ...tariffData, price: e.target.value })} />
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

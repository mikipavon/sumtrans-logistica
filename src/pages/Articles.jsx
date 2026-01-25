import { useState } from 'react';
import { Search, Plus, FileText, Trash2, Edit, Euro, Tag } from 'lucide-react';

export default function Articles({ articles, onAddArticle, onUpdateArticle, onDeleteArticle }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [isFormatModalOpen, setIsFormatModalOpen] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        unit: 'Unidad' // Unidad, Hora, Km, Bulto, etc.
    });
    const [editingId, setEditingId] = useState(null);

    const filteredArticles = (articles || []).filter(article =>
        article.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        article.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSubmit = (e) => {
        e.preventDefault();

        if (editingId) {
            onUpdateArticle(editingId, formData);
        } else {
            onAddArticle({
                ...formData,
                id: Date.now()
            });
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

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Tag className="text-blue-600" />
                        Artículos y Tarifas
                    </h1>
                    <p className="text-slate-500 mt-1">Gestión de precios y catálogo de servicios</p>
                </div>
                <button
                    onClick={() => setIsFormatModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all hover:scale-105 active:scale-95"
                >
                    <Plus size={20} />
                    Nuevo Artículo
                </button>
            </div>

            {/* Search Bar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar por nombre o descripción..."
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Articles List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredArticles.map(article => (
                    <div key={article.id} className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-all group relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                            <button onClick={() => handleEdit(article)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors">
                                <Edit size={16} />
                            </button>
                            {/* <button className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors">
                                <Trash2 size={16} />
                            </button> */}
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
            </div>

            {filteredArticles.length === 0 && (
                <div className="text-center py-12">
                    <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                        <Tag size={32} />
                    </div>
                    <h3 className="text-lg font-medium text-slate-900">No hay artículos encontrados</h3>
                    <p className="text-slate-500 mt-1">Prueba con otra búsqueda o añade un nuevo artículo.</p>
                </div>
            )}

            {/* Modal */}
            {isFormatModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                <Tag className="text-blue-600" size={20} />
                                {editingId ? 'Editar Artículo' : 'Nuevo Artículo'}
                            </h3>
                            <button onClick={resetForm} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nombre del Artículo</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: Palet Europeo, Hora de Espera..."
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Descripción</label>
                                <textarea
                                    placeholder="Detalles adicionales..."
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none h-24"
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Precio Base (€)</label>
                                    <div className="relative">
                                        <Euro className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        <input
                                            type="number"
                                            step="0.01"
                                            required
                                            placeholder="0.00"
                                            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                            value={formData.price}
                                            onChange={e => setFormData({ ...formData, price: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Unidad</label>
                                    <select
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                                        value={formData.unit}
                                        onChange={e => setFormData({ ...formData, unit: e.target.value })}
                                    >
                                        <option value="Unidad">Unidad</option>
                                        <option value="Hora">Hora</option>
                                        <option value="Km">Km</option>
                                        <option value="Kg">Kg</option>
                                        <option value="Viaje">Viaje</option>
                                    </select>
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20"
                                >
                                    {editingId ? 'Guardar Cambios' : 'Crear Artículo'}
                                </button>
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

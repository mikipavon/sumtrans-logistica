import { X, Building2, MapPin, Tag, Phone, Router, Map, FileCode, DollarSign } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function CreateClientModal({ isOpen, onClose, onSave, articles, initialData }) {
    const [formData, setFormData] = useState({
        name: '',
        cif: '',
        address: '',
        city: '',
        zip: '',
        phone: '',
        coordinates: '',
        type: 'Remitente',
        billingType: 'Facturación',
        tariffType: 'General',
        customRates: {}
    });

    useEffect(() => {
        if (isOpen && initialData) {
            setFormData({
                name: initialData.name || '',
                cif: initialData.cif || '',
                address: initialData.address || '',
                city: initialData.city || '',
                zip: initialData.zip || '',
                phone: initialData.phone || '',
                coordinates: initialData.coordinates || '',
                type: initialData.type || 'Remitente',
                billingType: initialData.billingType || 'Facturación',
                tariffType: initialData.tariffType || 'General',
                customRates: initialData.customRates || {}
            });
        } else if (isOpen) {
            setFormData({
                name: '', cif: '', address: '', city: '', zip: '', phone: '', coordinates: '', type: 'Remitente',
                billingType: 'Facturación', tariffType: 'General', customRates: {}
            });
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        // Pass ID if editing
        onSave(initialData ? { ...formData, id: initialData.id } : formData);
        onClose();
    };

    const handleRateChange = (articleId, newPrice) => {
        setFormData(prev => ({
            ...prev,
            customRates: {
                ...prev.customRates,
                [articleId]: newPrice
            }
        }));
    };

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8 flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl shrink-0">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Building2 size={20} className="text-blue-600" />
                        {initialData ? 'Editar Cliente / Ubicación' : 'Nuevo Cliente / Ubicación'}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="overflow-y-auto p-6 custom-scrollbar">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Section: Datos Generales */}
                        <div>
                            <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                                <FileCode size={16} className="text-blue-500" />
                                Datos Identificativos
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Nombre / Razón Social</label>
                                    <input
                                        type="text" required
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        placeholder="Ej: Industrias Apex S.L."
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">CIF / NIF</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        placeholder="B-12345678"
                                        value={formData.cif}
                                        onChange={(e) => setFormData({ ...formData, cif: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="mt-4">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Color Distintivo</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    className="w-12 h-10 rounded cursor-pointer border border-slate-200"
                                    value={formData.color || '#000000'}
                                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                />
                                <span className="text-sm text-slate-500">Selecciona un color para identificar a este cliente en el mapa y listados.</span>
                            </div>
                        </div>


                        {/* Section: Ubicación */}
                        <div>
                            <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                                <MapPin size={16} className="text-emerald-500" />
                                Dirección y Ubicación
                            </h4>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Dirección Completa</label>
                                    <input
                                        type="text" required
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        placeholder="Calle, Número, Polígono..."
                                        value={formData.address}
                                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Población</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                            placeholder="Madrid"
                                            value={formData.city}
                                            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Código Postal</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                            placeholder="28001"
                                            value={formData.zip}
                                            onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Coordenadas GPS</label>
                                        <div className="relative">
                                            <Map className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                            <input
                                                type="text"
                                                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                                placeholder="40.416, -3.703"
                                                value={formData.coordinates}
                                                onChange={(e) => setFormData({ ...formData, coordinates: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section: Contacto y Tipo */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                                    <Phone size={16} className="text-purple-500" />
                                    Contacto
                                </h4>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Teléfono</label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        type="tel"
                                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        placeholder="+34 600..."
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                                    <Tag size={16} className="text-amber-500" />
                                    Clasificación
                                </h4>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tipo de Cliente</label>
                                <select
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                    value={formData.type}
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                >
                                    <option value="Remitente">Remitente</option>
                                    <option value="Destinatario">Destinatario</option>
                                    <option value="Ambos">Ambos</option>
                                </select>

                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 mt-4">Tipo de Cobro</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="billingType"
                                            value="Facturación"
                                            checked={formData.billingType === 'Facturación'}
                                            onChange={(e) => setFormData({ ...formData, billingType: e.target.value })}
                                            className="text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm font-medium text-slate-700">Facturación</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="billingType"
                                            value="Cobro Diario"
                                            checked={formData.billingType === 'Cobro Diario'}
                                            onChange={(e) => setFormData({ ...formData, billingType: e.target.value })}
                                            className="text-amber-600 focus:ring-amber-500"
                                        />
                                        <span className="text-sm font-medium text-slate-700">Cobro Diario</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Section: Tarifa */}
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                            <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <DollarSign size={16} className="text-green-600" />
                                Tarifas y Precios
                            </h4>

                            <div className="mb-4">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tipo de Tarifa</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="tariffType"
                                            value="General"
                                            checked={formData.tariffType === 'General'}
                                            onChange={(e) => setFormData({ ...formData, tariffType: e.target.value })}
                                            className="text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm font-medium text-slate-700">Tarifa General</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="tariffType"
                                            value="Personalizada"
                                            checked={formData.tariffType === 'Personalizada'}
                                            onChange={(e) => setFormData({ ...formData, tariffType: e.target.value })}
                                            className="text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm font-medium text-slate-700">Tarifa Personalizada</span>
                                    </label>
                                </div>
                            </div>

                            {formData.tariffType === 'Personalizada' && (
                                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50 border-b border-slate-200">
                                                <tr>
                                                    <th className="px-4 py-2 text-left font-medium text-slate-600">Artículo</th>
                                                    <th className="px-4 py-2 text-right font-medium text-slate-600">Precio General</th>
                                                    <th className="px-4 py-2 text-right font-medium text-slate-600">Precio Cliente</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {articles.map((article) => (
                                                    <tr key={article.id}>
                                                        <td className="px-4 py-2 text-slate-700">
                                                            <div className="font-medium">{article.name}</div>
                                                            <div className="text-xs text-slate-400">{article.unit}</div>
                                                        </td>
                                                        <td className="px-4 py-2 text-right text-slate-500">
                                                            {article.price} €
                                                        </td>
                                                        <td className="px-4 py-2 text-right">
                                                            <div className="relative inline-block w-24">
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    placeholder={article.price}
                                                                    className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:border-blue-500 text-right pr-6"
                                                                    value={formData.customRates[article.id] || ''}
                                                                    onChange={(e) => handleRateChange(article.id, e.target.value)}
                                                                />
                                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">€</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {(!articles || articles.length === 0) && (
                                                    <tr>
                                                        <td colSpan="3" className="px-4 py-4 text-center text-slate-400 italic">
                                                            No hay artículos definidos en el sistema.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="pt-4 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0 bg-white pb-2">
                            <button type="button" onClick={onClose} className="px-6 py-2 text-slate-500 font-medium hover:bg-slate-50 rounded-lg transition-colors">
                                Cancelar
                            </button>
                            <button type="submit" className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg shadow-blue-600/20 transition-all">
                                Guardar Ficha
                            </button>
                        </div>
                    </form>
                </div>
            </div >
        </div >
    );
}

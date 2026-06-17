import { useState, useRef, useEffect } from 'react';
import { X, Truck, Save, ChevronDown, Search } from 'lucide-react';

// Lista de marcas con sus logos (debe coincidir con los archivos en /logos/brands/)
const BRANDS = [
    { key: 'fiat',       name: 'FIAT' },
    { key: 'peugeot',    name: 'PEUGEOT' },
    { key: 'hyundai',    name: 'HYUNDAI' },
    { key: 'mercedes',   name: 'MERCEDES-BENZ' },
    { key: 'renault',    name: 'RENAULT' },
    { key: 'volkswagen', name: 'VOLKSWAGEN' },
    { key: 'iveco',      name: 'IVECO' },
    { key: 'man',        name: 'MAN' },
    { key: 'bmw',        name: 'BMW' },
    { key: 'toyota',     name: 'TOYOTA' },
    { key: 'ford',       name: 'FORD' },
    { key: 'citroen',    name: 'CITROËN' },
    { key: 'nissan',     name: 'NISSAN' },
    { key: 'volvo',      name: 'VOLVO' },
    { key: 'daf',        name: 'DAF' },
    { key: 'scania',     name: 'SCANIA' },
    { key: 'opel',       name: 'OPEL' },
];

function BrandDropdown({ value, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const dropdownRef = useRef(null);
    const searchRef = useRef(null);

    // Close on outside click
    useEffect(() => {
        function handleClick(e) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsOpen(false);
                setSearch('');
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Focus search on open
    useEffect(() => {
        if (isOpen && searchRef.current) {
            searchRef.current.focus();
        }
    }, [isOpen]);

    const selectedBrand = BRANDS.find(b => b.name === value);
    const filtered = BRANDS.filter(b =>
        b.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div ref={dropdownRef} className="relative">
            {/* Selected display / trigger button */}
            <button
                type="button"
                onClick={() => { setIsOpen(!isOpen); setSearch(''); }}
                className={`w-full flex items-center gap-3 border rounded-lg px-3 py-2.5 text-sm text-left transition-all
                    ${isOpen 
                        ? 'border-blue-500 ring-2 ring-blue-500/20' 
                        : 'border-slate-200 hover:border-slate-300'}
                    ${!value ? 'text-slate-400' : 'text-slate-800'}`}
            >
                {selectedBrand ? (
                    <>
                        <img 
                            src={`/logos/brands/${selectedBrand.key}.png`} 
                            alt={selectedBrand.name}
                            className="w-7 h-7 object-contain flex-shrink-0"
                        />
                        <span className="font-semibold flex-1">{selectedBrand.name}</span>
                    </>
                ) : (
                    <>
                        <div className="w-7 h-7 rounded-full bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center flex-shrink-0">
                            <Truck size={14} className="text-slate-400" />
                        </div>
                        <span className="flex-1">Seleccionar marca...</span>
                    </>
                )}
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown panel */}
            {isOpen && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
                    style={{ maxHeight: '320px' }}>
                    
                    {/* Search */}
                    <div className="p-2 border-b border-slate-100 sticky top-0 bg-white">
                        <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5">
                            <Search size={14} className="text-slate-400 flex-shrink-0" />
                            <input
                                ref={searchRef}
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Buscar marca..."
                                className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Brand list */}
                    <div className="overflow-y-auto" style={{ maxHeight: '260px' }}>
                        {filtered.length === 0 ? (
                            <div className="p-4 text-center text-sm text-slate-400">
                                No se encontró la marca
                            </div>
                        ) : (
                            filtered.map(brand => (
                                <button
                                    key={brand.key}
                                    type="button"
                                    onClick={() => {
                                        onChange(brand.name);
                                        setIsOpen(false);
                                        setSearch('');
                                    }}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors
                                        ${value === brand.name 
                                            ? 'bg-blue-50 text-blue-700 font-bold' 
                                            : 'text-slate-700 hover:bg-slate-50'}`}
                                >
                                    <img 
                                        src={`/logos/brands/${brand.key}.png`} 
                                        alt={brand.name}
                                        className="w-8 h-8 object-contain flex-shrink-0"
                                        loading="lazy"
                                    />
                                    <span className="font-medium">{brand.name}</span>
                                    {value === brand.name && (
                                        <span className="ml-auto text-blue-500 text-xs font-bold">✓</span>
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function CreateVehicleModal({ isOpen, onClose, onSave }) {
    const [formData, setFormData] = useState({
        id: '', // Matrícula
        brand: '', // Marca separada
        modelName: '', // Modelo separado
        status: 'Disponible',
        location: 'Base Central',
        fuel: '100%',
        maintenance: 'OK',
    });

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        // Combinar marca + modelo en el campo "model" para compatibilidad
        const combinedModel = formData.brand 
            ? `${formData.brand} ${formData.modelName}`.trim()
            : formData.modelName;
        
        onSave({
            id: formData.id,
            model: combinedModel,
            status: formData.status,
            location: formData.location,
            fuel: formData.fuel,
            maintenance: formData.maintenance,
            assignedDriverId: null,
            documents: []
        });
        setFormData({
            id: '',
            brand: '',
            modelName: '',
            status: 'Disponible',
            location: 'Base Central',
            fuel: '100%',
            maintenance: 'OK',
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Truck className="text-blue-600" size={20} />
                        Añadir Nuevo Vehículo
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar">
                    <form id="createVehicleForm" onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Matrícula</label>
                            <input
                                type="text"
                                required
                                value={formData.id}
                                onChange={(e) => setFormData({ ...formData, id: e.target.value.toUpperCase() })}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 uppercase"
                                placeholder="1234 ABC"
                            />
                        </div>

                        {/* Brand selector with logos */}
                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Marca</label>
                            <BrandDropdown
                                value={formData.brand}
                                onChange={(brand) => setFormData({ ...formData, brand })}
                            />
                        </div>

                        {/* Model name */}
                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Modelo</label>
                            <input
                                type="text"
                                required
                                value={formData.modelName}
                                onChange={(e) => setFormData({ ...formData, modelName: e.target.value })}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                placeholder={formData.brand === 'FIAT' ? 'Ducato' : formData.brand === 'PEUGEOT' ? 'Boxer' : 'Ej: FH16, Sprinter...'}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Combustible</label>
                                <select
                                    value={formData.fuel}
                                    onChange={(e) => setFormData({ ...formData, fuel: e.target.value })}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                >
                                    <option value="100%">100%</option>
                                    <option value="75%">75%</option>
                                    <option value="50%">50%</option>
                                    <option value="25%">25%</option>
                                    <option value="Reserva">Reserva</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Estado</label>
                                <select
                                    value={formData.status}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                >
                                    <option value="Disponible">Disponible</option>
                                    <option value="En Ruta">En Ruta</option>
                                    <option value="Mantenimiento">Mantenimiento</option>
                                    <option value="Inactivo">Inactivo / Vendido</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Ubicación Inicial</label>
                            <input
                                type="text"
                                value={formData.location}
                                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                placeholder="Base Central"
                            />
                        </div>
                    </form>
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        form="createVehicleForm"
                        className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                        <Save size={16} /> Guardar Vehículo
                    </button>
                </div>
            </div>
        </div>
    );
}

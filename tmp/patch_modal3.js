import fs from 'fs';

let content = fs.readFileSync('src/components/shipments/ShipmentDetailsModal.jsx', 'utf8');

// 1. Update Props Signature
const oldSig = "export default function ShipmentDetailsModal({ isOpen, onClose, shipment, onUpdate, allPoblaciones, drivers = [], isReadOnly = false, onWhatsAppShare, hidePrices = false }) {";
const newSig = "import { Trash2, Plus } from 'lucide-react';\n" + 
    "export default function ShipmentDetailsModal({ isOpen, onClose, shipment, onUpdate, allPoblaciones, drivers = [], clients = [], tariffs = null, articles = [], familyOrder = [], isReadOnly = false, onWhatsAppShare, hidePrices = false }) {";
if (content.includes(oldSig)) content = content.replace(oldSig, newSig);

// 2. Add State inside component
const stateTarget = "    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);\n    const fileInputRef = useRef(null);";
const stateAdd = `    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const fileInputRef = useRef(null);
    
    const [selectedArticles, setSelectedArticles] = useState([]);
    const [tempArticleId, setTempArticleId] = useState('');
    const [tempQuantity, setTempQuantity] = useState(1);
    const [weightKg, setWeightKg] = useState('');`;
if (content.includes(stateTarget)) content = content.replace(stateTarget, stateAdd);

// 3. Setup hooks & calc logic
const calcTarget = `    useEffect(() => {
        if (shipment) {`;

const calcAdd = `    const weightClientData = React.useMemo(() => {
        if (!formData.client) return null;
        const cName = formData.client.toLowerCase().trim();
        const client = (clients || []).find(c =>
            String(c.name || '').toLowerCase().trim() === cName ||
            String(c.legalName || '').toLowerCase().trim() === cName
        );
        const hasTariff = client && client.weightTariff && Array.isArray(client.weightTariff) && client.weightTariff.length > 0;
        const isByKilos = client && client.tariffType === 'Por Kilos';
        if (hasTariff || isByKilos) {
            return { client, tariff: client.weightTariff || [] };
        }
        return null;
    }, [formData.client, clients]);

    const calculateWeightPrice = (kg, tariff) => {
        if (!kg || !tariff || tariff.length === 0) return 0;
        const weight = parseFloat(kg);
        if (isNaN(weight) || weight <= 0) return 0;
        const sorted = [...tariff].sort((a, b) => a.maxKg - b.maxKg);
        const bracket = sorted.find(b => weight <= b.maxKg);
        if (bracket) return parseFloat(bracket.price);
        return parseFloat(sorted[sorted.length - 1].price);
    };

    const addArticle = () => {
        if (!tempArticleId || tempQuantity < 1 || !tariffs) return;
        const article = (articles || []).find(a => a.id.toString() === tempArticleId.toString());
        if (!article) return;
        
        let price = article.basePrice || 0;
        let dest = formData.destinationCity;
        if (shipment && shipment.type === 'Recogida') dest = formData.originCity;
        
        if (dest && tariffs[dest]) {
            const familyCode = article.category ? article.category.substring(0, 3).toUpperCase() : 'NEU';
            if (tariffs[dest][familyCode] !== undefined) {
                price = tariffs[dest][familyCode];
            }
        }
        
        const newItem = {
            ...article,
            quantity: Number(tempQuantity),
            pricePerUnit: price,
            totalPrice: price * Number(tempQuantity),
            uniqueId: Date.now().toString()
        };
        
        const updatedList = [...selectedArticles, newItem];
        setSelectedArticles(updatedList);
        
        const articlesTotal = updatedList.reduce((sum, item) => sum + item.totalPrice, 0);
        const commission = parseFloat(formData.codCommission) || 0;
        setFormData(prev => ({ ...prev, amount: (articlesTotal + commission).toFixed(2) }));
        setTempArticleId('');
        setTempQuantity(1);
    };

    const removeArticle = (uniqueId) => {
        const updatedList = selectedArticles.filter(item => item.uniqueId !== uniqueId);
        setSelectedArticles(updatedList);
        const articlesTotal = updatedList.reduce((sum, item) => sum + item.totalPrice, 0);
        const commission = parseFloat(formData.codCommission) || 0;
        setFormData(prev => ({ ...prev, amount: (articlesTotal + commission).toFixed(2) }));
    };

    useEffect(() => {
        if (shipment) {`;
if (content.includes(calcTarget)) {
   content = content.replace(calcTarget, calcAdd);
}

// 4. Update the initialization hook
const initTarget = `        if (shipment) {
            let packagesText = shipment.packages || '';
            if (!packagesText && shipment.articles && shipment.articles.length > 0) {
                packagesText = shipment.articles.map(a => \`\${a.quantity || 1}x \${a.name}\`).join('\\n');
            }
            setFormData({
                ...shipment,
                packages: packagesText
            });
            setIsEditing(false);
        }`;

const initReplace = `        if (shipment) {
            let packagesText = shipment.packages || '';
            if (!packagesText && shipment.articles && shipment.articles.length > 0) {
                packagesText = shipment.articles.map(a => \`\${a.quantity || 1}x \${a.name}\`).join('\\n');
            }
            setSelectedArticles(shipment.articles || []);
            setWeightKg(shipment.weightKg || '');
            setFormData({
                ...shipment,
                packages: packagesText
            });
            setIsEditing(false);
        }`;
if (content.includes(initTarget)) {
    content = content.replace(initTarget, initReplace);
}

// 5. Setup handler on save
const saveTarget = `                if (newPhoto === 'REMOVE') {
                    // Si el usuario activó borrar la foto
                    finalFormData.merchandisePhoto = null;
                }

                await onUpdate(shipment.id, finalFormData);`;
const saveReplace = `                if (newPhoto === 'REMOVE') {
                    finalFormData.merchandisePhoto = null;
                }
                
                // Inject the articles array
                finalFormData.articles = selectedArticles;
                // Generate a text mapped string for packages from the articles array
                if (selectedArticles && selectedArticles.length > 0) {
                    finalFormData.packages = selectedArticles.map(a => \`\${a.quantity || 1}x \${a.name}\`).join('\\n');
                } else if (weightKg) {
                    finalFormData.packages = \`\${weightKg} Kg\`;
                } else {
                    finalFormData.packages = '';
                }
                finalFormData.weightKg = weightKg ? parseFloat(weightKg) : null;

                await onUpdate(shipment.id, finalFormData);`;
if (content.includes(saveTarget)) {
    content = content.replace(saveTarget, saveReplace);
}

// 6. UI for the selector
const bultosTarget = '{renderField("Bultos", formData.packages, "packages", <Package />, "textarea")}';
const bultosReplace = `{isEditing && !isReadOnly ? (
                            <div className="col-span-full bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
                                <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1 border-b border-slate-100 pb-2"><Package size={12} /> Bultos y Artículos</span>
                                
                                {/* Article Selector */}
                                <div className="flex gap-2 items-end">
                                    <div className="flex-1">
                                        <select 
                                            value={tempArticleId} 
                                            onChange={(e) => setTempArticleId(e.target.value)} 
                                            className="w-full text-sm border-2 border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        >
                                            <option value="">Seleccionar artículo...</option>
                                            {(() => {
                                                let availableArticles = [...(articles || [])];
                                                const client = (clients||[]).find(c => c.name.toLowerCase() === (formData.client||'').toLowerCase());
                                                if (client && client.allowedArticles && client.allowedArticles.length > 0) {
                                                    const allowedIds = client.allowedArticles;
                                                    availableArticles = availableArticles.filter(a => allowedIds.includes(a.id)).sort((a, b) => allowedIds.indexOf(a.id) - allowedIds.indexOf(b.id));
                                                } else {
                                                    availableArticles = availableArticles.filter(a => {
                                                        const cat = String(a.category || '').toLowerCase();
                                                        return cat.includes('tarifa estandar') || cat.includes('tarifas estandar') || cat.includes('estándar');
                                                    });
                                                    availableArticles.sort((a, b) => {
                                                        const indexA = (familyOrder||[])?.indexOf(a.category || 'Sin Categoría') ?? -1;
                                                        const indexB = (familyOrder||[])?.indexOf(b.category || 'Sin Categoría') ?? -1;
                                                        if (indexA !== indexB) return (indexA === -1 ? 1 : indexB === -1 ? -1 : indexA - indexB);
                                                        const numA = parseInt(a.name) || 0;
                                                        const numB = parseInt(b.name) || 0;
                                                        if (numA && numB && numA !== numB) return numA - numB;
                                                        return (a.name || '').localeCompare(b.name || '');
                                                    });
                                                }
                                                return availableArticles.map(article => <option key={article.id} value={article.id}>{article.name}</option>);
                                            })()}
                                        </select>
                                    </div>
                                    <div className="w-16">
                                        <input type="number" min="1" className="w-full text-sm border-2 border-slate-200 rounded-lg p-2.5" value={tempQuantity} onChange={(e) => setTempQuantity(e.target.value)} />
                                    </div>
                                    <button type="button" onClick={addArticle} className="p-2.5 bg-blue-100 text-blue-600 rounded-lg font-bold hover:bg-blue-200"><Plus size={18} /></button>
                                </div>
                                
                                {weightClientData && (
                                    <div className="w-28 mt-2 border-t border-slate-100 pt-2">
                                        <label className="text-[10px] uppercase font-bold text-indigo-500 mb-1 block">⚖️ Kilos</label>
                                        <input
                                            type="number" min="0" step="0.1" placeholder="Kg"
                                            className="w-full text-sm border-2 border-indigo-200 rounded-lg p-2 text-indigo-700 font-bold focus:ring-indigo-500"
                                            value={weightKg}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setWeightKg(val);
                                                const p = calculateWeightPrice(val, weightClientData.tariff);
                                                const aTotal = selectedArticles.reduce((sum, item) => sum + item.totalPrice, 0);
                                                const com = parseFloat(formData.codCommission) || 0;
                                                setFormData(prev => ({ ...prev, amount: (aTotal + p + com).toFixed(2) }));
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Article List */}
                                {selectedArticles.length > 0 && (
                                    <div className="mt-3 bg-white border border-slate-100 rounded-lg p-2">
                                        {selectedArticles.map((item) => (
                                            <div key={item.uniqueId} className="flex justify-between items-center py-1 text-sm border-b border-slate-50 last:border-0">
                                                <span className="font-medium text-slate-800">{item.quantity}x {item.name}</span>
                                                <div className="flex gap-3 items-center">
                                                    <span className="font-bold text-slate-700">{hidePrices ? '***' : \`\${item.totalPrice.toFixed(2)}€\`}</span>
                                                    <button type="button" onClick={() => removeArticle(item.uniqueId)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            renderField("Bultos", formData.packages, "packages", <Package />)
                        )}`;

if (content.includes(bultosTarget)) {
    content = content.replace(bultosTarget, bultosReplace);
}

fs.writeFileSync('src/components/shipments/ShipmentDetailsModal.jsx', content, 'utf8');
console.log("✅ ShipmentDetailsModal fully patched");
